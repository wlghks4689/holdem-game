import assert from "node:assert/strict";
import {
  bettingActionDisplayAmount,
  bettingActionLabel,
  bettingActionPressure,
} from "../src/app/holdem/bettingActionPressure";
import type { GameMessage } from "../src/holdem/types";

const action = (
  t: "preflop_action" | "postflop_action",
  value: string,
): Extract<GameMessage, { t: "preflop_action" } | { t: "postflop_action" }> => ({
  t,
  player: 0,
  action: value,
});

assert.equal(bettingActionPressure(action("postflop_action", "체크"), 0), null);
assert.equal(bettingActionPressure(action("postflop_action", "베트"), 0)?.badge, "BET");
assert.equal(bettingActionPressure(action("postflop_action", "레이즈"), 1)?.badge, "RAISE");
assert.equal(bettingActionPressure(action("postflop_action", "레이즈"), 2)?.badge, "3-BET");
assert.equal(bettingActionPressure(action("preflop_action", "레이즈"), 3)?.badge, "4-BET");
assert.equal(bettingActionPressure(action("preflop_action", "레이즈"), 4)?.badge, "5-BET");
assert.equal(bettingActionPressure(action("preflop_action", "레이즈"), 5)?.badge, "6-BET");
assert.equal(bettingActionPressure(action("preflop_action", "레이즈"), 6)?.badge, "7-BET");
assert.equal(
  bettingActionPressure(action("preflop_action", "올인"), 3)?.badge,
  "ALL-IN",
);
assert.equal(
  bettingActionPressure(action("postflop_action", "올인 콜"), 1)?.badge,
  "ALL-IN",
);

assert.equal(bettingActionLabel(action("postflop_action", "체크"), 0), "CHECK");
assert.equal(bettingActionLabel(action("postflop_action", "콜"), 0), "CALL");
assert.equal(bettingActionLabel(action("postflop_action", "베트"), 0), "BET");
assert.equal(bettingActionLabel(action("preflop_action", "레이즈"), 1), "RAISE");
assert.equal(bettingActionLabel(action("preflop_action", "레이즈"), 2), "3-BET");
assert.equal(bettingActionLabel(action("preflop_action", "레이즈"), 3), "4-BET");
assert.equal(bettingActionLabel(action("postflop_action", "올인"), 2), "ALL-IN");
assert.equal(bettingActionLabel(action("postflop_action", "올인 콜"), 2), "ALL-IN");

assert.equal(
  bettingActionDisplayAmount(
    { ...action("postflop_action", "콜"), amount: 3 },
    24,
  ),
  3,
);
assert.equal(
  bettingActionDisplayAmount(
    { ...action("postflop_action", "체크"), amount: 3 },
    24,
  ),
  undefined,
);
assert.equal(
  bettingActionDisplayAmount(
    { ...action("preflop_action", "올인"), amount: 149 },
    150,
  ),
  150,
);
assert.equal(
  bettingActionDisplayAmount(
    { ...action("preflop_action", "올인 콜"), amount: 149 },
    150,
  ),
  150,
);

const bet = bettingActionPressure(action("postflop_action", "베트"), 0)!;
const raise = bettingActionPressure(action("postflop_action", "레이즈"), 1)!;
const threeBet = bettingActionPressure(action("postflop_action", "레이즈"), 2)!;
const fourBet = bettingActionPressure(action("preflop_action", "레이즈"), 3)!;
const fiveBet = bettingActionPressure(action("preflop_action", "레이즈"), 4)!;
const sixBet = bettingActionPressure(action("preflop_action", "레이즈"), 5)!;
const sevenBet = bettingActionPressure(action("preflop_action", "레이즈"), 6)!;
const allIn = bettingActionPressure(action("preflop_action", "올인"), 3)!;

assert.ok(bet.motionMs < raise.motionMs);
assert.ok(raise.motionMs < threeBet.motionMs);
assert.ok(threeBet.motionMs < fourBet.motionMs);
assert.ok(fourBet.motionMs < fiveBet.motionMs);
assert.ok(fiveBet.motionMs < sixBet.motionMs);
assert.ok(sixBet.motionMs < sevenBet.motionMs);
assert.ok(sevenBet.motionMs < allIn.motionMs);
assert.equal(fiveBet.soundLevel, 4);
assert.equal(sixBet.soundLevel, 4);
assert.equal(sevenBet.soundLevel, 4);
assert.deepEqual(
  [bet.soundLevel, raise.soundLevel, threeBet.soundLevel, fourBet.soundLevel, allIn.soundLevel],
  [1, 2, 3, 4, 5],
);

console.log("Betting pressure verification passed: labels, motion holds, and sound tiers.");
