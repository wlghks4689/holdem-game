'use client';

import {
  best5Of7,
  compareHandValue,
  handValueShowdownConciseKorean,
} from "@/holdem/pokerEval";
import { totalIaDeductedFromPotThisHand } from "@/holdem/bettingHelpers";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import type { GameState, PlayerIndex } from "@/holdem/types";

export type HandResultBannerProps = {
  state: GameState;
  playerNames: [string, string];
};

export function HandResultBanner({ state, playerNames }: HandResultBannerProps) {
  const pl = (p: PlayerIndex) => playerNames[p] ?? `플레이어 ${p + 1}`;
  const h0 = state.holes[0];
  const h1 = state.holes[1];

  if (state.phase === "showdown" && h0 && h1) {
    const all0 = [...h0.hole, ...state.board];
    const all1 = [...h1.hole, ...state.board];
    const v0 = best5Of7(all0);
    const v1 = best5Of7(all1);
    const cmp = compareHandValue(v0, v1);
    const split = cmp === 0;
    const highlight0 = split || cmp > 0;
    const highlight1 = split || cmp < 0;
    const lastPotLog = [...state.logs].reverse().find((m) => m.t === "showdown");
    const potBb =
      lastPotLog?.t === "showdown" ? chipsAsBbLabel(lastPotLog.pot) : null;
    const iaDeducted = totalIaDeductedFromPotThisHand(state.logs);

    const leadHand = split
      ? handValueShowdownConciseKorean(v0)
      : cmp > 0
        ? handValueShowdownConciseKorean(v0)
        : handValueShowdownConciseKorean(v1);

    const panel0 = split
      ? "rounded-lg border border-emerald-700/40 bg-emerald-950/15 px-2.5 py-2 ring-1 ring-emerald-500/25"
      : highlight0
        ? "rounded-lg border border-amber-500/45 bg-amber-950/20 px-2.5 py-2 ring-1 ring-amber-400/40"
        : "rounded-lg border border-zinc-700/80 bg-zinc-800/40 px-2.5 py-2";

    const panel1 = split
      ? "rounded-lg border border-emerald-700/40 bg-emerald-950/15 px-2.5 py-2 ring-1 ring-emerald-500/25"
      : highlight1
        ? "rounded-lg border border-violet-500/45 bg-violet-950/20 px-2.5 py-2 ring-1 ring-violet-400/40"
        : "rounded-lg border border-zinc-700/80 bg-zinc-800/40 px-2.5 py-2";

    const headlineKey =
      state.logs.length > 0 &&
      state.logs[state.logs.length - 1]!.t === "showdown"
        ? `showdown-head-${state.logs.length}`
        : "showdown-head";

    return (
      <div
        className="rounded-xl border border-zinc-600/80 bg-zinc-800/60 p-3 sm:p-4"
        key={headlineKey}
        style={{ animation: "holdem-result-pop 0.36s ease-out both" }}
      >
        <div className="text-balance">
          <p className="leading-snug sm:leading-snug">
            <span className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
              {split ? (
                <>👉 무승부</>
              ) : (
                <>
                  👉 <span className="text-zinc-100">{pl(state.winner!)}</span>
                  <span className="font-semibold text-zinc-400"> 승리</span>
                </>
              )}
            </span>
            <span className="text-zinc-600"> · </span>
            <span className="text-base font-semibold text-violet-200/95 sm:text-lg">
              {leadHand}
            </span>
            {potBb ? (
              <>
                <span className="text-zinc-600"> · </span>
                <span className="font-mono text-xs text-amber-200/80 sm:text-sm">
                  팟 {potBb}
                </span>
              </>
            ) : null}
          </p>
          {iaDeducted > 0 ? (
            <p className="mt-2 font-mono text-[10px] text-indigo-300/75">
              IA 제외 {chipsAsBbLabel(iaDeducted)}
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-2.5">
          <div className={panel0}>
            <div className="text-[10px] font-medium text-zinc-500">{pl(0)}</div>
            <p
              className={`mt-0.5 font-mono text-xs ${
                split
                  ? "text-emerald-100"
                  : highlight0
                    ? "text-amber-100"
                    : "text-zinc-500"
              }`}
            >
              {handValueShowdownConciseKorean(v0)}
            </p>
          </div>
          <div className={panel1}>
            <div className="text-[10px] font-medium text-zinc-500">{pl(1)}</div>
            <p
              className={`mt-0.5 font-mono text-xs ${
                split
                  ? "text-emerald-100"
                  : highlight1
                    ? "text-violet-100"
                    : "text-zinc-500"
              }`}
            >
              {handValueShowdownConciseKorean(v1)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "hand_over" && state.handEndMode === "fold") {
    const w = state.winner;
    const folder = w != null ? (w === 0 ? 1 : 0) : null;
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-900/22 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-300/90">
          판 끝 — 폴드
        </p>
        <p className="mt-2 text-base font-bold text-zinc-50">
          {w != null ? (
            <>
              상대 폴드로 승리 —{" "}
              <span className="text-emerald-300">{pl(w)}</span>
            </>
          ) : (
            "폴드로 종료"
          )}
        </p>
        {folder != null ? (
          <p className="mt-1 text-xs text-zinc-400">
            {pl(folder)} 폴드 · 상대 홀 카드는 비공개입니다.
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
