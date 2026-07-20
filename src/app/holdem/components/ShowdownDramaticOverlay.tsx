"use client";

import * as React from "react";
import type { GameState, PlayerIndex } from "@/holdem/types";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import { ALL_IN_RESULT_HOLD_MS } from "../allInCinemaTimeline";
import { buildShowdownResultPresentation } from "../showdownPresentation";

const AUTO_HIDE_MS = ALL_IN_RESULT_HOLD_MS;

export type ShowdownDramaticOverlayProps = {
  state: GameState;
  playerNames: [string, string];
  /** 올인 시네마 등: 결과가 확정되었을 때만 true */
  armed: boolean;
};

function pl(playerNames: [string, string], p: PlayerIndex, isEn: boolean) {
  return playerNames[p] ?? `${isEn ? "Player" : "플레이어"} ${p + 1}`;
}

export function ShowdownDramaticOverlay({
  state,
  playerNames,
  armed,
}: ShowdownDramaticOverlayProps) {
  const { locale } = useHoldemI18n();
  const [open, setOpen] = React.useState(false);
  const timers = React.useRef<number[]>([]);

  const h0 = state.holes[0];
  const h1 = state.holes[1];
  const result = React.useMemo(
    () =>
      h0 && h1 && state.board.length >= 5
        ? buildShowdownResultPresentation(
            [h0.hole, h1.hole],
            state.board,
            locale,
          )
        : null,
    [h0, h1, locale, state.board],
  );

  const clear = React.useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const showKey = React.useMemo(() => {
    if (!armed) return null;
    if (state.phase !== "showdown") return null;
    if (state.boardRevealed < 5) return null;
    if (state.board.length < 5) return null;
    if (result == null) return null;
    return `sd-dramatic-${state.roundNumber}-${result.winner ?? "tie"}-${state.logs.length}`;
  }, [
    armed,
    state.phase,
    state.boardRevealed,
    state.board.length,
    result,
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

  if (!open || showKey == null || result == null) return null;

  const { split, winner, labels } = result;
  const isEn = locale === "en";
  const handLabel = winner == null ? labels[0] : labels[winner];
  const winnerName = winner == null ? null : pl(playerNames, winner, isEn);
  const titleTop = isEn ? "SHOWDOWN" : "쇼다운";
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
      className="pointer-events-none fixed inset-0 z-[65] flex items-start justify-center px-3 pt-[max(4.5rem,9vh)] sm:pt-[max(5rem,10vh)]"
      aria-label={isEn ? "Showdown result presentation" : "쇼다운 결과 연출"}
    >
      <div
        className="absolute inset-0"
        style={{ animation: "holdem-sd-backdrop-in 220ms ease-out both" }}
      >
        <div className="absolute inset-0 bg-black/38 backdrop-blur-[1px]" />
        <div className="absolute inset-0 holdem-sd-vignette" />
      </div>

      <div
        className="relative w-full max-w-[36rem] rounded-2xl border border-amber-300/50 bg-zinc-950/82 p-4 text-center shadow-[0_0_75px_rgba(251,191,36,0.18),0_22px_70px_rgba(0,0,0,0.62)] backdrop-blur-md sm:p-5"
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

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px] sm:gap-3 sm:text-xs">
          <div className={split || winner === 0 ? "font-bold text-amber-100" : "text-zinc-500"}>
            <span className="block truncate text-[10px] uppercase tracking-wider text-zinc-400">
              {pl(playerNames, 0, isEn)}
            </span>
            {labels[0]}
          </div>
          <span className="font-black tracking-[0.18em] text-zinc-600">VS</span>
          <div className={split || winner === 1 ? "font-bold text-violet-100" : "text-zinc-500"}>
            <span className="block truncate text-[10px] uppercase tracking-wider text-zinc-400">
              {pl(playerNames, 1, isEn)}
            </span>
            {labels[1]}
          </div>
        </div>
      </div>
    </div>
  );
}

