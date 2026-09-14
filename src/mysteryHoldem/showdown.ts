import type { Card } from "@/holdem/cards";
import { HAND_RANK, compareHandValue, type HandValue } from "@/holdem/pokerEval";
import { MYSTERY_HOLDEM_CONFIG } from "./config";
import { bestHandStandard } from "./handEval";
import { seatOrderFrom } from "./positions";
import { specialRuleFor } from "./specialRules";
import type { PlayerState, Pot, Seat } from "./types";

/** 플레이어의 Mission specialRule에 따라 표준 또는 오마하식 최선 5장을 계산한다. */
export function computeBestHandForPlayer(p: PlayerState, board: readonly Card[]): HandValue {
  const specialRule = specialRuleFor(p.mission?.def.specialRule);
  if (specialRule != null && p.holeCards.length === specialRule.finalHoleCardCount) {
    return specialRule.evaluateBestHand(p.holeCards, board);
  }
  return bestHandStandard(p.holeCards, board);
}

/**
 * 쇼다운에서 공개할 홀카드. Extra Hand(홀 4장)는 정확히 2장만 사용하므로 그 2장만 공개한다.
 *
 * 4장을 전부 보여주면 (1) 규칙과 달리 4장을 다 쓴 것처럼 보이고 (2) 좁은 좌석 폭을 넘쳐
 * 레이아웃이 깨진다. 보드가 아직 부족해 조합을 못 고르는 단계에서는 앞 2장으로 잘라 둔다.
 */
export function showdownHoleCardsForPlayer(p: PlayerState, board: readonly Card[]): Card[] {
  const specialRule = specialRuleFor(p.mission?.def.specialRule);
  if (specialRule == null || p.holeCards.length !== specialRule.finalHoleCardCount) {
    return [...p.holeCards];
  }
  const used = specialRule.bestHoleCardsUsed?.(p.holeCards, board) ?? [];
  return used.length > 0 ? used : p.holeCards.slice(0, specialRule.showdownHoleCardCount);
}

export interface PotAward {
  pot: Pot;
  winners: Seat[];
  /** 좌석별 실수령 칩(승자만 포함) */
  amounts: Map<Seat, number>;
  /**
   * 이 팟에서 Forced Split이 **실제로 결과를 바꿨는가**(§14).
   * 카드를 들고만 있고 승자가 그대로였다면 false이며, 그때는 카드를 교체하지 않는다.
   */
  forcedSplit: boolean;
}

/** Forced Split 보유 여부 — 팟 판정 단계에서만 쓰는 좁은 질의 */
function hasForcedSplit(p: PlayerState | undefined): boolean {
  return p?.mission?.def.potRule === "forced_split";
}

/** 표준 포커 랭킹으로 이 좌석들의 승자를 고른다 */
function rankingWinners(seats: readonly Seat[], handFor: (seat: Seat) => HandValue): Seat[] {
  let best: HandValue | null = null;
  let winners: Seat[] = [];
  for (const seat of seats) {
    const v = handFor(seat);
    if (best == null || compareHandValue(v, best) > 0) {
      best = v;
      winners = [seat];
    } else if (compareHandValue(v, best) === 0) {
      winners.push(seat);
    }
  }
  return winners;
}

/**
 * 이 팟의 승자를 정한다. Forced Split은 핸드 전체가 아니라 **팟별로** 판정한다(§14) —
 * 메인 팟은 강제 스플릿이지만 사이드 팟에는 풀하우스가 있어 정상 승부가 되는 상황이 가능하다.
 *
 * 규칙 순서:
 *   1. 보유자가 없으면 표준 랭킹.
 *   2. 이 팟에 풀하우스 이상이 한 명이라도 있으면 적용하지 않는다(High-End 예외).
 *   3. 보유자가 2명 이상이면 서로 상쇄되어 **보유자들은 팟을 가져가지 못하고** 나머지가 나눈다.
 *   4. 보유자가 1명이면 이 팟의 참가자 전원이 강제 스플릿한다.
 *
 * 3에서 참가자가 전부 보유자라 남는 사람이 없으면 상쇄를 적용할 대상이 사라지므로 표준
 * 랭킹으로 되돌린다 — 아무도 팟을 못 가져가면 칩이 사라져 보존이 깨진다.
 */
function resolvePotWinners(
  eligibleSeats: readonly Seat[],
  handFor: (seat: Seat) => HandValue,
  bySeat: ReadonlyMap<Seat, PlayerState>,
): { winners: Seat[]; forcedSplit: boolean } {
  const normal = rankingWinners(eligibleSeats, handFor);
  const holders = eligibleSeats.filter((s) => hasForcedSplit(bySeat.get(s)));
  if (holders.length === 0) return { winners: normal, forcedSplit: false };

  const highEndPresent = eligibleSeats.some((s) => handFor(s).rank >= HAND_RANK.FULL_HOUSE);
  if (highEndPresent) return { winners: normal, forcedSplit: false };

  let winners: Seat[];
  if (holders.length >= 2) {
    const others = eligibleSeats.filter((s) => !holders.includes(s));
    winners = others.length > 0 ? others : normal;
  } else {
    winners = [...eligibleSeats];
  }

  // "카드를 들고 있었다"가 아니라 "결과가 달라졌다"가 발동 기준이다(§14 교체 규칙).
  const changed = winners.length !== normal.length || winners.some((s) => !normal.includes(s));
  return { winners, forcedSplit: changed };
}

