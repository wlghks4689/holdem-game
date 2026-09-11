import type { GameMessage } from "@/holdem/types";

export type BettingPressureTier =
  | "bet"
  | "raise"
  | "three-bet"
  | "four-plus-bet"
  | "all-in";

export type BettingPressure = {
  tier: BettingPressureTier;
  badge: string;
  soundLevel: 1 | 2 | 3 | 4 | 5;
  motionMs: number;
};

type BettingActionMessage = Extract<
  GameMessage,
  { t: "preflop_action" } | { t: "postflop_action" }
>;

function raiseBadge(raisesThisStreet: number): string {
  if (raisesThisStreet >= 2) return `${raisesThisStreet + 1}-BET`;
  return "RAISE";
}

export function bettingActionLabel(
  message: BettingActionMessage,
  raisesThisStreet: number,
): string {
  if (message.action === "체크" || message.action === "체크(자동)") return "CHECK";
  if (message.action === "콜") return "CALL";
  if (message.action === "올인" || message.action === "올인 콜") return "ALL-IN";
  if (message.action === "베트") return "BET";
  if (message.action === "레이즈") {
    return raiseBadge(Math.max(0, Math.round(raisesThisStreet)));
  }
  return message.action.toUpperCase();
}

export function bettingActionDisplayAmount(
  message: BettingActionMessage,
  allInTotal?: number,
): number | undefined {
  if (message.action === "체크" || message.action === "체크(자동)") return undefined;
  if (message.action === "올인" || message.action === "올인 콜") {
    return allInTotal ?? message.amount;
  }
  return message.amount;
}

export function bettingActionPressure(
  message: BettingActionMessage,
  raisesThisStreet: number,
): BettingPressure | null {
  const raises = Math.max(0, Math.round(raisesThisStreet));

  if (message.action === "올인" || message.action === "올인 콜") {
    return {
      tier: "all-in",
      badge: "ALL-IN",
      soundLevel: 5,
      motionMs: 1_520,
    };
  }

  if (message.action === "베트") {
    return {
      tier: "bet",
      badge: "BET",
      soundLevel: 1,
      motionMs: 380,
    };
  }

  if (message.action !== "레이즈") return null;

  if (raises >= 3) {
    return {
      tier: "four-plus-bet",
      badge: raiseBadge(raises),
      soundLevel: 4,
      motionMs: Math.min(1_360, 980 + Math.max(0, raises - 3) * 120),
    };
  }
  if (raises === 2) {
    return {
      tier: "three-bet",
      badge: "3-BET",
      soundLevel: 3,
      motionMs: 780,
    };
  }
  return {
    tier: "raise",
    badge: "RAISE",
    soundLevel: 2,
    motionMs: 580,
  };
}
