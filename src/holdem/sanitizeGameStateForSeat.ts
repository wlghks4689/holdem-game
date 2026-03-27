import type { GameState, PlayerIndex } from "./types";

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
  if (out.phase !== "showdown") {
    out.holes[opp] = null;
  }
  if (out.phase === "hand_select") {
    out.handPickPending[opp] = null;
  }
  return out;
}
