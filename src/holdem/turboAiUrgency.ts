import { resolveHandBlinds } from "./blindLevels";
import { effectiveStackBb } from "./bettingHelpers";
import { totalRoundsForMode } from "./gameModeRules";
import type { GameState, PlayerIndex } from "./types";

export type TurboAiUrgency = {
  currentRound: number;
  totalRounds: number;
  remainingRounds: number;
  aiStack: number;
  opponentStack: number;
  stackDifference: number;
  stackRatio: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  effectiveStack: number;
  effectiveStackBb: number;
  isLeading: boolean;
  isTrailing: boolean;
  urgency: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Turbo 전용 토너먼트 압력. 핸드 강도를 대체하지 않고 AI의 기존 확률 경계에만
 * 더해지는 0..1 보정값입니다. Deep/Classic에서는 null을 반환합니다.
 */
export function turboAiUrgency(
  state: GameState,
  aiSeat: PlayerIndex,
): TurboAiUrgency | null {
  if (state.gameMode !== "cost" || state.costStructure !== "turbo") return null;

  const opponentSeat: PlayerIndex = aiSeat === 0 ? 1 : 0;
  const aiStack = Math.max(0, state.chips[aiSeat]!);
  const opponentStack = Math.max(0, state.chips[opponentSeat]!);
  const totalRounds = totalRoundsForMode(state.gameMode, state.costStructure);
  const currentRound = Math.max(1, Math.min(totalRounds, state.roundNumber));
  const remainingRounds = Math.max(0, totalRounds - currentRound);
  const stackDifference = opponentStack - aiStack;
  const stackRatio = opponentStack > 1e-9 ? aiStack / opponentStack : 1;
  const blinds = resolveHandBlinds(state);
  const effectiveStack = Math.min(aiStack, opponentStack);
  const effectiveBb = effectiveStackBb(state, aiSeat);
  const isTrailing = stackDifference > 1e-9;
  const isLeading = stackDifference < -1e-9;

  const totalChips = Math.max(1, aiStack + opponentStack);
  const deficitShare = isTrailing ? stackDifference / totalChips : 0;
  const roundPressure = clamp01((currentRound - 1) / Math.max(1, totalRounds - 1));
  const shortStackPressure = effectiveBb <= 5
    ? 1
    : effectiveBb <= 10
      ? 0.75
      : effectiveBb <= 20
        ? 0.4
        : 0;

  // Early/small deficits remain close to the normal strategy. A large deficit
  // late in the match and a low effective-BB stack progressively raise risk tolerance.
  const urgency = isTrailing
    ? clamp01(
        deficitShare * (0.55 + roundPressure * 1.15)
        + roundPressure * 0.18
        + shortStackPressure * (0.06 + roundPressure * 0.1),
      )
    : 0;

  return {
    currentRound,
    totalRounds,
    remainingRounds,
    aiStack,
    opponentStack,
    stackDifference,
    stackRatio,
    smallBlind: blinds.sb,
    bigBlind: blinds.bb,
    ante: blinds.ante,
    effectiveStack,
    effectiveStackBb: effectiveBb,
    isLeading,
    isTrailing,
    urgency,
  };
}
