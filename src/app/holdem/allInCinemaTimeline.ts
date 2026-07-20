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

/**
 * 올인 쇼다운의 단일 시간표. 화면 크기와 모션 표현 설정은 CSS만 바꾸며,
 * 실제 카드 공개 간격은 모든 기기에서 동일하게 유지한다.
 */
export const ALL_IN_CINEMA_TIMING = {
  introHoldMs: 1_000,
  flopWindupMs: 420,
  /** 일반 보드 공개 620ms의 130% */
  flopCardIntervalMs: 806,
  turnWindupMs: 806,
  /** 턴보다 정확히 0.5초 더 긴 리버 예고 */
  riverWindupMs: 1_306,
  revealSettleMs: { flop: 520, turn: 620, river: 760 },
  streetHoldMs: { flop: 1_400, turn: 1_400, river: 1_710 },
} as const;

/** 최종 승패·족보 화면과 입력 잠금을 유지하는 최소 시간. */
export const ALL_IN_RESULT_HOLD_MS = 3_200;

export function allInCinemaStreetForTarget(
  targetRevealed: number,
): AllInCinemaStreet {
  if (targetRevealed <= 3) return "flop";
  if (targetRevealed === 4) return "turn";
  return "river";
}

function windupMs(street: AllInCinemaStreet): number {
  if (street === "flop") return ALL_IN_CINEMA_TIMING.flopWindupMs;
  if (street === "turn") return ALL_IN_CINEMA_TIMING.turnWindupMs;
  return ALL_IN_CINEMA_TIMING.riverWindupMs;
}

export function buildAllInCinemaTimeline(
  startRevealed: number,
  _subtleMotion = false,
): AllInCinemaTimelineEvent[] {
  void _subtleMotion;
  const start = Math.min(5, Math.max(0, Math.round(startRevealed)));

  // 리버 올인은 추가 런아웃 없이 완성 보드와 양쪽 홀카드를 1초 보여준 뒤 비교한다.
  if (start >= 5) {
    return [{ atMs: ALL_IN_CINEMA_TIMING.introHoldMs, kind: "resolve" }];
  }

  const events: AllInCinemaTimelineEvent[] = [];
  let atMs = ALL_IN_CINEMA_TIMING.introHoldMs;
  let previousStreet: AllInCinemaStreet | null =
    start >= 4 ? "turn" : start >= 3 ? "flop" : null;

  for (let target = start + 1; target <= 5; target += 1) {
    const street = allInCinemaStreetForTarget(target);
    if (street !== previousStreet) {
      events.push({ atMs, kind: "windup", street });
      atMs += windupMs(street);
    }

    events.push({ atMs, kind: "reveal", street, targetRevealed: target });

    if (target < 3) {
      atMs += ALL_IN_CINEMA_TIMING.flopCardIntervalMs;
    } else {
      events.push({
        atMs: atMs + ALL_IN_CINEMA_TIMING.revealSettleMs[street],
        kind: "hold",
        street,
      });
      atMs += ALL_IN_CINEMA_TIMING.streetHoldMs[street];
    }
    previousStreet = street;
  }

  events.push({ atMs, kind: "resolve" });
  return events;
}
