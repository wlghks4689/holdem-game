"use client";

import * as React from "react";
import type { AllInCinemaPhase } from "../hooks/useAllInShowdownCinema";

export type AllInShowdownCinemaOverlayProps = {
  phase: AllInCinemaPhase;
};

export function AllInShowdownCinemaOverlay({
  phase,
}: AllInShowdownCinemaOverlayProps) {
  // ALL-IN 타이틀은 lock 구간에서만 보여주고, reveal 구간에서는 검은 오버레이를 없애 보드가 잘 보이게 한다.
  if (phase !== "allin-lock") return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-start pt-[min(20vh,7rem)]"
      aria-label="올인 쇼다운 연출"
    >
      <div
        className="px-4 text-center"
        style={{
          animation: "holdem-all-in-title 0.9s ease-in-out both",
        }}
      >
        <p className="text-2xl font-black uppercase tracking-[0.28em] text-amber-200 drop-shadow-[0_0_24px_rgba(251,191,36,0.35)] sm:text-3xl">
          ALL-IN
        </p>
        <p className="mt-3 text-sm font-medium text-zinc-200/90">
          보드를 순차 공개합니다
        </p>
      </div>
      <span className="absolute bottom-6 left-1/2 max-w-[min(92vw,24rem)] -translate-x-1/2 text-center text-[11px] leading-snug text-zinc-400">
        쇼다운 후 턴 · 리버가 순차 공개됩니다
      </span>
    </div>
  );
}
