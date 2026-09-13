import assert from "node:assert/strict";
import { raiseCapForStreet } from "../src/mysteryHoldem/betting";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";

assert.equal(raiseCapForStreet("preflop"), 2);
assert.equal(raiseCapForStreet("flop"), 2);
assert.equal(raiseCapForStreet("turn"), 2);
assert.equal(raiseCapForStreet("river"), 3);

// 3인 테이블에서 프리플랍 Raise Cap(2) 초과 시 Bet/Raise가 막히고 Call/Fold만 가능해야 한다.
// 최초 Bet(빅블라인드 자체는 카운트하지 않음)에 이어 레이즈를 정확히 2번까지만 허용한다.
{
  const rng = mulberry32(7);
  let state = startMatch(3, rng);
  state = autoCompleteHandSetup(state, rng);
  assert.equal(state.phase, "preflop");
  assert.equal(state.betting.raiseCap, 2);
  assert.equal(state.betting.raisesUsed, 0);

  // UTG 레이즈(1번째 레이즈)
  let actor = state.toActSeat!;
  state = dispatch(state, { type: "RAISE", seat: actor, toAmount: 600 }, rng);
  assert.equal(state.betting.raisesUsed, 1);

  // 다음 액터 레이즈(2번째 레이즈 = cap 도달)
  actor = state.toActSeat!;
  state = dispatch(state, { type: "RAISE", seat: actor, toAmount: 1800 }, rng);
  assert.equal(state.betting.raisesUsed, 2);

  // 캡 도달 후에는 어떤 레이즈도 거부되어야 한다(체크/콜/폴드만 가능).
  actor = state.toActSeat!;
  const before = state;
  const blocked = dispatch(state, { type: "RAISE", seat: actor, toAmount: 5400 }, rng);
  assert.strictEqual(blocked, before, "Raise Cap 도달 후 추가 레이즈는 거부되어야 한다");
  const blockedAllIn = dispatch(state, { type: "ALL_IN", seat: actor }, rng);
  assert.strictEqual(blockedAllIn, before, "Raise Cap 도달 후 레이즈성 올인도 거부되어야 한다");

  // 콜은 허용된다.
  const afterCall = dispatch(state, { type: "CALL", seat: actor }, rng);
  assert.notStrictEqual(afterCall, before);
}

console.log("OK: mystery raise cap");
