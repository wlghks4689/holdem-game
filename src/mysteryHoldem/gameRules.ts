import { MYSTERY_HOLDEM_CONFIG } from "./config";
import type { MysteryHoldemConfig, PlayerState, Seat } from "./types";

export function isRegularMissionChangeRound(
  round: number,
  config: MysteryHoldemConfig = MYSTERY_HOLDEM_CONFIG,
): boolean {
  return config.missionChangeRounds.includes(round);
}

export function createInitialPlayers(
  seatCount: number,
  names: readonly string[] | undefined,
  config: MysteryHoldemConfig = MYSTERY_HOLDEM_CONFIG,
): PlayerState[] {
  return Array.from({ length: seatCount }, (_, seat) => createPlayer(seat, names?.[seat], config));
}

function createPlayer(seat: Seat, name: string | undefined, config: MysteryHoldemConfig): PlayerState {
  return {
    seat,
    name: name ?? `Player ${seat + 1}`,
    chips: config.startingChips,
    pendingDeal: [],
    discarded: [],
    holeCards: [],
    inHand: false,
    folded: false,
    allIn: false,
    busted: false,
    streetContribution: 0,
    handContribution: 0,
    mission: null,
    missionPoint: 0,
    bountyPoint: 0,
    chipPoint: config.startingChips / config.chipPointDivisor,
    totalPoint: config.startingChips / config.chipPointDivisor,
  };
}

/** 다음 핸드에 참여 가능한 좌석(버스트되지 않고 칩이 남은 좌석) */
export function seatsEligibleForNextHand(players: readonly PlayerState[]): Seat[] {
  return players.filter((p) => !p.busted && p.chips > 1e-9).map((p) => p.seat);
}

/** Last Player Standing 판정: 버스트되지 않은 좌석이 1명 이하 */
export function survivorSeatIfLastStanding(players: readonly PlayerState[]): Seat | null {
  const survivors = players.filter((p) => !p.busted);
  return survivors.length === 1 ? survivors[0]!.seat : null;
}

export function nextButtonSeat(
  currentButton: Seat,
  players: readonly PlayerState[],
  seatCount: number,
): Seat {
  for (let i = 1; i <= seatCount; i++) {
    const candidate = (currentButton + i) % seatCount;
    const p = players.find((x) => x.seat === candidate);
    if (p && !p.busted) return candidate;
  }
  return currentButton;
}
