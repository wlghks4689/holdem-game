export type AllInCinemaStreet = "flop" | "turn" | "river";

export type AllInCinemaTimelineEvent =
  | { atMs: number; kind: "windup"; street: AllInCinemaStreet }
  | {
      atMs: number;
      kind: "reveal";
      street: AllInCinemaStreet;
      targetRevealed: number;
    }
  | { atMs: number; kind: "hold"; street: AllInCinemaStreet }
  | { atMs: number; kind: "resolve" };

type TimelinePacing = {
  impact: number;
  windup: Record<AllInCinemaStreet, number>;
  betweenFlopCards: number;
  settle: Record<AllInCinemaStreet, number>;
  hold: Record<AllInCinemaStreet, number>;
};

const NORMAL_PACING: TimelinePacing = {
  impact: 900,
  windup: { flop: 550, turn: 700, river: 1050 },
  betweenFlopCards: 360,
  settle: { flop: 480, turn: 580, river: 700 },
  hold: { flop: 650, turn: 900, river: 1150 },
};

const SUBTLE_PACING: TimelinePacing = {
  impact: 350,
  windup: { flop: 200, turn: 250, river: 350 },
  betweenFlopCards: 120,
  settle: { flop: 150, turn: 180, river: 220 },
  hold: { flop: 250, turn: 300, river: 350 },
};

export function allInCinemaStreetForTarget(
  targetRevealed: number,
): AllInCinemaStreet {
  if (targetRevealed <= 3) return "flop";
  if (targetRevealed === 4) return "turn";
  return "river";
}

export function buildAllInCinemaTimeline(
  startRevealed: number,
  subtleMotion = false,
): AllInCinemaTimelineEvent[] {
  const start = Math.min(5, Math.max(0, Math.round(startRevealed)));
  if (start >= 5) return [];

  const pacing = subtleMotion ? SUBTLE_PACING : NORMAL_PACING;
  const events: AllInCinemaTimelineEvent[] = [];
  let atMs = pacing.impact;
  let previousStreet: AllInCinemaStreet | null =
    start >= 4 ? "turn" : start >= 3 ? "flop" : null;

  for (let target = start + 1; target <= 5; target += 1) {
    const street = allInCinemaStreetForTarget(target);
    if (street !== previousStreet) {
      events.push({ atMs, kind: "windup", street });
      atMs += pacing.windup[street];
    }

    events.push({
      atMs,
      kind: "reveal",
      street,
      targetRevealed: target,
    });

    if (target < 3) {
      atMs += pacing.betweenFlopCards;
    } else {
      events.push({
        atMs: atMs + Math.min(pacing.settle[street], pacing.hold[street]),
        kind: "hold",
        street,
      });
      atMs += pacing.hold[street];
    }
    previousStreet = street;
  }

  events.push({ atMs, kind: "resolve" });
  const runtimeMultiplier = start === 0 ? 2 : 1;
  return runtimeMultiplier === 1
    ? events
    : events.map((event) => ({ ...event, atMs: event.atMs * runtimeMultiplier }));
}
