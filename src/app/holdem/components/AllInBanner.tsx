'use client';

import { facingFor } from "@/holdem/bettingHelpers";
import type { GameState } from "@/holdem/types";

export type AllInBannerProps = {
  state: GameState;
};

/** 올인·보드 자동 런아웃 중 안내 */
export function AllInBanner({ state }: AllInBannerProps) {
  if (state.matchWinner != null) return null;
  if (
    state.phase === "hand_select" ||
    state.phase === "showdown" ||
    state.phase === "hand_over"
  ) {
    return null;
  }
  if (!state.isAllIn) return null;

  const act = state.toAct;
  const mustRespond =
    act != null &&
    state.chips[act]! > 1e-9 &&
    facingFor(act, state.betting) > 1e-9;

  const title = mustRespond
    ? "상대 올인 — 응답 필요"
    : "보드 자동 공개 · 쇼다운 진행";
  const sub = mustRespond
    ? "폴드하거나 스택 전부로 콜하세요. 추가 베팅은 없습니다."
    : "추가 베팅 없이 남은 카드가 공개되고 쇼다운으로 넘어갑니다.";

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-amber-500/50 bg-amber-950/30 px-4 py-3 shadow-[0_0_20px_rgba(245,158,11,0.12)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-amber-500/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-200 ring-1 ring-amber-400/40">
          ALL-IN
        </span>
        <span className="text-sm font-semibold text-amber-50/95">{title}</span>
      </div>
      <p className="text-[11px] text-amber-200/75">{sub}</p>
    </div>
  );
}
