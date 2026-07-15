import { STARTING_CHIPS, TOTAL_ROUNDS } from "./constants";
import type { HoldemGameMode } from "./types";

export const COST_STARTING_CHIPS = 150;
export const COST_TOTAL_ROUNDS = 20;
export const COST_MAX = 100;
export const COST_ROUND_RECOVERY = 1;
export const MYSTERY_HAND_COST = 3;

export function startingChipsForMode(mode: HoldemGameMode): number {
  return mode === "cost" ? COST_STARTING_CHIPS : STARTING_CHIPS;
}

export function totalRoundsForMode(mode: HoldemGameMode): number {
  return mode === "cost" ? COST_TOTAL_ROUNDS : TOTAL_ROUNDS;
}
