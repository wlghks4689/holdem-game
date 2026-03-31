"use client";

import * as React from "react";
import type { GameState } from "@/holdem/types";
import { useHoldemMotionMode } from "../HoldemMotionRuntime";
import { CardBack, PlayingCard } from "./Card";
import { playBoardDealSoft } from "../showdownCinemaSounds";

const streetKo: Record<string, string> = {
  hand_select: "핸드 선택",
  preflop: "프리플랍",
  flop: "플랍",
  turn: "턴",
  river: "리버",
  showdown: "쇼다운",
  hand_over: "종료",
};

/** 플랍/턴 폴드 후 레빗 — 미공개 슬롯에 오버레이·공개 시 동일 보드 줄에 표시 */
export type BoardRabbitHuntUi = {
  active: boolean;
  open: boolean;
  onToggle: () => void;
  /** 폴드 직전 boardRevealed — 3 또는 4 */
  revealedAtFold: 3 | 4;
};

type EnterDeal = {
  id: number;
  slot: number;
  delayMs: number;
  durationMs: number;
  animClass: string;
};

const FLOP_STAGGER_MS = 180;
const TURN_RIVER_STAGGER_MS = 80;

const BOARD_GAP = "gap-2 sm:gap-5 lg:gap-7";

function rabbitSlotLabel(
  i: number,
  revealedAtFold: 3 | 4,
): string {
  if (revealedAtFold === 3) {
    return i === 3 ? "턴" : "리버";
  }
  return "리버";
}

function buildEnterDeal(
  slot: number,
  prevRev: number,
  nextRev: number,
  subtle: boolean,
  id: number,
): EnterDeal | null {
  const normalDuration = 620;
  const subtleDuration = 380;
  if (prevRev < 3 && nextRev >= 3 && slot < 3 && slot >= prevRev) {
    const order = slot - Math.max(0, prevRev);
    const animClass = subtle
      ? `holdem-board-enter-flop-subtle-${order}`
      : `holdem-board-enter-flop-${order}`;
    return {
      id,
      slot,
      delayMs: order * FLOP_STAGGER_MS,
      durationMs: subtle ? subtleDuration : normalDuration,
      animClass,
    };
  }
  if (prevRev < 4 && nextRev >= 4 && slot === 3) {
    return {
      id,
      slot,
      delayMs: TURN_RIVER_STAGGER_MS,
      durationMs: subtle ? subtleDuration : normalDuration,
      animClass: subtle ? "holdem-board-enter-turn-subtle" : "holdem-board-enter-turn",
    };
  }
  if (prevRev < 5 && nextRev >= 5 && slot === 4) {
    return {
      id,
      slot,
      delayMs: TURN_RIVER_STAGGER_MS,
      durationMs: subtle ? subtleDuration : normalDuration,
      animClass: subtle ? "holdem-board-enter-river-subtle" : "holdem-board-enter-river",
    };
  }
  return null;
}

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
  /** 레빗 헌트(폴드 당사자만 active) */
  rabbitHunt?: BoardRabbitHuntUi | null;
};

