import assert from "node:assert/strict";
import type { Card } from "../src/holdem/cards";
import { createInitialGameState, holdemReducer } from "../src/holdem/gameReducer";
import type { GameAction, GameState } from "../src/holdem/types";

const c = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });
const board = [
  c(2, "c"),
  c(5, "d"),
  c(9, "h"),
  c(11, "s"),
  c(12, "c"),
];

function facingAllInState(
  phase: "preflop" | "flop" | "turn" | "river",
): GameState {
  const base = createInitialGameState("classic");
  const revealed = phase === "preflop" ? 0 : phase === "flop" ? 3 : phase === "turn" ? 4 : 5;
  return {
    ...base,
    phase,
    chips: [0, 100],
    pot: 20,
    betting: {
      contributed: [10, 0],
      currentLevel: 10,
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 1,
    },
    toAct: 1,
    preflopStage: phase === "preflop" ? "facing_raise" : null,
    holes: [
      { hole: [c(14, "s"), c(14, "h")], templateId: "hi_AA" },
      { hole: [c(13, "s"), c(13, "h")], templateId: "hi_KK" },
    ],
    board,
    boardRevealed: revealed,
    runoutUiStartRevealed: null,
    isAllIn: true,
  } as unknown as GameState;
}

const scenarios = [
  { phase: "preflop", start: 0, streets: ["flop", "turn", "river"] },
  { phase: "flop", start: 3, streets: ["turn", "river"] },
  { phase: "turn", start: 4, streets: ["river"] },
  { phase: "river", start: 5, streets: [] },
] as const;

for (const scenario of scenarios) {
  const state = facingAllInState(scenario.phase);
  const action: GameAction =
    scenario.phase === "preflop"
      ? { type: "PREFLOP_CALL" }
      : { type: "POSTFLOP_CALL" };
  const after = holdemReducer(state, action, () => 0.25);
  assert.equal(after.phase, "showdown");
  assert.equal(after.handEndMode, "showdown");
  assert.equal(after.runoutUiStartRevealed, scenario.start);
  assert.equal(after.boardRevealed, 5);
  assert.equal(after.toAct, null);
  const streets = after.logs
    .filter((log) => log.t === "street_cards")
    .map((log) => (log.t === "street_cards" ? log.street : null));
  assert.deepEqual(streets.slice(-scenario.streets.length || undefined), scenario.streets);
}

console.log("Preflop/flop/turn/river all-in runout entry verification passed.");
