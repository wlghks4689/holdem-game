"use client";

import * as React from "react";
import type { GameState } from "@/holdem/types";
import { CardBack, PlayingCard } from "./Card";

const streetKo: Record<string, string> = {
  hand_select: "핸드 선택",
  preflop: "프리플랍",
  flop: "플랍",
  turn: "턴",
  river: "리버",
  showdown: "쇼다운",
  hand_over: "종료",
};

const DEAL_STAGGER_S = 0.18;

export type BoardDisplayProps = {
  state: GameState;
  /** 올인 쇼다운 연출: 실제 `boardRevealed` 대신 공개 장 수(없으면 상태값 사용) */
  visualRevealedOverride?: number | null;
  /** 보드 헤더 스트리트 라벨 치환(연출용) */
  streetLabelOverride?: string | null;
  /** 올인 연출: 새로 깔린 카드에 플립 애니메이션 */
  cinematicFlip?: boolean;
  /** 강조할 스트리트 — 해당 슬롯에 글로우 */
  cinemaStreetPulse?: "flop" | "turn" | "river" | null;
};

export function BoardDisplay({
  state,
  visualRevealedOverride = null,
  streetLabelOverride = null,
  cinematicFlip = false,
  cinemaStreetPulse = null,
}: BoardDisplayProps) {
  const rev =
    visualRevealedOverride != null
      ? visualRevealedOverride
      : state.boardRevealed;
  const slots = [0, 1, 2, 3, 4] as const;
  const label =
    streetLabelOverride ??
    streetKo[state.phase] ??
    state.phase;
  const showdown = state.phase === "showdown";

  /** 직전 커밋의 `boardRevealed` — 카드 등장 스태거(레이아웃 이펙트로 `rev`와 동기화) */
  const [lagRev, setLagRev] = React.useState(rev);
  React.useLayoutEffect(() => {
    setLagRev(rev);
  }, [rev]);
  const oldRev = lagRev;

  /** 로그 인덱스 기준 — 새 라운드 시 `logs.length`만 바뀌어 스캔이 재생되지 않도록 */
  const lastIaKey = React.useMemo(() => {
    const idx = state.logs.findLastIndex((x) => x.t === "ia");
    if (idx < 0) return null;
    const m = state.logs[idx]!;
    if (m.t !== "ia") return null;
    return `${idx}-${m.player}-${m.cost}`;
  }, [state.logs]);

  const [scanOn, setScanOn] = React.useState(false);
  React.useEffect(() => {
    if (!lastIaKey) return;
    setScanOn(true);
    const t = window.setTimeout(() => setScanOn(false), 440);
    return () => window.clearTimeout(t);
  }, [lastIaKey]);

  return (
    <div
      className={[
        "rounded-xl border bg-gradient-to-b from-zinc-900 via-zinc-800/95 to-zinc-800/90",
        showdown ? "border-zinc-600/70 p-3" : "border-amber-900/40 p-4 shadow-[0_0_40px_rgba(245,158,11,0.06)]",
      ].join(" ")}
    >
      <div className={showdown ? "mb-2 text-center" : "mb-4 text-center lg:mb-5"}>
        <div className="text-xs font-semibold uppercase tracking-widest text-amber-500/80 lg:text-sm">
          보드
        </div>
        <div className="mt-1 text-[11px] text-zinc-400 lg:text-xs">
          스트리트 · {label}
        </div>
      </div>
      <div
        className={[
          "relative flex flex-wrap items-center justify-center",
          showdown ? "gap-2.5 sm:gap-3 lg:gap-4" : "gap-2 sm:gap-5 lg:gap-7",
        ].join(" ")}
      >
        {scanOn ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-lg"
            aria-hidden
          >
            <div
              className="absolute inset-y-1 left-0 w-[45%] bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent blur-[2px]"
              style={{
                animation: "holdem-ia-scan-line 0.42s ease-in-out 1",
              }}
            />
          </div>
        ) : null}
        {slots.map((i) => {
          if (i < rev && state.board[i]) {
            const c = state.board[i]!;
            const newlyShown = i >= oldRev && i < rev;
            const stagger = newlyShown ? Math.max(0, i - oldRev) * DEAL_STAGGER_S : 0;
            const pulseStreet =
              (cinemaStreetPulse === "flop" && i <= 2) ||
              (cinemaStreetPulse === "turn" && i === 3) ||
              (cinemaStreetPulse === "river" && i === 4);
            const dealAnim =
              cinematicFlip && newlyShown
                ? "holdem-card-flip-reveal 0.42s cubic-bezier(0.22, 1, 0.36, 1) both"
                : newlyShown
                  ? "holdem-deal-card 0.34s ease-out both"
                  : undefined;
            return (
              <div
                key={i}
                className={[
                  "relative transition-transform lg:origin-center lg:scale-[1.14]",
                  pulseStreet && newlyShown ? "rounded-md" : "",
                ].join(" ")}
                style={
                  dealAnim
                    ? {
                        animation: dealAnim,
                        animationDelay: `${stagger}s`,
                      }
                    : pulseStreet
                      ? {
                          animation: "holdem-board-street-pulse 0.55s ease-out 1",
                        }
                      : undefined
                }
              >
                <PlayingCard
                  card={c}
                  size="board"
                  className={[
                    showdown ? "drop-shadow-sm" : "drop-shadow-md",
                    pulseStreet && newlyShown
                      ? "ring-2 ring-amber-400/55 ring-offset-2 ring-offset-zinc-900/90"
                      : "",
                  ].join(" ")}
                />
              </div>
            );
          }
          return (
            <div
              key={i}
              className="transition-transform lg:origin-center lg:scale-[1.14]"
            >
              <CardBack size="board" className="opacity-80" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
