import assert from "node:assert/strict";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";

// 어느 스트리트에서 폴드하더라도 별도의 Fold Penalty가 없다 — 이미 팟에 넣은 칩만 잃는다.
const rng = mulberry32(9);
let state = startMatch(3, rng);
state = autoCompleteHandSetup(state, rng);
assert.equal(state.phase, "preflop");

const utg = state.toActSeat!;
const utgChipsBeforeFold = state.players.find((p) => p.seat === utg)!.chips;
state = dispatch(state, { type: "FOLD", seat: utg }, rng);
const utgChipsAfterFold = state.players.find((p) => p.seat === utg)!.chips;

assert.equal(
  utgChipsAfterFold,
  utgChipsBeforeFold,
  "폴드 자체는 추가로 칩을 차감하지 않아야 한다(Fold Penalty 없음)",
);

// 나머지 두 명이 계속 진행해 핸드가 끝날 때까지, 폴드한 플레이어의 칩은 더 이상 변하지 않는다.
let seat1Chips = state.players.find((p) => p.seat === utg)!.chips;
while (state.phase !== "hand_over") {
  const seat = state.toActSeat;
  if (seat == null) break;
  const player = state.players.find((p) => p.seat === seat)!;
  const facing = state.betting.currentLevel - player.streetContribution;
  state = facing > 1e-9
    ? dispatch(state, { type: "CALL", seat }, rng)
    : dispatch(state, { type: "CHECK", seat }, rng);
  const foldedPlayer = state.players.find((p) => p.seat === utg)!;
  assert.equal(foldedPlayer.chips, seat1Chips, "폴드 이후 해당 좌석 칩은 더 이상 바뀌지 않아야 한다");
  seat1Chips = foldedPlayer.chips;
}

console.log("OK: mystery fold (no penalty)");
