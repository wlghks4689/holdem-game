import type { MissionEvalContext, MysteryMissionDef } from "./types";

/**
 * Mystery Card 보상 계산.
 *
 * 예전에는 "기준 족보 이상이면 달성 + 더 높은 족보면 배수"라는 숨은 계수(HAND_RANK_WEIGHT)를
 * 곱했다. Mystery Card 개편(§9, §25)에서 이 방식을 제거했다 — 각 Maker 카드는 정확히
 * 한 족보만 인정하고, 풀하우스 이상은 High-End Maker가 명시적 보상표로 처리한다.
 * 그래서 여기 남는 것은 "카드가 선언한 대로 준다"뿐이다.
 */

/** Mission Point는 10단위로 떨어지게 정리한다 */
export function roundToTen(n: number): number {
  return Math.round(n / 10) * 10;
}

/**
 * 이번 핸드에 실제 지급할 Mission Point.
 * 달성 내용에 따라 금액이 달라지는 카드만 `rewardFor`를 선언하고, 나머지는 고정값이다.
 */
export function resolveMissionReward(def: MysteryMissionDef, ctx: MissionEvalContext): number {
  return def.rewardFor != null ? def.rewardFor(ctx) : def.reward;
}
