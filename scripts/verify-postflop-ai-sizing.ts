import assert from "node:assert/strict";
import {
  computeAIBettingAction,
  type AIPersonality,
} from "../src/holdem/aiPlayer";
import {
  postflopAiMaxOpenBetForActor,
  postflopAiMaxRaiseTargetForActor,
  postflopRaiseTargetCappedByOpponent,
} from "../src/holdem/bettingHelpers";
import { createInitialGameState } from "../src/holdem/gameReducer";
import type { GameState } from "../src/holdem/types";

const aggressive: AIPersonality = {
  style: "aggressive",
  bluffRate: 0,
  raiseFreq: 1,
};

function postflopState(options: {
  pot: number;
  chips: [number, number];
  contributed: [number, number];
}): GameState {
  const base = createInitialGameState("classic");
  return {
    ...base,
    phase: "flop",
    handBlinds: { sb: 0.5, bb: 1, ante: 0 },
    chips: options.chips,
    pot: options.pot,
    betting: {
      contributed: options.contributed,
      currentLevel: Math.max(...options.contributed),
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 0,
    },
    toAct: 1,
    holes: [null, { templateId: "hi_AA" }],
    isAllIn: false,
  } as unknown as GameState;
}

const deepFacingRaise = postflopState({
  pot: 15,
  chips: [195, 200],
  contributed: [5, 0],
});

assert.equal(postflopRaiseTargetCappedByOpponent(deepFacingRaise), 200);
assert.equal(postflopAiMaxRaiseTargetForActor(deepFacingRaise), 20);

let deepRaiseCount = 0;
for (let i = 0; i < 2_000; i++) {
  const action = computeAIBettingAction(
    deepFacingRaise,
    1,
    "hard",
    aggressive,
  );
  if (action?.type !== "POSTFLOP_RAISE") continue;
  deepRaiseCount++;
  assert.ok(action.toLevelChips <= 20 + 1e-9);
  assert.ok(action.toLevelChips < 200 - 1e-9);
}
assert.ok(deepRaiseCount > 0, "deep-stack scenario should exercise raises");

const deepOpen = postflopState({
  pot: 12,
  chips: [200, 200],
  contributed: [0, 0],
});
assert.equal(postflopAiMaxOpenBetForActor(deepOpen), 12);

let deepBetCount = 0;
for (let i = 0; i < 2_000; i++) {
  const action = computeAIBettingAction(deepOpen, 1, "hard", aggressive);
  if (action?.type !== "POSTFLOP_BET") continue;
  deepBetCount++;
  assert.ok(action.amount <= 12 + 1e-9);
  assert.ok(action.amount < 200 - 1e-9);
}
assert.ok(deepBetCount > 0, "deep-stack scenario should exercise bets");

// A genuinely short stack may still move all-in when it cannot make a full
// minimum raise. This preserves valid low-SPR no-limit behavior.
const shortFacingRaise = postflopState({
  pot: 120,
  chips: [20, 60],
  contributed: [40, 0],
});
assert.equal(postflopAiMaxRaiseTargetForActor(shortFacingRaise), 60);

let shortAllInCount = 0;
for (let i = 0; i < 2_000; i++) {
  const action = computeAIBettingAction(
    shortFacingRaise,
    1,
    "hard",
    aggressive,
  );
  if (action?.type !== "POSTFLOP_RAISE") continue;
  shortAllInCount++;
  assert.equal(action.toLevelChips, 60);
}
assert.ok(shortAllInCount > 0, "short-stack scenario should preserve all-in raises");

console.log("Postflop AI sizing verification passed.");
