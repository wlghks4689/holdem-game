import assert from "node:assert/strict";
import type { Card } from "../src/holdem/cards";
import { analyzePostflopAiStrength } from "../src/holdem/postflopAiStrength";
import type { GameState } from "../src/holdem/types";

const card = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

function flopState(
  hole: [Card, Card],
  board: [Card, Card, Card],
  templateId: string | null,
): GameState {
  return {
    gameMode: "classic",
    phase: "flop",
    roundNumber: 1,
    pot: 8,
    holes: [null, { hole, templateId }],
    board,
    boardRevealed: 3,
    handPoolRemaining: [{}, {}],
  } as unknown as GameState;
}

const wetBottomSet = analyzePostflopAiStrength(flopState(
  [card(8, "d"), card(8, "h")],
  [card(14, "s"), card(11, "s"), card(8, "c")],
  "mid_88",
), 1);

const queensBehind = analyzePostflopAiStrength(flopState(
  [card(12, "d"), card(12, "h")],
  [card(14, "s"), card(13, "c"), card(9, "d")],
  "hi_QQ",
), 1);

const missedAk = analyzePostflopAiStrength(flopState(
  [card(14, "d"), card(13, "h")],
  [card(9, "s"), card(7, "c"), card(2, "d")],
  "axo_AKo",
), 1);

const comboDraw = analyzePostflopAiStrength(flopState(
  [card(12, "s"), card(10, "s")],
  [card(11, "s"), card(9, "s"), card(2, "c")],
  "bw_QTs",
), 1);

assert.ok(wetBottomSet && queensBehind && missedAk && comboDraw);
assert.ok(wetBottomSet.equity > queensBehind.equity);
assert.ok(wetBottomSet.actionTier > queensBehind.actionTier);
assert.ok(wetBottomSet.aggressionBonus > 0);
assert.ok(comboDraw.drawWeight >= 0.6);
assert.ok(queensBehind.actionTier <= 3);
assert.ok(missedAk.actionTier <= 3);

const sameCardsLowTemplate = analyzePostflopAiStrength(flopState(
  [card(8, "d"), card(8, "h")],
  [card(14, "s"), card(11, "s"), card(8, "c")],
  "low_22",
), 1);
assert.equal(sameCardsLowTemplate?.equity, wetBottomSet.equity);
assert.equal(sameCardsLowTemplate?.actionTier, wetBottomSet.actionTier);
assert.equal(sameCardsLowTemplate?.aggressionBonus, wetBottomSet.aggressionBonus);

console.log(JSON.stringify({ wetBottomSet, queensBehind, missedAk, comboDraw }, null, 2));
