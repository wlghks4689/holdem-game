import assert from "node:assert/strict";
import type { AllInCinemaTimelineEvent } from "../src/app/holdem/allInCinemaTimeline";

const timelineModulePath = "../src/app/holdem/allInCinemaTimeline.ts";
const { buildAllInCinemaTimeline } = await import(timelineModulePath);

function reveals(events: AllInCinemaTimelineEvent[]) {
  return events
    .filter((event) => event.kind === "reveal")
    .map((event) => event.targetRevealed);
}

function resolveAt(events: AllInCinemaTimelineEvent[]) {
  return events.find((event) => event.kind === "resolve")?.atMs;
}

function assertOrdered(events: AllInCinemaTimelineEvent[]) {
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(
      events[index]!.atMs >= events[index - 1]!.atMs,
      `timeline event ${index} must not precede event ${index - 1}`,
    );
  }
}

const preflopRunout = buildAllInCinemaTimeline(0);
assert.deepEqual(reveals(preflopRunout), [1, 2, 3, 4, 5]);
assert.equal(resolveAt(preflopRunout), 13_240);
assertOrdered(preflopRunout);

const afterFlop = buildAllInCinemaTimeline(3);
assert.deepEqual(reveals(afterFlop), [4, 5]);
assert.equal(resolveAt(afterFlop), 4_700);
assertOrdered(afterFlop);

const afterTurn = buildAllInCinemaTimeline(4);
assert.deepEqual(reveals(afterTurn), [5]);
assert.equal(resolveAt(afterTurn), 3_100);
assertOrdered(afterTurn);

const subtleRunout = buildAllInCinemaTimeline(0, true);
assert.deepEqual(reveals(subtleRunout), [1, 2, 3, 4, 5]);
assert.equal(resolveAt(subtleRunout), 4_580);
assertOrdered(subtleRunout);

assert.deepEqual(buildAllInCinemaTimeline(5), []);

console.log("All-in cinema verification passed.");
