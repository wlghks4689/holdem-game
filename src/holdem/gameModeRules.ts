import { STARTING_CHIPS, TOTAL_ROUNDS } from "./constants";
import { getCostGameStructureConfig } from "./costGameStructures";
import type { CostGameStructure, HoldemGameMode } from "./types";

export const COST_STARTING_CHIPS = getCostGameStructureConfig("deep").startingChips;
export const COST_TOTAL_ROUNDS = getCostGameStructureConfig("deep").totalRounds;
export const COST_MAX = 100;
export const COST_ROUND_RECOVERY = 1;
export const MYSTERY_HAND_COST = 3;

export function startingChipsForMode(
  mode: HoldemGameMode,
  costStructure: CostGameStructure = "deep",
): number {
  return mode === "cost"
    ? getCostGameStructureConfig(costStructure).startingChips
    : STARTING_CHIPS;
}

export function totalRoundsForMode(
  mode: HoldemGameMode,
  costStructure: CostGameStructure = "deep",
): number {
  return mode === "cost"
    ? getCostGameStructureConfig(costStructure).totalRounds
    : TOTAL_ROUNDS;
}
