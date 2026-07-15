import assert from "node:assert/strict";
import { evaluateAllInCall } from "../src/holdem/allInCallPolicy";
import type { Card } from "../src/holdem/cards";
import type { GameState } from "../src/holdem/types";

function allInState(options: {
  hole: [Card, Card];
  effectiveBb: number;
  phase?: "preflop" | "flop" | "turn" | "river";
  board?: Card[];
}): GameState {
  const phase = options.phase ?? "preflop";
  const board = options.board ?? [];
  const heroBlind = phase === "preflop" ? 1 : 0;
  const call = options.effectiveBb - heroBlind;
  return {
    gameMode: "cost",
    phase,
    roundNumber: 1,
    handBlinds: { sb: 0.5, bb: 1, ante: 0 },
    button: 0,
    chips: [0, call],
    pot: options.effectiveBb + heroBlind,
    betting: {
      contributed: [options.effectiveBb, heroBlind],
      currentLevel: options.effectiveBb,
      raiseDone: true,
      checksThisStreet: 0,
      raisesThisStreet: 1,
    },
    toAct: 1,
    preflopStage: phase === "preflop" ? "facing_raise" : null,
    holes: [null, { templateId: null, hole: options.hole }],
    board,
    boardRevealed: board.length,
    // Matches reducer state while the opponent's shove is awaiting a response.
    isAllIn: false,
  } as unknown as GameState;
}

const c = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

const aa = evaluateAllInCall(allInState({
  hole: [c(14, "s"), c(14, "h")], effectiveBb: 100,
}), 1, "hard");
assert.equal(aa?.action, "call");

const sevens = evaluateAllInCall(allInState({
  hole: [c(7, "s"), c(7, "h")], effectiveBb: 100,
}), 1, "hard");
assert.equal(sevens?.action, "fold");

const nineEight = evaluateAllInCall(allInState({
  hole: [c(9, "s"), c(8, "s")], effectiveBb: 100,
}), 1, "hard");
assert.equal(nineEight?.action, "fold");

const shortAks = evaluateAllInCall(allInState({
  hole: [c(14, "s"), c(13, "s")], effectiveBb: 10,
}), 1, "hard");
assert.equal(shortAks?.action, "call");

const setOnFlop = evaluateAllInCall(allInState({
  hole: [c(9, "s"), c(9, "h")],
  effectiveBb: 30,
  phase: "flop",
  board: [c(9, "d"), c(6, "c"), c(2, "s")],
}), 1, "hard");
assert.equal(setOnFlop?.action, "call");

for (const decision of [aa, sevens, nineEight, shortAks, setOnFlop]) {
  assert.ok(decision != null);
  assert.ok(decision.potOdds > 0 && decision.potOdds < 1);
  assert.ok(decision.equity >= 0 && decision.equity <= 1);
  assert.equal(decision.samples, 720);
}

console.log(JSON.stringify({ aa, sevens, nineEight, shortAks, setOnFlop }, null, 2));
