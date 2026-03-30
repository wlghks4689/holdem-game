/**
 * AI 플레이어 로직
 * ─ 성향(personality), 핸드 선택, 베팅 결정, IA 사용 여부를 순수 함수로 제공
 * ─ React 의존 없음 — useHoldemSinglePlayer 훅에서 호출
 */
import {
  canPreflopShortStackAllInShove,
  effectiveCallPay,
  facingFor,
  iaCostFromPot,
  levelFromContributions,
  postflopEffectiveMaxRaiseToLevel,
  postflopMaxBet,
  postflopMinRaiseToLevelChips,
  preflopHasLegalRaise,
  preflopMaxRaiseTargetForActor,
  preflopMinTotalRaiseForActor,
  roundHalfChip,
} from "./bettingHelpers";
import { resolveHandBlinds } from "./blindLevels";
import { SMALLEST_CHIP } from "./constants";
import { ALL_HAND_TEMPLATES } from "./handPool";
import type { GameAction, GameState, PlayerIndex } from "./types";

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export type Difficulty = "easy" | "normal" | "hard";

export type AIPersonality = {
  /** 플레이 스타일 */
  style: "aggressive" | "passive" | "tight" | "loose";
  /** 블러프 빈도 0-1 */
  bluffRate: number;
  /** 레이즈 빈도 보정 0-1 */
  raiseFreq: number;
};

// ─── 핸드 강도 티어 ───────────────────────────────────────────────────────────

/**
 * 템플릿 ID → 강도 티어 1-5
 * 5: 프리미엄 (AA/KK), 4: 강함, 3: 보통, 2: 약함/투기적
 */
export function handStrengthTier(templateId: string | null | undefined): number {
  if (!templateId) return 2;
  if (templateId === "hi_AA" || templateId === "hi_KK") return 5;
  if (templateId === "hi_QQ" || templateId === "hi_JJ") return 4;
  if (templateId === "axo_AKo" || templateId === "bw_KQs") return 4;
  if (templateId.startsWith("axo_") || templateId.startsWith("bw_")) return 3;
  if (templateId === "mid_TT" || templateId === "mid_99") return 3;
  if (templateId.startsWith("mid_")) return 2;
  // 커넥터 수딧: 연결성이 높을수록 약간 높게
  if (templateId.startsWith("conn_")) return 2;
  // 로우 페어
  if (templateId.startsWith("low_")) return 2;
  return 2;
}

// ─── 성향 생성 ────────────────────────────────────────────────────────────────

const STYLES = ["aggressive", "passive", "tight", "loose"] as const;

/**
 * 게임 시작 시 한 번, 이후 라운드 진행에 따라 부분 갱신
 * - 칩 차이가 크면 지는 쪽 → 공격적, 이기는 쪽 → 타이트
 */
export function generatePersonality(
  difficulty: Difficulty,
  chips: [number, number],
  aiSeat: PlayerIndex,
): AIPersonality {
  const total = chips[0] + chips[1];
  const aiShare = total > 0 ? chips[aiSeat] / total : 0.5;

  // 스타일 결정 (칩 수에서 pseudo-random)
  const seed = (chips[0] * 17 + chips[1] * 31 + aiSeat * 7) % 4;
  let style = STYLES[Math.floor(seed)] ?? "passive";

  // 큰 역전 상황에서 성향 보정
  if (aiShare < 0.35) style = "aggressive";       // 지고 있을 때 → 공격적
  else if (aiShare > 0.65 && difficulty === "hard") style = "tight"; // 이기고 있을 때(hard) → 타이트

  switch (difficulty) {
    case "easy":
      return { style, bluffRate: 0.28, raiseFreq: 0.35 };
    case "normal":
      return {
        style,
        bluffRate: style === "aggressive" || style === "loose" ? 0.18 : 0.10,
        raiseFreq: style === "aggressive" ? 0.62 : style === "passive" ? 0.28 : 0.45,
      };
    case "hard":
      return {
        style,
        bluffRate: style === "aggressive" || style === "loose" ? 0.13 : 0.06,
        raiseFreq: style === "aggressive" ? 0.72 : style === "passive" ? 0.38 : 0.55,
      };
  }
}

// ─── 핸드 선택 ────────────────────────────────────────────────────────────────

