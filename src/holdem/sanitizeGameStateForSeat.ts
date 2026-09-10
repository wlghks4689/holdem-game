import type { GameMessage, GameState, PlayerIndex } from "./types";
import {
  normalizeGameMode,
  normalizeHandCostRemaining,
  normalizeHandPoolRemaining,
} from "./handPool";
import { normalizeCostGameStructure } from "./costGameStructures";

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** `idx`가 속한 라운드의 시작(`round_start`) 인덱스. 없으면 -1. */
function findRoundStartIndexFor(logs: GameMessage[], idx: number): number {
  for (let j = idx; j >= 0; j--) {
    if (logs[j]!.t === "round_start") return j;
  }
  return -1;
}

/**
 * `roundStartIdx` 라운드가 실제 카드 비교(진짜 쇼다운)로 끝났는지.
 * 폴드 종료도 `t: "showdown"` 로그를 남기므로 `folder`가 없을 때만 인정한다.
 */
function segmentEndedInRealShowdown(logs: GameMessage[], roundStartIdx: number): boolean {
  for (let j = roundStartIdx + 1; j < logs.length; j++) {
    const m = logs[j]!;
    if (m.t === "round_start") return false;
    if (m.t === "showdown") return m.folder == null;
  }
  return false;
}

/**
 * 온라인 방: `seat` 입장에서 상대 홀 카드·상대 핸드픽 pending 제거.
 * 상대 홀은 `phase === "showdown"` 일 때만 양쪽에 공개.
 */
export function sanitizeGameStateForSeat(
  state: GameState,
  seat: PlayerIndex,
): GameState {
  const out = structuredClone(state) as GameState;
  const opp = other(seat);
  out.gameMode = normalizeGameMode(out.gameMode);
  out.costStructure = out.gameMode === "cost"
    ? normalizeCostGameStructure(out.costStructure)
    : "deep";
  out.matchEndReason = out.matchEndReason ?? null;
  out.handPoolRemaining = normalizeHandPoolRemaining(
    out.handPoolRemaining as unknown,
    out.gameMode,
  );
  out.handCostRemaining = normalizeHandCostRemaining(
    out.handCostRemaining as unknown,
    out.gameMode,
  );
  out.mysteryHandUsed = Array.isArray(out.mysteryHandUsed)
    ? [Boolean(out.mysteryHandUsed[0]), Boolean(out.mysteryHandUsed[1])]
    : [false, false];
  out.matchEnded = Boolean(out.matchEnded || out.matchWinner != null);
  out.iaRevealType = Array.isArray(out.iaRevealType)
    ? [out.iaRevealType[0] ?? null, out.iaRevealType[1] ?? null]
    : [null, null];

  // Seat-based minimum disclosure:
  // - hide opponent future resource info
  // - hide unrevealed board cards from API payload
  out.handPoolRemaining[opp] = {};
  if (out.gameMode === "cost") {
    out.handCostRemaining[opp] = 0;
    out.mysteryHandUsed[opp] = false;
  }
  const visibleBoard = Math.max(0, Math.min(out.boardRevealed, out.board.length));
  out.board = out.board.slice(0, visibleBoard);
  out.iaReveal[opp] = null;
  out.iaRevealType[opp] = null;
  // 상대의 hand_chosen 라벨은 "현재 phase"가 아니라 "그 라운드가 실제
  // 쇼다운으로 끝났는지"로 판단한다. 폴드로 끝난 라운드는 이후 다른
  // 라운드가 쇼다운에 도달해도 영원히 숨겨야 한다.
  out.logs = out.logs.map((message, idx) => {
    if (message.t !== "hand_chosen" || message.player !== opp) return message;
    const roundStartIdx = findRoundStartIndexFor(out.logs, idx);
    const revealed = roundStartIdx >= 0 && segmentEndedInRealShowdown(out.logs, roundStartIdx);
    return revealed ? message : { ...message, label: "Hidden Hand" };
  });

  if (out.phase !== "showdown") {
    out.holes[opp] = null;
  }
  if (out.phase === "hand_select") {
    out.handPickPending[opp] = null;
  }
  return out;
}
