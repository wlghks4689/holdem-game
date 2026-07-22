import assert from "node:assert/strict";
import type { Card } from "../src/holdem/cards";
import { buildWeightedOpponentHoles } from "../src/holdem/riverEvAi";
import { ShowdownRangeTracker } from "../src/holdem/showdownRangeTracker";
import type { GameState, HoldemGameMode } from "../src/holdem/types";

const card = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

function showdownState(
  gameMode: HoldemGameMode,
  roundNumber: number,
  templateId: string | null,
): GameState {
  return {
    gameMode,
    phase: "showdown",
    handEndMode: "showdown",
    roundNumber,
    holes: [
      { templateId, hole: [card(14, "s"), card(14, "h")] },
      { templateId: "hi_KK", hole: [card(13, "s"), card(13, "h")] },
    ],
    board: [card(2, "c"), card(5, "d"), card(9, "h"), card(11, "c"), card(12, "d")],
    boardRevealed: 5,
    handPoolRemaining: [{}, {}],
  } as unknown as GameState;
}

for (const gameMode of ["classic", "cost"] as const) {
  const tracker = new ShowdownRangeTracker();
  const aaShowdown = showdownState(gameMode, 1, "hi_AA");
  assert.equal(tracker.observeShowdown(aaShowdown, 0), true);
  assert.equal(tracker.observeShowdown(aaShowdown, 0), false);
  assert.equal(tracker.remainingTemplateCounts(gameMode).hi_AA, 0);

  const range = buildWeightedOpponentHoles(
    aaShowdown,
    1,
    null,
    tracker.remainingTemplateCounts(gameMode),
  );
  assert.equal(range.some(({ hole }) => hole[0].rank === 14 && hole[1].rank === 14), false);

  const folded = showdownState(gameMode, 2, "hi_KK");
  folded.phase = "hand_over";
  folded.handEndMode = "fold";
  assert.equal(tracker.observeShowdown(folded, 0), false);
  assert.equal(tracker.observedTemplateCounts().hi_KK, undefined);

  const mystery = showdownState(gameMode, 3, null);
  assert.equal(tracker.observeShowdown(mystery, 0), false);
}

const classicConnectors = new ShowdownRangeTracker();
assert.equal(
  classicConnectors.observeShowdown(showdownState("classic", 1, "conn_89s"), 0),
  true,
);
assert.equal(classicConnectors.remainingTemplateCounts("classic").conn_89s, 2);

const costConnectors = new ShowdownRangeTracker();
assert.equal(
  costConnectors.observeShowdown(showdownState("cost", 1, "conn_89s"), 0),
  true,
);
assert.equal(costConnectors.remainingTemplateCounts("cost").conn_89s, 0);

console.log("showdown range tracker verified for classic and cost modes");
