import assert from "node:assert/strict";
import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import { autoCompleteHandSetup, dispatch, mulberry32, playHandToEnd, startMatch } from "./mysteryTestHelpers";

const rng = mulberry32(2);
let state = startMatch(4, rng);
state = autoCompleteHandSetup(state, rng);

assert.equal(state.phase, "preflop");

const blindsLog = state.logs.find((l) => l.t === "blinds_posted");
assert.ok(blindsLog && blindsLog.t === "blinds_posted");
if (blindsLog && blindsLog.t === "blinds_posted") {
  assert.equal(blindsLog.sbAmount, MYSTERY_HOLDEM_CONFIG.smallBlind);
  assert.equal(blindsLog.bbAmount, MYSTERY_HOLDEM_CONFIG.bigBlind);
  assert.equal(blindsLog.anteAmount, MYSTERY_HOLDEM_CONFIG.bigBlindAnte);
}

// SB/BB 좌석 실제 차감액 확인 (BB는 블라인드 + 앤티 합산)
const sbSeat = (state.buttonSeat + 1) % 4;
const bbSeat = (state.buttonSeat + 2) % 4;
const sbPlayer = state.players.find((p) => p.seat === sbSeat)!;
const bbPlayer = state.players.find((p) => p.seat === bbSeat)!;
assert.equal(
  MYSTERY_HOLDEM_CONFIG.startingChips - sbPlayer.chips,
  MYSTERY_HOLDEM_CONFIG.smallBlind,
  "SB는 정확히 100 차감되어야 한다",
);
assert.equal(
  MYSTERY_HOLDEM_CONFIG.startingChips - bbPlayer.chips,
  MYSTERY_HOLDEM_CONFIG.bigBlind + MYSTERY_HOLDEM_CONFIG.bigBlindAnte,
  "BB는 블라인드(200) + 앤티(200) = 400이 차감되어야 한다",
);

// 15라운드 내내 블라인드가 고정되는지 여러 핸드에 걸쳐 확인
let s = state;
for (let i = 0; i < 5; i++) {
  s = playHandToEnd(s, rng);
  if (s.matchEnded) break;
  s = dispatch(s, { type: "START_NEXT_HAND" }, rng);
  s = autoCompleteHandSetup(s, rng);
  if (s.phase !== "preflop") continue;
  const log = [...s.logs].reverse().find((l) => l.t === "blinds_posted");
  assert.ok(log && log.t === "blinds_posted");
  if (log && log.t === "blinds_posted") {
    assert.equal(log.sbAmount <= MYSTERY_HOLDEM_CONFIG.smallBlind, true);
    assert.equal(log.bbAmount <= MYSTERY_HOLDEM_CONFIG.bigBlind, true);
  }
}

console.log("OK: mystery blinds/ante");