/**
 * 가중치 기반 핸드 템플릿 ID 선택.
 * Hard 는 강한 핸드를, Easy 는 균등하게 선택.
 */
export function pickAIHandTemplateId(
  state: GameState,
  aiSeat: PlayerIndex,
  difficulty: Difficulty,
): string | null {
  const pool = state.handPoolRemaining[aiSeat];
  const available = ALL_HAND_TEMPLATES.filter((t) => (pool[t.id] ?? 0) > 0);
  if (available.length === 0) return null;

  const tierWeight = (tier: number): number => {
    // [tier1, tier2, tier3, tier4, tier5]
    const table: Record<Difficulty, number[]> = {
      easy:   [0, 1.0, 1.0, 1.0, 1.0, 1.0],
      normal: [0, 1.0, 1.0, 1.5, 2.0, 3.0],
      hard:   [0, 1.0, 1.0, 2.0, 3.5, 5.0],
    };
    return table[difficulty][tier] ?? 1.0;
  };

  const weights = available.map((t) => tierWeight(handStrengthTier(t.id)));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return available[0]?.id ?? null;

  let rand = Math.random() * total;
  for (let i = 0; i < available.length; i++) {
    rand -= weights[i]!;
    if (rand <= 0) return available[i]!.id;
  }
  return available[available.length - 1]!.id;
}

// ─── 내부 유틸 ────────────────────────────────────────────────────────────────

function rng(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, roundHalfChip(v)));
}

/** 성향 보정치 */
function personalityBonus(p: AIPersonality): { agg: number; loose: number } {
  return {
    agg:   p.style === "aggressive" ? 0.15 : p.style === "passive" ? -0.10 : 0,
    loose: p.style === "loose" ? 0.10 : p.style === "tight" ? -0.10 : 0,
  };
}

// ─── 프리플랍 레이즈 사이징 ───────────────────────────────────────────────────

function preflopRaiseTo(
  state: GameState,
  tier: number,
  difficulty: Difficulty,
): number {
  const minT = preflopMinTotalRaiseForActor(state);
  const maxT = preflopMaxRaiseTargetForActor(state);
  if (minT > maxT + 1e-9) return minT;

  const bb = resolveHandBlinds(state).bb;
  let target: number;

  if (difficulty === "easy") {
    target = minT + rng(0, bb * 2);
  } else if (difficulty === "normal") {
    target = tier >= 4 ? minT + rng(bb, bb * 2.5) : minT + rng(0, bb);
  } else {
    // hard: pot-appropriate
    const pot = state.pot;
    target =
      tier >= 5 ? pot * 0.75 + minT :
      tier >= 4 ? pot * 0.5 + minT :
                  minT + rng(0, bb * 0.8);
  }

  // 최소 SMALLEST_CHIP 단위 스냅
  const snapped = Math.round(target / SMALLEST_CHIP) * SMALLEST_CHIP;
  return clamp(snapped, minT, maxT);
}

// ─── 프리플랍 베팅 결정 ───────────────────────────────────────────────────────

