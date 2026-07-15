import assert from "node:assert/strict";
import { actionTimerSignature, computeTimeoutAction } from "../src/holdem/actionTimer";
import { getBlindLevel } from "../src/holdem/blindLevels";
import { createInitialGameState, holdemReducer } from "../src/holdem/gameReducer";
import { totalRoundsForMode } from "../src/holdem/gameModeRules";
import { canSelectHandTemplate, getHandTemplateForMode, shouldForceRandomHand } from "../src/holdem/handPool";
import { sanitizeGameStateForSeat } from "../src/holdem/sanitizeGameStateForSeat";
import type { GameState } from "../src/holdem/types";

let seed = 0x4689;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

function handOver(state: GameState, options: { round?: number; chips?: [number, number]; cost?: [number, number] } = {}) {
  const next = structuredClone(state);
  next.phase = "hand_over";
  next.roundNumber = options.round ?? next.roundNumber;
  next.chips = options.chips ?? next.chips;
  next.handCostRemaining = options.cost ?? next.handCostRemaining;
  next.matchWinner = null;
  next.matchEnded = false;
  return next;
}

const classic = createInitialGameState();
assert.equal(classic.gameMode, "classic");
assert.deepEqual(classic.chips, [200, 200]);
assert.equal(totalRoundsForMode("classic"), 30);
assert.deepEqual(getBlindLevel(11, "classic"), { smallBlind: 1, bigBlind: 2, ante: 2 });

const cost = createInitialGameState("cost");
assert.deepEqual(cost.chips, [150, 150]);
assert.deepEqual(cost.handCostRemaining, [100, 100]);
assert.equal(totalRoundsForMode("cost"), 20);
assert.deepEqual(getBlindLevel(1, "cost"), { smallBlind: 0.5, bigBlind: 1, ante: 1 });
assert.deepEqual(getBlindLevel(11, "cost"), { smallBlind: 1, bigBlind: 2, ante: 2 });
assert.deepEqual(getBlindLevel(16, "cost"), { smallBlind: 2, bigBlind: 4, ante: 4 });

let mystery = holdemReducer(cost, { type: "SELECT_MYSTERY_HAND", player: 0 }, random);
mystery = holdemReducer(mystery, { type: "SELECT_MYSTERY_HAND", player: 1 }, random);
assert.equal(mystery.phase, "preflop");
assert.deepEqual(mystery.handCostRemaining, [97, 97]);
assert.deepEqual(mystery.mysteryHandUsed, [true, true]);
assert.equal(mystery.holes[0]?.acquisitionType, "mystery");
assert.equal(mystery.holes[0]?.templateId, null);
assert.equal(mystery.holes[1]?.templateId, null);
const mysteryCards = mystery.holes.flatMap((h) => h?.hole ?? []).map((c) => `${c.rank}:${c.suit}`);
assert.equal(new Set(mysteryCards).size, 4);
assert.deepEqual(mystery.handPoolRemaining, cost.handPoolRemaining);

const forcedBase = createInitialGameState("cost");
forcedBase.handCostRemaining = [0, 0];
assert.equal(shouldForceRandomHand(forcedBase, 0), true);
let forced = holdemReducer(forcedBase, { type: "SELECT_FORCED_RANDOM", player: 0 }, random);
forced = holdemReducer(forced, { type: "SELECT_FORCED_RANDOM", player: 1 }, random);
assert.equal(forced.phase, "preflop");
assert.deepEqual(forced.handCostRemaining, [0, 0]);
assert.equal(forced.holes[0]?.acquisitionType, "forced-random");
assert.equal(forced.holes[1]?.acquisitionType, "forced-random");
assert.deepEqual(forced.handPoolRemaining, forcedBase.handPoolRemaining);

const continued = holdemReducer(handOver(cost, { round: 1, cost: [0, 99] }), { type: "NEW_HAND" }, random);
assert.equal(continued.roundNumber, 2);
assert.deepEqual(continued.handCostRemaining, [1, 100]);
const oneCostHand = getHandTemplateForMode("cost", "conn_23s")!;
assert.equal(oneCostHand.cost, 1);
assert.equal(canSelectHandTemplate(continued, 0, oneCostHand), true);
assert.equal(shouldForceRandomHand(continued, 0), false);

const round10 = handOver(cost, { round: 10, chips: [132, 168], cost: [17, 18] });
const round11 = holdemReducer(round10, { type: "NEW_HAND" }, random);
assert.equal(round11.roundNumber, 11);
assert.deepEqual(round11.handBlinds, { sb: 1, bb: 2, ante: 2 });
assert.equal(round11.phase, "hand_select");
const timerBeforePick = actionTimerSignature(round11);
const aiPick = holdemReducer(round11, { type: "SELECT_HAND", player: 1, templateId: "hi_KK" }, random);
assert.notEqual(actionTimerSignature(aiPick), timerBeforePick);
assert.deepEqual(aiPick.handPickPending[1], { kind: "selected", templateId: "hi_KK" });
assert.equal(computeTimeoutAction(aiPick)?.type, "SELECT_HAND");
const round11Started = holdemReducer(aiPick, { type: "SELECT_HAND", player: 0, templateId: "conn_45s" }, random);
assert.equal(round11Started.phase, "preflop");
assert.equal(round11Started.handSelectPhase, "done");
assert.equal(round11Started.handBlinds.bb, 2);

const terminal = holdemReducer(handOver(cost, { round: 20, chips: [150, 150], cost: [7, 8] }), { type: "NEW_HAND" }, random);
assert.equal(terminal.matchEnded, true);
assert.equal(terminal.matchWinner, null);
assert.deepEqual(terminal.handCostRemaining, [7, 8]);

const busted = holdemReducer(handOver(cost, { round: 5, chips: [0, 300], cost: [4, 5] }), { type: "NEW_HAND" }, random);
assert.equal(busted.matchEnded, true);
assert.equal(busted.matchWinner, 1);
assert.deepEqual(busted.handCostRemaining, [4, 5]);

const secret = createInitialGameState("cost");
secret.handPickPending = [{ kind: "mystery" }, { kind: "forced-random" }];
secret.handCostRemaining = [88, 77];
secret.mysteryHandUsed = [true, true];
secret.iaRevealType = ["mystery", "forced-random"];
secret.logs.push({ t: "hand_chosen", player: 1, label: "Random Hand" });
const seat0 = sanitizeGameStateForSeat(secret, 0);
assert.deepEqual(seat0.handPoolRemaining[1], {});
assert.equal(seat0.handCostRemaining[1], 0);
assert.equal(seat0.mysteryHandUsed[1], false);
assert.equal(seat0.handPickPending[1], null);
assert.equal(seat0.iaRevealType[1], null);
assert.deepEqual(seat0.handPickPending[0], { kind: "mystery" });
const hiddenLog = seat0.logs.at(-1);
assert.equal(hiddenLog?.t, "hand_chosen");
assert.equal(hiddenLog?.t === "hand_chosen" ? hiddenLog.label : null, "Hidden Hand");

const reset = holdemReducer(terminal, { type: "RESET_MATCH" }, random);
assert.equal(reset.gameMode, "cost");
assert.deepEqual(reset.chips, [150, 150]);
assert.deepEqual(reset.handCostRemaining, [100, 100]);
assert.deepEqual(reset.mysteryHandUsed, [false, false]);

console.log("Cost mode verification passed (classic isolation, R10->R11 hand start/timer, blinds, Mystery, forced Random, recovery, terminal draw/bust, privacy, reset).");
