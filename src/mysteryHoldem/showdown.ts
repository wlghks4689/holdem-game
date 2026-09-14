import type { Card } from "@/holdem/cards";
import { compareHandValue, type HandValue } from "@/holdem/pokerEval";
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

export interface PotAward {
  pot: Pot;
  winners: Seat[];
  /** 좌석별 실수령 칩(승자만 포함) */
  amounts: Map<Seat, number>;
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
