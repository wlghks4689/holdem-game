import {
  effectiveCallPay,
  effectiveStackBb,
  levelFromContributions,
  preflopMaxRaiseTargetForActor,
  preflopMinTotalRaiseForActor,
  preflopRaiseSliderRange,
  roundHalfChip,
} from "./bettingHelpers";
import { resolveHandBlinds } from "./blindLevels";
import { SMALLEST_CHIP } from "./constants";
import type { GameState, PlayerIndex } from "./types";

const EPS = 1e-9;

export type PreflopRaiseStage = "open" | "threeBet" | "fourBetPlus";
export type PreflopAiContext = {
  effectiveStackBb: number;
  callAmount: number;
  currentHighestStreetContribution: number;
  raiseStage: PreflopRaiseStage;
  potSize: number;
  legalMinRaiseTo: number | null;
  legalMaxRaiseTo: number | null;
};
export type PreflopActionScores = { fold: number; call: number; raise: number; allIn: number };

export function isPremiumOpeningHand(templateId: string | null | undefined): boolean {
  return templateId === "hi_AA" || templateId === "hi_KK" || templateId === "hi_QQ" ||
    templateId === "hi_JJ" || templateId === "axs_AKs";
}

export function isPremiumJamHand(templateId: string | null | undefined): boolean {
  return templateId === "hi_AA" || templateId === "hi_KK" || templateId === "hi_QQ";
}

export function preflopRaiseStage(state: GameState): PreflopRaiseStage {
  const raises = Math.max(state.preflopRaiseCount, state.betting.raisesThisStreet ?? 0);
  if (raises <= 0) return "open";
  if (raises === 1) return "threeBet";
  return "fourBetPlus";
}

export function buildPreflopAiContext(state: GameState, aiSeat: PlayerIndex): PreflopAiContext {
  const range = preflopRaiseSliderRange(state);
  return {
    effectiveStackBb: effectiveStackBb(state, aiSeat),
    callAmount: effectiveCallPay(aiSeat, state),
    currentHighestStreetContribution: levelFromContributions(state.betting),
    raiseStage: preflopRaiseStage(state),
    potSize: state.pot,
    legalMinRaiseTo: range?.min ?? null,
    legalMaxRaiseTo: range?.max ?? null,
  };
}

function normalRaiseIsEffectivelyAllIn(state: GameState, ctx: PreflopAiContext): boolean {
  if (ctx.raiseStage === "open" || ctx.legalMinRaiseTo == null || ctx.legalMaxRaiseTo == null) return false;
  const bb = resolveHandBlinds(state).bb;
  const remainingAfterMin = ctx.legalMaxRaiseTo - ctx.legalMinRaiseTo;
  const minConsumesStack = ctx.legalMinRaiseTo >= ctx.legalMaxRaiseTo * 0.8 - EPS;
  const largeReraisePot = ctx.raiseStage === "fourBetPlus" || ctx.potSize >= 12 * bb - EPS;
  return largeReraisePot && (remainingAfterMin <= 2 * bb + EPS || minConsumesStack);
}

export function preflopAiAllInAllowed(
  state: GameState,
  aiSeat: PlayerIndex,
  templateId: string | null | undefined,
): boolean {
  const ctx = buildPreflopAiContext(state, aiSeat);
  const maxTarget = preflopMaxRaiseTargetForActor(state);
  if (ctx.legalMaxRaiseTo == null || maxTarget <= ctx.currentHighestStreetContribution + EPS) return false;
  if (ctx.effectiveStackBb <= 15 + EPS) return true;
  if (ctx.effectiveStackBb <= 20 + EPS && isPremiumJamHand(templateId)) return true;
  return normalRaiseIsEffectivelyAllIn(state, ctx);
}

function snap(value: number): number {
  return Math.round(value / SMALLEST_CHIP) * SMALLEST_CHIP;
}

/** Legal raise-to target shared by all single-player difficulties. */
export function preflopAiRaiseTarget(
  state: GameState,
  aiSeat: PlayerIndex,
  templateId: string | null | undefined,
  random01 = Math.random(),
): number {
  const ctx = buildPreflopAiContext(state, aiSeat);
  const min = ctx.legalMinRaiseTo ?? preflopMinTotalRaiseForActor(state);
  const max = ctx.legalMaxRaiseTo ?? preflopMaxRaiseTargetForActor(state);
  if (min >= max - EPS) return roundHalfChip(max);
  const bb = resolveHandBlinds(state).bb;
  let target: number;
  if (ctx.raiseStage === "open" && isPremiumOpeningHand(templateId)) {
    target = (ctx.effectiveStackBb >= 40 ? 2 + random01 * 0.5 : 2) * bb;
  } else if (ctx.raiseStage === "open") {
    target = (2 + random01 * 0.75) * bb;
  } else {
    const extra = ctx.effectiveStackBb >= 40 ? random01 * bb : random01 * bb * 0.5;
    target = min + extra;
  }
  return roundHalfChip(Math.max(min, Math.min(max, snap(target))));
}

export function scorePreflopActions(
  state: GameState,
  aiSeat: PlayerIndex,
  templateId: string | null | undefined,
  handTier: number,
): PreflopActionScores {
  const ctx = buildPreflopAiContext(state, aiSeat);
  const bb = resolveHandBlinds(state).bb;
  const strength = Math.max(1, Math.min(5, handTier));
  const callBb = bb > EPS ? ctx.callAmount / bb : 0;
  const potBb = bb > EPS ? ctx.potSize / bb : 0;
  const facingRaise = ctx.raiseStage !== "open";
  const deep = ctx.effectiveStackBb >= 40;
  const short = ctx.effectiveStackBb <= 15;
  const fold = Math.max(0, (5 - strength) * 0.16 + callBb * 0.025 - potBb * 0.008);
  const call = Math.max(0.05, 0.22 + strength * 0.09 - callBb * 0.02 + (facingRaise ? 0.08 : 0));
  const raise = Math.max(0.05, strength * 0.17 + (deep ? 0.22 : 0) +
    (isPremiumOpeningHand(templateId) ? 0.25 : 0) - (short ? 0.18 : 0) -
    Math.max(0, callBb - 8) * 0.015);
  const allIn = preflopAiAllInAllowed(state, aiSeat, templateId)
    ? Math.max(0.04, strength * 0.12 + (short ? 0.55 : 0) + (potBb >= 12 ? 0.2 : 0))
    : 0;
  return { fold, call, raise, allIn };
}
