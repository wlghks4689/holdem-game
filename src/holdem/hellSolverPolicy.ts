/**
 * Hell 전용 프리플랍·리버 정책 — 솔버 출력으로 교체 가능한 빈도 테이블.
 * (현재 값은 HUNL·EV 근사에 맞춘 플레이스홀더 — 실제 Pio/GTO+ 등에서 덮어쓰면 됨)
 */
import {
  canPreflopShortStackAllInShove,
  effectiveCallPay,
  facingFor,
  preflopHasLegalRaise,
  preflopMaxRaiseTargetForActor,
  preflopMinTotalRaiseForActor,
  roundHalfChip,
} from "./bettingHelpers";
import { resolveHandBlinds } from "./blindLevels";
import { SMALLEST_CHIP } from "./constants";
import {
  hellEndgameBonuses,
  hellPotOddsCallBonus,
} from "./hellGtoHeuristics";
import {
  buildWeightedOpponentHoles,
  enumerateRiverLineCandidates,
  equityVsWeightedRange,
  totalWeight,
  type RiverLineCandidate,
  type RiverLineKind,
} from "./riverEvAi";
import type { GameAction, GameState, OpponentHandCategory, PlayerIndex } from "./types";

const CHIP = 1e-6;

function rng(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function clampChip(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, roundHalfChip(v)));
}

function hellPreflopRaiseTo(state: GameState, tier: number): number {
  const minT = preflopMinTotalRaiseForActor(state);
  const maxT = preflopMaxRaiseTargetForActor(state);
  if (minT > maxT + CHIP) return roundHalfChip(maxT);
  const bb = resolveHandBlinds(state).bb;
  const pot = state.pot;
  const target =
    tier >= 5
      ? pot * 0.82 + minT
      : tier >= 4
        ? pot * 0.58 + minT
        : minT + rng(0, bb * 0.55);
  const snapped = Math.round(target / SMALLEST_CHIP) * SMALLEST_CHIP;
  return clampChip(snapped, minT, maxT);
}

function tierIdx(tier: number): number {
  return Math.max(1, Math.min(5, tier)) - 1;
}

/** SB 오픈 레이즈 빈도 [티어1..5], 나머지는 콜(림프) */
const HELL_PF_SB_OPEN_RAISE: readonly number[] = [0.28, 0.44, 0.58, 0.78, 0.9];

/** BB 미리레이즈(옵션) 레이즈 빈도, 나머지 체크 */
const HELL_PF_BB_OPTION_RAISE: readonly number[] = [0.07, 0.14, 0.24, 0.42, 0.64];

/** BB vs 오픈 — [폴드, 콜, 레이즈] */
const HELL_PF_BB_VS_RAISE: readonly [number, number, number][] = [
  [0.52, 0.4, 0.08],
  [0.36, 0.52, 0.12],
  [0.22, 0.56, 0.22],
  [0.1, 0.5, 0.4],
  [0.04, 0.36, 0.6],
];

/** BTN vs 리레이즈 — [폴드, 콜, 레이즈] */
const HELL_PF_BTN_VS_RAISE: readonly [number, number, number][] = [
  [0.58, 0.34, 0.08],
  [0.44, 0.44, 0.12],
  [0.28, 0.52, 0.2],
  [0.12, 0.48, 0.4],
  [0.05, 0.35, 0.6],
];

function normalize3(t: readonly [number, number, number]): [number, number, number] {
  const s = t[0] + t[1] + t[2];
  if (s <= 1e-9) return [1 / 3, 1 / 3, 1 / 3];
  return [t[0] / s, t[1] / s, t[2] / s];
}

function sample3(
  u: number,
  triple: [number, number, number],
): 0 | 1 | 2 {
  if (u < triple[0]) return 0;
  if (u < triple[0] + triple[1]) return 1;
  return 2;
}

/**
 * Hell 프리플랍: 테이블 기반 혼합 전략 (솔버 CSV 등으로 교체 가능).
 * `hellGtoHeuristics` 배당 보정은 폴드 분기에만 약하게 반영.
 */
