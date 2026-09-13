import { legalActionsForSeat } from "@/mysteryHoldem/selectors";
import type { MysteryGameAction, MysteryGameState, Seat } from "@/mysteryHoldem/types";

/**
 * 로컬 대전(초기 프로토타입)용 매우 단순한 봇 정책. 포커 실력 최적화가 목적이 아니라
 * §27 전체 루프(딜링 → 베팅 → 쇼다운 → 정산 → 다음 라운드)를 UI에서 곧바로
 * 검증/플레이할 수 있게 하는 자리채움 로직이다. 실제 AI는 범위 밖(§27).
 */
export function decideBotAction(state: MysteryGameState, seat: Seat, rng: () => number): MysteryGameAction {
  const legal = legalActionsForSeat(state, seat);
  const player = state.players.find((p) => p.seat === seat)!;

  if (legal.canCheck) {
    if (legal.canBet && legal.raiseRange && rng() < 0.15) {
      return { type: "BET", seat, amount: legal.raiseRange.min };
    }
    return { type: "CHECK", seat };
  }

  const denom = player.chips + legal.callAmount;
  const facingRatio = denom > 0 ? legal.callAmount / denom : 1;
  if (facingRatio > 0.5 && rng() < 0.6) {
    return { type: "FOLD", seat };
  }
  if (legal.canRaise && legal.raiseRange && rng() < 0.1) {
    return { type: "RAISE", seat, toAmount: legal.raiseRange.min };
  }
  return { type: "CALL", seat };
}

/** 카드 강도 평가 없이 항상 처음 두 장을 유지(추후 교체 가능한 자리채움 정책) */
export function pickHoleKeepIndexes(): [number, number] {
  return [0, 1];
}

export function pickMissionId(state: MysteryGameState, seat: Seat, rng: () => number): string {
  const candidates = state.missionOffers[seat] ?? [];
  if (candidates.length === 0) return "";
  const idx = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[idx]!.id;
}
