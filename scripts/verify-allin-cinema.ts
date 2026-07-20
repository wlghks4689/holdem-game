import assert from "node:assert/strict";
import type { AllInCinemaTimelineEvent } from "../src/app/holdem/allInCinemaTimeline";

const timelineModulePath = "../src/app/holdem/allInCinemaTimeline.ts";

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

async function main() {
  const { buildAllInCinemaTimeline } = await import(timelineModulePath);
  const { ALL_IN_CINEMA_TIMING, ALL_IN_RESULT_HOLD_MS } = await import(
    timelineModulePath
  );

  const preflopRunout: AllInCinemaTimelineEvent[] =
    buildAllInCinemaTimeline(0);
  assert.deepEqual(reveals(preflopRunout), [1, 2, 3, 4, 5]);
  assert.equal(resolveAt(preflopRunout), 9_654);
  assertOrdered(preflopRunout);
  const preflopRevealTimes = preflopRunout
    .filter((event) => event.kind === "reveal")
    .map((event) => event.atMs);
  assert.equal(
    preflopRevealTimes[1]! - preflopRevealTimes[0]!,
    ALL_IN_CINEMA_TIMING.flopCardIntervalMs,
  );
  assert.equal(
    preflopRevealTimes[2]! - preflopRevealTimes[1]!,
    ALL_IN_CINEMA_TIMING.flopCardIntervalMs,
  );

  const afterFlop: AllInCinemaTimelineEvent[] = buildAllInCinemaTimeline(3);
  assert.deepEqual(reveals(afterFlop), [4, 5]);
  assert.equal(resolveAt(afterFlop), 6_222);
  assertOrdered(afterFlop);

  const afterTurn: AllInCinemaTimelineEvent[] = buildAllInCinemaTimeline(4);
  assert.deepEqual(reveals(afterTurn), [5]);
  assert.equal(resolveAt(afterTurn), 4_016);
  assertOrdered(afterTurn);

  const subtleRunout: AllInCinemaTimelineEvent[] =
    buildAllInCinemaTimeline(0, true);
  assert.deepEqual(subtleRunout, preflopRunout);

  const riverAllIn: AllInCinemaTimelineEvent[] = buildAllInCinemaTimeline(5);
  assert.deepEqual(reveals(riverAllIn), []);
  assert.equal(resolveAt(riverAllIn), 1_000);
  assertOrdered(riverAllIn);

  for (const events of [preflopRunout, afterFlop, afterTurn, riverAllIn]) {
    const targets = reveals(events);
    assert.equal(new Set(targets).size, targets.length, "cards must reveal once");
  }
  assert.equal(
    ALL_IN_CINEMA_TIMING.riverWindupMs -
      ALL_IN_CINEMA_TIMING.turnWindupMs,
    500,
  );
  assert.ok(ALL_IN_RESULT_HOLD_MS >= 2_500);

  console.log("All-in cinema verification passed.");
}

void main();