export function hellPreflopSolverAction(
  state: GameState,
  aiSeat: PlayerIndex,
  tier: number,
): GameAction {
  const facing = facingFor(aiSeat, state.betting);
  const callPay = effectiveCallPay(aiSeat, state);
  const canRaise = preflopHasLegalRaise(state);
  const canAllIn = canPreflopShortStackAllInShove(state);
  const ti = tierIdx(tier);
  const r = Math.random();

  if (state.preflopStage === "button_acts" && aiSeat === state.button) {
    if (canAllIn && tier >= 5 && r < 0.06) {
      return { type: "PREFLOP_ALL_IN" };
    }
    const pRaise = HELL_PF_SB_OPEN_RAISE[ti] ?? 0.5;
    if (canRaise && r < pRaise) {
      return {
        type: "PREFLOP_RAISE",
        toLevelChips: hellPreflopRaiseTo(state, tier),
      };
    }
    return { type: "PREFLOP_CALL" };
  }

  if (state.preflopStage === "bb_option" && aiSeat !== state.button) {
    if (facing === 0) {
      if (canAllIn && tier >= 5 && r < 0.12) {
        return { type: "PREFLOP_ALL_IN" };
      }
      const pRaise = HELL_PF_BB_OPTION_RAISE[ti] ?? 0.2;
      if (canRaise && r < pRaise) {
        return {
          type: "PREFLOP_RAISE",
          toLevelChips: hellPreflopRaiseTo(state, tier),
        };
      }
      return { type: "PREFLOP_CHECK" };
    }
  }

  if (state.preflopStage === "facing_raise" && aiSeat !== state.button) {
    let triple = normalize3(HELL_PF_BB_VS_RAISE[ti] ?? [0.3, 0.5, 0.2]);
    if (callPay > 0) {
      const relief =
        hellPotOddsCallBonus(callPay, state.pot) * 0.55 +
        hellEndgameBonuses(state, aiSeat).preflopFoldRelief * 0.35;
      const foldW = Math.max(0.02, triple[0] - relief);
      const callW = triple[1] + (triple[0] - foldW) * 0.65;
      const raiseW = Math.max(0.02, 1 - foldW - callW);
      triple = normalize3([foldW, callW, raiseW]);
    }
    const u = Math.random();
    const pick = sample3(u, triple);
    if (pick === 2 && canRaise) {
      return {
        type: "PREFLOP_RAISE",
        toLevelChips: hellPreflopRaiseTo(state, tier),
      };
    }
    if (pick === 0 && facing > 0 && callPay > 0) {
      return { type: "FOLD" };
    }
    return { type: "PREFLOP_CALL" };
  }

  if (state.preflopStage === "facing_raise" && aiSeat === state.button) {
    let triple = normalize3(HELL_PF_BTN_VS_RAISE[ti] ?? [0.35, 0.45, 0.2]);
    if (callPay > 0) {
      const relief =
        hellPotOddsCallBonus(callPay, state.pot) * 0.55 +
        hellEndgameBonuses(state, aiSeat).preflopFoldRelief * 0.35;
      const foldW = Math.max(0.02, triple[0] - relief);
      const callW = triple[1] + (triple[0] - foldW) * 0.6;
      const raiseW = Math.max(0.02, 1 - foldW - callW);
      triple = normalize3([foldW, callW, raiseW]);
    }
    const u = Math.random();
    const pick = sample3(u, triple);
    if (pick === 2 && canRaise) {
      return {
        type: "PREFLOP_RAISE",
        toLevelChips: hellPreflopRaiseTo(state, tier),
      };
    }
    if (pick === 0 && facing > 0) {
      return { type: "FOLD" };
    }
    return { type: "PREFLOP_CALL" };
  }

  return { type: "PREFLOP_CALL" };
}

function equityBucket(eq: number): number {
  if (eq < 0.25) return 0;
  if (eq < 0.4) return 1;
  if (eq < 0.55) return 2;
  if (eq < 0.7) return 3;
  if (eq < 0.85) return 4;
  return 5;
}

/** facing 시 콜 가격 구간: 싼 / 중 / 비쌈 */
function priceBucket(price: number): number {
  if (price <= 0.12) return 0;
  if (price <= 0.28) return 1;
  return 2;
}

/**
 * [폴드, 콜, 레이즈] — 솔버 출력으로 교체 (eqBucket 0..5 × priceBucket 0..2)
 * 행: 약한 에퀴티 → 강한 에퀴티, 열: 싼 가격 → 비싼 가격
 */
