import type { PlayerState, PositionLabel, Seat } from "./types";

/**
 * N인 좌석 순서·포지션 계산. 기존 헤즈업 전용 `other(player)` 방식은 쓰지 않는다.
 * 모든 함수는 순수 함수이며 좌석 배열 상태(fold/all-in/bust)만으로 다음 액터를 계산한다.
 */

export function seatOrderFrom(startSeat: Seat, seatCount: number): Seat[] {
  const order: Seat[] = [];
  for (let i = 0; i < seatCount; i++) {
    order.push((startSeat + i) % seatCount);
  }
  return order;
}

/** 이번 핸드에 계속 참여 중(폴드도 버스트도 아님) — 팟 수령 자격 판단에 사용 */
export function isInHandContesting(p: PlayerState): boolean {
  return p.inHand && !p.folded && !p.busted;
}

/** 아직 액션(체크/콜/베트/레이즈/폴드)을 할 수 있는 좌석 — 올인·폴드·버스트는 제외 */
export function isActionable(p: PlayerState): boolean {
  return p.inHand && !p.folded && !p.allIn && !p.busted;
}

export function actionableSeats(players: readonly PlayerState[]): Seat[] {
  return players.filter(isActionable).map((p) => p.seat);
}

export function contestingSeats(players: readonly PlayerState[]): Seat[] {
  return players.filter(isInHandContesting).map((p) => p.seat);
}

/** seatCount 좌석 중 이번 핸드 참여자만 필터링해 startSeat부터 순환한 좌석 순서 */
export function orderedActionableSeats(
  players: readonly PlayerState[],
  startSeat: Seat,
  seatCount: number,
): Seat[] {
  const order = seatOrderFrom(startSeat, seatCount);
  const bySeat = new Map(players.map((p) => [p.seat, p] as const));
  return order.filter((seat) => {
    const p = bySeat.get(seat);
    return p != null && isActionable(p);
  });
}

/** startSeat(포함)부터 순환하며 처음 만나는 액션 가능 좌석. 없으면 null */
export function firstActionableSeatFrom(
  players: readonly PlayerState[],
  startSeat: Seat,
  seatCount: number,
): Seat | null {
  const order = orderedActionableSeats(players, startSeat, seatCount);
  return order.length > 0 ? order[0]! : null;
}

export function sbSeat(buttonSeat: Seat, seatCount: number): Seat {
  return seatCount === 2 ? buttonSeat : (buttonSeat + 1) % seatCount;
}

export function bbSeat(buttonSeat: Seat, seatCount: number): Seat {
  return seatCount === 2 ? (buttonSeat + 1) % seatCount : (buttonSeat + 2) % seatCount;
}

/**
 * 프리플랍 첫 액터: 헤즈업(2인)에서는 버튼(=SB)이 먼저 행동하는 표준 규칙과 동일하게,
 * "BB 다음 좌석"이라는 일반식으로 통일한다. N>=3에서는 이 좌석이 UTG가 된다.
 */
export function preflopFirstActorSeat(
  players: readonly PlayerState[],
  buttonSeat: Seat,
  seatCount: number,
): Seat | null {
  const bb = bbSeat(buttonSeat, seatCount);
  return firstActionableSeatFrom(players, (bb + 1) % seatCount, seatCount);
}

/** 포스트플랍 첫 액터: 버튼 왼쪽(= 다음 좌석)부터 액션 가능한 첫 플레이어 */
export function postflopFirstActorSeat(
  players: readonly PlayerState[],
  buttonSeat: Seat,
  seatCount: number,
): Seat | null {
  return firstActionableSeatFrom(players, (buttonSeat + 1) % seatCount, seatCount);
}

/** 현재 액터 다음으로 액션 가능한 좌석 (현재 좌석 자신은 제외하고 순환) */
export function nextActionableSeat(
  players: readonly PlayerState[],
  fromSeat: Seat,
  seatCount: number,
): Seat | null {
  return firstActionableSeatFrom(players, (fromSeat + 1) % seatCount, seatCount);
}

/**
 * 좌석별 표시용 포지션 라벨. BTN/SB/BB는 항상 정확히 표기하고,
 * 그 외 좌석은 버튼으로부터의 거리 기준으로 UTG.. / HJ / CO를 근사 배정한다.
 * (정밀한 6-max/9-max 표준 명칭 표는 §31 범위 밖 — UI·Position Mission 표기용 근사치)
 */
export function positionLabelForSeat(
  seat: Seat,
  buttonSeat: Seat,
  seatCount: number,
): PositionLabel {
  if (seatCount === 2) {
    return seat === buttonSeat ? "SB" : "BB";
  }
  const distance = (seat - buttonSeat + seatCount) % seatCount;
  if (distance === 0) return "BTN";
  if (distance === 1) return "SB";
  if (distance === 2) return "BB";
  const distanceFromButtonGoingBack = (buttonSeat - seat + seatCount) % seatCount;
  if (distanceFromButtonGoingBack === 1 && seatCount >= 5) return "CO";
  if (distanceFromButtonGoingBack === 2 && seatCount >= 7) return "HJ";
  if (distance >= 3 && distance <= 4) return "UTG";
  return "MP";
}

/**
 * 이번 스트리트 베팅이 끝났고, 남은 액션 가능 좌석이 1명 이하이면서
 * 쇼다운 참가자(폴드 아닌 좌석)가 2명 이상이면 올인 런아웃 대상이다.
 */
export function isAllInRunoutSituation(players: readonly PlayerState[]): boolean {
  const actionable = actionableSeats(players);
  const contesting = contestingSeats(players);
  return actionable.length <= 1 && contesting.length >= 2;
}

/** 폴드 등으로 핸드가 즉시 종료되는지(콘테스트 참가자가 1명 이하) */
export function isHandDecidedByFold(players: readonly PlayerState[]): boolean {
  return contestingSeats(players).length <= 1;
}
