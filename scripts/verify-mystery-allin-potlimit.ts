import assert from "node:assert/strict";
import { currentTotalPot } from "../src/mysteryHoldem/gameReducer";
import { calculatePotLimitMaxRaise } from "../src/mysteryHoldem/potLimit";
import { legalActionsForSeat } from "../src/mysteryHoldem/selectors";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";
import type { MysteryGameState, Seat } from "../src/mysteryHoldem/types";

/**
 * Pot-Limit에서 ALL_IN은 별도의 액션이 아니라 "스택 전액을 건 레이즈"다.
 * 따라서 스택이 Pot Limit 상한보다 크면 올인 레이즈는 불법이며, 상한까지만 레이즈할 수 있다.
 * (콜조차 스택으로 못 채우는 숏스택의 올인 콜은 언제나 합법 — 이건 레이즈가 아니다.)
 */

function potLimitMaxFor(state: MysteryGameState, seat: Seat): number {
  const player = state.players.find((p) => p.seat === seat)!;
  return calculatePotLimitMaxRaise({
    potBeforeAction: currentTotalPot(state),
    currentLevel: state.betting.currentLevel,
    actorContributedThisStreet: player.streetContribution,
  });
}

function streetContributionOf(state: MysteryGameState, seat: Seat): number {
  return state.players.find((p) => p.seat === seat)!.streetContribution;
}

// ── 프리플랍: 딥스택 올인은 팟을 넘길 수 없다 ──
{
  const rng = mulberry32(6);
  let state = startMatch(2, rng);
  state = autoCompleteHandSetup(state, rng);
  assert.equal(state.phase, "preflop");

  const seat = state.toActSeat!;
  const potMax = potLimitMaxFor(state, seat);
  const stack = state.players.find((p) => p.seat === seat)!.chips;
  assert.ok(stack + streetContributionOf(state, seat) > potMax, "딥스택 전제가 성립해야 한다");

  // 올인 버튼 자체가 제공되면 안 된다.
  assert.equal(
    legalActionsForSeat(state, seat).canAllIn,
    false,
    "스택이 Pot Limit을 넘으면 올인은 합법 액션이 아니다",
  );

  const after = dispatch(state, { type: "ALL_IN", seat }, rng);
  assert.strictEqual(after, state, "Pot Limit을 초과하는 올인은 거부되어야 한다");
}

// ── 포스트플랍(플랍)에서도 동일 ──
{
  const rng = mulberry32(11);
  let state = startMatch(3, rng);
  state = autoCompleteHandSetup(state, rng);

  // 프리플랍을 콜/체크로 넘겨 플랍까지 간다.
  let guard = 0;
  while (state.phase === "preflop" && state.toActSeat != null) {
    if (guard++ > 50) throw new Error("preflop did not converge");
    const seat = state.toActSeat;
    const legal = legalActionsForSeat(state, seat);
    state = legal.canCheck
      ? dispatch(state, { type: "CHECK", seat }, rng)
      : dispatch(state, { type: "CALL", seat }, rng);
  }
  assert.equal(state.phase, "flop");

  const seat = state.toActSeat!;
  const potMax = potLimitMaxFor(state, seat);
  const stack = state.players.find((p) => p.seat === seat)!.chips;
  assert.ok(stack + streetContributionOf(state, seat) > potMax, "딥스택 전제가 성립해야 한다");

  assert.equal(legalActionsForSeat(state, seat).canAllIn, false, "플랍에서도 팟 오버 올인은 불가");

  const after = dispatch(state, { type: "ALL_IN", seat }, rng);
  assert.strictEqual(after, state, "플랍에서 Pot Limit 초과 올인은 거부되어야 한다");

  // 상한까지의 베팅은 정상 동작해야 한다(막아놓고 끝내면 안 된다).
  const atMax = dispatch(state, { type: "BET", seat, amount: potMax }, rng);
  assert.notStrictEqual(atMax, state, "Pot Limit 상한 베팅은 허용되어야 한다");
  assert.ok(
    Math.abs(streetContributionOf(atMax, seat) - potMax) < 1e-9,
    "상한 베팅 후 기여액이 정확히 Pot Limit이어야 한다",
  );
}

// ── 숏스택: 올인 총액이 Pot Limit 이내면 올인은 합법 ──
{
  const rng = mulberry32(6);
  let state = startMatch(2, rng);
  state = autoCompleteHandSetup(state, rng);
  const seat = state.toActSeat!;

  // 스택을 Pot Limit 상한 아래로 줄여 올인이 합법이 되는 상황을 만든다.
  const potMax = potLimitMaxFor(state, seat);
  const shortStack = potMax - streetContributionOf(state, seat) - 100;
  state = {
    ...state,
    players: state.players.map((p) => (p.seat === seat ? { ...p, chips: shortStack } : p)),
  };

  assert.equal(legalActionsForSeat(state, seat).canAllIn, true, "Pot Limit 이내 올인은 합법");
  const after = dispatch(state, { type: "ALL_IN", seat }, rng);
  assert.notStrictEqual(after, state, "Pot Limit 이내 올인은 허용되어야 한다");
  assert.equal(after.players.find((p) => p.seat === seat)!.chips, 0, "스택 전액이 들어가야 한다");
  assert.equal(after.players.find((p) => p.seat === seat)!.allIn, true);
}

// ── 숏스택 올인 콜: 콜조차 못 채우면 레이즈가 아니므로 언제나 합법 ──
{
  const rng = mulberry32(9);
  let state = startMatch(2, rng);
  state = autoCompleteHandSetup(state, rng);
  const raiser = state.toActSeat!;
  state = dispatch(state, { type: "RAISE", seat: raiser, toAmount: 600 }, rng);

  const caller = state.toActSeat!;
  // 콜 금액(600 - 이미 낸 금액)보다 적은 스택으로 만든다.
  const facing = state.betting.currentLevel - streetContributionOf(state, caller);
  state = {
    ...state,
    players: state.players.map((p) => (p.seat === caller ? { ...p, chips: facing - 100 } : p)),
  };

  const shortStack = facing - 100;
  assert.equal(
    legalActionsForSeat(state, caller).canAllIn,
    true,
    "콜도 못 채우는 숏스택의 올인 콜은 언제나 합법",
  );
  const after = dispatch(state, { type: "ALL_IN", seat: caller }, rng);
  assert.notStrictEqual(after, state, "올인 콜은 허용되어야 한다");
  // 올인 콜은 스트리트를 끝내고 런아웃·정산까지 진행시키므로 칩 잔액으로는 검증할 수 없다
  // (팟을 따면 칩이 다시 늘어난다). 액션 로그로 스택 전액이 들어갔는지를 확인한다.
  const allInCallLog = after.logs.find(
    (l) => l.t === "action" && l.seat === caller && l.action === "all_in_call",
  );
  assert.ok(allInCallLog, "all_in_call 로그가 남아야 한다");
  assert.equal(
    allInCallLog.t === "action" ? allInCallLog.amount : undefined,
    shortStack,
    "올인 콜은 남은 스택 전액을 지불해야 한다",
  );
}

console.log("OK: mystery all-in pot limit");