/**
 * 팟별 승자 판정 + 배분(§24). 동률 시 남는 몫은 베팅 단위(100칩) 덩어리 그대로
 * 포지션이 불리한 승자에게 넘긴다 — distributeAmount 참고.
 */
export function awardPots(
  pots: readonly Pot[],
  players: readonly PlayerState[],
  board: readonly Card[],
  buttonSeat: Seat,
  seatCount: number,
): PotAward[] {
  const bySeat = new Map(players.map((p) => [p.seat, p] as const));
  const handCache = new Map<Seat, HandValue>();
  const handFor = (seat: Seat): HandValue => {
    if (!handCache.has(seat)) {
      const p = bySeat.get(seat);
      if (p == null) throw new Error(`Unknown seat in pot: ${seat}`);
      handCache.set(seat, computeBestHandForPlayer(p, board));
    }
    return handCache.get(seat)!;
  };

  return pots.map((pot) => {
    const amounts = new Map<Seat, number>();
    if (pot.eligibleSeats.length === 0) {
      return { pot, winners: [], amounts, forcedSplit: false };
    }
    const { winners, forcedSplit } = resolvePotWinners(pot.eligibleSeats, handFor, bySeat);
    distributeAmount(pot.amount, winners, buttonSeat, seatCount, amounts);
    return { pot, winners, amounts, forcedSplit };
  });
}

/** 폴드로 결정된 핸드: 유일하게 남은 콘테스트 좌석이 모든 팟을 그대로 가져간다(쇼다운 없음). */
export function awardAllPotsToSingleWinner(pots: readonly Pot[], winnerSeat: Seat): PotAward[] {
  return pots.map((pot) => {
    const amounts = new Map<Seat, number>([[winnerSeat, pot.amount]]);
    // 폴드로 끝난 핸드에는 쇼다운이 없으므로 Forced Split도 발동하지 않는다(§14).
    return { pot, winners: [winnerSeat], amounts, forcedSplit: false };
  });
}

/**
 * 팟을 승자들에게 나눈다. 나누는 단위는 항상 베팅 단위(betStepUnit = 100칩)다.
 *
 * 1칩 단위로 쪼개면 정확한 chop이 되는 대신 50칩 같은 단위 밖 스택이 생기고, 그러면
 * "모든 베팅은 100 단위"라는 전제가 깨진다. 최소 레이즈·Raise Cap 계산(§15)이 그 전제 위에
 * 서 있으므로, 정확한 분배보다 단위 유지를 우선한다.
 *
 * 그래서 나누어떨어지지 않고 남는 100칩 덩어리는 쪼개지 않고, 포지션이 불리한 승자부터
 * (버튼 다음 좌석 = 포스트플랍에서 먼저 행동하는 자리) 한 덩어리씩 더 준다.
 */
function distributeAmount(
  amount: number,
  winners: readonly Seat[],
  buttonSeat: Seat,
  seatCount: number,
  out: Map<Seat, number>,
  step: number = MYSTERY_HOLDEM_CONFIG.betStepUnit,
): void {
  if (winners.length === 0) return;
  // 포지션이 불리한 순서 = 버튼 다음 좌석부터
  const ordered = seatOrderFrom((buttonSeat + 1) % seatCount, seatCount).filter((s) =>
    winners.includes(s),
  );
  const receivers = ordered.length > 0 ? ordered : [...winners];

  const units = Math.floor(amount / step);
  const baseUnits = Math.floor(units / receivers.length);
  let extraUnits = units - baseUnits * receivers.length;
  // 100 미만 잔돈은 모든 투입이 100 단위인 정상 플레이에서는 생기지 않는다. 그래도 생긴다면
  // 쪼개지 않고 가장 불리한 포지션에게 몰아줘, 합계가 팟과 정확히 일치하도록 한다.
  const dust = Math.round((amount - units * step) * 100) / 100;

  for (const seat of receivers) {
    const extra = extraUnits > 0 ? step : 0;
    if (extra > 0) extraUnits--;
    out.set(seat, (out.get(seat) ?? 0) + baseUnits * step + extra);
  }
  if (dust > 1e-9) {
    const seat = receivers[0]!;
    out.set(seat, (out.get(seat) ?? 0) + dust);
  }
}

/** 여러 PotAward의 좌석별 총 수령액을 합산 */
export function mergeAwardAmounts(awards: readonly PotAward[]): Map<Seat, number> {
  const total = new Map<Seat, number>();
  for (const a of awards) {
    for (const [seat, amount] of a.amounts) {
      total.set(seat, (total.get(seat) ?? 0) + amount);
    }
  }
  return total;
}

/** board까지 반영해 특정 좌석 하나의 최선 5장 카드 값만 필요할 때(로그·미션 판정용) */
export function bestHandValueForSeat(
  players: readonly PlayerState[],
  seat: Seat,
  board: readonly Card[],
): HandValue | null {
  const p = players.find((x) => x.seat === seat);
  if (p == null || p.folded || !p.inHand) return null;
  return computeBestHandForPlayer(p, board);
}

export type { Card };
