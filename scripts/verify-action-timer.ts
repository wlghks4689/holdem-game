import assert from "node:assert/strict";
import {
  actionTimerLimitMs,
  actionTimerProgressKey,
  actionTimerSignature,
  computeTimeoutAction,
  reconcileActionTimerWindow,
} from "../src/holdem/actionTimer";
import { createInitialGameState, holdemReducer } from "../src/holdem/gameReducer";

const random = () => 0.31;
const initial = createInitialGameState("cost");
const signature = actionTimerSignature(initial)!;
const progress = actionTimerProgressKey(initial);
const afterFirstPick = holdemReducer(
  initial,
  { type: "SELECT_HAND", player: 0, templateId: "hi_AA" },
  random,
);

assert.equal(actionTimerSignature(afterFirstPick), signature);
assert.notEqual(actionTimerProgressKey(afterFirstPick), progress);
assert.equal(computeTimeoutAction(afterFirstPick, 0), null);
assert.equal(computeTimeoutAction(afterFirstPick, 1)?.type, "SELECT_HAND");

const limit = actionTimerLimitMs(initial)!;
const opened = reconcileActionTimerWindow(null, signature, limit, false, 1_000)!;
assert.equal(opened.deadlineMs, 1_000 + limit);
const unchanged = reconcileActionTimerWindow(opened, signature, limit, false, 6_000)!;
assert.equal(unchanged.deadlineMs, opened.deadlineMs);

const extended = reconcileActionTimerWindow(opened, signature, limit + 10_000, false, 6_000)!;
assert.equal(extended.deadlineMs, opened.deadlineMs + 10_000);

const paused = reconcileActionTimerWindow(opened, signature, limit, true, 11_000)!;
assert.equal(paused.pausedRemainingMs, opened.deadlineMs - 11_000);
const stillPaused = reconcileActionTimerWindow(paused, signature, limit, true, 21_000)!;
assert.equal(stillPaused.pausedRemainingMs, paused.pausedRemainingMs);
const resumed = reconcileActionTimerWindow(stillPaused, signature, limit, false, 31_000)!;
assert.equal(resumed.deadlineMs, 31_000 + paused.pausedRemainingMs!);

console.log("Action timer verification passed: stable selection window, seat timeout, IA extension, pause/resume.");
