import type { PotAward } from "./showdown";
import type { Seat } from "./types";

export interface BustAttributionContext {
  bustedSeat: Seat;
  /** 이번 핸드에 정산된 팟(승자 포함), 배열 순서 = Main Pot → Side Pot 1 → ... */
  awards: readonly PotAward[];
}

/**
 * Bounty 귀속 규칙 인터페이스(§23, §24). Multi-Way All-In/Side Pot 상황에서 "누가
 * 버스트를 유발한 것으로 인정되는가"는 §31에 따라 아직 확정되지 않았으므로,
 * Codex가 임의로 최종 규칙을 정하지 않고 교체 가능한 전략 함수로 분리했다.
 */
export type BountyAttributionRule = (ctx: BustAttributionContext) => Seat[];

/**
 * 기본(잠정) Bounty 귀속 규칙 — §31 미확정 영역의 합리적인 기본값일 뿐, 최종 기획 확정 전.
 *
 * 버스트된 플레이어가 자격을 가졌던 팟 중 배열상 가장 마지막 팟(그 플레이어를 실제로
 * 올인시킨 것으로 볼 수 있는 팟)의 승자(들)에게 귀속한다. 승자가 여럿이면(무승부) 동일하게
 * 나눠 갖는다(`splitBountyReward`).
 */
export const defaultBountyAttributionRule: BountyAttributionRule = (ctx) => {
  const eligible = ctx.awards.filter((a) => a.pot.eligibleSeats.includes(ctx.bustedSeat));
  if (eligible.length === 0) return [];
  const decidingPot = eligible[eligible.length - 1]!;
  return decidingPot.winners.filter((s) => s !== ctx.bustedSeat);
};

/** reward를 승자 수만큼 균등 분배 */
export function splitBountyReward(
  totalReward: number,
  winners: readonly Seat[],
): Map<Seat, number> {
  const result = new Map<Seat, number>();
  if (winners.length === 0) return result;
  const share = totalReward / winners.length;
  for (const seat of winners) result.set(seat, share);
  return result;
}
