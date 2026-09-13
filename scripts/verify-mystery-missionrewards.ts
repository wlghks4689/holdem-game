import assert from "node:assert/strict";
import { HAND_RANK } from "../src/holdem/pokerEval";
import { madeHandRewardMultiplier, resolveMissionReward } from "../src/mysteryHoldem/missionRewards";
import { resolveMissionsForHand } from "../src/mysteryHoldem/missionResolver";
import { MISSION_POOL, findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import type { MissionEvalContext, PlayerMissionState } from "../src/mysteryHoldem/types";

// 포카드 전용 Mission은 "풀하우스 이상"에 통합돼 사라졌다(EV 역전 방지).
assert.equal(findMissionDef("made_quads_plus"), undefined);
const fullHouseMission = findMissionDef("made_full_house_plus");
assert.ok(fullHouseMission != null);
assert.equal(fullHouseMission!.madeHandThreshold, HAND_RANK.FULL_HOUSE);

// 높은 족보 계수: 기준 족보로 달성하면 1배, 더 높은 족보면 배수가 붙는다.
assert.equal(madeHandRewardMultiplier(HAND_RANK.FULL_HOUSE, HAND_RANK.FULL_HOUSE), 1);
assert.equal(madeHandRewardMultiplier(HAND_RANK.QUADS, HAND_RANK.FULL_HOUSE), 2);
assert.equal(madeHandRewardMultiplier(HAND_RANK.STRAIGHT_FLUSH, HAND_RANK.FULL_HOUSE), 4);
// 기준 미만은 1배로 클램프(조건상 발생하지 않지만 방어)
assert.equal(madeHandRewardMultiplier(HAND_RANK.PAIR, HAND_RANK.FULL_HOUSE), 1);

function ctxWith(rank: number): MissionEvalContext {
  return {
    seat: 0,
    round: 3,
    buttonSeat: 0,
    position: "BTN",
    board: [],
    folded: false,
    wentToShowdown: true,
    wonAnyPot: true,
    wonPotAmount: 1000,
    bestHandValue: { rank, kickers: [10, 9] },
    showdownOpponents: [1],
    opponentBestHandValues: {},
    myPreflopScore: 5,
    opponentPreflopScores: {},
    opponentsAchievedThisHand: [],
    extraHandActive: false,
  };
}

// 풀하우스로 달성하면 기본 보상, 포카드면 2배가 실제로 지급된다.
const base = fullHouseMission!.reward;
assert.equal(resolveMissionReward(fullHouseMission!, ctxWith(HAND_RANK.FULL_HOUSE)), base);
assert.equal(resolveMissionReward(fullHouseMission!, ctxWith(HAND_RANK.QUADS)), base * 2);
assert.equal(resolveMissionReward(fullHouseMission!, ctxWith(HAND_RANK.STRAIGHT_FLUSH)), base * 4);

// resolver 통합: 포카드로 달성한 플레이어는 계수가 반영된 포인트를 받는다.
{
  const mission: PlayerMissionState = { def: fullHouseMission!, assignedRound: 3, achieved: false };
  const results = resolveMissionsForHand([{ seat: 0, mission, ctx: ctxWith(HAND_RANK.QUADS) }]);
  assert.equal(results[0]!.achieved, true);
  assert.equal(results[0]!.reward, base * 2);
}

// 계수가 없는 Mission(Position 등)은 기본 보상 그대로여야 한다.
{
  const positional = findMissionDef("position_win_button")!;
  assert.equal(positional.madeHandThreshold, undefined);
  assert.equal(resolveMissionReward(positional, ctxWith(HAND_RANK.QUADS)), positional.reward);
}

// Made 계열은 전부 threshold를 데이터로 선언해야 계수 시스템이 자동 적용된다.
for (const m of MISSION_POOL.filter((x) => x.category === "made")) {
  assert.ok(m.madeHandThreshold != null, `${m.id}에 madeHandThreshold가 없습니다`);
}

// 미션 강탈자는 무효화 + 절반 획득으로 조정되었다.
{
  const stealer = findMissionDef("counter_steal")!;
  const victim = findMissionDef("made_trips_plus")!;
  const victimCtx = ctxWith(HAND_RANK.TRIPS);
  const stealerCtx: MissionEvalContext = { ...ctxWith(HAND_RANK.HIGH_CARD), seat: 1, wentToShowdown: false };
  const results = resolveMissionsForHand([
    { seat: 0, mission: { def: victim, assignedRound: 3, achieved: false }, ctx: victimCtx },
    { seat: 1, mission: { def: stealer, assignedRound: 3, achieved: false }, ctx: stealerCtx },
  ]);
  const victimResult = results.find((r) => r.seat === 0)!;
  const stealerResult = results.find((r) => r.seat === 1)!;
  assert.equal(victimResult.achieved, true);
  assert.equal(victimResult.reward, 0, "강탈당한 쪽 보상은 무효화되어야 한다");
  assert.equal(victimResult.nullified, true);
  assert.equal(stealerResult.reward, Math.round(victim.reward * 0.5), "강탈자는 절반만 가져간다");
}

console.log("OK: mystery mission rewards (high-hand multiplier)");
