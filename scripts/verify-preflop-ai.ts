import assert from "node:assert/strict";
import { computeAIBettingAction, generatePersonality } from "../src/holdem/aiPlayer";
import {
  buildPreflopAiContext,
  preflopAiAllInAllowed,
  preflopAiRaiseTarget,
} from "../src/holdem/preflopAiPolicy";
import type { GameState, HoldemGameMode, PlayerIndex } from "../src/holdem/types";

function stateFor(options: {
  templateId: string;
  stacksBb: [number, number];
  aiSeat?: PlayerIndex;
  mode?: HoldemGameMode;
  contributions?: [number, number];
  potBb?: number;
  raises?: number;
}): GameState {
  const aiSeat = options.aiSeat ?? 0;
  const contributions = options.contributions ?? [0.5, 1];
  const raises = options.raises ?? 0;
  return {
    gameMode: options.mode ?? "classic",
    phase: "preflop",
    handBlinds: { sb: 0.5, bb: 1, ante: 0 },
    button: 0,
    chips: options.stacksBb,
    pot: options.potBb ?? contributions[0] + contributions[1],
    betting: {
      contributed: contributions,
      currentLevel: Math.max(...contributions),
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: raises,
    },
    toAct: aiSeat,
    preflopStage: raises === 0 ? "button_acts" : "facing_raise",
    preflopRaiseCount: raises,
    holes: [null, null],
    isAllIn: false,
  } as unknown as GameState;
}

function withAiHand(state: GameState, aiSeat: PlayerIndex, templateId: string): GameState {
  state.holes[aiSeat] = { templateId } as GameState["holes"][number];
  return state;
}

let seed = 0x4689;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const personality = generatePersonality("hard", [100, 100], 0);

// 1. 100bb AA open: never jam; always a legal 2-3bb standard raise.
const aaDeep = withAiHand(stateFor({ templateId: "hi_AA", stacksBb: [100, 100] }), 0, "hi_AA");
for (let i = 0; i < 500; i++) {
  const action = computeAIBettingAction(aaDeep, 0, "hard", personality);
  assert.equal(action?.type, "PREFLOP_RAISE");
  if (action?.type === "PREFLOP_RAISE") {
    assert.ok(action.toLevelChips >= 2 && action.toLevelChips <= 3);
  }
}

// 2. 50bb KK facing 2bb: no jam; every generated re-raise obeys shared min 4bb.
const kkVsOpen = withAiHand(stateFor({
  templateId: "hi_KK",
  stacksBb: [50, 50],
  aiSeat: 1,
  contributions: [2, 1],
  potBb: 3,
  raises: 1,
}), 1, "hi_KK");
assert.equal(buildPreflopAiContext(kkVsOpen, 1).legalMinRaiseTo, 4);
assert.equal(preflopAiAllInAllowed(kkVsOpen, 1, "hi_KK"), false);
assert.ok(preflopAiRaiseTarget(kkVsOpen, 1, "hi_KK", 0) >= 4);
let kkRaises = 0;
let kkCalls = 0;
for (let i = 0; i < 500; i++) {
  const action = computeAIBettingAction(kkVsOpen, 1, "hard", personality);
  assert.notEqual(action?.type, "PREFLOP_ALL_IN");
  if (action?.type === "PREFLOP_RAISE") {
    kkRaises++;
    assert.ok(action.toLevelChips >= 4 && action.toLevelChips < 50);
  } else if (action?.type === "PREFLOP_CALL") kkCalls++;
}
assert.ok(kkRaises > kkCalls, `expected KK raises (${kkRaises}) > calls (${kkCalls})`);

// 3-4. Short effective stacks allow AA and AKs jams.
const aa15 = withAiHand(stateFor({ templateId: "hi_AA", stacksBb: [15, 15] }), 0, "hi_AA");
assert.equal(preflopAiAllInAllowed(aa15, 0, "hi_AA"), true);
const aks10 = withAiHand(stateFor({ templateId: "axs_AKs", stacksBb: [10, 10] }), 0, "axs_AKs");
assert.equal(preflopAiAllInAllowed(aks10, 0, "axs_AKs"), true);

// 5. Deep 76s cannot inherit AA's forced premium aggression or jam permission.
const suited76 = withAiHand(stateFor({ templateId: "conn_76s", stacksBb: [100, 100] }), 0, "conn_76s");
assert.equal(preflopAiAllInAllowed(suited76, 0, "conn_76s"), false);
let suitedRaises = 0;
for (let i = 0; i < 500; i++) {
  const action = computeAIBettingAction(suited76, 0, "hard", personality);
  if (action?.type === "PREFLOP_RAISE") suitedRaises++;
  assert.notEqual(action?.type, "PREFLOP_ALL_IN");
}
assert.ok(suitedRaises < 500, `76s unexpectedly matched AA aggression (${suitedRaises}/500)`);

// 6. Classic and Cost pass through the same betting policy.
for (const mode of ["classic", "cost"] as const) {
  const state = withAiHand(stateFor({ templateId: "hi_AA", stacksBb: [100, 100], mode }), 0, "hi_AA");
  assert.equal(preflopAiAllInAllowed(state, 0, "hi_AA"), false);
  const target = preflopAiRaiseTarget(state, 0, "hi_AA", 0.5);
  assert.ok(target >= 2 && target <= 3);
}

console.log(JSON.stringify({
  scenario1: "500/500 standard raises, 0 all-ins",
  scenario2: `${kkRaises} raises vs ${kkCalls} calls, min raise-to 4bb, 0 all-ins`,
  scenario3: "15bb AA all-in allowed",
  scenario4: "10bb AKs all-in allowed",
  scenario5: `76s raised ${suitedRaises}/500, 0 all-ins`,
  scenario6: "Classic/Cost shared policy passed",
}, null, 2));
