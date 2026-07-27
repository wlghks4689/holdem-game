"use client";

import * as React from "react";
import type { GameState } from "@/holdem/types";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import {
  bestFiveCardsFromSeven,
  best5Of7,
  compareHandValue,
  madeHandFxKind,
} from "@/holdem/pokerEval";
import type { MadeHandFxKind } from "@/holdem/pokerEval";
import { useHoldemMotionMode } from "../HoldemMotionRuntime";
import { CardBack, PlayingCard } from "./Card";
import {
  playBoardDealSoft,
  playShowdownBoardReveal,
} from "../showdownCinemaSounds";

const streetKo: Record<string, string> = {
  hand_select: "핸드 선택",
  preflop: "프리플랍",
  flop: "플랍",
  turn: "턴",
  river: "리버",
  showdown: "쇼다운",
  hand_over: "종료",
};

const streetEn: Record<string, string> = {
  hand_select: "HAND SELECT",
  preflop: "PREFLOP",
  flop: "FLOP",
  turn: "TURN",
  river: "RIVER",
  showdown: "SHOWDOWN",
  hand_over: "COMPLETE",
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

const SHOWDOWN_BOARD_GLOW: Record<MadeHandFxKind, string> = {
  none: "holdem-showdown-default-card-glow",
  straight: "holdem-made-card-glow-t1",
  flush: "holdem-made-card-glow-t2",
  "full-house": "holdem-made-card-glow-t3",
  quads: "holdem-preview-quads-coral-card",
  "straight-flush": "holdem-preview-straight-flush-rainbow-card",
  "royal-flush": "holdem-preview-royal-flush-card",
};

function rabbitSlotLabel(
  i: number,
  revealedAtFold: 3 | 4,
  isEn: boolean,
): string {
  if (revealedAtFold === 3) {
    return i === 3 ? (isEn ? "TURN" : "턴") : isEn ? "RIVER" : "리버";
  }
  return isEn ? "RIVER" : "리버";
}

function buildEnterDeal(
  slot: number,
  prevRev: number,
  nextRev: number,
  subtle: boolean,
  cinematicFlip: boolean,
  id: number,
): EnterDeal | null {
  const cinemaStreet = slot < 3 ? "flop" : slot === 3 ? "turn" : "river";
  const cinematicDuration = subtle
    ? cinemaStreet === "flop" ? 300 : cinemaStreet === "turn" ? 360 : 440
    : cinemaStreet === "flop" ? 806 : cinemaStreet === "turn" ? 806 : 900;
  const normalDuration = cinematicFlip ? cinematicDuration : 620;
  const subtleDuration = cinematicFlip ? cinematicDuration : 380;
  const flipClass = subtle
    ? `holdem-board-flip-reveal-${cinemaStreet}-subtle`
    : `holdem-board-flip-reveal-${cinemaStreet}`;
  if (prevRev < 3 && nextRev >= 3 && slot < 3 && slot >= prevRev) {
    const order = slot - Math.max(0, prevRev);
    const animClass = cinematicFlip
      ? flipClass
      : subtle
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
      animClass: cinematicFlip
        ? flipClass
        : subtle
          ? "holdem-board-enter-turn-subtle"
          : "holdem-board-enter-turn",
    };
  }
  if (prevRev < 5 && nextRev >= 5 && slot === 4) {
    return {
      id,
      slot,
      delayMs: TURN_RIVER_STAGGER_MS,
      durationMs: subtle ? subtleDuration : normalDuration,
      animClass: cinematicFlip
        ? flipClass
        : subtle
          ? "holdem-board-enter-river-subtle"
          : "holdem-board-enter-river",
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
  cinemaAnticipation?: "flop" | "turn" | "river" | null;
  /** 레빗 헌트(폴드 당사자만 active) */
  rabbitHunt?: BoardRabbitHuntUi | null;
};

export function BoardDisplay({
  state,
  visualRevealedOverride = null,
  streetLabelOverride = null,
  cinematicFlip = false,
  cinemaStreetPulse = null,
  cinemaAnticipation = null,
  rabbitHunt = null,
}: BoardDisplayProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const motionMode = useHoldemMotionMode();
  const subtleMotion = motionMode === "subtle";
  const rev =
    visualRevealedOverride != null
      ? visualRevealedOverride
      : state.boardRevealed;
  const slots = [0, 1, 2, 3, 4] as const;
  const overrideLabel =
    isEn && streetLabelOverride != null
      ? ({ 쇼다운: "SHOWDOWN", 플랍: "FLOP", 턴: "TURN", 리버: "RIVER" }[
          streetLabelOverride
        ] ?? streetLabelOverride)
      : streetLabelOverride;
  const label =
    overrideLabel ??
    (isEn ? streetEn[state.phase] : streetKo[state.phase]) ??
    state.phase;
  const showdown = state.phase === "showdown";

  const showdownMadeKeySet = React.useMemo(() => {
    // 올인 시네마 리빌 단계(긴장감 구간)에는 디밍을 걸지 않는다.
    if (state.phase !== "showdown" || cinematicFlip) return null;
    const h0 = state.holes[0];
    const h1 = state.holes[1];
    if (!h0 || !h1) return null;
    // 보드 5장이 모두 공개된 뒤에만 "승부에 사용된 5장" 하이라이트가 명확하다.
    if (rev < 5) return null;

    const all0 = [...h0.hole, ...state.board];
    const all1 = [...h1.hole, ...state.board];
    const v0 = best5Of7(all0);
    const v1 = best5Of7(all1);
    const cmp = compareHandValue(v0, v1);

    const key = (c: { rank: number; suit: string }) => `${c.rank}:${c.suit}`;
    const set = new Set<string>();

    if (cmp === 0) {
      // 타이: 양쪽의 best5가 동일/유사할 수 있으니 둘 다 합집합으로 강조
      for (const c of bestFiveCardsFromSeven(all0)) set.add(key(c));
      for (const c of bestFiveCardsFromSeven(all1)) set.add(key(c));
      return { keys: set, fxKind: madeHandFxKind(v0) };
    } else {
      const winAll = cmp > 0 ? all0 : all1;
      for (const c of bestFiveCardsFromSeven(winAll)) set.add(key(c));
      return {
        keys: set,
        fxKind: madeHandFxKind(cmp > 0 ? v0 : v1),
      };
    }
  }, [cinematicFlip, rev, state.board, state.holes, state.phase]);

  const [enterDeals, setEnterDeals] = React.useState<EnterDeal[]>([]);
  const prevRevRef = React.useRef(rev);
  const enterDealRoundRef = React.useRef(state.roundNumber);
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
    if (enterDealRoundRef.current !== state.roundNumber) {
      setEnterDeals([]);
      prevRevRef.current = rev;
      enterDealRoundRef.current = state.roundNumber;
      for (const t of clearTimersRef.current) window.clearTimeout(t);
      clearTimersRef.current = [];
      return;
    }
    const prev = prevRevRef.current;
    if (rev <= prev) {
      prevRevRef.current = rev;
      return;
    }
    const next: EnterDeal[] = [];
    for (let i = prev; i < rev; i++) {
      if (!state.board[i]) continue;
      const built = buildEnterDeal(
        i,
        prev,
        rev,
        subtleMotion,
        cinematicFlip,
        dealSeqRef.current++,
      );
      if (built) next.push(built);
    }
    if (next.length > 0) {
      setEnterDeals((cur) => [...cur, ...next]);
      for (const deal of next) {
        // SFX: 각 카드가 들어올 때 가볍게 "사사삭" 한 번
        const sfxDelay = deal.delayMs;
        const sfxTimer = window.setTimeout(() => {
          if (cinematicFlip) {
            playShowdownBoardReveal(
              deal.slot < 3 ? "flop" : deal.slot === 3 ? "turn" : "river",
            );
          } else {
            playBoardDealSoft();
          }
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
        cinemaStreetPulse ? `holdem-board-cinema-${cinemaStreetPulse}` : "",
      ].join(" ")}
    >
      <div className={showdown ? "mb-1.5 text-center sm:mb-2" : "mb-2 text-center sm:mb-3"}>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/85 sm:text-xs lg:text-sm">
          <span className="text-zinc-500">{isEn ? "BOARD" : "보드"}</span>
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
            const cardKey = `${c.rank}:${c.suit}`;
            const madeOnWinner =
              showdownMadeKeySet?.keys.has(cardKey) ?? false;
            const dimNonMade = showdownMadeKeySet != null && !madeOnWinner;
            const showdownGlowClass = SHOWDOWN_BOARD_GLOW[
              showdownMadeKeySet?.fxKind ?? "none"
            ];
            return (
              <div
                key={i}
                className={[
                  "relative transition-[transform,opacity,filter] duration-300 lg:origin-center lg:scale-[1.14]",
                  madeOnWinner ? "z-10 scale-[1.04] lg:scale-[1.2]" : "",
                ].join(" ")}
              >
                <PlayingCard
                  card={c}
                  size="board"
                  className={[
                    showdown ? "drop-shadow-sm" : "drop-shadow-md",
                    madeOnWinner
                      ? `brightness-[1.16] contrast-[1.1] saturate-[1.12] ${showdownGlowClass}`
                      : "",
                    dimNonMade
                      ? "opacity-20 brightness-[0.48] contrast-75 saturate-[0.28] grayscale-[0.58]"
                      : "",
                    hasEnterDeal ? "opacity-0" : "opacity-100",
                  ].join(" ")}
                />
                {slotDeals.map((deal) => (
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
                        className={[
                          "drop-shadow-lg",
                          madeOnWinner
                            ? `brightness-[1.16] contrast-[1.1] saturate-[1.12] ${showdownGlowClass}`
                            : "",
                          dimNonMade
                            ? "opacity-20 brightness-[0.48] contrast-75 saturate-[0.28] grayscale-[0.58]"
                            : "",
                        ].join(" ")}
                      />
                    </div>
                  </div>
                ))}
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
                <CardBack
                  size="board"
                  className={[
                    "opacity-80",
                    cinemaAnticipation
                      ? `holdem-allin-cardback-wait holdem-allin-cardback-${cinemaAnticipation}`
                      : "",
                  ].join(" ")}
                />
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
                      aria-label={
                        showRabbitCard
                          ? isEn
                            ? "Hide rabbit card"
                            : "레빗 카드 닫기"
                          : isEn
                            ? "Reveal rabbit card"
                            : "레빗 카드 공개"
                      }
                    >
                      {showRabbitCard ? (
                        <>
                          <span className="whitespace-nowrap text-[9px] font-medium text-cyan-200/85">
                            {rabbitSingleTail
                              ? isEn
                                ? "RABBIT"
                                : "레빗"
                              : rabbitSlotLabel(i, rabbitHunt.revealedAtFold, isEn)}
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
