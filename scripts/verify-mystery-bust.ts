import assert from "node:assert/strict";
import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import { autoCompleteHandSetup, dispatch, mulberry32, totalChipsInPlay } from "./mysteryTestHelpers";
import { createInitialMysteryGameState, mysteryHoldemReducer } from "../src/mysteryHoldem/gameReducer";
import type { MysteryGameState } from "../src/mysteryHoldem/types";

/**
 * 3인 테이블에서 한 명(C)은 프리플랍에 폴드시켜 매치가 끝나지 않게(Last Player Standing 회피)
 * 두고, 남은 두 명(A vs B)을 올인 대결시킨다. 진 쪽은 버스트되어야 한다.
 * (동률 시드는 버스트가 발생하지 않으므로 실제로 버스트가 난 첫 시드를 사용한다.)
 */
let found: MysteryGameState | null = null;
for (let seed = 1; seed <= 100 && found == null; seed++) {
  const rng = mulberry32(seed);
  const chipsBefore = 3 * MYSTERY_HOLDEM_CONFIG.startingChips;
  let state = mysteryHoldemReducer(createInitialMysteryGameState(), { type: "START_MATCH", seatCount: 3 }, rng);
  state = autoCompleteHandSetup(state, rng);
  if (state.phase !== "preflop") continue;

  const seatC = state.toActSeat!;
  state = dispatch(state, { type: "FOLD", seat: seatC }, rng);
  if (state.phase !== "preflop" || state.toActSeat == null) continue;

  const seatA = state.toActSeat;
  state = dispatch(state, { type: "ALL_IN", seat: seatA }, rng);
  if (state.toActSeat != null) {
    state = dispatch(state, { type: "CALL", seat: state.toActSeat }, rng);
  }
  if (state.phase !== "hand_over") continue;

  assert.equal(totalChipsInPlay(state), chipsBefore, "칩 총량은 핸드 정산 후에도 보존되어야 한다(레이크 없음)");
  const busted = state.players.filter((p) => p.busted);
  if (busted.length === 1) found = state;
}

assert.ok(found != null, "여러 시드 중 최소 한 번은 명확한 승/패(버스트)가 나와야 한다");
const state = found!;
const bustedSeat = state.players.find((p) => p.busted)!;
// 버스트를 유발한 승자는 올인 대결의 상대(가장 많은 칩을 가져간 좌석) — 방관자로 폴드한
// 세 번째 좌석(C)은 칩은 그대로지만 Bounty와는 무관하므로 최댓값 기준으로 구분한다.
let survivorSeat = state.players.find((p) => !p.busted)!;
for (const p of state.players) {
  if (!p.busted && p.chips > survivorSeat.chips) survivorSeat = p;
}

assert.equal(bustedSeat.chips, 0);
assert.equal(state.matchEnded, false, "3인 중 1인만 버스트했다면 아직 Last Player Standing이 아니다");

const bustLog = state.logs.find((l) => l.t === "player_busted" && l.seat === bustedSeat.seat);
assert.ok(bustLog != null, "player_busted 로그가 있어야 한다");

const bountyLog = state.logs.find((l) => l.t === "bounty_awarded" && l.bustedSeat === bustedSeat.seat);
assert.ok(bountyLog != null, "버스트 이벤트에 대한 Bounty 지급 로그가 있어야 한다");
if (bountyLog && bountyLog.t === "bounty_awarded") {
  assert.equal(survivorSeat.bountyPoint, MYSTERY_HOLDEM_CONFIG.bountyRewardPerBust);
}

// 버스트된 플레이어는 다음 핸드에 참여하지 않는다(카드/미션 없음, Betting Turn 제외).
const nextHand = dispatch(state, { type: "START_NEXT_HAND" }, mulberry32(999));
assert.equal(nextHand.awaitingHoleSelection.includes(bustedSeat.seat), false);
const bustedInNext = nextHand.players.find((p) => p.seat === bustedSeat.seat)!;
assert.equal(bustedInNext.inHand, false);
assert.equal(bustedInNext.holeCards.length, 0);

console.log("OK: mystery bust + bounty");
