import type { GameState, PlayerIndex } from "./types";
import {
  normalizeGameMode,
  normalizeHandCostRemaining,
  normalizeHandPoolRemaining,
} from "./handPool";

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

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
  out.handPoolRemaining = normalizeHandPoolRemaining(
    out.handPoolRemaining as unknown,
    out.gameMode,
  );
  out.handCostRemaining = normalizeHandCostRemaining(
    out.handCostRemaining as unknown,
    out.gameMode,
  );

  // Seat-based minimum disclosure:
  // - hide opponent future resource info
  // - hide unrevealed board cards from API payload
  out.handPoolRemaining[opp] = {};
  if (out.gameMode === "cost") out.handCostRemaining[opp] = 0;
  const visibleBoard = Math.max(0, Math.min(out.boardRevealed, out.board.length));
  out.board = out.board.slice(0, visibleBoard);

  if (out.phase !== "showdown") {
    out.holes[opp] = null;
  }
  if (out.phase === "hand_select") {
    out.handPickPending[opp] = null;
  }
  return out;
}
