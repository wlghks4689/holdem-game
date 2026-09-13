import assert from "node:assert/strict";
import { HAND_RANK } from "../src/holdem/pokerEval";
import { madeHandRewardMultiplier, resolveMissionReward, roundToTen } from "../src/mysteryHoldem/missionRewards";
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

// 미션 강탈자: 가장 점수가 높은 상대 1명만 무효화하고 그 25%를 가져간다.
{
  const stealer = findMissionDef("counter_steal")!;
  const bigVictim = findMissionDef("made_full_house_plus")!; // 270
  const smallVictim = findMissionDef("made_trips_plus")!; // 70
  const stealerCtx: MissionEvalContext = { ...ctxWith(HAND_RANK.HIGH_CARD), seat: 2, wentToShowdown: false };
  const results = resolveMissionsForHand([
    { seat: 0, mission: { def: bigVictim, assignedRound: 3, achieved: false }, ctx: { ...ctxWith(HAND_RANK.FULL_HOUSE), seat: 0 } },
    { seat: 1, mission: { def: smallVictim, assignedRound: 3, achieved: false }, ctx: { ...ctxWith(HAND_RANK.TRIPS), seat: 1 } },
    { seat: 2, mission: { def: stealer, assignedRound: 3, achieved: false }, ctx: stealerCtx },
  ]);
  const big = results.find((r) => r.seat === 0)!;
  const small = results.find((r) => r.seat === 1)!;
  const stealerResult = results.find((r) => r.seat === 2)!;

  assert.equal(big.achieved, true);
  assert.equal(big.reward, 0, "가장 큰 상대만 무효화되어야 한다");
  assert.equal(big.nullified, true);
  assert.equal(big.deniedReward, bigVictim.reward, "지운 점수가 기록되어야 한다");

  assert.equal(small.nullified, false, "작은 쪽은 그대로 남아야 한다");
  assert.equal(small.reward, smallVictim.reward);

  assert.equal(
    stealerResult.reward,
    roundToTen(bigVictim.reward * 0.25),
    "강탈자는 최대 피해자 점수의 25%를 가져간다",
  );
}

// 미션 브레이커: 달성한 상대 "전원"을 무효화하는 광역 방해(강탈자와 역할이 다르다).
{
  const breaker = findMissionDef("counter_block_bonus")!;
  const results = resolveMissionsForHand([
    { seat: 0, mission: { def: findMissionDef("made_full_house_plus")!, assignedRound: 3, achieved: false }, ctx: { ...ctxWith(HAND_RANK.FULL_HOUSE), seat: 0 } },
    { seat: 1, mission: { def: findMissionDef("made_trips_plus")!, assignedRound: 3, achieved: false }, ctx: { ...ctxWith(HAND_RANK.TRIPS), seat: 1 } },
    { seat: 2, mission: { def: breaker, assignedRound: 3, achieved: false }, ctx: { ...ctxWith(HAND_RANK.HIGH_CARD), seat: 2, wentToShowdown: false } },
  ]);
  assert.equal(results.find((r) => r.seat === 0)!.reward, 0);
  assert.equal(results.find((r) => r.seat === 1)!.reward, 0, "브레이커는 전원을 무효화한다");
  assert.equal(results.find((r) => r.seat === 2)!.reward, breaker.reward);
}

// 모든 Mission 기본 점수와 계수 적용 결과가 10단위로 떨어져야 한다.
for (const m of MISSION_POOL) {
  assert.equal(m.reward % 10, 0, `${m.id}의 기본 점수가 10단위가 아닙니다: ${m.reward}`);
  if (m.madeHandThreshold == null) continue;
  for (const rank of [HAND_RANK.TRIPS, HAND_RANK.STRAIGHT, HAND_RANK.FLUSH, HAND_RANK.FULL_HOUSE, HAND_RANK.QUADS, HAND_RANK.STRAIGHT_FLUSH]) {
    if (rank < m.madeHandThreshold) continue;
    const paid = resolveMissionReward(m, ctxWith(rank));
    assert.equal(paid % 10, 0, `${m.id}가 ${rank} 족보로 달성 시 ${paid}점 — 10단위가 아닙니다`);
  }
}

console.log("OK: mystery mission rewards (high-hand multiplier)");
