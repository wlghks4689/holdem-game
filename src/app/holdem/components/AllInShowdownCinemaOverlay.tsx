"use client";

import * as React from "react";
import type { AllInCinemaPhase } from "../hooks/useAllInShowdownCinema";

export type AllInShowdownCinemaOverlayProps = {
  phase: AllInCinemaPhase;
  onSkip: () => void;
};

export function AllInShowdownCinemaOverlay({
  phase,
  onSkip,
}: AllInShowdownCinemaOverlayProps) {
  if (phase === "off" || phase === "result") return null;

  return (
    <button
      type="button"
      className="fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-start border-0 bg-black/50 pt-[min(20vh,7rem)] backdrop-blur-[2px] transition-colors duration-300"
      onClick={onSkip}
      aria-label="쇼다운 연출 스킵 — 전체 보드·결과 즉시 표시"
    >
      {phase === "intro" ? (
        <div
          className="pointer-events-none px-4 text-center"
          style={{
            animation: "holdem-all-in-title 2s ease-in-out forwards",
          }}
        >
          <p className="text-2xl font-black uppercase tracking-[0.28em] text-amber-200 drop-shadow-[0_0_24px_rgba(251,191,36,0.35)] sm:text-3xl">
            All-in Showdown
          </p>
          <p className="mt-3 text-sm font-medium text-zinc-200/90">
            플랍 · 턴 · 리버 순서로 공개합니다
          </p>
        </div>
      ) : null}
      <span className="pointer-events-none absolute bottom-6 left-1/2 max-w-[min(92vw,24rem)] -translate-x-1/2 text-center text-[11px] leading-snug text-zinc-400">
        화면을 누르면 남은 카드와 결과를 바로 볼 수 있습니다
      </span>
    </button>
  );
}
