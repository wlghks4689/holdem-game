import { HAND_RANK } from "@/holdem/pokerEval";
import type { MissionEvalContext, MysteryMissionDef } from "./types";

/**
 * Made 계열 Mission의 "높은 족보 계수"(§12 보완).
 *
 * 배경: 기준 족보를 올릴수록 보상을 올리는 단순 방식은 EV가 역전된다.
 * 7장 기준 달성률이 트립스 15.3% → 포카드 0.20%로 76배 떨어지는데 보상은 몇 배밖에
 * 오르지 않아, 희귀 족보 Mission일수록 오히려 기대값이 낮은 "함정 선택지"가 된다.
 *
 * 해결: 기준 족보는 달성 가능한 선에서 유지하고(포카드는 "풀하우스 이상"에 통합),
 * 실제로 더 높은 족보를 완성했을 때 보상에 계수를 곱해 상방을 보상한다.
 *   계수 = weight(달성 족보) / weight(Mission 기준 족보)   (최소 1배)
 *
 * 가중치는 잠정값이며 시뮬레이션(scripts/simulate-mystery.ts) 결과로 조정한다(§31).
 */
export const HAND_RANK_WEIGHT: Record<number, number> = {
  [HAND_RANK.HIGH_CARD]: 1,
  [HAND_RANK.PAIR]: 1,
  [HAND_RANK.TWO_PAIR]: 1,
  [HAND_RANK.TRIPS]: 1,
  [HAND_RANK.STRAIGHT]: 1.2,
  [HAND_RANK.FLUSH]: 1.5,
  [HAND_RANK.FULL_HOUSE]: 2,
  [HAND_RANK.QUADS]: 4,
  [HAND_RANK.STRAIGHT_FLUSH]: 8,
};

/** 기준 족보 대비 달성 족보의 보상 배수(기준 미만이면 1배로 클램프) */
export function madeHandRewardMultiplier(achievedRank: number, thresholdRank: number): number {
  const achieved = HAND_RANK_WEIGHT[achievedRank] ?? 1;
  const threshold = HAND_RANK_WEIGHT[thresholdRank] ?? 1;
  if (threshold <= 0) return 1;
  return Math.max(1, achieved / threshold);
}

/** 모든 Mission Point는 10단위로 떨어지게 정리한다(계수가 곱해진 값 포함) */
export function roundToTen(n: number): number {
  return Math.round(n / 10) * 10;
}

/**
 * 이번 핸드에 실제 지급할 Mission Point.
 * `madeHandThreshold`가 선언된 Mission만 높은 족보 계수가 적용되고, 나머지는 기본 보상 그대로다.
 */
export function resolveMissionReward(def: MysteryMissionDef, ctx: MissionEvalContext): number {
  if (def.madeHandThreshold == null || ctx.bestHandValue == null) return def.reward;
  const multiplier = madeHandRewardMultiplier(ctx.bestHandValue.rank, def.madeHandThreshold);
  return roundToTen(def.reward * multiplier);
}

/** UI 안내용 — 기준 족보에서 한 단계씩 올라갈 때의 배수 목록 */
export function madeHandBonusTable(thresholdRank: number): { rank: number; multiplier: number }[] {
  const ranks = [
    HAND_RANK.TRIPS,
    HAND_RANK.STRAIGHT,
    HAND_RANK.FLUSH,
    HAND_RANK.FULL_HOUSE,
    HAND_RANK.QUADS,
    HAND_RANK.STRAIGHT_FLUSH,
  ];
  return ranks
    .filter((r) => r > thresholdRank)
    .map((rank) => ({ rank, multiplier: madeHandRewardMultiplier(rank, thresholdRank) }));
}
