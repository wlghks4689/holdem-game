import type { Card } from "@/holdem/cards";
import { makeDeck, removeCards, shuffle } from "@/holdem/cards";
import { compareHandValue } from "@/holdem/pokerEval";
import { bestHandExactUse, bestHandStandard } from "../handEval";
import { mysteryPreflopHandScore, preflopScoreForHoleCards } from "../mysteryHandRanking";

export interface EquityParams {
  hole: readonly Card[];
  board: readonly Card[];
  /** 아직 핸드에 남아 있는 상대 수 */
  opponentCount: number;
  /**
   * Extra Hand Mission처럼 홀카드 사용 매수가 강제되는 경우의 사용 매수(예: 2).
   * 지정하지 않으면 일반 텍사스 홀덤 규칙(자유 조합).
   */
  holeUse?: number;
  /** 시뮬레이션 표본 수 — 정확도와 속도의 트레이드오프 */
  samples?: number;
  rng: () => number;
}

/**
 * 몬테카를로 승률 추정. N인 게임에서는 같은 핸드라도 상대 수에 따라 가치가 크게 달라지므로,
 * 단순 족보 등급이 아니라 "지금 상대 수 기준으로 이길 확률"을 직접 추정한다.
 * 무승부는 승자 수로 나눈 지분으로 계산한다.
 */
export function estimateEquity(params: EquityParams): number {
  const { hole, board, opponentCount, holeUse, rng } = params;
  const samples = params.samples ?? 160;
  if (opponentCount <= 0) return 1;
  if (hole.length === 0) return 0;

  const known = [...hole, ...board];
  const boardNeeded = 5 - board.length;
  let won = 0;

  for (let s = 0; s < samples; s++) {
    const deck = shuffle(removeCards(makeDeck(), known), rng);
    let idx = 0;

    const fullBoard = [...board];
    for (let i = 0; i < boardNeeded; i++) fullBoard.push(deck[idx++]!);

    const heroValue =
      holeUse != null
        ? bestHandExactUse(hole, fullBoard, holeUse, 5 - holeUse)
        : bestHandStandard(hole, fullBoard);

    let beaten = false;
    let tied = 0;
    for (let o = 0; o < opponentCount; o++) {
      const oppHole = [deck[idx++]!, deck[idx++]!];
      const oppValue = bestHandStandard(oppHole, fullBoard);
      const cmp = compareHandValue(oppValue, heroValue);
      if (cmp > 0) {
        beaten = true;
        break;
      }
      if (cmp === 0) tied++;
    }
    if (!beaten) won += 1 / (1 + tied);
  }

  return won / samples;
}

/**
 * 프리플랍 강도(0~1). 매 액션마다 몬테카를로를 돌리면 비용이 큰 데다 프리플랍은
 * 보드 제약이 없어 표가 충분히 정확하므로, MysteryHoldem 전용 프리플랍 랭킹을 정규화해 쓴다.
 */
export function preflopStrength(hole: readonly Card[]): number {
  if (hole.length < 2) return 0;
  const score = hole.length === 2
    ? mysteryPreflopHandScore([hole[0]!, hole[1]!])
    : preflopScoreForHoleCards(hole);
  // 대략 1.5(72o) ~ 20(AA) 범위를 0~1로 정규화
  return clamp01((score - 1.5) / 18.5);
}

/**
 * 상대 수가 늘수록 "이 핸드로 이길 확률"은 떨어진다. 프리플랍 강도(핸드 자체의 등급)를
 * 상대 수 기준 승률로 환산한다.
 *
 * 기준점: 무작위 핸드의 기대 승률은 1/(n+1)이고, 실제 승률은 대략 그 0.5배(최악 핸드)에서
 * 2.1배(AA) 사이에 분포한다. 예를 들어 상대 5명이면 AA가 약 35%, 72o가 약 8%다.
 * 이 배수 모델을 쓰지 않고 baseline에서 1.0까지 선형 보간하면 중간 핸드의 승률이
 * 크게 부풀려져 봇이 지나치게 루즈해진다.
 */
export function preflopEquityApprox(hole: readonly Card[], opponentCount: number): number {
  if (opponentCount <= 0) return 1;
  const strength = preflopStrength(hole);
  const baseline = 1 / (opponentCount + 1);
  return clamp01(baseline * (0.5 + strength * 1.6));
}

/**
 * "공정 지분 대비 몇 배인가". 1.0이면 평균, 2.0이면 평균의 두 배.
 * 상대 수에 따라 절대 승률의 범위가 달라지므로, 베팅·레이즈 임계값은 이 상대 강도로 판단한다.
 */
export function relativeStrength(equity: number, opponentCount: number): number {
  return equity * (opponentCount + 1);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
