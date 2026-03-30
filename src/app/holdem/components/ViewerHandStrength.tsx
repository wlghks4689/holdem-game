"use client";

import { currentMadeHandLabel } from "@/holdem/pokerEval";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { GameState, PlayerIndex } from "@/holdem/types";

export type ViewerHandStrengthProps = {
  state: GameState;
  viewer: PlayerIndex;
};

export function ViewerHandStrength({ state, viewer }: ViewerHandStrengthProps) {
  const { t, locale } = useHoldemI18n();
  if (state.phase === "hand_select" || state.phase === "showdown") return null;
  const hole = state.holes[viewer];
  if (hole == null) return null;

  const label = currentMadeHandLabel(
    hole.hole,
    state.board,
    state.boardRevealed,
    locale,
  );
  if (!label) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-900/25 px-3 py-2 lg:text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-100/90">
        {t("viewer.panelTitle")}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-50">
        {t("viewer.currentHand")} {label}
      </p>
    </div>
  );
}
