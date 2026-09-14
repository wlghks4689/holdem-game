import assert from "node:assert/strict";
import { HAND_RANK } from "../src/holdem/pokerEval";
import { resolveMissionReward, roundToTen } from "../src/mysteryHoldem/missionRewards";
import { resolveMissionsForHand } from "../src/mysteryHoldem/missionResolver";
import {
  HIGH_END_REWARD_BY_HAND_RANK,
  MISSION_POOL,
  findMissionDef,
} from "../src/mysteryHoldem/mysteryMissions";
import { makeMissionCtx, missionStateOf } from "./mysteryTestHelpers";

/**
 * Mystery Card 보상 계산 검증.
 *
 * 이전 버전은 "기준 족보 이상 + 높은 족보 배수(HAND_RANK_WEIGHT)"를 검증했다. Mystery Card
 * 개편(§9, §25)에서 그 숨은 계수를 제거했으므로, 이제 확인해야 할 것은
 *   1) 각 Maker는 "정확히 그 족보"에서만 성공하고
 *   2) 풀하우스 이상은 High-End Maker의 명시적 보상표대로 지급되는가
 * 이다.
 */

const ctxWith = (rank: number, extra = {}) =>
  makeMissionCtx({ bestHandValue: { rank, kickers: [10, 9, 8, 7, 6] }, wonAnyPot: true, ...extra });

// ── Maker 계열: 정확히 한 족보만 인정한다 ──
{
  const cases: [string, number][] = [
    ["maker_set", HAND_RANK.TRIPS],
    ["maker_straight", HAND_RANK.STRAIGHT],
    ["maker_flush", HAND_RANK.FLUSH],
  ];
  const allRanks = [
    HAND_RANK.HIGH_CARD, HAND_RANK.PAIR, HAND_RANK.TWO_PAIR, HAND_RANK.TRIPS,
    HAND_RANK.STRAIGHT, HAND_RANK.FLUSH, HAND_RANK.FULL_HOUSE, HAND_RANK.QUADS,
    HAND_RANK.STRAIGHT_FLUSH,
  ];
  for (const [id, exactRank] of cases) {
    const def = findMissionDef(id)!;
    for (const rank of allRanks) {
      assert.equal(
        def.condition(ctxWith(rank)),
        rank === exactRank,
        `${id}는 ${exactRank} 족보에서만 성공해야 하는데 ${rank}에서 ${def.condition(ctxWith(rank))}`,
      );
    }
    // 쇼다운에 도달하지 않으면 족보가 맞아도 실패다.
    assert.equal(def.condition(ctxWith(exactRank, { wentToShowdown: false })), false);
  }
}

// ── High-End Maker: 숨은 배수가 아니라 명시적 보상표 ──
{
  const def = findMissionDef("maker_high_end")!;
  assert.equal(def.condition(ctxWith(HAND_RANK.FLUSH)), false, "플러시는 High-End 영역이 아니다");
  for (const [rank, expected] of [
    [HAND_RANK.FULL_HOUSE, 300],
    [HAND_RANK.QUADS, 600],
    [HAND_RANK.STRAIGHT_FLUSH, 1200],
  ] as const) {
    assert.equal(def.condition(ctxWith(rank)), true);
    assert.equal(resolveMissionReward(def, ctxWith(rank)), expected, `${rank} 족보 보상`);
    assert.equal(HIGH_END_REWARD_BY_HAND_RANK[rank], expected);
  }
}

// ── 고정 보상 카드는 ctx와 무관하게 같은 값을 준다 ──
{
  const set = findMissionDef("maker_set")!;
  assert.equal(resolveMissionReward(set, ctxWith(HAND_RANK.TRIPS)), set.reward);
  assert.equal(resolveMissionReward(set, ctxWith(HAND_RANK.QUADS)), set.reward);
}

// ── 미션 강탈자: 가장 점수가 높은 상대 1명만 무효화하고 그 25%를 가져간다 ──
{
  const stealer = findMissionDef("counter_steal")!;
  const bigVictim = findMissionDef("maker_flush")!; // 180
  const smallVictim = findMissionDef("maker_set")!; // 90
  const results = resolveMissionsForHand([
    { seat: 0, mission: missionStateOf(bigVictim, 3), ctx: ctxWith(HAND_RANK.FLUSH, { seat: 0 }) },
    { seat: 1, mission: missionStateOf(smallVictim, 3), ctx: ctxWith(HAND_RANK.TRIPS, { seat: 1 }) },
    {
      seat: 2,
      mission: missionStateOf(stealer, 3),
      ctx: ctxWith(HAND_RANK.HIGH_CARD, { seat: 2, wentToShowdown: false }),
    },
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

// ── 미션 브레이커: 달성한 상대 "전원"을 무효화하는 광역 방해(강탈자와 역할이 다르다) ──
{
  const breaker = findMissionDef("counter_block_bonus")!;
  const results = resolveMissionsForHand([
    {
      seat: 0,
      mission: missionStateOf(findMissionDef("maker_flush")!, 3),
      ctx: ctxWith(HAND_RANK.FLUSH, { seat: 0 }),
    },
    {
      seat: 1,
      mission: missionStateOf(findMissionDef("maker_set")!, 3),
      ctx: ctxWith(HAND_RANK.TRIPS, { seat: 1 }),
    },
    {
      seat: 2,
      mission: missionStateOf(breaker, 3),
      ctx: ctxWith(HAND_RANK.HIGH_CARD, { seat: 2, wentToShowdown: false }),
    },
  ]);
  assert.equal(results.find((r) => r.seat === 0)!.reward, 0);
  assert.equal(results.find((r) => r.seat === 1)!.reward, 0, "브레이커는 전원을 무효화한다");
  assert.equal(results.find((r) => r.seat === 2)!.reward, breaker.reward);
}

// ── 모든 카드의 점수는 10단위로 떨어져야 한다(rewardFor로 계산되는 값 포함) ──
for (const m of MISSION_POOL) {
  assert.equal(m.reward % 10, 0, `${m.id}의 기본 점수가 10단위가 아닙니다: ${m.reward}`);
  if (m.rewardFor == null) continue;
  for (const rank of Object.keys(HIGH_END_REWARD_BY_HAND_RANK).map(Number)) {
    for (const seats of [2, 3, 4, 6, 10]) {
      const paid = resolveMissionReward(m, ctxWith(rank, { initialSeatCount: seats }));
      assert.equal(paid % 10, 0, `${m.id} 지급액 ${paid}점 — 10단위가 아닙니다`);
    }
  }
}

console.log("OK: mystery card rewards (정확 족보 + 명시적 High-End 보상표)");
