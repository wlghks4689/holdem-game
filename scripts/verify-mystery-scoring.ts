import assert from "node:assert/strict";
import {
  chipPointFromChips,
  resolveLastPlayerStandingResult,
  resolveRoundLimitResult,
  scoreBreakdownFor,
  survivalPointsBySeat,
  survivalRewardForRank,
} from "../src/mysteryHoldem/scoring";
import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import type { PlayerState } from "../src/mysteryHoldem/types";

// Chip Point = 보유 칩 / chipPointDivisor. 분모는 설정값이므로 하드코딩하지 않는다 —
// 칩 비중을 조정할 때마다 테스트가 깨지면 무엇을 검증하는 테스트인지 흐려진다.
{
  const d = MYSTERY_HOLDEM_CONFIG.chipPointDivisor;
  assert.equal(chipPointFromChips(30_000), 30_000 / d);
  assert.equal(chipPointFromChips(42_500), 42_500 / d);
  assert.equal(d, 200, "현재 확정값 — 칩이 다른 점수를 압도하지 않도록 100에서 올렸다");
}

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
    anteContribution: 0,
    mission: null,
    missionPoint: 0,
    bountyPoint: 0,
    survivalPoint: 0,
    chipPoint: 0,
    totalPoint: 0,
    ...overrides,
  };
}

// Total Point = Chip Point + Mission Point + Bounty Point, 각 항목은 독립적으로 관리된다(§19, §20).
{
  const p = player({ chips: 34_200, missionPoint: 180, bountyPoint: 60 });
  const chip = chipPointFromChips(p.chips);
  assert.equal(chip, 34_200 / MYSTERY_HOLDEM_CONFIG.chipPointDivisor);
  assert.equal(scoreBreakdownFor(p).totalPoint, chip + 180 + 60);
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
    // 25,000/200 = 125, +50 = 175
    player({ seat: 0, chips: 25_000, missionPoint: 50, bountyPoint: 0 }),
    // 35,000/200 = 175 — 위와 동점
    player({ seat: 1, chips: 35_000, missionPoint: 0, bountyPoint: 0 }),
    player({ seat: 2, chips: 10_000, missionPoint: 0, bountyPoint: 0 }),
  ];
  const result = resolveRoundLimitResult(players);
  assert.deepEqual([...result.winners].sort(), [0, 1]);
  assert.equal(result.isDraw, true);
}

// 최후 1인이 남아 끝나도 자동 승리가 아니라 점수로 승자를 가린다.
//
// 예전에는 생존자가 점수와 무관하게 이겼다. 그러면 Mystery Card와 Bounty로 쌓은 점수가
// "칩을 다 먹으면 어차피 무의미"해져 게임의 절반이 장식이 된다.
{
  const players = [
    // 생존자지만 칩이 거의 없다(=다른 좌석의 칩이 아직 반영되지 않은 인위적 상황).
    player({ seat: 0, chips: 5_000 }), // 50
    player({ seat: 1, chips: 0, missionPoint: 500, bountyPoint: 500, busted: true }), // 1000
  ];
  const result = resolveLastPlayerStandingResult(players);
  assert.deepEqual(result.winners, [1], "생존이 아니라 총점이 승자를 정한다");
  assert.equal(result.reason, "last_player_standing");
}

// 실제로는 최후 1인이 테이블의 칩을 전부 들고 있어 대개 그대로 1위가 된다.
{
  const players = [
    player({ seat: 0, chips: 120_000 }), // 1200
    player({ seat: 1, chips: 0, missionPoint: 300, bountyPoint: 200, busted: true }), // 500
    player({ seat: 2, chips: 0, busted: true }),
  ];
  const result = resolveLastPlayerStandingResult(players);
  assert.deepEqual(result.winners, [0]);
}

// ─────────────── 생존 점수 ───────────────

// 시작 인원에 비례한다 — 10인에서 가장 크고 인원이 적을수록 작아진다.
{
  assert.equal(survivalRewardForRank(1, 10), 200);
  assert.equal(survivalRewardForRank(2, 10), 100);
  assert.equal(survivalRewardForRank(3, 10), 50);
  assert.equal(survivalRewardForRank(1, 4), 80);
  assert.equal(survivalRewardForRank(2, 4), 40);
  assert.equal(survivalRewardForRank(3, 4), 20);

  for (const rank of [1, 2, 3] as const) {
    let prev = -1;
    for (const n of [2, 3, 4, 6, 8, 10]) {
      const v = survivalRewardForRank(rank, n);
      assert.ok(v >= prev, `${rank}위 보상이 인원이 늘어나는데 줄었다: ${n}인 ${v}`);
      assert.equal(v % 10, 0, "생존 점수는 10단위여야 한다");
      prev = v;
    }
  }
  // 등수가 낮을수록 적다.
  for (const n of [4, 10]) {
    assert.ok(survivalRewardForRank(1, n) > survivalRewardForRank(2, n));
    assert.ok(survivalRewardForRank(2, n) > survivalRewardForRank(3, n));
  }
}

// 생존자 상위 3인에게만, 생존 점수를 뺀 총점 순으로 지급한다.
{
  const players = [
    player({ seat: 0, chips: 50_000 }), // 500 — 생존 1위
    player({ seat: 1, chips: 40_000 }), // 400 — 생존 2위
    player({ seat: 2, chips: 30_000 }), // 300 — 생존 3위
    player({ seat: 3, chips: 20_000 }), // 200 — 생존 4위(지급 없음)
    // 버스트한 좌석은 점수가 아무리 높아도 "생존" 점수를 받지 못한다.
    player({ seat: 4, chips: 0, missionPoint: 900, bountyPoint: 900, busted: true }),
  ];
  const awards = survivalPointsBySeat(players, 5);
  assert.equal(awards.get(0), survivalRewardForRank(1, 5));
  assert.equal(awards.get(1), survivalRewardForRank(2, 5));
  assert.equal(awards.get(2), survivalRewardForRank(3, 5));
  assert.equal(awards.get(3), undefined, "4위는 생존 점수가 없다");
  assert.equal(awards.get(4), undefined, "버스트한 좌석은 총점이 높아도 받지 못한다");
}

// 1위가 전원을 버스트시킨 경우 2·3위 몫은 자연히 사라진다.
{
  const players = [
    player({ seat: 0, chips: 400_000 }),
    player({ seat: 1, chips: 0, missionPoint: 500, busted: true }),
    player({ seat: 2, chips: 0, missionPoint: 400, busted: true }),
  ];
  const awards = survivalPointsBySeat(players, 10);
  assert.equal(awards.size, 1, "생존자가 하나뿐이면 1위 몫만 나간다");
  assert.equal(awards.get(0), survivalRewardForRank(1, 10));
}

// 생존 점수는 Total Point에 합산된다.
{
  const p = player({ chips: 20_000, missionPoint: 100, bountyPoint: 50, survivalPoint: 200 });
  assert.equal(scoreBreakdownFor(p).totalPoint, chipPointFromChips(20_000) + 100 + 50 + 200);
  assert.equal(scoreBreakdownFor(p).survivalPoint, 200);
}

console.log("OK: mystery scoring");
