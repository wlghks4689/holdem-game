/**
 * Hell 난이도용 GTO·헤즈업에 가깝게 보이도록 하는 휴리스틱(솔버 학습 결과가 아님).
 * - 최소 방어 / 배당(가격) 의식: 싼 가격이면 콜·폴드 빈도 조정
 * - 엔드게임: 남은 라운드·칩 비율에 따라 역전 시도 vs 칩 리드 보호
 */
import {
  HELL_ENDGAME_LAST_ROUNDS,
  TOTAL_ROUNDS,
} from "./constants";
import type { GameState, PlayerIndex } from "./types";

/** tier 1..5 가중치 (인덱스 0은 미사용) */
const HELL_TIER_WEIGHTS_EARLY = [0, 0.4, 0.7, 2.2, 4.5, 8.0];
const HELL_TIER_WEIGHTS_LATE = [0, 0.58, 1.05, 2.85, 4.35, 6.2];

/**
 * 매치 후반으로 갈수록 프리미엄 소모를 완화해 후반에도 운영 가능한 손 분포 유지.
 */
export function hellTierWeightsForRound(roundNumber: number): number[] {
  const u = Math.min(
    1,
    Math.max(0, (roundNumber - 1) / Math.max(1, TOTAL_ROUNDS - 1)),
  );
  return HELL_TIER_WEIGHTS_EARLY.map((e, i) => e + (HELL_TIER_WEIGHTS_LATE[i]! - e) * u);
}

export function isHellEndgamePhase(roundNumber: number): boolean {
  return roundNumber >= TOTAL_ROUNDS - HELL_ENDGAME_LAST_ROUNDS + 1;
}

/**
 * 콜에 필요한 금액 대비 팟 배당이 좋을수록 콜 쪽으로 보정값(0~1) 증가.
 * price = call / (pot + call)
 */
export function hellPotOddsCallBonus(callAmount: number, potBeforeCall: number): number {
  if (callAmount <= 1e-9 || potBeforeCall < 0) return 0;
  const denom = potBeforeCall + callAmount;
  if (denom <= 1e-9) return 0;
  const price = callAmount / denom;
  if (price <= 0.05) return 0.26;
  if (price <= 0.1) return 0.19;
  if (price <= 0.16) return 0.13;
  if (price <= 0.24) return 0.08;
  if (price <= 0.33) return 0.04;
  return 0;
}

export type HellEndgameBonuses = {
  callBonus: number;
  raiseBonus: number;
  openBetBonus: number;
  /** preflop fold 확률에서 빼는 값 */
  preflopFoldRelief: number;
};

/**
 * 막판 + 칩 우열: 역전이 필요한 쪽은 싸움, 우위는 얇은 밸류·무액션 완화.
 */
export function hellEndgameBonuses(
  state: GameState,
  aiSeat: PlayerIndex,
): HellEndgameBonuses {
  const z: HellEndgameBonuses = {
    callBonus: 0,
    raiseBonus: 0,
    openBetBonus: 0,
    preflopFoldRelief: 0,
  };
  if (!isHellEndgamePhase(state.roundNumber)) return z;

  const c0 = state.chips[0]!;
  const c1 = state.chips[1]!;
  const total = c0 + c1;
  if (total <= 1e-9) return z;
  const aiShare = state.chips[aiSeat]! / total;

  if (aiShare < 0.44) {
    return {
      callBonus: 0.11,
      raiseBonus: 0.045,
      openBetBonus: 0.065,
      preflopFoldRelief: 0.09,
    };
  }
  if (aiShare > 0.56) {
    return {
      callBonus: 0.07,
      raiseBonus: 0.025,
      openBetBonus: 0.055,
      preflopFoldRelief: 0.055,
    };
  }
  return {
    callBonus: 0.05,
    raiseBonus: 0.03,
    openBetBonus: 0.04,
    preflopFoldRelief: 0.04,
  };
}
