import assert from "node:assert/strict";
import { calculatePotLimitMaxRaise, calculateMinRaiseToLevel, raiseRangeForActor } from "../src/mysteryHoldem/potLimit";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";

// 표준 Pot-Limit 예시: 팟 100, 콜 20 → 콜 후 팟 120 → 최대 레이즈 폭 120 → 총 레벨 20+120=140
assert.equal(
  calculatePotLimitMaxRaise({ potBeforeAction: 100, currentLevel: 20, actorContributedThisStreet: 0 }),
  140,
);

// 액터가 이미 이번 스트리트에 일부 기여했다면 콜 금액은 그 차액만.
assert.equal(
  calculatePotLimitMaxRaise({ potBeforeAction: 100, currentLevel: 20, actorContributedThisStreet: 10 }),
  // callAmount=10, potAfterCall=110, max=20+110=130
  130,
);

// 오픈 베팅(currentLevel=0)에서는 최대 = 팟 그대로.
assert.equal(
  calculatePotLimitMaxRaise({ potBeforeAction: 300, currentLevel: 0, actorContributedThisStreet: 0 }),
  300,
);

assert.equal(calculateMinRaiseToLevel(200, 200), 400);

// 스택이 표준 min-raise에 못 미치면 숏스택 올인 한 점만 반환한다.
{
  const range = raiseRangeForActor({
    potBeforeAction: 600,
    currentLevel: 200,
    actorContributedThisStreet: 0,
    actorStack: 250,
    minRaiseIncrement: 200,
  });
  assert.ok(range != null);
  assert.equal(range!.min, 250);
  assert.equal(range!.max, 250);
}

// 콜조차 못 채우면 레이즈 불가.
{
  const range = raiseRangeForActor({
    potBeforeAction: 600,
    currentLevel: 200,
    actorContributedThisStreet: 0,
    actorStack: 100,
    minRaiseIncrement: 200,
  });
  assert.equal(range, null);
}

// reducer 통합: Pot Limit 최대치를 초과하는 레이즈는 거부되고, 정확히 최대치는 허용된다.
{
  const rng = mulberry32(6);
  let state = startMatch(2, rng);
  state = autoCompleteHandSetup(state, rng);
  assert.equal(state.phase, "preflop");
  const actorSeat = state.toActSeat!;

  const tooHigh = dispatch(state, { type: "RAISE", seat: actorSeat, toAmount: 999_999 }, rng);
  assert.strictEqual(tooHigh, state, "Pot Limit 초과 레이즈는 거부되어야 한다");

  const tooLow = dispatch(state, { type: "RAISE", seat: actorSeat, toAmount: 210 }, rng);
  assert.strictEqual(tooLow, state, "Minimum Raise 미만은 거부되어야 한다(2bb 미만 등)");

  const ok = dispatch(state, { type: "RAISE", seat: actorSeat, toAmount: 400 }, rng);
  assert.notStrictEqual(ok, state, "최소 레이즈(2bb=400) 총액은 허용되어야 한다");
}

console.log("OK: mystery pot-limit");
