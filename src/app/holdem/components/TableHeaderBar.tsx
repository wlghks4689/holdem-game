"use client";

import * as React from "react";
import { totalIaChipsRemovedFromLogs } from "@/holdem/bettingHelpers";
import { TOTAL_ROUNDS } from "@/holdem/constants";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import type { GameState, PlayerIndex } from "@/holdem/types";
import { useTurnPulse } from "../hooks/useTurnPulse";

function fmtChips(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(1);
}

export type TableHeaderBarProps = {
  state: GameState;
  /** [P0 이름, P1 이름] */
  playerNames: [string, string];
};

const GAIN_ANIM_MS = 2000;
const GAIN_EPS = 1e-6;

function flashMagnitude(f: [number, number] | null): boolean {
  if (f == null) return false;
  return Math.abs(f[0]!) > GAIN_EPS || Math.abs(f[1]!) > GAIN_EPS;
}

export function TableHeaderBar({ state, playerNames }: TableHeaderBarProps) {
  const turnPulse = useTurnPulse(state.toAct);
  const iaRemovedTotal = totalIaChipsRemovedFromLogs(state.logs);
  const [gainVisible, setGainVisible] = React.useState(false);

  React.useEffect(() => {
    const f = state.potAwardFlash;
    if (!flashMagnitude(f)) {
      setGainVisible(false);
      return;
    }
    setGainVisible(true);
    const t = window.setTimeout(() => setGainVisible(false), GAIN_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [state.potAwardFlash]);

  const btnName = playerNames[state.button]!;
  const bbSeat: PlayerIndex = state.button === 0 ? 1 : 0;
  const bbName = playerNames[bbSeat]!;

  return (
    <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/70 p-3 text-sm">
      <div className="mb-3 flex flex-col gap-1 border-b border-zinc-600/70 pb-3 text-xs text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
          style={{ fontSize: "130%" }}
        >
          <span>
            <span className="font-semibold text-zinc-100">
              라운드 {state.roundNumber}
            </span>
            <span className="text-zinc-500"> / {TOTAL_ROUNDS}</span>
          </span>
          <span
            className={[
              "rounded-md px-1.5 py-px font-mono font-medium leading-none",
              iaRemovedTotal > 0
                ? "bg-indigo-900/45 text-indigo-100"
                : "bg-zinc-600/35 text-zinc-400",
            ].join(" ")}
            title="매치 시작부터 IA로 팟에서 빠져 나간 칩 누적 합계"
          >
            IA 누적 −{chipsAsBbLabel(iaRemovedTotal)}
          </span>
        </div>
        <div className="text-[11px] text-zinc-400">
          버튼(SB): <span className="font-medium text-zinc-200">{btnName}</span>
          <span className="mx-1 text-zinc-600">·</span>
          BB: <span className="font-medium text-zinc-200">{bbName}</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {([0, 1] as PlayerIndex[]).map((p) => {
          const acting =
            state.toAct === p &&
            state.matchWinner == null &&
            state.phase !== "showdown" &&
            state.phase !== "hand_over";
          const label = playerNames[p]!;
          const blindTag = state.button === p ? "버튼 / SB" : "BB";
          const flashDelta = state.potAwardFlash?.[p] ?? 0;
          const showPotFlash =
            gainVisible &&
            state.potAwardFlash != null &&
            Math.abs(flashDelta) > GAIN_EPS;
          return (
            <div
              key={p}
              className={[
                "relative rounded-lg px-2 py-2 transition-colors",
                acting ? "bg-emerald-900/25 ring-1 ring-emerald-500/35" : "",
              ].join(" ")}
              style={
                acting && turnPulse
                  ? { animation: "holdem-turn-ring 0.32s ease-out 1" }
                  : undefined
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-zinc-50">
                  {label}
                </span>
                <span className="rounded bg-zinc-600/80 px-1.5 py-px text-[9px] font-medium uppercase text-zinc-300">
                  {blindTag}
                </span>
                <span className="text-[10px] text-zinc-500">P{p}</span>
              </div>
              <div className="mt-1 flex min-h-[1.5rem] items-baseline justify-between gap-2">
                <div className="min-w-0 shrink font-mono text-base text-zinc-100">
                  {fmtChips(state.chips[p]!)}{" "}
                  <span className="text-[11px] font-sans text-zinc-400">칩</span>
                </div>
                {showPotFlash ? (
                  <span
                    key={`pot-gain-${p}-${flashDelta}-${state.roundNumber}`}
                    className={[
                      "pointer-events-none shrink-0 font-mono text-sm font-bold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]",
                      flashDelta > 0 ? "text-green-400" : "text-red-400",
                    ].join(" ")}
                    style={{
                      animation: "holdem-pot-gain 1.8s ease-out forwards",
                    }}
                    aria-label={
                      flashDelta > 0
                        ? `이번 판 팟 획득 ${chipsAsBbLabel(Math.abs(flashDelta))}`
                        : `이번 판 팟 ${chipsAsBbLabel(Math.abs(flashDelta))} 유실`
                    }
                  >
                    {flashDelta > 0
                      ? `+${chipsAsBbLabel(Math.abs(flashDelta))}`
                      : `-${chipsAsBbLabel(Math.abs(flashDelta))}`}
                  </span>
                ) : null}
              </div>
              {acting ? (
                <span className="mt-1 inline-block rounded-md bg-emerald-700/40 px-2 py-0.5 text-[10px] font-bold text-emerald-100">
                  행동 중
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
