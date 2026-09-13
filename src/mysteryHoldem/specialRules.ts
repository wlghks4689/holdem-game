import type { Card } from "@/holdem/cards";
import type { HandValue } from "@/holdem/pokerEval";
import { bestHandExactUse } from "./handEval";
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
  /** 추가 카드 수령 후 최종적으로 더 버려야 하는 카드 수 */
  extraDiscardCount: number;
  evaluateBestHand: (hole: readonly Card[], board: readonly Card[]) => HandValue;
}

export const SPECIAL_RULES: Record<SpecialRuleId, SpecialRuleHooks> = {
  /**
   * Extra Hand(§12): 카드 선택 이후 2장 추가 획득 → 1장 버림 → 최종 홀카드 4장 보유.
   * 쇼다운에서는 오마하 방식처럼 홀카드 정확히 2장 + 보드 3장으로만 5장을 구성한다.
   */
  extra_hand_four_card: {
    finalHoleCardCount: 4,
    extraDealCount: 2,
    extraDiscardCount: 1,
    evaluateBestHand: (hole, board) => bestHandExactUse(hole, board, 2, 3),
  },
};

export function specialRuleFor(id: SpecialRuleId | undefined): SpecialRuleHooks | null {
  if (id == null) return null;
  return SPECIAL_RULES[id] ?? null;
}
