export type AllInCinemaStreet = "flop" | "turn" | "river";

export type AllInCinemaTimelineEvent =
  | { atMs: number; kind: "hole-reveal" }
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
  /** 상대 콜 확정 문구를 읽는 시간 */
  responseHoldMs: 800,
  /** 양쪽 홀카드 공개 후 현재 보드를 읽는 시간 */
  holeCardsHoldMs: 900,
  flopWindupMs: 420,
  turnWindupMs: 600,
  riverWindupMs: 800,
  revealSettleMs: { flop: 280, turn: 300, river: 360 },
  /** 새 정보가 등장한 스트릿에서만 읽을 시간을 둔다. */
  streetHoldMs: { flop: 1_200, turn: 1_000, river: 1_300 },
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

  const events: AllInCinemaTimelineEvent[] = [
    { atMs: ALL_IN_CINEMA_TIMING.responseHoldMs, kind: "hole-reveal" },
  ];
  let atMs =
    ALL_IN_CINEMA_TIMING.responseHoldMs +
    ALL_IN_CINEMA_TIMING.holeCardsHoldMs;

  // 리버 올인은 양쪽 홀카드와 완성 보드만 읽은 뒤 바로 결과로 합류한다.
  if (start >= 5) {
    events.push({ atMs, kind: "resolve" });
    return events;
  }

  let previousStreet: AllInCinemaStreet | null =
    start >= 4 ? "turn" : start >= 3 ? "flop" : null;

  for (let target = start + 1; target <= 5; target += 1) {
    const street = allInCinemaStreetForTarget(target);
    // 플랍은 한 스트릿 이벤트로 3장을 함께 공개한다.
    const revealTarget = street === "flop" ? 3 : target;
    if (street !== previousStreet) {
      events.push({ atMs, kind: "windup", street });
      atMs += windupMs(street);
    }

    events.push({
      atMs,
      kind: "reveal",
      street,
      targetRevealed: revealTarget,
    });
    events.push({
      atMs: atMs + ALL_IN_CINEMA_TIMING.revealSettleMs[street],
      kind: "hold",
      street,
    });
    atMs += ALL_IN_CINEMA_TIMING.streetHoldMs[street];
    previousStreet = street;
    if (street === "flop") target = 3;
  }

  events.push({ atMs, kind: "resolve" });
  return events;
}
