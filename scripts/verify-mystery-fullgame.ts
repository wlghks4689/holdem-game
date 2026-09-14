import assert from "node:assert/strict";
import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import { dispatch, mulberry32, playHandToEnd, startMatch, totalChipsInPlay } from "./mysteryTestHelpers";

/**
 * §27 프로토타입 전체 루프 스모크 테스트: 4인 매치 생성 → 30,000 칩 지급 → Round 1 →
 * 블라인드/앤티 → 카드 3장 → 2장 선택 → Mission 선택 → 프리플랍~리버 베팅 → 쇼다운 →
 * 팟 지급 → 버스트/Bounty/Mission 판정 → 다음 라운드 → ... → 15라운드 종료 또는
 * Last Player Standing까지, 크래시 없이 완주하는지 확인한다.
 */
for (const seatCount of [2, 3, 4, 6]) {
  const rng = mulberry32(1000 + seatCount);
  let state = startMatch(seatCount, rng);
  const startingTotal = seatCount * MYSTERY_HOLDEM_CONFIG.startingChips;
  assert.equal(totalChipsInPlay(state), startingTotal);

  let safety = 0;
  while (!state.matchEnded) {
    if (safety++ > 40) throw new Error(`매치가 종료되지 않고 있음(seatCount=${seatCount})`);
    state = playHandToEnd(state, rng);
    assert.equal(
      totalChipsInPlay(state),
      startingTotal,
      `핸드 ${state.round} 종료 후에도 칩 총량이 보존되어야 한다(레이크 없음)`,
    );
    // 모든 투입과 팟 분배가 베팅 단위(100)로만 이루어지므로 스택도 항상 100 단위여야 한다.
    // 여기가 깨지면 50칩짜리 스택이 생겨 최소 레이즈·Raise Cap 계산의 전제가 무너진다.
    for (const p of state.players) {
      assert.equal(
        p.chips % MYSTERY_HOLDEM_CONFIG.betStepUnit,
        0,
        `핸드 ${state.round}: 좌석 ${p.seat}의 스택 ${p.chips}이 베팅 단위를 벗어났다`,
      );
    }
    if (!state.matchEnded) {
      state = dispatch(state, { type: "START_NEXT_HAND" }, rng);
    }
  }

  assert.ok(state.matchEndReason === "round_limit" || state.matchEndReason === "last_player_standing");
  assert.ok(state.matchWinners != null && state.matchWinners.length >= 1);
  if (state.matchEndReason === "round_limit") {
    assert.equal(state.round, MYSTERY_HOLDEM_CONFIG.totalRounds);
  } else {
    assert.ok(state.round < MYSTERY_HOLDEM_CONFIG.totalRounds);
    assert.equal(state.matchWinners!.length, 1, "Last Player Standing은 무승부가 없다");
  }

  // 모든 좌석의 Total Point가 세 항목의 합과 정확히 일치한다.
  for (const p of state.players) {
    const chipPoint = p.chips / MYSTERY_HOLDEM_CONFIG.chipPointDivisor;
    assert.ok(Math.abs(p.chipPoint - chipPoint) < 1e-6);
    assert.ok(Math.abs(p.totalPoint - (chipPoint + p.missionPoint + p.bountyPoint)) < 1e-6);
  }

  console.log(`OK: mystery full game loop (seatCount=${seatCount}, rounds=${state.round}, reason=${state.matchEndReason})`);
}
