import type { Card } from "@/holdem/cards";
import type { HandValue } from "@/holdem/pokerEval";
import { bestHandExactUse, bestHandExactUseDetailed } from "./handEval";
import type { SpecialRuleId } from "./types";

/**
 * Mission의 `specialRule`이 실제 핸드 규칙(딜링·쇼다운 평가)을 바꾸는 훅 테이블.
 * 새 규칙-변경형 Mission을 추가할 때 reducer에 if/else를 늘리지 않고
 * 이 테이블에 항목만 추가하면 되도록 분리했다(§8, §26).
 */
export interface SpecialRuleHooks {
  /** 최종 확정 홀카드 수(일반 2장 대신) */
  finalHoleCardCount: number;
  /** 최초 3장 중 2장 선택 이후, 추가로 받는 카드 수 */
  extraDealCount: number;
  /** 쇼다운에서 실제로 사용하는(=공개하는) 홀카드 수 */
  showdownHoleCardCount: number;
  evaluateBestHand: (hole: readonly Card[], board: readonly Card[]) => HandValue;
  /** 최선 조합에 실제로 쓰인 홀카드 — 쇼다운에서 그 카드만 공개하는 데 사용한다 */
  bestHoleCardsUsed?: (hole: readonly Card[], board: readonly Card[]) => Card[];
}

export const SPECIAL_RULES: Record<SpecialRuleId, SpecialRuleHooks> = {
  /**
   * Extra Hand(§12): 카드 선택 이후 2장 추가 획득 → 최종 홀카드 4장 보유(추가 버림 없음).
   * 쇼다운에서는 오마하 방식처럼 홀카드 정확히 2장 + 보드 3장으로만 5장을 구성한다.
   */
  extra_hand_four_card: {
    finalHoleCardCount: 4,
    extraDealCount: 2,
    showdownHoleCardCount: 2,
    evaluateBestHand: (hole, board) => bestHandExactUse(hole, board, 2, 3),
    bestHoleCardsUsed: (hole, board) => bestHandExactUseDetailed(hole, board, 2, 3).holeUsed,
  },
};

export function specialRuleFor(id: SpecialRuleId | undefined): SpecialRuleHooks | null {
  if (id == null) return null;
  return SPECIAL_RULES[id] ?? null;
}
