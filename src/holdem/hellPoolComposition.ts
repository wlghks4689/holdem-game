/**
 * Hell: 매치 전체 핸드 풀 잔량으로 초·중·후반 가중치 보정.
 */
import { getHandTemplatesForMode } from "./handPool";
import { TOTAL_ROUNDS } from "./constants";
import { hellTierWeightsForRound } from "./hellGtoHeuristics";
import type { GameState, PlayerIndex } from "./types";

/** `aiPlayer.handStrengthTier`와 동일 — 순환 참조 방지 */
function templateTier(id: string): number {
  if (id === "hi_AA" || id === "hi_KK") return 5;
  if (id === "hi_QQ" || id === "hi_JJ") return 4;
  if (id === "axs_AKs") return 4;
  if (id === "axo_AKo" || id === "bw_KQs") return 4;
  if (id.startsWith("axs_") || id.startsWith("axo_") || id.startsWith("bw_")) return 3;
  if (id === "mid_TT" || id === "mid_99") return 3;
  if (id.startsWith("mid_")) return 2;
  if (id.startsWith("conn_")) return 2;
  if (id.startsWith("low_")) return 2;
  return 2;
}

function poolTierMasses(
  pool: Record<string, number>,
  state: GameState,
): { premium: number; mid: number; weak: number; total: number } {
  let premium = 0;
  let mid = 0;
  let weak = 0;
  let total = 0;
  for (const t of getHandTemplatesForMode(state.gameMode)) {
    const rem = pool[t.id] ?? 0;
    if (rem <= 0) continue;
    total += rem;
    const tier = templateTier(t.id);
    if (tier >= 4) premium += rem;
    else if (tier === 3) mid += rem;
    else weak += rem;
  }
  return { premium, mid, weak, total };
}

/**
 * Hell 핸드 선택 가중치 [0..5] 인덱스 — `hellTierWeightsForRound` 결과에 곱할 보정.
 */
export function hellPoolAdjustedTierWeights(
  state: GameState,
  aiSeat: PlayerIndex,
): number[] {
  const base = hellTierWeightsForRound(state.roundNumber);
  const out = [...base];
  const { premium, mid, weak, total } = poolTierMasses(
    state.handPoolRemaining[aiSeat],
    state,
  );
  if (total < 1e-9) return out;

  const pr = premium / total;
  const wr = weak / total;
  const phase = state.roundNumber / TOTAL_ROUNDS;

  /* 초반: 프리미엄 비율이 이미 낮으면 약간 보존(중티어↑) */
  if (phase < 0.38 && pr < 0.18) {
    out[3] = (out[3] ?? 1) * 1.14;
    out[4] = (out[4] ?? 1) * 1.08;
  }

  /* 중반: 밸런스 — 약핸드 풀 소진 시 미드 가중 */
  if (phase >= 0.35 && phase < 0.72 && wr < 0.25) {
    out[2] = (out[2] ?? 1) * 1.12;
    out[3] = (out[3] ?? 1) * 1.1;
  }

  /* 후반: 프리미엄/미드 소진 → 운영 폭(약·중 티어) */
  if (phase >= 0.65) {
    if (pr < 0.12) {
      out[2] = (out[2] ?? 1) * 1.18;
      out[3] = (out[3] ?? 1) * 1.12;
    }
    if (mid + premium < total * 0.35) {
      out[1] = (out[1] ?? 1) * 1.08;
      out[2] = (out[2] ?? 1) * 1.06;
    }
  }

  return out;
}
