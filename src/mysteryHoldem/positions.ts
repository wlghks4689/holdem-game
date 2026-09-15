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

/**
 * 이번 핸드에 참여 중인 좌석을 버튼(포함)부터 시계방향으로 나열한다.
 *
 * 블라인드·포지션은 반드시 이 "실제 참여 좌석 링" 위에서 계산해야 한다. 좌석 번호로
 * button+1 / button+2를 그대로 쓰면, 플레이어가 버스트돼 빈 좌석이 생겼을 때 블라인드가
 * 아무도 없는 좌석에 배정돼 포스팅이 누락된다. 또한 10좌석 테이블에 2명만 남으면
 * 좌석 수가 아니라 "남은 인원"이 2명이므로 헤즈업 규칙을 적용해야 한다.
 */
export function inHandSeatsFromButton(
  players: readonly PlayerState[],
  buttonSeat: Seat,
  seatCount: number,
): Seat[] {
  const bySeat = new Map(players.map((p) => [p.seat, p] as const));
  return seatOrderFrom(buttonSeat, seatCount).filter((seat) => bySeat.get(seat)?.inHand === true);
}

/** 스몰 블라인드 좌석. 참여 인원이 2명이면 버튼이 SB를 낸다(헤즈업 규칙) */
export function sbSeatFor(
  players: readonly PlayerState[],
  buttonSeat: Seat,
  seatCount: number,
): Seat | null {
  const ring = inHandSeatsFromButton(players, buttonSeat, seatCount);
  if (ring.length < 2) return null;
  return ring.length === 2 ? ring[0]! : ring[1]!;
}

export function bbSeatFor(
  players: readonly PlayerState[],
  buttonSeat: Seat,
  seatCount: number,
): Seat | null {
  const ring = inHandSeatsFromButton(players, buttonSeat, seatCount);
  if (ring.length < 2) return null;
  return ring.length === 2 ? ring[1]! : ring[2]!;
}

/**
 * 프리플랍 첫 액터: "BB 다음 좌석"이라는 일반식으로 통일한다.
 * 참여 인원 2명이면 이 식이 자연스럽게 버튼(=SB) 선행동이라는 헤즈업 규칙이 되고,
 * 3명이면 버튼이 UTG가 되며, 4명 이상이면 BB 왼쪽이 UTG가 된다.
 */
export function preflopFirstActorSeat(
  players: readonly PlayerState[],
  buttonSeat: Seat,
  seatCount: number,
): Seat | null {
  const ring = inHandSeatsFromButton(players, buttonSeat, seatCount);
  if (ring.length === 0) return null;
  const bb = bbSeatFor(players, buttonSeat, seatCount);
  if (bb == null) return firstActionableSeatFrom(players, buttonSeat, seatCount);
  const bySeat = new Map(players.map((p) => [p.seat, p] as const));
  const bbIdx = ring.indexOf(bb);
  for (let i = 1; i <= ring.length; i++) {
    const seat = ring[(bbIdx + i) % ring.length]!;
    const p = bySeat.get(seat);
    if (p != null && isActionable(p)) return seat;
  }
  return null;
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
 * 좌석별 포지션 라벨. 빈(버스트) 좌석을 건너뛴 "실제 참여 좌석 링" 기준으로 계산한다 —
 * 좌석 번호 거리로 계산하면 버스트가 생긴 뒤 BTN/SB/BB가 어긋나고, 그 결과 Position 계열
 * Mission 판정까지 틀어진다.
 * (정밀한 6-max/9-max 표준 명칭 표는 §31 범위 밖 — UI·Position Mission 표기용 근사치)
 */
export function positionLabelForSeat(
  seat: Seat,
  players: readonly PlayerState[],
  buttonSeat: Seat,
  seatCount: number,
): PositionLabel {
  const ring = inHandSeatsFromButton(players, buttonSeat, seatCount);
  const idx = ring.indexOf(seat);
  if (idx < 0) return "MP";
  const n = ring.length;
  if (n === 2) return idx === 0 ? "SB" : "BB";
  if (idx === 0) return "BTN";
  if (idx === 1) return "SB";
  if (idx === 2) return "BB";
  const fromButtonBack = n - 1 - idx;
  if (fromButtonBack === 0 && n >= 5) return "CO";
  if (fromButtonBack === 1 && n >= 7) return "HJ";
  if (idx <= 4) return "UTG";
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
