"use client";

import * as React from "react";
import type { GameState, PlayerIndex } from "@/holdem/types";
import {
  best5Of7,
  compareHandValue,
  handValueShowdownConciseForLocale,
} from "@/holdem/pokerEval";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";

const AUTO_HIDE_MS = 2600;

export type ShowdownDramaticOverlayProps = {
  state: GameState;
  playerNames: [string, string];
  /** 올인 시네마 등: 결과가 확정되었을 때만 true */
  armed: boolean;
};

function pl(playerNames: [string, string], p: PlayerIndex) {
  return playerNames[p] ?? `플레이어 ${p + 1}`;
}

export function ShowdownDramaticOverlay({
  state,
  playerNames,
  armed,
}: ShowdownDramaticOverlayProps) {
  const { locale } = useHoldemI18n();
  const [open, setOpen] = React.useState(false);
  const timers = React.useRef<number[]>([]);

  const clear = React.useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const showKey = React.useMemo(() => {
    if (!armed) return null;
    if (state.phase !== "showdown") return null;
    if (state.boardRevealed < 5) return null;
    const h0 = state.holes[0];
    const h1 = state.holes[1];
    if (!h0 || !h1) return null;
    if (state.winner == null) return null;
    return `sd-dramatic-${state.roundNumber}-${state.winner}-${state.logs.length}`;
  }, [
    armed,
    state.phase,
    state.boardRevealed,
    state.holes,
    state.winner,
    state.roundNumber,
    state.logs.length,
  ]);

  React.useEffect(() => {
    if (!showKey) {
      setOpen(false);
      clear();
      return;
    }
    clear();
    setOpen(true);
    const id = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    timers.current.push(id);
    return clear;
  }, [showKey, clear]);

  if (!open) return null;

  const h0 = state.holes[0]!;
  const h1 = state.holes[1]!;
  const v0 = best5Of7([...h0.hole, ...state.board]);
  const v1 = best5Of7([...h1.hole, ...state.board]);
  const cmp = compareHandValue(v0, v1);
  const split = cmp === 0;
  const lead = split ? v0 : cmp > 0 ? v0 : v1;
  const handLabel = handValueShowdownConciseForLocale(lead, locale);

  const winnerName = split ? null : pl(playerNames, state.winner!);
  const titleTop = locale === "en" ? "SHOWDOWN" : "쇼다운";
  const winText =
    locale === "en"
      ? split
        ? "SPLIT POT"
        : "WINNER"
      : split
        ? "팟 분배"
        : "승자";

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center"
      aria-label="쇼다운 결과 연출"
    >
      <div
        className="absolute inset-0"
        style={{ animation: "holdem-sd-backdrop-in 220ms ease-out both" }}
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
        <div className="absolute inset-0 holdem-sd-vignette" />
      </div>

      <div
        className="relative mx-4 w-full max-w-[32rem] rounded-2xl border border-amber-300/30 bg-zinc-950/60 p-4 text-center shadow-[0_0_60px_rgba(0,0,0,0.55)]"
        style={{ animation: "holdem-sd-panel-in 520ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <p
          className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-200/85"
          style={{ animation: "holdem-sd-title-pop 520ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          {titleTop}
        </p>

        <p
          className="mt-2 text-[13px] font-extrabold uppercase tracking-[0.22em] text-zinc-300"
          style={{ animation: "holdem-sd-subtitle-in 680ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          {winText}
        </p>

        <p
          className="mt-1.5 text-3xl font-black tracking-tight text-zinc-50 sm:text-4xl"
          style={{ animation: "holdem-sd-winner-in 820ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          {split ? (locale === "en" ? "TIE" : "무승부") : winnerName}
        </p>

        <div
          className="mx-auto mt-3 inline-flex items-center justify-center rounded-full border border-violet-300/25 bg-violet-950/35 px-4 py-1.5"
          style={{ animation: "holdem-sd-hand-in 920ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <span className="text-sm font-semibold text-violet-100/95">
            {handLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

