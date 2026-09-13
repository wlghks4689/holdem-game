import assert from "node:assert/strict";
import { autoCompleteHandSetup, dispatch, mulberry32, playHandToEnd, startMatch } from "./mysteryTestHelpers";
import { createInitialMysteryGameState, mysteryHoldemReducer } from "../src/mysteryHoldem/gameReducer";
import type { MysteryGameState } from "../src/mysteryHoldem/types";

// §21-A: 15라운드를 (버스트 없이) 체크/콜만으로 진행하면 라운드 제한 종료로 끝나야 한다.
{
  const rng = mulberry32(42);
  let state = startMatch(2, rng);
  let rounds = 0;
  while (!state.matchEnded && rounds < 30) {
    state = playHandToEnd(state, rng);
    rounds++;
    if (!state.matchEnded) {
      state = dispatch(state, { type: "START_NEXT_HAND" }, rng);
    }
  }
  assert.equal(state.matchEnded, true);
  assert.equal(state.matchEndReason, "round_limit");
  assert.equal(state.round, 15, "15라운드 종료 후 게임이 끝나야 한다");
  assert.ok(state.matchWinners != null && state.matchWinners.length >= 1);
  // Round 16이 진행되지 않는지 확인 — START_NEXT_HAND은 더 이상 라운드를 진행시키지 않는다.
  const after = dispatch(state, { type: "START_NEXT_HAND" }, rng);
  assert.strictEqual(after, state);
}

// §21-B: 15라운드 전에 한 명을 제외한 전원이 버스트되면 즉시 승리하고 이후 라운드는 진행하지 않는다.
{
  let found: MysteryGameState | null = null;
  for (let seed = 1; seed <= 100 && found == null; seed++) {
    const rng = mulberry32(seed);
    let state = mysteryHoldemReducer(createInitialMysteryGameState(), { type: "START_MATCH", seatCount: 2 }, rng);
    state = autoCompleteHandSetup(state, rng);
    if (state.phase !== "preflop" || state.toActSeat == null) continue;
    state = dispatch(state, { type: "ALL_IN", seat: state.toActSeat }, rng);
    if (state.toActSeat != null) {
      state = dispatch(state, { type: "CALL", seat: state.toActSeat }, rng);
    }
    if (state.matchEnded && state.matchEndReason === "last_player_standing" && state.round < 15) {
      found = state;
    }
  }
  assert.ok(found != null, "헤즈업 올인 대결로 Last Player Standing 종료가 재현되어야 한다");
  const state = found!;
  assert.equal(state.matchWinners?.length, 1);
  assert.equal(state.round < 15, true, "15라운드 이전에 즉시 종료되어야 한다");

  const after = dispatch(state, { type: "START_NEXT_HAND" }, mulberry32(1));
  assert.strictEqual(after, state, "매치 종료 후에는 더 이상 라운드가 진행되지 않아야 한다");
}

console.log("OK: mystery game end conditions");
