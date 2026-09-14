/**
 * Mystery Card 시스템 어휘(§1~§3, §30).
 *
 * 기존 Mystery Mission을 Mystery Card로 개편하는 단계적 리팩터링의 1단계다. 여기서는
 * "카드를 무엇으로 선언할 수 있는가"만 정의하고, 실제 14장 구현과 UI 문구 교체는 다음
 * 단계에서 한다. 파일·타입명을 한 번에 갈아엎어 회귀 버그를 만들지 않기 위해, 기존
 * MysteryMissionDef는 그대로 두고 이 어휘를 선택적으로 얹는 방식으로 간다.
 */

/** 카드 분류 — 미션형/강화형/발동형 */
export type MysteryCardCategory = "mission" | "enhancement" | "trigger";

export const CARD_CATEGORY_LABEL: Record<MysteryCardCategory, string> = {
  mission: "미션형",
  enhancement: "강화형",
  trigger: "발동형",
};

/**
 * 카드 교체 조건(§3). 기존의 "Mission 성공 → 무조건 다음 핸드에 교체" 전역 규칙을 대체한다.
 *
 * - on_success:          조건 달성 시 교체(미션형 기본)
 * - on_pot_win:          그 핸드에서 팟을 하나라도 이기면 교체(강화형 — True Sight / Four Card)
 * - on_trigger:          실제로 효과가 발동해 결과를 바꿨을 때 교체(발동형 — Forced Split 등)
 * - regular_round_only:  정규 변경 라운드에만 교체
 *
 * 어떤 규칙이든 정규 변경 라운드(1/4/7/10/13)가 오면 승패와 무관하게 교체한다.
 */
export type CardReplacementRule = "on_success" | "on_pot_win" | "on_trigger" | "regular_round_only";

/** 상대 지정 규칙(§22) — 지금은 Mission Breaker / Parasite만 사용한다. */
export type CardTargetRule =
  | "none"
  /** 플랍에서 자신의 첫 액션 전에, 팟에 남아 있는 상대 1명을 지정 */
  | "opponent_in_pot_at_flop";

/** 한 핸드에서 카드가 만들어낸 결과 — 교체 판정(§20 Phase 6)의 입력이 된다. */
export interface CardHandOutcome {
  /** 미션형 조건을 달성했는가 */
  achieved: boolean;
  /** 그 핸드에서 팟을 하나라도 이겼는가 */
  wonAnyPot: boolean;
  /** 발동형 효과가 실제로 결과를 바꿨는가 */
  triggered: boolean;
}

/**
 * 다음 핸드에 카드를 교체해야 하는지 판정한다(§20 Phase 6).
 * 정규 변경 라운드가 우선이며, 그 외에는 카드별 규칙을 따른다.
 */
export function shouldReplaceCard(params: {
  rule: CardReplacementRule;
  outcome: CardHandOutcome;
  isRegularChangeRound: boolean;
}): boolean {
  if (params.isRegularChangeRound) return true;
  switch (params.rule) {
    case "on_success":
      return params.outcome.achieved;
    case "on_pot_win":
      return params.outcome.wonAnyPot;
    case "on_trigger":
      return params.outcome.triggered;
    case "regular_round_only":
      return false;
    default:
      return false;
  }
}

/**
 * 기존 Mission 카테고리를 새 Mystery Card 카테고리로 옮기는 임시 매핑.
 *
 * 14장 구현 단계에서 각 카드가 category를 직접 선언하게 되면 이 함수는 사라진다.
 * 그때까지 UI가 새 분류 라벨을 쓸 수 있게 다리를 놓아둔다.
 */
export function cardCategoryFromLegacy(legacy: string): MysteryCardCategory {
  switch (legacy) {
    case "counter":
      return "trigger";
    case "extraHand":
      return "enhancement";
    default:
      return "mission";
  }
}
