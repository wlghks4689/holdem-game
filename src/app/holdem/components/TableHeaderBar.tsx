"use client";

import * as React from "react";
import { totalIaChipsRemovedFromLogs } from "@/holdem/bettingHelpers";
import {
  debugBlindLine,
  formatBlindTriple,
  getBlindLevel,
  isBlindTierUpTransition,
  nextBlindTierStartRound,
  resolveHandBlinds,
} from "@/holdem/blindLevels";
import { TOTAL_ROUNDS } from "@/holdem/constants";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import {
  HEADS_UP_RULES_BLURB,
  HU_BB_LABEL,
  HU_DEALER_SB_LABEL,
  headsUpPositionLabel,
} from "@/holdem/headsUpLabels";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { GameState, PlayerIndex } from "@/holdem/types";
import { useHoldemMotionMode } from "../HoldemMotionRuntime";
import { useTurnPulse } from "../hooks/useTurnPulse";

function fmtChips(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(1);
}

/** 현재 BB 칩 크기 기준 스택을 bb 문자열로 (칩 숫자 옆에 붙임) */
function stackAsBbPretty(chips: number, bbUnit: number): string {
  if (bbUnit < 1e-9) return "—";
  const bbVal = chips / bbUnit;
  if (Math.abs(bbVal - Math.round(bbVal)) < 1e-9) return `${Math.round(bbVal)}bb`;
  return `${bbVal.toFixed(1).replace(/\.0$/, "")}bb`;
}

export type TableHeaderBarProps = {
  state: GameState;
  playerNames: [string, string];
};

const GAIN_ANIM_MS = 2000;
const BLIND_UP_TOAST_MS = 1200;
const GAIN_EPS = 1e-6;

const headerMetaMono =
  "font-mono text-[13px] font-semibold tabular-nums tracking-tight sm:text-sm";

function flashMagnitude(f: [number, number] | null): boolean {
  if (f == null) return false;
  return Math.abs(f[0]!) > GAIN_EPS || Math.abs(f[1]!) > GAIN_EPS;
}

