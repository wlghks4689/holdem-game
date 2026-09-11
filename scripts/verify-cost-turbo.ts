import assert from "node:assert/strict";
import { getBlindLevel, handBlindsFromRound } from "../src/holdem/blindLevels";
import { createInitialGameState, holdemReducer } from "../src/holdem/gameReducer";
import { startingChipsForMode, totalRoundsForMode } from "../src/holdem/gameModeRules";
import { turboAiUrgency } from "../src/holdem/turboAiUrgency";
import { computeAIBettingAction, type AIPersonality } from "../src/holdem/aiPlayer";
import type { Card } from "../src/holdem/cards";
import type { GameAction, GameState, PlayerIndex, SelectedHand } from "../src/holdem/types";

const expectedLevels = [
  [1, 0.5, 1, 1],
  [5, 0.5, 1, 1],
  [6, 1, 2, 2],
  [10, 1, 2, 2],
  [11, 2, 4, 4],
  [15, 2, 4, 4],
] as const;

for (const [round, smallBlind, bigBlind, ante] of expectedLevels) {
  assert.deepEqual(getBlindLevel(round, "cost", "turbo"), {
    smallBlind,
    bigBlind,
    ante,
  });
}

assert.equal(startingChipsForMode("cost", "deep"), 150);
assert.equal(totalRoundsForMode("cost", "deep"), 20);
assert.equal(startingChipsForMode("cost", "turbo"), 100);
assert.equal(totalRoundsForMode("cost", "turbo"), 15);
assert.equal(startingChipsForMode("classic", "turbo"), 200);
assert.equal(totalRoundsForMode("classic", "turbo"), 30);

function startSelectedHand(structure: "deep" | "turbo"): GameState {
  let state = createInitialGameState("cost", structure);
  state = holdemReducer(state, { type: "SELECT_HAND", player: 0, templateId: "hi_AA" }, () => 0.1);
  state = holdemReducer(state, { type: "SELECT_HAND", player: 1, templateId: "hi_KK" }, () => 0.2);
  return state;
}

const turboStart = startSelectedHand("turbo");
assert.equal(turboStart.phase, "preflop");
assert.deepEqual(turboStart.chips, [98.5, 98]);
assert.equal(turboStart.pot, 3.5);
assert.deepEqual(turboStart.betting.contributed, [0.5, 1]);

const deepStart = startSelectedHand("deep");
assert.deepEqual(deepStart.chips, [149.5, 148]);
assert.equal(deepStart.pot, 2.5);
assert.deepEqual(deepStart.betting.contributed, [0.5, 1]);

function endedRound(roundNumber: number, chips: [number, number]): GameState {
  const state = createInitialGameState("cost", "turbo");
  return {
    ...state,
    roundNumber,
    phase: "hand_over",
    chips,
    handStartChips: chips,
  };
}

const afterFive = holdemReducer(endedRound(5, [100, 100]), { type: "NEW_HAND" }, () => 0.3);
assert.equal(afterFive.roundNumber, 6);
assert.deepEqual(afterFive.handBlinds, { sb: 1, bb: 2, ante: 2 });
assert.equal(afterFive.matchEnded, false);

const afterTen = holdemReducer(endedRound(10, [100, 100]), { type: "NEW_HAND" }, () => 0.3);
assert.equal(afterTen.roundNumber, 11);
assert.deepEqual(afterTen.handBlinds, { sb: 2, bb: 4, ante: 4 });

const liveFifteen = {
  ...endedRound(15, [110, 90]),
  phase: "river" as const,
};
assert.equal(liveFifteen.matchEnded, false);

for (const scenario of [
  { chips: [110, 90] as [number, number], winner: 0 as PlayerIndex, reason: "round_limit_stack_lead" },
  { chips: [90, 110] as [number, number], winner: 1 as PlayerIndex, reason: "round_limit_stack_lead" },
  { chips: [100, 100] as [number, number], winner: null, reason: "round_limit_draw" },
]) {
  const result = holdemReducer(endedRound(15, scenario.chips), { type: "NEW_HAND" }, () => 0.4);
  assert.equal(result.roundNumber, 15);
  assert.equal(result.matchEnded, true);
  assert.equal(result.matchWinner, scenario.winner);
  assert.equal(result.matchEndReason, scenario.reason);
}

const bust = holdemReducer(endedRound(8, [0, 200]), { type: "NEW_HAND" }, () => 0.4);
assert.equal(bust.matchEnded, true);
assert.equal(bust.matchWinner, 1);
assert.equal(bust.matchEndReason, "bust");

function urgencyState(roundNumber: number, chips: [number, number]): GameState {
  return {
    ...createInitialGameState("cost", "turbo"),
    roundNumber,
    chips,
    handBlinds: handBlindsFromRound(roundNumber, "cost", "turbo"),
  };
}

const equalEarly = turboAiUrgency(urgencyState(1, [100, 100]), 1)!;
const behindEarly = turboAiUrgency(urgencyState(2, [115, 85]), 1)!;
const behindLate = turboAiUrgency(urgencyState(13, [165, 35]), 1)!;
const leadingLate = turboAiUrgency(urgencyState(14, [35, 165]), 1)!;
assert.equal(equalEarly.urgency, 0);
assert.ok(behindEarly.urgency > 0 && behindEarly.urgency < 0.3);
assert.ok(behindLate.urgency > behindEarly.urgency);
assert.ok(behindLate.urgency > 0.65);
assert.equal(behindLate.remainingRounds, 2);
assert.equal(behindLate.bigBlind, 4);
assert.equal(behindLate.effectiveStackBb, 8.75);
assert.equal(leadingLate.urgency, 0);
assert.equal(turboAiUrgency(createInitialGameState("cost", "deep"), 1), null);
assert.equal(turboAiUrgency(createInitialGameState("classic"), 1), null);