export function BoardDisplay({
  state,
  visualRevealedOverride = null,
  streetLabelOverride = null,
  cinematicFlip = false,
  cinemaStreetPulse = null,
  rabbitHunt = null,
}: BoardDisplayProps) {
  const motionMode = useHoldemMotionMode();
  const subtleMotion = motionMode === "subtle";
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

  const [enterDeals, setEnterDeals] = React.useState<EnterDeal[]>([]);
  const prevRevRef = React.useRef(rev);
  const dealSeqRef = React.useRef(1);
  const clearTimersRef = React.useRef<number[]>([]);

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

  React.useEffect(() => {
    return () => {
      for (const t of clearTimersRef.current) window.clearTimeout(t);
      clearTimersRef.current = [];
    };
  }, []);

  React.useEffect(() => {
    const prev = prevRevRef.current;
    if (cinematicFlip || rev <= prev) {
      prevRevRef.current = rev;
      return;
    }
    const next: EnterDeal[] = [];
    for (let i = prev; i < rev; i++) {
      if (!state.board[i]) continue;
      const built = buildEnterDeal(i, prev, rev, subtleMotion, dealSeqRef.current++);
      if (built) next.push(built);
    }
    if (next.length > 0) {
      setEnterDeals((cur) => [...cur, ...next]);
      for (const deal of next) {
        // SFX: 각 카드가 들어올 때 가볍게 "사사삭" 한 번
        const sfxDelay = deal.delayMs;
        const sfxTimer = window.setTimeout(() => {
          playBoardDealSoft();
        }, sfxDelay);
        const t = window.setTimeout(() => {
          setEnterDeals((cur) => cur.filter((x) => x.id !== deal.id));
          clearTimersRef.current = clearTimersRef.current.filter(
            (id) => id !== t && id !== sfxTimer,
          );
        }, deal.delayMs + deal.durationMs + 80);
        clearTimersRef.current.push(t, sfxTimer);
      }
    }
    prevRevRef.current = rev;
  }, [rev, state.board, state.roundNumber, cinematicFlip, subtleMotion]);

  React.useEffect(() => {
    setEnterDeals([]);
    prevRevRef.current = rev;
    for (const t of clearTimersRef.current) window.clearTimeout(t);
    clearTimersRef.current = [];
  }, [state.roundNumber]); // new hand safety reset

  const tailIndices = slots.filter((i) => i >= rev && i < 5);
  const rabbitTail = rabbitHunt?.active === true && tailIndices.length > 0;
  const rabbitSingleTail = rabbitTail && tailIndices.length === 1;

  return (
    <div
      className={[
        "rounded-xl border bg-gradient-to-b from-zinc-900 via-zinc-800/95 to-zinc-800/90",
        showdown
          ? "border-zinc-600/70 p-2 sm:p-3"
          : "border-amber-900/40 p-2.5 shadow-[0_0_40px_rgba(245,158,11,0.06)] sm:p-3.5 lg:p-4",
      ].join(" ")}
    >
      <div className={showdown ? "mb-1.5 text-center sm:mb-2" : "mb-2 text-center sm:mb-3"}>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/85 sm:text-xs lg:text-sm">
          <span className="text-zinc-500">보드</span>
          <span className="mx-1.5 text-zinc-600" aria-hidden>
            ·
          </span>
          <span className="text-zinc-300">{label}</span>
        </div>
      </div>
      <div
        className={[
          "holdem-board-perspective relative flex flex-wrap items-center justify-center overflow-visible",
          showdown ? "gap-2.5 sm:gap-3 lg:gap-4" : BOARD_GAP,
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
            const slotDeals = enterDeals.filter((d) => d.slot === i);
            const hasEnterDeal = slotDeals.length > 0;
            return (
              <div
                key={i}
                className="relative transition-transform lg:origin-center lg:scale-[1.14]"
              >
                <PlayingCard
                  card={c}
                  size="board"
                  className={[
                    showdown ? "drop-shadow-sm" : "drop-shadow-md",
                    hasEnterDeal ? "opacity-0" : "opacity-100",
                    "transition-opacity duration-150",
                  ].join(" ")}
                />
                {!cinematicFlip
                  ? slotDeals.map((deal) => (
                      <div
                        key={deal.id}
                        className="pointer-events-none absolute inset-0 z-20"
                        aria-hidden
                      >
                        <div
                          className={[
                            "holdem-board-enter-root",
                            "holdem-board-card-3d-root",
                            deal.animClass,
                          ].join(" ")}
                          style={{ animationDelay: `${deal.delayMs}ms` }}
                        >
                          <PlayingCard
                            card={c}
                            size="board"
                            className="drop-shadow-lg"
                          />
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            );
          }
          return null;
        })}
        {!rabbitTail
          ? tailIndices.map((i) => (
              <div
                key={i}
                className="transition-transform lg:origin-center lg:scale-[1.14]"
              >
                <CardBack size="board" className="opacity-80" />
              </div>
            ))
          : (
            <div
              className={[
                "relative flex flex-wrap items-end justify-center overflow-visible rounded-lg",
                BOARD_GAP,
              ].join(" ")}
            >
              {rabbitHunt &&
                tailIndices.map((i) => {
                  const c = state.board[i];
                  const showRabbitCard = rabbitHunt.open && c != null;
                  return (
                    <div
                      key={i}
                      className={[
                        "relative flex flex-col items-center gap-0.5 lg:origin-center lg:scale-[1.14]",
                        !showRabbitCard
                          ? "cursor-pointer active:scale-[0.985]"
                          : "cursor-pointer",
                      ].join(" ")}
                      role="button"
                      tabIndex={0}
                      onClick={rabbitHunt.onToggle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          rabbitHunt.onToggle();
                        }
                      }}
                      aria-label={showRabbitCard ? "레빗 카드 닫기" : "레빗 카드 공개"}
                    >
                      {showRabbitCard ? (
                        <>
                          <span className="whitespace-nowrap text-[9px] font-medium text-cyan-200/85">
                            {rabbitSingleTail
                              ? "레빗"
                              : rabbitSlotLabel(i, rabbitHunt.revealedAtFold)}
                          </span>
                          <PlayingCard
                            card={c}
                            size="board"
                            className="drop-shadow-md ring-1 ring-cyan-400/50 shadow-[0_0_14px_rgba(34,211,238,0.22)]"
                          />
                        </>
                      ) : (
                        <CardBack
                          size="board"
                          className="opacity-80 ring-1 ring-cyan-500/35 shadow-[0_0_10px_rgba(34,211,238,0.12)]"
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          )}
      </div>
    </div>
  );
}
