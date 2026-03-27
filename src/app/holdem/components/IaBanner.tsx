"use client";

import * as React from "react";
import { iaCategoryHandListText } from "@/holdem/handPool";
import type { GameState, PlayerIndex } from "@/holdem/types";

export type IaBannerProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
};

/** 로컬 2인: IA 구매자와 관계없이 좌석별로 본 상대 범주를 모두 표시 */
export function IaBanner({ state, viewer, playerNames }: IaBannerProps) {
  const pl = (p: PlayerIndex) => playerNames[p] ?? `P${p}`;
  const r0 = state.iaReveal[0];
  const r1 = state.iaReveal[1];

  const iaKey = React.useMemo(() => {
    const idx = state.logs.findLastIndex((m) => m.t === "ia");
    if (idx < 0) return "ia-banner";
    const m = state.logs[idx]!;
    if (m.t !== "ia") return "ia-banner";
    return `ia-banner-${idx}-${m.player}-${m.cost}`;
  }, [state.logs]);

  if (r0 == null && r1 == null) return null;

  return (
    <div
      key={iaKey}
      className={[
        "relative overflow-hidden rounded-xl border px-4 py-3",
        "border-indigo-400/55 bg-indigo-900/40 shadow-[0_0_20px_rgba(129,140,248,0.22)]",
      ].join(" ")}
      style={{ animation: "holdem-ia-banner-in 0.36s ease-out both" }}
    >
      <div className="relative z-[1] space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/90">
          정보 획득 · IA
        </p>
        {r0 != null ? (
          <div
            className={`space-y-1 ${
              viewer === 0 ? "rounded-md px-1 -mx-1 ring-1 ring-indigo-400/30" : ""
            }`}
          >
            <p className="text-sm font-semibold text-indigo-50">
              {pl(0)} — 상대 카테고리:{" "}
              <span className="text-white">{r0}</span>
              {viewer === 0 ? (
                <span className="ml-1 text-[11px] font-normal text-indigo-300/90">
                  (내 좌석)
                </span>
              ) : null}
            </p>
            <p className="break-words font-mono text-[11px] leading-relaxed text-indigo-100/90">
              {iaCategoryHandListText(r0)}
            </p>
          </div>
        ) : null}
        {r1 != null ? (
          <div
            className={`space-y-1 ${
              viewer === 1 ? "rounded-md px-1 -mx-1 ring-1 ring-indigo-400/30" : ""
            }`}
          >
            <p className="text-sm font-semibold text-indigo-50">
              {pl(1)} — 상대 카테고리:{" "}
              <span className="text-white">{r1}</span>
              {viewer === 1 ? (
                <span className="ml-1 text-[11px] font-normal text-indigo-300/90">
                  (내 좌석)
                </span>
              ) : null}
            </p>
            <p className="break-words font-mono text-[11px] leading-relaxed text-indigo-100/90">
              {iaCategoryHandListText(r1)}
            </p>
          </div>
        ) : null}
        <p className="text-[11px] text-indigo-200/75">
          액면 카드는 비공개입니다. 결정에만 참고하세요.
        </p>
      </div>
    </div>
  );
}