export function TableHeaderBar({ state, playerNames }: TableHeaderBarProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const motionMode = useHoldemMotionMode();
  const subtleMotion = motionMode === "subtle";
  const turnPulse = useTurnPulse(state.toAct, {
    holdMs: subtleMotion ? 240 : 320,
  });
  const prevRoundRef = React.useRef<number | null>(null);
  const [blindUpKey, setBlindUpKey] = React.useState<number | null>(null);
  const iaRemovedTotal =
    typeof state.iaPotRemovalTotal === "number" &&
    !Number.isNaN(state.iaPotRemovalTotal)
      ? state.iaPotRemovalTotal
      : totalIaChipsRemovedFromLogs(state.logs);
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

  React.useEffect(() => {
    const r = state.roundNumber;
    const prev = prevRoundRef.current;
    if (prev !== null && isBlindTierUpTransition(prev, r)) {
      setBlindUpKey(Date.now());
      window.setTimeout(() => setBlindUpKey(null), BLIND_UP_TOAST_MS);
    }
    prevRoundRef.current = r;
  }, [state.roundNumber]);

  const btnName = playerNames[state.button]!;
  const bbSeat: PlayerIndex = state.button === 0 ? 1 : 0;
  const bbName = playerNames[bbSeat]!;
  const dealerLabel = isEn ? "Dealer · SB" : HU_DEALER_SB_LABEL;
  const bbLabel = HU_BB_LABEL;
  const hb = resolveHandBlinds(state);
  const blindLine = formatBlindTriple({
    smallBlind: hb.sb,
    bigBlind: hb.bb,
    ante: hb.ante,
  });
  const nextR = nextBlindTierStartRound(state.roundNumber);
  const nextBlindHint =
    nextR != null
      ? isEn
        ? `from R${nextR}: ${formatBlindTriple(getBlindLevel(nextR))}`
        : `${nextR}R부터 ${formatBlindTriple(getBlindLevel(nextR))}`
      : isEn
        ? "No further increase (final tier)"
        : "이후 상향 없음 (최종 티어)";

  const blindTooltip = `${debugBlindLine(state.roundNumber, hb)}\n${isEn ? "Next" : "다음"}: ${nextBlindHint}\n${isEn ? "IA total" : "IA 누적"}: ${fmtChips(iaRemovedTotal)}${isEn ? " chips" : "칩"}`;

  /** 매치 승자 확정 시(버스트·30R·조기 종료 무관) 승/패 배너 구분 */
  const matchDecided = state.matchWinner != null;

  return (
    <>
      {blindUpKey != null ? (
        <div
          className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-black/25"
          aria-live="polite"
        >
          <div
            key={blindUpKey}
            className="mx-4 rounded-2xl border-2 border-amber-400/90 bg-zinc-950/95 px-8 py-5 shadow-[0_0_48px_rgba(251,191,36,0.45)] backdrop-blur-sm sm:px-12 sm:py-7"
            style={{ animation: "holdem-blind-up 1.2s ease-out forwards" }}
          >
            <p className="text-center text-2xl font-black uppercase tracking-[0.18em] text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)] sm:text-3xl">
              {isEn ? "BLINDS UP" : "블라인드 UP"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/70 p-2 text-sm sm:p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-600/70 pb-1.5 text-zinc-300 sm:mb-2 sm:pb-2">
        <span
          className={`shrink-0 text-zinc-100 ${headerMetaMono}`}
          title={debugBlindLine(state.roundNumber, hb)}
        >
          {isEn ? "ROUND" : "라운드"} {state.roundNumber}
          <span className="font-semibold text-zinc-400"> / {TOTAL_ROUNDS}</span>
        </span>
        <span className="hidden shrink-0 text-zinc-600 sm:inline" aria-hidden>
          ·
        </span>
        <span
          className="min-w-0 shrink rounded-md border-2 border-amber-400/75 bg-amber-950/25 px-2 py-1 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]"
          title={blindTooltip}
        >
          <span className={`text-amber-100 ${headerMetaMono}`}>
            <span className="font-sans font-semibold text-white">
              {isEn ? "BLINDS:  " : "현재 블라인드:  "}
            </span>
            {blindLine}
          </span>
        </span>
        <span className="hidden shrink-0 text-zinc-600 sm:inline" aria-hidden>
          ·
        </span>
        <span
          className={`hidden shrink-0 text-zinc-100 sm:inline ${headerMetaMono}`}
          title={
            isEn
              ? "Total chips removed by IA since match start"
              : "매치 시작부터 IA로 팟에서 빠져 나간 칩 누적(칩 단위)"
          }
        >
          {isEn ? "IA total" : "IA 누적"} {fmtChips(iaRemovedTotal)}
          {isEn ? " chips" : "칩"}
        </span>
        <span className="hidden shrink-0 text-zinc-600 lg:inline" aria-hidden>
          ·
        </span>
        <span
          className="hidden min-w-0 shrink text-[10px] text-zinc-400 md:inline md:text-[11px]"
          title={HEADS_UP_RULES_BLURB}
        >
          {isEn ? dealerLabel : HU_DEALER_SB_LABEL}{" "}
          <span className="font-medium text-zinc-200">{btnName}</span>
          <span className="mx-0.5 text-zinc-600">·</span>
          {bbLabel}{" "}
          <span className="font-medium text-zinc-200">{bbName}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
        {([0, 1] as PlayerIndex[]).map((p) => {
          const bettingUi =
            state.matchWinner == null &&
            state.phase !== "showdown" &&
            state.phase !== "hand_over" &&
            state.phase !== "hand_select";
          const acting =
            bettingUi && state.toAct === p;
          const dimOpponentTurn = bettingUi && state.toAct !== p;
          const matchWinnerGlow =
            matchDecided && p === state.matchWinner;
          const matchLoserDim =
            matchDecided && p !== state.matchWinner;
          const label = playerNames[p]!;
          const blindTagRaw = headsUpPositionLabel(state, p);
          const blindTag = isEn && blindTagRaw === HU_DEALER_SB_LABEL
            ? "Dealer · SB"
            : blindTagRaw;
          const flashDelta = state.potAwardFlash?.[p] ?? 0;
          const showPotFlash =
            gainVisible &&
            state.potAwardFlash != null &&
            Math.abs(flashDelta) > GAIN_EPS;
          return (
            <div
              key={p}
              className={[
                "relative rounded-lg px-2 py-1.5 transition-[background-color,opacity,box-shadow,filter] duration-200 sm:py-2",
                matchWinnerGlow
                  ? "z-[2] bg-gradient-to-br from-amber-950/55 via-zinc-900/50 to-zinc-900/30 ring-2 ring-amber-400/90 shadow-[0_0_32px_rgba(251,191,36,0.38)]"
                  : matchLoserDim
                    ? "opacity-[0.5] brightness-[0.9] ring-1 ring-zinc-700/35"
                    : acting
                      ? "z-[1] bg-emerald-900/40 ring-2 ring-emerald-400/50 shadow-[0_0_22px_rgba(52,211,153,0.22)]"
                      : dimOpponentTurn
                        ? "opacity-[0.55] brightness-90 ring-1 ring-zinc-700/40"
                        : "bg-zinc-800/20 ring-1 ring-zinc-700/30",
              ].join(" ")}
              style={
                matchWinnerGlow
                  ? {
                      animation: subtleMotion
                        ? "holdem-match-winner-stack-glow-subtle 2.1s ease-in-out infinite"
                        : "holdem-match-winner-stack-glow 2.2s ease-in-out infinite",
                    }
                  : acting && turnPulse
                    ? {
                        animation: subtleMotion
                          ? "holdem-turn-ring-subtle 0.24s ease-out 1"
                          : "holdem-turn-ring 0.32s ease-out 1",
                      }
                    : acting
                      ? {
                          animation: subtleMotion
                            ? "holdem-active-turn-glow-subtle 1.45s ease-in-out infinite"
                            : "holdem-active-turn-glow 2.2s ease-in-out infinite",
                        }
                      : undefined
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-zinc-50">
                  {label}
                  {matchWinnerGlow ? (
                    <span className="ml-1.5 inline-block rounded-md bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-100 ring-1 ring-amber-400/60">
                      {isEn ? "WIN" : "승리"}
                    </span>
                  ) : null}
                </span>
                <span
                  className="rounded bg-zinc-600/80 px-1.5 py-px font-medium uppercase text-zinc-300"
                  style={{ fontSize: "calc(9px * 1.3)" }}
                >
                  {blindTag}
                </span>
              </div>
              <div className="mt-1 flex min-h-[1.5rem] items-center justify-between gap-2">
                <div
                  className="flex min-w-0 shrink flex-wrap items-baseline gap-x-1.5 gap-y-0"
                  title={
                    isEn
                      ? `1 BB = ${fmtChips(hb.bb)} chips · round ${state.roundNumber}`
                      : `BB 1단위 = ${fmtChips(hb.bb)}칩 · 라운드 ${state.roundNumber}`
                  }
                >
                  <span
                    className="font-mono text-zinc-100"
                    style={{ fontSize: "calc(1rem * 1.2)" }}
                  >
                    {fmtChips(state.chips[p]!)}
                    <span
                      className="font-sans text-zinc-400"
                      style={{ fontSize: "calc(11px * 1.4)" }}
                    >
                      칩
                    </span>
                  </span>
                  <span className="text-zinc-600" aria-hidden>
                    =
                  </span>
                  <span className="font-mono text-sm font-medium tabular-nums text-amber-200/90 sm:text-[0.95rem]">
                    {stackAsBbPretty(state.chips[p]!, hb.bb)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {acting ? (
                    <span className="rounded-md bg-emerald-700/40 px-2 py-0.5 text-[10px] font-bold text-emerald-100">
                      {isEn ? "ACTING" : "행동 중"}
                    </span>
                  ) : null}
                  {showPotFlash ? (
                    <span
                      key={`pot-gain-${p}-${flashDelta}-${state.roundNumber}`}
                      className={[
                        "pointer-events-none font-mono text-sm font-bold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]",
                        flashDelta > 0 ? "text-green-400" : "text-red-400",
                      ].join(" ")}
                      style={{
                        animation: "holdem-pot-gain 1.8s ease-out forwards",
                      }}
                      aria-label={
                        flashDelta > 0
                          ? `이번 판 팟 획득 ${chipsAsBbLabel(Math.abs(flashDelta), hb.bb)}`
                          : `이번 판 팟 ${chipsAsBbLabel(Math.abs(flashDelta), hb.bb)} 유실`
                      }
                    >
                      {flashDelta > 0
                        ? `+${chipsAsBbLabel(Math.abs(flashDelta), hb.bb)}`
                        : `-${chipsAsBbLabel(Math.abs(flashDelta), hb.bb)}`}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
