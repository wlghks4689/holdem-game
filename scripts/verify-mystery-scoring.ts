import assert from "node:assert/strict";
import { chipPointFromChips, resolveRoundLimitResult, resolveLastPlayerStandingResult } from "../src/mysteryHoldem/scoring";
import type { PlayerState } from "../src/mysteryHoldem/types";

// Chip Point = Chips / 100 (§19-1)
assert.equal(chipPointFromChips(30_000), 300);
assert.equal(chipPointFromChips(42_500), 425);

function player(overrides: Partial<PlayerState>): PlayerState {
  return {
    seat: 0,
    name: "P",
    chips: 0,
    pendingDeal: [],
    discarded: [],
    holeCards: [],
    inHand: false,
    folded: false,
    allIn: false,
    busted: false,
    streetContribution: 0,
    handContribution: 0,
    mission: null,
    missionPoint: 0,
    bountyPoint: 0,
    chipPoint: 0,
    totalPoint: 0,
    ...overrides,
  };
}

// Total Point = Chip Point + Mission Point + Bounty Point, 각 항목은 독립적으로 관리된다(§19, §20).
{
  const p = player({ chips: 34_200, missionPoint: 180, bountyPoint: 60 });
  // 342 + 180 + 60 = 582
  const chip = chipPointFromChips(p.chips);
  assert.equal(chip, 342);
  assert.equal(chip + p.missionPoint + p.bountyPoint, 582);
}

// §21-A: 15라운드 정상 종료 — 최고 Total Point 플레이어 승리.
{
  const players = [
    player({ seat: 0, chips: 40_000, missionPoint: 10, bountyPoint: 0 }), // 410
    player({ seat: 1, chips: 20_000, missionPoint: 0, bountyPoint: 0 }), // 200
  ];
  const result = resolveRoundLimitResult(players);
  assert.deepEqual(result.winners, [0]);
  assert.equal(result.isDraw, false);
}

// §22: 최고점 동률이면 무승부, 추가 타이브레이커(칩 보유량 등) 없음.
{
  const players = [
    player({ seat: 0, chips: 25_000, missionPoint: 50, bountyPoint: 0 }), // 300
    player({ seat: 1, chips: 30_000, missionPoint: 0, bountyPoint: 0 }), // 300
    player({ seat: 2, chips: 10_000, missionPoint: 0, bountyPoint: 0 }), // 100
  ];
  const result = resolveRoundLimitResult(players);
  assert.deepEqual([...result.winners].sort(), [0, 1]);
  assert.equal(result.isDraw, true);
}

// §21-B: Last Player Standing은 점수 비교 없이 즉시 승리(무승부 개념 없음).
{
  const players = [
    player({ seat: 0, chips: 5_000, missionPoint: 500, bountyPoint: 500 }), // 점수는 낮지만 생존
    player({ seat: 1, chips: 0, missionPoint: 0, bountyPoint: 0, busted: true }),
  ];
  const result = resolveLastPlayerStandingResult(players, 0);
  assert.deepEqual(result.winners, [0]);
  assert.equal(result.isDraw, false);
  assert.equal(result.reason, "last_player_standing");
}

console.log("OK: mystery scoring");
