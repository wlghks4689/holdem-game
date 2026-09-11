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

function holeRevealAt(events: AllInCinemaTimelineEvent[]) {
  return events.find((event) => event.kind === "hole-reveal")?.atMs;
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
  assert.deepEqual(reveals(preflopRunout), [3, 4, 5]);
  assert.equal(resolveAt(preflopRunout), 7_020);
  assertOrdered(preflopRunout);
  assert.equal(holeRevealAt(preflopRunout), ALL_IN_CINEMA_TIMING.responseHoldMs);
  assert.equal(
    preflopRunout.find((event) => event.kind === "windup")?.atMs,
    ALL_IN_CINEMA_TIMING.responseHoldMs +
      ALL_IN_CINEMA_TIMING.holeCardsHoldMs,
  );

  const afterFlop: AllInCinemaTimelineEvent[] = buildAllInCinemaTimeline(3);
  assert.deepEqual(reveals(afterFlop), [4, 5]);
  assert.equal(resolveAt(afterFlop), 5_400);
  assertOrdered(afterFlop);

  const afterTurn: AllInCinemaTimelineEvent[] = buildAllInCinemaTimeline(4);
  assert.deepEqual(reveals(afterTurn), [5]);
  assert.equal(resolveAt(afterTurn), 3_800);
  assertOrdered(afterTurn);

  const subtleRunout: AllInCinemaTimelineEvent[] =
    buildAllInCinemaTimeline(0, true);
  assert.deepEqual(subtleRunout, preflopRunout);

  const riverAllIn: AllInCinemaTimelineEvent[] = buildAllInCinemaTimeline(5);
  assert.deepEqual(reveals(riverAllIn), []);
  assert.equal(resolveAt(riverAllIn), 1_700);
  assertOrdered(riverAllIn);

  for (const [startRevealed, events] of [
    [0, preflopRunout],
    [3, afterFlop],
    [4, afterTurn],
    [5, riverAllIn],
  ] as const) {
    const targets = reveals(events);
    assert.equal(new Set(targets).size, targets.length, "cards must reveal once");
    assert.ok(
      targets.every((target) => target > startRevealed),
      "already revealed streets must not be replayed",
    );
    assert.equal(
      events.filter((event) => event.kind === "hole-reveal").length,
      1,
      "both hole cards must have one shared reveal beat",
    );
  }
  assert.ok(
    ALL_IN_CINEMA_TIMING.responseHoldMs >= 600 &&
      ALL_IN_CINEMA_TIMING.responseHoldMs <= 1_000,
  );
  assert.ok(
    ALL_IN_CINEMA_TIMING.holeCardsHoldMs >= 700 &&
      ALL_IN_CINEMA_TIMING.holeCardsHoldMs <= 1_000,
  );
  assert.ok(
    ALL_IN_CINEMA_TIMING.streetHoldMs.flop >= 900 &&
      ALL_IN_CINEMA_TIMING.streetHoldMs.flop <= 1_200,
  );
  assert.ok(
    ALL_IN_CINEMA_TIMING.streetHoldMs.turn >= 700 &&
      ALL_IN_CINEMA_TIMING.streetHoldMs.turn <= 1_000,
  );
  assert.ok(
    ALL_IN_CINEMA_TIMING.streetHoldMs.river >= 900 &&
      ALL_IN_CINEMA_TIMING.streetHoldMs.river <= 1_300,
  );
  assert.ok(ALL_IN_RESULT_HOLD_MS >= 2_500);

  console.log("All-in cinema verification passed.");
}

void main();
