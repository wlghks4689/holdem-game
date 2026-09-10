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

export function bettingActionPressure(
  message: BettingActionMessage,
  raisesThisStreet: number,
): BettingPressure | null {
  const raises = Math.max(0, Math.round(raisesThisStreet));

  if (message.action === "올인" || message.action === "올인 콜") {
    const raisePrefix =
      message.action === "올인 콜"
        ? "CALL"
        : raises >= 2
          ? raiseBadge(raises)
          : raises === 1
            ? "RAISE"
            : null;
    return {
      tier: "all-in",
      badge: raisePrefix ? `${raisePrefix} ALL-IN` : "ALL-IN",
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
