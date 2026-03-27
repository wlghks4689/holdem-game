'use client';

import { currentMadeHandLabel } from "@/holdem/pokerEval";
import type { GameState, PlayerIndex } from "@/holdem/types";

export type ViewerHandStrengthProps = {
  state: GameState;
  viewer: PlayerIndex;
};

export function ViewerHandStrength({ state, viewer }: ViewerHandStrengthProps) {
  if (state.phase === "hand_select" || state.phase === "showdown") return null;
  const hole = state.holes[viewer];
  if (hole == null) return null;

  const label = currentMadeHandLabel(
    hole.hole,
    state.board,
    state.boardRevealed,
  );
  if (!label) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-900/25 px-3 py-2 lg:text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-100/90">
        현재 핸드 (내 카드 + 공개 보드)
      </p>
      <p className="mt-0.5 text-sm font-semibold text-amber-50">
        👉 현재 핸드: {label}
      </p>
    </div>
  );
}
