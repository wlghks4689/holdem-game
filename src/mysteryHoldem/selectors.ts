import { CARD_CATEGORY_LABEL, cardCategoryFromLegacy } from "./mysteryCard";
import { canCall, canCheck, canOpenBet, canRaise, facingForSeat, legalRaiseRange } from "./betting";
import { currentTotalPot } from "./gameReducer";
import { calculatePotLimitMaxRaise, isLegalRaiseTarget } from "./potLimit";
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
  const raiseOk = canRaise(state.betting, seat);
  const range = legalRaiseRange(seat, state.betting, state.players, potBeforeAction);

  // 올인은 별도 액션이 아니라 "스택 전액을 건 레이즈"다. 따라서 Pot Limit 상한을 넘는
  // 딥스택 올인은 불법이며(상한까지만 레이즈 가능), 반대로 콜조차 못 채우는 숏스택의
  // 올인 콜은 레이즈가 아니므로 언제나 합법이다.
  const allInTotal = player.streetContribution + player.chips;
  const isAllInCall = allInTotal <= state.betting.currentLevel + 1e-9;

  return {
    canCheck: canCheck(seat, state.betting, state.players),
    canCall: canCall(seat, state.betting, state.players),
    callAmount: facingForSeat(seat, state.betting, state.players),
    canBet: openBet && range != null,
    canRaise: raiseOk && range != null,
    raiseRange: range,
    canAllIn: player.chips > 1e-9 && (isAllInCall || isLegalRaiseTarget(allInTotal, range)),
    canFold: true,
  };
}

/**
 * 화면에 표시할 팟 — 이번 스트리트 베팅은 아직 좌석 앞 칩으로 놓여 있으므로 제외한다.
 * 스트리트가 끝나 칩이 팟으로 모이는 순간 이 값이 올라간다.
 *
 * 팟 리밋 계산에 쓰는 currentTotalPot(이번 스트리트 포함)과는 의도적으로 다르다.
 */
export function displayPotExcludingStreetBets(state: MysteryGameState): number {
  const sum = state.players.reduce((acc, p) => acc + p.handContribution - p.streetContribution, 0);
  return Math.round(sum * 100) / 100;
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

/**
 * True Sight(§17): 이 좌석에게만 공개되는 상대들의 Mystery Card.
 *
 * 엔진 상태(MysteryGameState)에는 원래 전원의 카드가 들어 있다 — 서버 권위 상태이고, 무엇을
 * 보여줄지는 표시 계층이 정한다. 그래서 True Sight는 "정보를 새로 만드는" 기능이 아니라
 * **이 필터를 통과시키는** 기능이다. 다른 좌석에서 이 함수를 호출하면 언제나 빈 배열이므로
 * 상대 화면에는 아무 변화도 생기지 않는다.
 *
 * 공개 시점은 플랍 진입 이후이며, 대상은 그 시점에 팟에 남아 있는(폴드하지 않은) 상대다.
 */
export function trueSightRevealedCards(
  state: MysteryGameState,
  seat: Seat,
): { seat: Seat; name: string; cardName: string; category: string }[] {
  const viewer = state.players.find((p) => p.seat === seat);
  if (viewer?.mission?.def.id !== "true_sight") return [];
  if (viewer.folded || state.boardRevealed < 3) return [];

  return state.players
    .filter((p) => p.seat !== seat && p.inHand && !p.folded && p.mission != null)
    .map((p) => ({
      seat: p.seat,
      name: p.name,
      cardName: p.mission!.def.name,
      category: CARD_CATEGORY_LABEL[cardCategoryFromLegacy(p.mission!.def.category)],
    }));
}