const HELL_RIVER_FACING: readonly (readonly (readonly [number, number, number])[])[] =
  [
    // eq 0
    [
      [0.42, 0.48, 0.1],
      [0.55, 0.38, 0.07],
      [0.72, 0.22, 0.06],
    ],
    [
      [0.28, 0.55, 0.17],
      [0.4, 0.45, 0.15],
      [0.58, 0.3, 0.12],
    ],
    [
      [0.16, 0.52, 0.32],
      [0.22, 0.48, 0.3],
      [0.35, 0.4, 0.25],
    ],
    [
      [0.08, 0.42, 0.5],
      [0.1, 0.38, 0.52],
      [0.15, 0.35, 0.5],
    ],
    [
      [0.04, 0.28, 0.68],
      [0.05, 0.25, 0.7],
      [0.08, 0.22, 0.7],
    ],
    [
      [0.02, 0.15, 0.83],
      [0.02, 0.12, 0.86],
      [0.03, 0.1, 0.87],
    ],
  ];

/** 리버 선액션 [체크, 베트] */
const HELL_RIVER_LEAD: readonly (readonly [number, number])[] = [
  [0.72, 0.28],
  [0.58, 0.42],
  [0.42, 0.58],
  [0.28, 0.72],
  [0.18, 0.82],
  [0.12, 0.88],
];

function pickCandidateByKind(
  kind: RiverLineKind,
  candidates: readonly RiverLineCandidate[],
): GameAction | null {
  const c = candidates.find((x) => x.kind === kind);
  return c ? c.action : null;
}

function bestEvAction(candidates: readonly RiverLineCandidate[]): GameAction | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  for (const c of candidates) {
    if (c.ev > best.ev + CHIP) best = c;
  }
  return best.action;
}

/**
 * Hell 리버: EV 후보 열거 + 솔버 빈도 테이블 혼합 (실제 솔버 주파수로 `HELL_RIVER_*` 교체).
 */
export function hellRiverSolverAction(
  state: GameState,
  aiSeat: PlayerIndex,
  categoryFilter: OpponentHandCategory | null,
): GameAction | null {
  if (state.phase !== "river") return null;
  const potEff = state.pot;
  const heroSel = state.holes[aiSeat];
  const board = state.board;
  if (!heroSel || board.length < 5) return null;

  const range = buildWeightedOpponentHoles(state, aiSeat, categoryFilter);
  if (totalWeight(range) <= 1e-12) return null;

  const { equity } = equityVsWeightedRange(heroSel.hole, board, range);
  const eqB = equityBucket(equity);

  const candidates = enumerateRiverLineCandidates(
    state,
    aiSeat,
    potEff,
    categoryFilter,
  );
  if (candidates.length === 0) return null;

  const facing = facingFor(aiSeat, state.betting);
  const callPay = effectiveCallPay(aiSeat, state);

  if (facing > CHIP) {
    const price =
      callPay > CHIP && potEff + callPay > CHIP
        ? callPay / (potEff + callPay)
        : 0.5;
    const pb = priceBucket(price);
    const row = HELL_RIVER_FACING[eqB] ?? HELL_RIVER_FACING[2]!;
    const triple = normalize3(row[pb] ?? row[1]!);
    const u = Math.random();
    const idx = sample3(u, triple);
    const want: RiverLineKind[] = ["fold", "call", "raise"];
    let kind = want[idx] ?? "call";
    /* 칩 EV: 이길 거의 없는데 콜만 하는 빈도 제거 */
    if (kind === "call" && callPay > CHIP && potEff + callPay > CHIP) {
      const minEq = (callPay / (potEff + callPay)) * 0.95;
      if (equity + 1e-9 < minEq) {
        kind = "fold";
      }
    }
    let act = pickCandidateByKind(kind, candidates);
    if (act == null) {
      act = bestEvAction(candidates);
    }
    return act;
  }

  const lead = HELL_RIVER_LEAD[eqB] ?? [0.45, 0.55];
  const pBet = lead[1] / (lead[0] + lead[1]);
  if (Math.random() < pBet) {
    const act = pickCandidateByKind("bet", candidates);
    return act ?? pickCandidateByKind("check", candidates) ?? bestEvAction(candidates);
  }
  const act = pickCandidateByKind("check", candidates);
  return act ?? pickCandidateByKind("bet", candidates) ?? bestEvAction(candidates);
}
