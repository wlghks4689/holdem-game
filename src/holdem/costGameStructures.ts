import type { CostGameStructure } from "./types";

export type CostAnteMode = "big-blind" | "each-player";

export type CostBlindLevel = {
  fromRound: number;
  toRound: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
};

export type CostGameStructureConfig = {
  id: CostGameStructure;
  startingChips: number;
  totalRounds: number;
  anteMode: CostAnteMode;
  blindLevels: readonly CostBlindLevel[];
};

const DEEP_STACK_LEVELS: readonly CostBlindLevel[] = [
  { fromRound: 1, toRound: 10, smallBlind: 0.5, bigBlind: 1, ante: 1 },
  { fromRound: 11, toRound: 15, smallBlind: 1, bigBlind: 2, ante: 2 },
  { fromRound: 16, toRound: 20, smallBlind: 2, bigBlind: 4, ante: 4 },
];

export const TURBO_LEVELS: readonly CostBlindLevel[] = [
  { fromRound: 1, toRound: 5, smallBlind: 0.5, bigBlind: 1, ante: 1 },
  { fromRound: 6, toRound: 10, smallBlind: 1, bigBlind: 1.5, ante: 1.5 },
  { fromRound: 11, toRound: 15, smallBlind: 1, bigBlind: 2, ante: 2 },
];

export const COST_GAME_STRUCTURES: Record<CostGameStructure, CostGameStructureConfig> = {
  deep: {
    id: "deep",
    startingChips: 150,
    totalRounds: 20,
    anteMode: "big-blind",
    blindLevels: DEEP_STACK_LEVELS,
  },
  turbo: {
    id: "turbo",
    startingChips: 100,
    totalRounds: 15,
    anteMode: "each-player",
    blindLevels: TURBO_LEVELS,
  },
};

export function normalizeCostGameStructure(raw: unknown): CostGameStructure {
  return raw === "turbo" ? "turbo" : "deep";
}

export function getCostGameStructureConfig(
  structure: CostGameStructure = "deep",
): CostGameStructureConfig {
  return COST_GAME_STRUCTURES[normalizeCostGameStructure(structure)];
}

export function getCostBlindLevel(
  round: number,
  structure: CostGameStructure = "deep",
): CostBlindLevel {
  const config = getCostGameStructureConfig(structure);
  const r = Math.max(1, Math.floor(round));
  return config.blindLevels.find((level) => r <= level.toRound)
    ?? config.blindLevels[config.blindLevels.length - 1]!;
}
