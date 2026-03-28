"use client";

import type { CSSProperties } from "react";
import { best5Of7, compareHandValue } from "@/holdem/pokerEval";
import { iaCategoryHandListText } from "@/holdem/handPool";
import { headsUpPositionLabel } from "@/holdem/headsUpLabels";
import type { GameState, PlayerIndex } from "@/holdem/types";
import { useTurnPulse } from "../hooks/useTurnPulse";
import { CardBack, PlayingCard } from "./Card";

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

export type HoleCardsProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
  /** `both`(기본). 테이블 레이아웃: 상대만 / 나만 분리 표시 */
  seatFilter?: "both" | "opponent" | "hero";
};

function showdownCompare(state: GameState): number | null {
  if (state.phase !== "showdown") return null;
  const h0 = state.holes[0];
  const h1 = state.holes[1];
  if (!h0 || !h1) return null;
  const v0 = best5Of7([...h0.hole, ...state.board]);
  const v1 = best5Of7([...h1.hole, ...state.board]);
  return compareHandValue(v0, v1);
}

export function HoleCards({
  state,
  viewer,
  playerNames,
  seatFilter = "both",
}: HoleCardsProps) {
  const selecting = state.phase === "hand_select";
  const opp = other(viewer);
  const showdownReveal = state.phase === "showdown";
  const sdCmp = showdownCompare(state);
  const turnPulse = useTurnPulse(
    state.phase !== "showdown" && state.phase !== "hand_over"
      ? state.toAct
      : null,
  );
  const iaCategoryForOpp =
    state.phase !== "hand_select" && state.iaReveal[viewer] != null
      ? state.iaReveal[viewer]
      : null;
  const iaOpponentLearnedAboutMe =
    state.phase !== "hand_select" ? state.iaReveal[other(viewer)] : null;

  return (
    <div
      className={[
        "grid gap-3",
        seatFilter === "both" ? "sm:grid-cols-2" : "grid-cols-1",
      ].join(" ")}
    >
      {([0, 1] as PlayerIndex[]).map((p) => {
        if (seatFilter === "hero" && p !== viewer) return null;
        if (seatFilter === "opponent" && p !== opp) return null;
        const sel = state.holes[p];
        const pending = state.handPickPending[p];
        const showPendingOnly = selecting && pending != null && sel == null;
        const isMe = p === viewer;
        const bettingLive =
          state.phase === "preflop" ||
          state.phase === "flop" ||
          state.phase === "turn" ||
          state.phase === "river";

        const isToAct =
          state.toAct === p &&
          state.matchWinner == null &&
          state.phase !== "showdown" &&
          state.phase !== "hand_over";

        const isHandPickChoosing =
          selecting && pending == null && sel == null;
        const isHandPickSubmitted =
          selecting && pending != null && sel == null;

        const dimForNonTurn =
          bettingLive &&
          state.toAct != null &&
          state.toAct !== p &&
          state.matchWinner == null;

        const showFaces =
          sel != null &&
          (showdownReveal ||
            (isMe && (state.phase === "hand_over" || !selecting)));

        const showOpponentBacks =
          sel != null && !isMe && !selecting && !showdownReveal;

        const winnerShowdown =
          showdownReveal &&
          sdCmp != null &&
          sdCmp !== 0 &&
          ((sdCmp > 0 && p === 0) || (sdCmp < 0 && p === 1));
        const tieShowdown = showdownReveal && sdCmp === 0;
        const loserShowdown =
          showdownReveal && sdCmp !== 0 && !winnerShowdown && !tieShowdown;

        /** 승자 패널만 은은한 글로우 1곳 */
        const showdownFrame =
          winnerShowdown && p === 0
            ? "border-amber-500/55 bg-amber-950/25 shadow-[0_0_20px_rgba(251,191,36,0.22)] ring-1 ring-amber-400/45"
            : winnerShowdown && p === 1
              ? "border-violet-500/55 bg-violet-950/25 shadow-[0_0_20px_rgba(167,139,250,0.22)] ring-1 ring-violet-400/45"
              : tieShowdown
                ? "border-emerald-600/40 bg-emerald-950/20 ring-1 ring-emerald-500/35"
                : "";

        let toneFrame = "";
        if (!loserShowdown) {
          if (isToAct) {
            toneFrame =
              "border-emerald-400/70 bg-emerald-900/35 shadow-[0_0_30px_rgba(52,211,153,0.38)] ring-2 ring-emerald-400/50 z-[2]";
          } else if (isHandPickChoosing) {
            toneFrame =
              "border-amber-400/60 bg-amber-950/28 shadow-[0_0_26px_rgba(251,191,36,0.28)] ring-2 ring-amber-400/40 z-[1]";
          } else if (isHandPickSubmitted) {
            toneFrame =
              "border-emerald-500/40 bg-emerald-950/18 ring-1 ring-emerald-500/35";
          } else if (showdownFrame) {
            toneFrame = showdownFrame;
          } else {
            toneFrame = "border-zinc-600/90 bg-zinc-700/45";
          }
        }

        const frameClass = [
          "rounded-xl border transition-[box-shadow,background-color,border-color,opacity,filter] duration-200",
          showdownReveal ? "px-2 py-2" : "px-3 py-3",
          loserShowdown
            ? "border-zinc-700/85 bg-zinc-800/35 text-zinc-500"
            : toneFrame,
          dimForNonTurn ? "opacity-[0.52] brightness-[0.88] saturate-75" : "",
        ].join(" ");

        const frameStyle: CSSProperties | undefined =
          isToAct && turnPulse
            ? { animation: "holdem-turn-ring 0.32s ease-out 1" }
            : isHandPickChoosing
              ? { animation: "holdem-hand-pick-glow 1.8s ease-in-out infinite" }
              : undefined;

        const seatName = playerNames[p]!;

        const cardSize =
          showdownReveal ? ("compact" as const) : isMe ? ("hero" as const) : ("board" as const);

        const showdownCardClass = loserShowdown ? "opacity-55" : "";

        return (
          <div key={p} className={frameClass} style={frameStyle}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium uppercase text-zinc-400">
              <span className="text-zinc-200">{seatName}</span>
              <span
                className="rounded bg-zinc-600/80 px-1.5 py-px text-zinc-300"
                style={{ fontSize: "calc(9px * 1.3)" }}
              >
                {headsUpPositionLabel(state, p)}
              </span>
              {isMe ? (
                <span className="text-emerald-300">내 카드</span>
              ) : (
                <span className="text-zinc-500">상대</span>
              )}
              {isToAct ? (
                <span className="ml-auto rounded-full bg-emerald-600/30 px-2 py-0.5 text-[9px] font-bold text-emerald-200">
                  액션 턴
                </span>
              ) : isHandPickChoosing ? (
                <span className="ml-auto rounded-full bg-amber-600/35 px-2 py-0.5 text-[9px] font-bold text-amber-100">
                  핸드 선택
                </span>
              ) : isHandPickSubmitted ? (
                <span className="ml-auto rounded-full bg-emerald-700/35 px-2 py-0.5 text-[9px] font-bold text-emerald-100">
                  확정됨
                </span>
              ) : null}
            </div>

            {sel && showFaces ? (
              <div className="mt-1.5">
                <div
                  className={[
                    "flex justify-center sm:justify-start",
                    showdownReveal ? "gap-2" : "gap-3",
                  ].join(" ")}
                >
                  {sel.hole.map((c, i) => (
                    <PlayingCard
                      key={i}
                      card={c}
                      size={cardSize}
                      className={showdownReveal ? showdownCardClass : ""}
                    />
                  ))}
                </div>
                {isMe &&
                iaOpponentLearnedAboutMe != null &&
                !showdownReveal ? (
                  <p className="mt-2 text-center text-[11px] leading-snug text-indigo-200/90 sm:text-left">
                    상대 IA로 공개된 내 카테고리:{" "}
                    <span className="font-semibold text-indigo-100">
                      {iaOpponentLearnedAboutMe}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] font-normal text-indigo-300/85">
                      {iaCategoryHandListText(iaOpponentLearnedAboutMe)}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : showOpponentBacks ? (
              <div className="mt-1.5 space-y-2">
                <div className="flex justify-center gap-2 sm:justify-start">
                  <CardBack size={showdownReveal ? "compact" : "board"} />
                  <CardBack size={showdownReveal ? "compact" : "board"} />
                </div>
                {p === opp && iaCategoryForOpp ? (
                  <p className="text-[11px] leading-snug text-indigo-200/90">
                    IA · 상대 카테고리:{" "}
                    <span className="font-semibold text-indigo-100">
                      {iaCategoryForOpp}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-indigo-100/85">
                      {iaCategoryHandListText(iaCategoryForOpp)}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-normal text-indigo-300/70">
                      (실제 카드는 비공개)
                    </span>
                  </p>
                ) : null}
              </div>
            ) : showPendingOnly ? (
              <p className="mt-2 text-[11px] text-zinc-400">
                제출됨 · 실제 카드는 상대 확정 후 공개
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">핸드 선택 대기 중</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
