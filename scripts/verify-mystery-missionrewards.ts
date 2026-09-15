import assert from "node:assert/strict";
import { HAND_RANK } from "../src/holdem/pokerEval";
import { resolveMissionReward } from "../src/mysteryHoldem/missionRewards";
import {
  HIGH_END_REWARD_BY_HAND_RANK,
  MISSION_POOL,
  findMissionDef,
} from "../src/mysteryHoldem/mysteryMissions";
import { makeMissionCtx } from "./mysteryTestHelpers";

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
  // 스트레이트/플러시 Maker는 스티플도 인정한다 — 스티플은 그 둘을 모두 포함하는 족보라,
  // 실패로 처리하면 "노리던 것을 더 크게 만들었더니 미션이 깨지는" 함정이 된다.
  const acceptsStraightFlush = new Set(["maker_straight", "maker_flush"]);
  for (const [id, exactRank] of cases) {
    const def = findMissionDef(id)!;
    for (const rank of allRanks) {
      const expected =
        rank === exactRank || (acceptsStraightFlush.has(id) && rank === HAND_RANK.STRAIGHT_FLUSH);
      assert.equal(
        def.condition(ctxWith(rank)),
        expected,
        `${id}가 족보 ${rank}에서 기대(${expected})와 다릅니다`,
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
  // 스티플은 High-End에도 포함된다(풀하우스 이상이므로).
  assert.equal(def.condition(ctxWith(HAND_RANK.STRAIGHT_FLUSH)), true);
  for (const [rank, expected] of [
    [HAND_RANK.FULL_HOUSE, 350],
    [HAND_RANK.QUADS, 600],
    [HAND_RANK.STRAIGHT_FLUSH, 1000],
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

// (Mission Breaker / Parasite의 상호작용은 verify-mystery-cards-trigger.ts에서 검증한다.)

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