function preflopAction(
  state: GameState,
  aiSeat: PlayerIndex,
  tier: number,
  difficulty: Difficulty,
  p: AIPersonality,
): GameAction | null {
  const facing = facingFor(aiSeat, state.betting);
  const callPay = effectiveCallPay(aiSeat, state);
  const canRaise = preflopHasLegalRaise(state);
  const canAllIn = canPreflopShortStackAllInShove(state);
  const { agg, loose } = personalityBonus(p);

  // ── Easy: 확률 위주 ──────────────────────────────────────────────────────
  if (difficulty === "easy") {
    const r = Math.random();
    if (state.preflopStage === "button_acts") {
      if (canRaise && r < 0.35 + tier * 0.07) {
        return { type: "PREFLOP_RAISE", toLevelChips: preflopRaiseTo(state, tier, difficulty) };
      }
      return { type: "PREFLOP_CALL" };
    }
    if (state.preflopStage === "bb_option") {
      if (facing === 0) {
        if (canRaise && r < 0.20 + tier * 0.05) {
          return { type: "PREFLOP_RAISE", toLevelChips: preflopRaiseTo(state, tier, difficulty) };
        }
        return { type: "PREFLOP_CHECK" };
      }
    }
    if (state.preflopStage === "facing_raise") {
      if (r < 0.55) return { type: "PREFLOP_CALL" };
      if (facing > 0) return { type: "FOLD" };
    }
    return { type: "PREFLOP_CALL" };
  }

  // ── Normal / Hard: 티어 기반 ───────────────────────────────────────────────
  const raisePBase = [0, 0.10, 0.20, 0.42, 0.68, 0.88][tier] ?? 0.35;
  const raiseP = clamp(raisePBase + agg + p.raiseFreq * 0.18, 0, 0.95);

  const foldPBase = [0, 0.55, 0.48, 0.28, 0.10, 0.04][tier] ?? 0.35;
  const foldP = clamp(foldPBase - agg - loose, 0.03, 0.92);

  const r = Math.random();

  // button_acts — 폴드 불가
  if (state.preflopStage === "button_acts" && aiSeat === state.button) {
    if (canAllIn && tier >= 5) return { type: "PREFLOP_ALL_IN" };
    if (canRaise && r < raiseP) {
      return { type: "PREFLOP_RAISE", toLevelChips: preflopRaiseTo(state, tier, difficulty) };
    }
    return { type: "PREFLOP_CALL" };
  }

  // bb_option
  if (state.preflopStage === "bb_option" && aiSeat !== state.button) {
    if (facing === 0) {
      if (canAllIn && tier >= 5 && r < 0.55) return { type: "PREFLOP_ALL_IN" };
      if (canRaise && r < raiseP * 0.72) {
        return { type: "PREFLOP_RAISE", toLevelChips: preflopRaiseTo(state, tier, difficulty) };
      }
      return { type: "PREFLOP_CHECK" };
    }
  }

  // facing_raise — BB 리레이즈 응답
  if (state.preflopStage === "facing_raise" && aiSeat !== state.button) {
    if (canAllIn && tier >= 5 && r < 0.48) return { type: "PREFLOP_ALL_IN" };
    if (canRaise && r < raiseP * 0.48) {
      return { type: "PREFLOP_RAISE", toLevelChips: preflopRaiseTo(state, tier, difficulty) };
    }
    if (r < raiseP * 0.48 + (1 - foldP) * 0.9) return { type: "PREFLOP_CALL" };
    if (facing > 0 && callPay > 0) return { type: "FOLD" };
    return { type: "PREFLOP_CALL" };
  }

  // facing_raise — 버튼 콜/폴드만
  if (state.preflopStage === "facing_raise" && aiSeat === state.button) {
    if (facing > 0 && r < foldP) return { type: "FOLD" };
    return { type: "PREFLOP_CALL" };
  }

  return null;
}

// ─── 포스트플랍 베팅 결정 ─────────────────────────────────────────────────────

