import type { GameAction, GameState, PlayerIndex } from "@/holdem/types";

/** 온라인 방: 해당 좌석이 이 액션을 보낼 수 있는지 */
export function canSeatSendAction(
  state: GameState,
  action: GameAction,
  seat: PlayerIndex,
): boolean {
  switch (action.type) {
    case "NEW_HAND":
      return (
        state.matchWinner == null &&
        (state.phase === "showdown" || state.phase === "hand_over")
      );
    case "SELECT_HAND":
      return action.player === seat;
    case "USE_IA":
    case "FOLD":
    case "PREFLOP_CALL":
    case "PREFLOP_CHECK":
    case "PREFLOP_RAISE":
    case "POSTFLOP_CHECK":
    case "POSTFLOP_CALL":
    case "POSTFLOP_BET":
    case "POSTFLOP_RAISE":
      return state.toAct === seat;
    default:
      return false;
  }
}
