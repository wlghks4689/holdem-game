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

// ── Big Blind Ante는 BB 전용 사이드 팟을 만들지 않는다 ──
// 앤티를 handContribution에 넣으면 BB만 기여액이 한 단계 높아져 "BB만 자격이 있는 팟"이
// 생기고, BB가 매 핸드 자기 앤티를 그대로 되돌려받는다. 앤티는 테이블 공용 데드머니다.
{
  const rng2 = mulberry32(3);
  let s = startMatch(3, rng2);
  s = autoCompleteHandSetup(s, rng2);
  assert.equal(s.phase, "preflop");

  const bb = s.players.find((p) => p.anteContribution > 0);
  assert.ok(bb != null, "BB가 앤티를 내야 한다");
  assert.equal(bb!.anteContribution, MYSTERY_HOLDEM_CONFIG.bigBlindAnte);
  assert.equal(
    bb!.handContribution,
    MYSTERY_HOLDEM_CONFIG.bigBlind,
    "handContribution에는 블라인드만 들어가고 앤티는 빠져야 한다",
  );

  // 전원 콜/체크로 쇼다운까지 — 올인이 없으므로 팟은 정확히 1개여야 한다.
  let guard = 0;
  while (s.phase !== "hand_over" && s.toActSeat != null && guard++ < 200) {
    const seat = s.toActSeat;
    const p = s.players.find((x) => x.seat === seat)!;
    const facing = s.betting.currentLevel - p.streetContribution;
    s = facing > 1e-9
      ? dispatch(s, { type: "CALL", seat }, rng2)
      : dispatch(s, { type: "CHECK", seat }, rng2);
  }
  assert.ok(
    s.players.every((p) => !p.allIn),
    "이 시나리오에는 올인이 없어야 한다(전제 확인)",
  );
  assert.equal(s.pots.length, 1, `올인이 없으면 팟은 1개여야 하는데 ${s.pots.length}개다`);
  assert.ok(
    s.pots[0]!.amount >= MYSTERY_HOLDEM_CONFIG.bigBlindAnte,
    "앤티가 메인 팟에 포함되어야 한다",
  );
}

console.log("OK: mystery blinds/ante (ante는 사이드 팟을 만들지 않는다)");