function postflopAction(
  state: GameState,
  aiSeat: PlayerIndex,
  tier: number,
  difficulty: Difficulty,
  p: AIPersonality,
): GameAction | null {
  const facing = facingFor(aiSeat, state.betting);
  const level = levelFromContributions(state.betting);
  const chips = state.chips[aiSeat]!;
  const pot = state.pot;
  const bb = resolveHandBlinds(state).bb;
  const isAllIn = state.isAllIn;
  const { agg } = personalityBonus(p);

  // 블러프 여부: 낮은 티어에서 일정 확률로 높은 티어처럼 행동
  const isBluffing = Math.random() < p.bluffRate;
  const effectiveTier = isBluffing && tier <= 2 ? 4 : tier;

  // ── Easy ────────────────────────────────────────────────────────────────────
  if (difficulty === "easy") {
    const r = Math.random();
    if (facing === 0) {
      const maxB = postflopMaxBet(pot, chips);
      if (!isAllIn && r < 0.38 && maxB >= bb) {
        return { type: "POSTFLOP_BET", amount: clamp(maxB * rng(0.25, 0.65), bb, maxB) };
      }
      return { type: "POSTFLOP_CHECK" };
    } else {
      if (!isAllIn && r < 0.18) {
        const minR = postflopMinRaiseToLevelChips(level, facing);
        const maxR = postflopEffectiveMaxRaiseToLevel(pot, facing, state.betting.contributed[aiSeat]!, chips);
        if (minR <= maxR + 1e-9) {
          return { type: "POSTFLOP_RAISE", toLevelChips: clamp(rng(minR, maxR), minR, maxR) };
        }
      }
      if (r < 0.55) return { type: "POSTFLOP_CALL" };
      return { type: "FOLD" };
    }
  }

  // ── Normal / Hard ───────────────────────────────────────────────────────────
  if (facing === 0) {
    const betThresh = clamp(
      ([0, 0.15, 0.25, 0.45, 0.68, 0.82][effectiveTier] ?? 0.4) + agg,
      0, 0.95,
    );
    const maxB = postflopMaxBet(pot, chips);

    if (!isAllIn && Math.random() < betThresh && maxB >= bb) {
      const frac =
        difficulty === "normal"
          ? effectiveTier >= 4 ? rng(0.50, 0.75) : rng(0.30, 0.50)
          : effectiveTier >= 5 ? rng(0.70, 1.00) :
            effectiveTier >= 4 ? rng(0.55, 0.80) :
            effectiveTier >= 3 ? rng(0.40, 0.60) : rng(0.25, 0.42);
      const amt = clamp(pot * frac, bb, maxB);
      return { type: "POSTFLOP_BET", amount: amt };
    }
    return { type: "POSTFLOP_CHECK" };
  } else {
    const raiseThresh = clamp(
      ([0, 0.05, 0.10, 0.18, 0.30, 0.45][effectiveTier] ?? 0.15) + agg * 0.5,
      0, 0.8,
    );
    const callThresh = clamp(
      ([0, 0.18, 0.28, 0.50, 0.68, 0.78][effectiveTier] ?? 0.40) + agg * 0.2,
      0, 0.95,
    );

    const r = Math.random();
    if (!isAllIn && r < raiseThresh) {
      const minR = postflopMinRaiseToLevelChips(level, facing);
      const maxR = postflopEffectiveMaxRaiseToLevel(pot, facing, state.betting.contributed[aiSeat]!, chips);
      const contrib = state.betting.contributed[aiSeat]!;
      const affordable = roundHalfChip(contrib + chips);
      if (minR <= maxR + 1e-9 && minR <= affordable + 1e-9) {
        const frac = effectiveTier >= 4 ? rng(0.6, 1.0) : rng(0.35, 0.7);
        const to = clamp(minR + (maxR - minR) * frac, minR, maxR);
        return { type: "POSTFLOP_RAISE", toLevelChips: to };
      }
    }
    if (r < raiseThresh + callThresh) return { type: "POSTFLOP_CALL" };
    return { type: "FOLD" };
  }
}

// ─── 메인 베팅 액션 선택 ──────────────────────────────────────────────────────

/**
 * AI의 현재 차례에서 최적 액션 반환.
 * null 이면 호출 측에서 computeTimeoutAction 으로 폴백.
 */
export function computeAIBettingAction(
  state: GameState,
  aiSeat: PlayerIndex,
  difficulty: Difficulty,
  personality: AIPersonality,
): GameAction | null {
  const tier = handStrengthTier(state.holes[aiSeat]?.templateId);
  const phase = state.phase;

  if (phase === "preflop" && state.preflopStage != null) {
    return preflopAction(state, aiSeat, tier, difficulty, personality);
  }
  if (phase === "flop" || phase === "turn" || phase === "river") {
    return postflopAction(state, aiSeat, tier, difficulty, personality);
  }
  return null;
}

// ─── IA 사용 여부 ─────────────────────────────────────────────────────────────

/**
 * 리버에서 AI가 IA를 사용할지 여부.
 * 강한 핸드일수록, hard 난이도일수록 IA 사용 빈도 증가.
 */
export function shouldAIUseIA(
  state: GameState,
  aiSeat: PlayerIndex,
  personality: AIPersonality,
  difficulty: Difficulty,
): boolean {
  const tier = handStrengthTier(state.holes[aiSeat]?.templateId);
  const bb = resolveHandBlinds(state).bb;
  const iaCost = iaCostFromPot(state.pot, bb);

  if ((state.chips[aiSeat] ?? 0) < iaCost) return false;
  if (state.pot <= 0 || state.isAllIn) return false;

  const base =
    difficulty === "easy"   ? 0.12 :
    difficulty === "normal" ? 0.24 : 0.40;
  const tierBonus = (tier - 2) * 0.08;
  const aggBonus = personality.style === "aggressive" ? 0.05 : 0;

  return Math.random() < Math.min(0.70, base + tierBonus + aggBonus);
}
