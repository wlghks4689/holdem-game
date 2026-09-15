import type { Card } from "./cards";
import {
  best5Of7,
  bestFiveCardsFromSeven,
  madeHandFxKind,
  type HandValue,
  type MadeHandFxKind,
} from "./pokerEval";

/**
 * 쇼다운에서 "어떤 카드가 승부에 쓰였는가"를 계산하는 공용 로직.
 *
 * Select Hold'em의 BoardDisplay / HoleCards가 각자 들고 있던 계산을 여기로 모았다.
 * MysteryHoldem도 같은 함수를 쓴다 — 두 게임이 각자 best5를 구하면 같은 손패를 두고
 * 강조되는 카드가 달라질 수 있고, 한쪽만 고쳐지는 일이 생긴다.
 *
 * 이 모듈은 **역할까지만** 계산한다. CSS 클래스는 UI가 붙인다(§27).
 */

/**
 * 카드 식별자. 덱에 같은 카드가 두 장 없으므로 rank+suit로 유일하다.
 * 객체 참조로 비교하면 평가기가 새로 만든 배열과 원본이 달라 매칭에 실패한다.
 */
export function cardKey(c: { rank: number; suit: string }): string {
  return `${c.rank}:${c.suit}`;
}

export interface ShowdownBestFive {
  value: HandValue;
  fxKind: MadeHandFxKind;
  /** 승부에 실제로 쓰인 5장 */
  bestFive: Card[];
  /** 그중 홀카드 쪽 키 */
  holeUsedKeys: Set<string>;
  /** 그중 커뮤니티 카드 쪽 키 */
  boardUsedKeys: Set<string>;
}

/**
 * 이미 구한 best5를 홀/보드 역할로 나눈다.
 *
 * 평가기마다 반환 형태가 달라(일반 7장 평가기 / Four Card 전용 평가기) 여기서 한 번에
 * 정규화한다.
 */
export function rolesFromBestFive(
  bestFive: readonly Card[],
  hole: readonly Card[],
  value: HandValue,
): ShowdownBestFive {
  const holeKeys = new Set(hole.map(cardKey));
  const holeUsedKeys = new Set<string>();
  const boardUsedKeys = new Set<string>();
  for (const c of bestFive) {
    const k = cardKey(c);
    // 보드에 없는 카드 = 홀카드. 덱에 중복이 없으므로 이 판정이 유일하다.
    if (holeKeys.has(k)) holeUsedKeys.add(k);
    else boardUsedKeys.add(k);
  }
  return { value, fxKind: madeHandFxKind(value), bestFive: [...bestFive], holeUsedKeys, boardUsedKeys };
}

/** 일반 홀덤(홀 2장 + 보드 자유 조합)의 BEST 5 */
export function standardShowdownBestFive(
  hole: readonly Card[],
  board: readonly Card[],
): ShowdownBestFive {
  const all = [...hole, ...board];
  return rolesFromBestFive(bestFiveCardsFromSeven(all), hole, best5Of7(all));
}
