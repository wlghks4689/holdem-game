import type { Card } from "@/holdem/cards";
import { compareHandValue, type HandValue } from "@/holdem/pokerEval";
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

export interface PotAward {
  pot: Pot;
  winners: Seat[];
  /** 좌석별 실수령 칩(승자만 포함) */
  amounts: Map<Seat, number>;
}

/**
 * 팟별 승자 판정 + 배분(§24). 동률 시 1칩 단위 잔여 칩은 버튼 다음 좌석부터
 * 가까운 순서로 승자들에게 한 칩씩 순환 배분한다(홀칩 처리 관례 — §31 범위 밖 세부 규칙,
 * 필요 시 교체 가능하도록 별도 함수로 분리했다).
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
      return { pot, winners: [], amounts };
    }
    let best: HandValue | null = null;
    let winners: Seat[] = [];
    for (const seat of pot.eligibleSeats) {
      const v = handFor(seat);
      if (best == null || compareHandValue(v, best) > 0) {
        best = v;
        winners = [seat];
      } else if (compareHandValue(v, best) === 0) {
        winners.push(seat);
      }
    }
    distributeAmount(pot.amount, winners, buttonSeat, seatCount, amounts);
    return { pot, winners, amounts };
  });
}

/** 폴드로 결정된 핸드: 유일하게 남은 콘테스트 좌석이 모든 팟을 그대로 가져간다(쇼다운 없음). */
export function awardAllPotsToSingleWinner(pots: readonly Pot[], winnerSeat: Seat): PotAward[] {
  return pots.map((pot) => {
    const amounts = new Map<Seat, number>([[winnerSeat, pot.amount]]);
    return { pot, winners: [winnerSeat], amounts };
  });
}

function distributeAmount(
  amount: number,
  winners: readonly Seat[],
  buttonSeat: Seat,
  seatCount: number,
  out: Map<Seat, number>,
): void {
  if (winners.length === 0) return;
  const shareBase = Math.floor(amount / winners.length);
  const remainderChips = Math.round(amount - shareBase * winners.length);
  for (const w of winners) out.set(w, (out.get(w) ?? 0) + shareBase);
  if (remainderChips <= 0) return;
  const order = seatOrderFrom((buttonSeat + 1) % seatCount, seatCount).filter((s) =>
    winners.includes(s),
  );
  for (let i = 0; i < remainderChips; i++) {
    const seat = order[i % order.length]!;
    out.set(seat, (out.get(seat) ?? 0) + 1);
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
