import { MYSTERY_HOLDEM_CONFIG } from "./config";
import { orderedActionableSeats, postflopFirstActorSeat, preflopFirstActorSeat } from "./positions";
import { calculatePotLimitMaxRaise, raiseRangeForActor } from "./potLimit";
import type { BettingState, MysteryStreet, PlayerState, Seat } from "./types";

const RAISE_CAP_BY_STREET: Record<Exclude<MysteryStreet, "lobby" | "hand_setup" | "showdown" | "hand_over" | "match_over">, number> = {
  preflop: MYSTERY_HOLDEM_CONFIG.raiseCap.preflop,
  flop: MYSTERY_HOLDEM_CONFIG.raiseCap.flop,
  turn: MYSTERY_HOLDEM_CONFIG.raiseCap.turn,
  river: MYSTERY_HOLDEM_CONFIG.raiseCap.river,
};

export function raiseCapForStreet(street: "preflop" | "flop" | "turn" | "river"): number {
  return RAISE_CAP_BY_STREET[street];
}

/** 새 스트리트 시작 시 베팅 상태 초기화. preflop은 블라인드 포스팅 후 호출한다. */
export function initStreetBetting(params: {
  street: "preflop" | "flop" | "turn" | "river";
  players: readonly PlayerState[];
  buttonSeat: Seat;
  seatCount: number;
  currentLevel: number;
  minRaiseIncrement: number;
}): BettingState {
  const { street, players, buttonSeat, seatCount, currentLevel, minRaiseIncrement } = params;
  const firstActor =
    street === "preflop"
      ? preflopFirstActorSeat(players, buttonSeat, seatCount)
      : postflopFirstActorSeat(players, buttonSeat, seatCount);
  const pendingActors =
    firstActor == null ? [] : orderedActionableSeats(players, firstActor, seatCount);
  return {
    street,
    raiseCap: raiseCapForStreet(street),
    raisesUsed: 0,
    currentLevel,
    minRaiseIncrement,
    lastAggressorSeat: null,
    pendingActors,
    raiseLockedSeats: [],
  };
}

export function facingForSeat(seat: Seat, betting: BettingState, players: readonly PlayerState[]): number {
  const p = players.find((x) => x.seat === seat);
  const contributed = p?.streetContribution ?? 0;
  return Math.max(0, round2(betting.currentLevel - contributed));
}

export function canCheck(seat: Seat, betting: BettingState, players: readonly PlayerState[]): boolean {
  return facingForSeat(seat, betting, players) <= 1e-9;
}

export function canCall(seat: Seat, betting: BettingState, players: readonly PlayerState[]): boolean {
  return facingForSeat(seat, betting, players) > 1e-9;
}

/** currentLevel===0일 때의 오픈 베팅 — Raise Cap 소모 없음 */
export function canOpenBet(betting: BettingState): boolean {
  return betting.currentLevel <= 1e-9;
}

/**
 * currentLevel>0일 때의 레이즈 — Raise Cap 이내여야 하고, 불완전 올인 때문에
 * 재레이즈가 잠긴 좌석이 아니어야 한다.
 */
export function canRaise(betting: BettingState, seat: Seat): boolean {
  return (
    betting.currentLevel > 1e-9 &&
    betting.raisesUsed < betting.raiseCap &&
    !betting.raiseLockedSeats.includes(seat)
  );
}

export function legalRaiseRange(
  seat: Seat,
  betting: BettingState,
  players: readonly PlayerState[],
  potBeforeAction: number,
): { min: number; max: number } | null {
  const p = players.find((x) => x.seat === seat);
  if (p == null) return null;
  if (betting.currentLevel > 1e-9 && !canRaise(betting, seat)) return null;
  return raiseRangeForActor({
    potBeforeAction,
    currentLevel: betting.currentLevel,
    actorContributedThisStreet: p.streetContribution,
    actorStack: p.chips,
    minRaiseIncrement: betting.minRaiseIncrement,
  });
}

/**
 * 합법 레인지를 베팅 단위 경계로 좁힌다(UI 슬라이더용).
 *
 * 숏스택 올인 근처처럼 레인지 폭이 단위보다 좁으면 단위 배수가 구간 안에 하나도 없을 수
 * 있다. 그때는 단위를 포기하고 원래 구간을 그대로 돌려준다 — 그러지 않으면 합법인데도
 * 베팅 자체를 할 수 없게 된다.
 */
export function snapRaiseRangeToStep(
  range: { min: number; max: number },
  step: number = MYSTERY_HOLDEM_CONFIG.betStepUnit,
): { min: number; max: number; step: number } {
  const snappedMin = Math.ceil(range.min / step) * step;
  const snappedMax = Math.floor(range.max / step) * step;
  if (snappedMin <= snappedMax) return { min: snappedMin, max: snappedMax, step };
  return { min: range.min, max: range.max, step: 1 };
}

