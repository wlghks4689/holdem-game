import { canCall, canCheck, canOpenBet, canRaise, facingForSeat, legalRaiseRange } from "./betting";
import { currentTotalPot } from "./gameReducer";
import { calculatePotLimitMaxRaise } from "./potLimit";
import type { MysteryGameState, Seat } from "./types";

/** UI가 액션 패널 버튼 활성/비활성을 결정하기 위한 순수 파생 정보(§14 "불가능한 액션은 UI에서 비활성화") */
export interface LegalActionsForSeat {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  raiseRange: { min: number; max: number } | null;
  canAllIn: boolean;
  canFold: boolean;
}

export function legalActionsForSeat(state: MysteryGameState, seat: Seat): LegalActionsForSeat {
  const isBettingStreet =
    state.phase === "preflop" || state.phase === "flop" || state.phase === "turn" || state.phase === "river";
  if (!isBettingStreet || state.toActSeat !== seat) {
    return {
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canBet: false,
      canRaise: false,
      raiseRange: null,
      canAllIn: false,
      canFold: false,
    };
  }
  const player = state.players.find((p) => p.seat === seat);
  if (player == null) {
    return {
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canBet: false,
      canRaise: false,
      raiseRange: null,
      canAllIn: false,
      canFold: false,
    };
  }
  const potBeforeAction = currentTotalPot(state);
  const openBet = canOpenBet(state.betting);
  const raiseOk = canRaise(state.betting);
  const range = legalRaiseRange(seat, state.betting, state.players, potBeforeAction);

  return {
    canCheck: canCheck(seat, state.betting, state.players),
    canCall: canCall(seat, state.betting, state.players),
    callAmount: facingForSeat(seat, state.betting, state.players),
    canBet: openBet && range != null,
    canRaise: raiseOk && range != null,
    raiseRange: range,
    canAllIn: player.chips > 1e-9,
    canFold: true,
  };
}

export function potLimitMaxRaiseDisplay(state: MysteryGameState, seat: Seat): number {
  const player = state.players.find((p) => p.seat === seat);
  if (player == null) return 0;
  return calculatePotLimitMaxRaise({
    potBeforeAction: currentTotalPot(state),
    currentLevel: state.betting.currentLevel,
    actorContributedThisStreet: player.streetContribution,
  });
}