const aggressive: AIPersonality = {
  style: "aggressive",
  bluffRate: 0,
  raiseFreq: 0.72,
};

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function selectedHand(
  templateId: string,
  hole: [Card, Card],
): SelectedHand {
  return {
    templateId,
    hole,
    iaCategory: templateId.startsWith("conn_") ? "커넥터 수딧" : "브로드웨이 수딧",
    acquisitionType: "selected",
    selectedHandKey: templateId,
  };
}

function sampleActions(state: GameState, count = 1_200): Record<GameAction["type"], number> {
  const counts = {} as Record<GameAction["type"], number>;
  const originalRandom = Math.random;
  Math.random = seededRandom(48271);
  try {
    for (let i = 0; i < count; i++) {
      const action = computeAIBettingAction(state, 1, "normal", aggressive);
      if (action) counts[action.type] = (counts[action.type] ?? 0) + 1;
    }
  } finally {
    Math.random = originalRandom;
  }
  return counts;
}

function preflopDecisionState(
  structure: "deep" | "turbo",
  templateId: string,
  chips: [number, number] = [165, 35],
): GameState {
  const base = createInitialGameState("cost", structure);
  return {
    ...base,
    roundNumber: 13,
    phase: "preflop",
    handBlinds: { sb: 1, bb: 2, ante: 2 },
    button: 0,
    chips,
    pot: 10,
    betting: {
      contributed: [4, 1],
      currentLevel: 4,
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 1,
    },
    preflopStage: "facing_raise",
    preflopRaiseCount: 1,
    toAct: 1,
    holes: [
      selectedHand("hi_AA", [{ rank: 14, suit: "s" }, { rank: 14, suit: "h" }]),
      selectedHand(templateId, [{ rank: 8, suit: "s" }, { rank: 7, suit: "s" }]),
    ],
  };
}

const mediumDeep = sampleActions(preflopDecisionState("deep", "axs_A5s"));
const mediumTurbo = sampleActions(preflopDecisionState("turbo", "axs_A5s"));
const deepAggression = (mediumDeep.PREFLOP_RAISE ?? 0) + (mediumDeep.PREFLOP_ALL_IN ?? 0);
const turboAggression = (mediumTurbo.PREFLOP_RAISE ?? 0) + (mediumTurbo.PREFLOP_ALL_IN ?? 0);
assert.ok(turboAggression > deepAggression, "late trailing Turbo AI should widen preflop aggression");

const weakTurbo = sampleActions(preflopDecisionState("turbo", "conn_76s"));
assert.equal(
  weakTurbo.FOLD ?? 0,
  0,
  "a playable pool hand must defend against a single 2bb raise",
);
assert.ok(
  (weakTurbo.PREFLOP_CALL ?? 0) + (weakTurbo.PREFLOP_RAISE ?? 0) > 0,
  "the defended hand should still mix calls and raises",
);

const shortTurbo = sampleActions(preflopDecisionState("turbo", "axs_AKs", [190, 10]));
const shortDeep = sampleActions(preflopDecisionState("deep", "axs_AKs", [190, 10]));
assert.ok(
  (shortTurbo.PREFLOP_ALL_IN ?? 0) > (shortDeep.PREFLOP_ALL_IN ?? 0),
  "low effective-BB Turbo AI should shove more often",
);

function postflopDrawState(structure: "deep" | "turbo"): GameState {
  const base = createInitialGameState("cost", structure);
  return {
    ...base,
    roundNumber: 13,
    phase: "turn",
    handBlinds: { sb: 1, bb: 2, ante: 2 },
    chips: [165, 35],
    pot: 24,
    board: [
      { rank: 6, suit: "s" },
      { rank: 9, suit: "d" },
      { rank: 2, suit: "s" },
      { rank: 13, suit: "c" },
    ],
    boardRevealed: 4,
    holes: [
      selectedHand("hi_AA", [{ rank: 14, suit: "h" }, { rank: 14, suit: "d" }]),
      selectedHand("conn_87s", [{ rank: 8, suit: "s" }, { rank: 7, suit: "s" }]),
    ],
    betting: {
      contributed: [6, 0],
      currentLevel: 6,
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 0,
    },
    toAct: 1,
  };
}

const drawDeep = sampleActions(postflopDrawState("deep"), 300);
const drawTurbo = sampleActions(postflopDrawState("turbo"), 300);
assert.ok(
  (drawTurbo.POSTFLOP_RAISE ?? 0) > (drawDeep.POSTFLOP_RAISE ?? 0),
  "late trailing Turbo AI should raise strong draws more often",
);

const leadingState = preflopDecisionState("turbo", "axs_A5s", [35, 165]);
const leadingActions = sampleActions(leadingState);
assert.ok(
  (leadingActions.PREFLOP_CALL ?? 0) + (leadingActions.PREFLOP_RAISE ?? 0) > 0,
  "leading Turbo AI should retain normal defend/value ranges",
);

console.log(
  "Cost Turbo verification passed: config, two-player ante, fractional chips, "
  + "round transitions, round-15 results, bust, urgency, AI action modifiers, "
  + "Deep/Classic isolation.",
);