/**
 * 원하는 금액을 합법 레인지 안의 베팅 단위 배수로 맞춘다(봇용).
 *
 * 반드시 구간 안의 값을 돌려줘야 한다. 엔진이 거부하면 봇이 같은 액션을 무한히 반복한다.
 * 단위 배수 → 정수 → clamp된 원값 순으로 물러난다.
 */
export function snapBetAmountToStep(
  desired: number,
  range: { min: number; max: number },
  step: number = MYSTERY_HOLDEM_CONFIG.betStepUnit,
): number {
  const clamped = Math.max(range.min, Math.min(range.max, desired));
  const stepped = Math.round(clamped / step) * step;
  if (stepped >= range.min && stepped <= range.max) return stepped;
  const snapped = snapRaiseRangeToStep(range, step);
  if (snapped.step === step) {
    // 원하는 금액 쪽 경계가 구간 안의 유일한(또는 가장 가까운) 단위 배수다.
    return Math.max(snapped.min, Math.min(snapped.max, stepped));
  }
  const rounded = Math.round(clamped);
  return rounded >= range.min && rounded <= range.max ? rounded : clamped;
}

export function potLimitMaxRaiseForSeat(
  seat: Seat,
  betting: BettingState,
  players: readonly PlayerState[],
  potBeforeAction: number,
): number {
  const p = players.find((x) => x.seat === seat);
  const contributed = p?.streetContribution ?? 0;
  return calculatePotLimitMaxRaise({
    potBeforeAction,
    currentLevel: betting.currentLevel,
    actorContributedThisStreet: contributed,
  });
}

/** seat을 대기 큐에서 제거(체크·콜 처리 후) */
export function removeFromPending(betting: BettingState, seat: Seat): BettingState {
  return { ...betting, pendingActors: betting.pendingActors.filter((s) => s !== seat) };
}

/**
 * 베트/레이즈 발생 시: 레이즈 카운트를 올리고(오픈 베팅은 제외), 레벨을 갱신하고,
 * 행동자 본인을 제외한 나머지 액션 가능 좌석 전원을 다시 대기 큐에 넣는다.
 *
 * 이때 "풀 레이즈"와 "불완전 올인"을 구분해야 한다. 숏스택이 최소 레이즈 폭에 못 미치는
 * 금액으로 올인하는 경우(예: 레벨 200, 최소 증가폭 200인데 250까지만 가능)는 불완전 올인이며,
 * 표준 규칙상 이것은 베팅을 다시 열지 않는다.
 *
 * - 최소 증가폭을 낮추지 않는다. 낮추면 다음 사람이 아주 작은 레이즈로 Raise Cap을
 *   태울 수 있어, 최소 레이즈 규칙(§15)이 막으려던 바로 그 행동이 가능해진다.
 * - 이미 행동을 마친 좌석의 레이즈 권한을 잠근다. 늘어난 금액을 콜하거나 폴드할 기회는
 *   주되(그래서 대기 큐에는 넣는다) 재레이즈는 못 하게 한다.
 * - Raise Cap도 소모하지 않는다. 스택이 모자라 어쩔 수 없이 나온 액션이지 자발적인
 *   레이즈가 아니므로, 남은 사람들의 정상적인 레이즈 기회를 빼앗지 않는다.
 *   (올인한 본인은 더 이상 행동할 수 없으므로 이것이 무한히 반복되지는 않는다.)
 */
export function applyAggressiveAction(params: {
  betting: BettingState;
  seat: Seat;
  newLevel: number;
  players: readonly PlayerState[];
  seatCount: number;
  isOpeningBet: boolean;
}): BettingState {
  const { betting, seat, newLevel, players, seatCount, isOpeningBet } = params;
  const increment = round2(newLevel - betting.currentLevel);
  const isFullRaise = isOpeningBet || increment >= betting.minRaiseIncrement - 1e-9;
  const order = orderedActionableSeats(players, (seat + 1) % seatCount, seatCount).filter(
    (s) => s !== seat,
  );
  // 직전 대기 큐에 없던 좌석 = 이번 스트리트에서 이미 행동을 마친 좌석
  const alreadyActed = order.filter((s) => !betting.pendingActors.includes(s));

  return {
    ...betting,
    currentLevel: newLevel,
    minRaiseIncrement: isFullRaise && increment > 0 ? increment : betting.minRaiseIncrement,
    raisesUsed: !isOpeningBet && isFullRaise ? betting.raisesUsed + 1 : betting.raisesUsed,
    lastAggressorSeat: seat,
    pendingActors: order,
    raiseLockedSeats: isFullRaise
      ? []
      : [...new Set([...betting.raiseLockedSeats, ...alreadyActed])],
  };
}

export function isStreetBettingComplete(betting: BettingState): boolean {
  return betting.pendingActors.length === 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
