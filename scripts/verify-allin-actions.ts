import assert from "node:assert/strict";
import { actorAllInActionKind } from "../src/holdem/bettingHelpers";
import { createInitialGameState, holdemReducer } from "../src/holdem/gameReducer";
import type { Card } from "../src/holdem/cards";
import type { GameState } from "../src/holdem/types";

const card = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

function actionState(options: {
  phase: "preflop" | "turn";
  heroStack: number;
  contributions: [number, number];
}): GameState {
  const base = createInitialGameState("cost");
  return {
    ...base,
    phase: options.phase,
    handBlinds: { sb: 0.5, bb: 1, ante: 0 },
    button: 0,
    chips: [100, options.heroStack],
    pot: options.contributions[0] + options.contributions[1],
    betting: {
      contributed: options.contributions,
      currentLevel: Math.max(...options.contributions),
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 1,
    },
    toAct: 1,
    preflopStage: options.phase === "preflop" ? "facing_raise" : null,
    holes: [
      { hole: [card(14, "s"), card(13, "h")] },
      { hole: [card(7, "s"), card(7, "h")] },
    ],
    board: [
      card(2, "c"),
      card(5, "d"),
      card(9, "h"),
      card(11, "s"),
      card(12, "c"),
    ],
    boardRevealed: options.phase === "turn" ? 4 : 0,
    isAllIn: false,
  } as unknown as GameState;
}

// A stack below the call amount is classified and settled as an all-in call.
for (const phase of ["preflop", "turn"] as const) {
  const state = actionState({ phase, heroStack: 13, contributions: [17, 1] });
  assert.equal(actorAllInActionKind(state), "call");
  const action = phase === "preflop"
    ? { type: "PREFLOP_CALL" as const }
    : { type: "POSTFLOP_CALL" as const };
  const after = holdemReducer(state, action, () => 0.25);
  assert.equal(after.phase, "showdown");
  const callLog = after.logs.filter((log) =>
    (log.t === "preflop_action" || log.t === "postflop_action") &&
    log.player === 1
  ).at(-1);
  assert.equal(callLog?.t === "preflop_action" || callLog?.t === "postflop_action"
    ? callLog.action
    : null, "올인 콜");
}

// A full-stack raise may be below the normal min-raise and is still legal.
for (const phase of ["preflop", "turn"] as const) {
  const state = actionState({ phase, heroStack: 13, contributions: [17, 5] });
  assert.equal(actorAllInActionKind(state), "raise");
  const allInAction = phase === "preflop"
    ? { type: "PREFLOP_ALL_IN" as const }
    : { type: "POSTFLOP_RAISE" as const, toLevelChips: 18 };
  const afterAllIn = holdemReducer(state, allInAction, () => 0.25);
  assert.equal(afterAllIn.chips[1], 0);
  assert.equal(afterAllIn.betting.contributed[1], 18);
  assert.equal(afterAllIn.toAct, 0);

  const ordinaryRaise = phase === "preflop"
    ? { type: "PREFLOP_RAISE" as const, toLevelChips: 17.5 }
    : { type: "POSTFLOP_RAISE" as const, toLevelChips: 17.5 };
  assert.strictEqual(holdemReducer(state, ordinaryRaise, () => 0.25), state);
}

console.log("All-in action classification and reducer verification passed.");
