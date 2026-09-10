"use client";

import * as React from "react";
import {
  bettingActionPressure,
  type BettingPressure,
  type BettingPressureTier,
} from "../bettingActionPressure";
import { resolveHandBlinds } from "@/holdem/blindLevels";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import {
  playBettingCallSound,
  playBettingCheckSound,
  playBettingIASound,
  playBettingRaiseSound,
  playHeroCallSound,
  playHeroCheckSound,
  playHeroIASound,
  playHeroRaiseSound,
} from "../showdownCinemaSounds";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { GameMessage, GameState, PlayerIndex } from "@/holdem/types";

function fmtChips(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(1);
}

function potInBbCompact(pot: number, bbUnit: number): string {
  if (bbUnit < 1e-9) return "—";
  const bb = pot / bbUnit;
  if (Math.abs(bb - Math.round(bb)) < 1e-6) return `${Math.round(bb)}BB`;
  return `${bb.toFixed(1).replace(/\.0$/, "")}BB`;
}

function tailSignature(logs: readonly GameMessage[]): string {
  const L = logs.length;
  if (L === 0) return "0";
  const last = logs[L - 1]!;
  if (last.t === "preflop_action" || last.t === "postflop_action") {
    return `${L}:${last.t}:p${last.player}:${last.action}:${last.amount ?? "x"}`;
  }
  if (last.t === "ia") {
    return `${L}:ia:p${last.player}:${last.cost}`;
  }
  return `${L}:${last.t}`;
}

/** 액션 스트립 한 줄 — 금액 앞 구분자는 모두 U+2192(→) 로 통일 */
const FLASH_ARROW = " → ";

function formatBettingFlashLine(
  m: Extract<GameMessage, { t: "preflop_action" } | { t: "postflop_action" }>,
  name: string,
  bbUnit: number,
  isEn: boolean,
): string {
  const amt = m.amount;
  const act = (ko: string, en: string) => (isEn ? en : ko);
  if (m.action === "체크(자동)") return "";
  if (m.action === "체크") return `${name} · ${act("체크", "Check")}`;
  if (m.action === "콜") {
    const tail =
      amt != null ? `${FLASH_ARROW}${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · ${act("콜", "Call")}${tail}`;
  }
  if (m.action === "올인 콜") {
    const tail =
      amt != null ? `${FLASH_ARROW}${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · ${act("올인 콜", "All-in Call")}${tail}`;
  }
  if (m.action === "레이즈") {
    const tail =
      amt != null
        ? `${FLASH_ARROW}${isEn ? "total " : "총 "}${chipsAsBbLabel(amt, bbUnit)}`
        : "";
    return `${name} · ${act("레이즈", "Raise")}${tail}`;
  }
  if (m.action === "베트") {
    const tail =
      amt != null ? `${FLASH_ARROW}${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · ${act("베팅", "Bet")}${tail}`;
  }
  if (m.action === "올인") {
    const tail =
      amt != null
        ? `${FLASH_ARROW}${isEn ? "total " : "총 "}${chipsAsBbLabel(amt, bbUnit)}`
        : "";
    return `${name} · ${act("올인", "All-in")}${tail}`;
  }
  return `${name} · ${m.action}`;
}

type ActionStripState = {
  id: number;
  text: string;
  who: "hero" | "opp";
  pressure: BettingPressure | null;
  specialBadge?: "IA";
};

function pressureBoxClass(tier: BettingPressureTier): string {
  switch (tier) {
    case "bet":
      return "border border-amber-500/45 bg-gradient-to-r from-amber-950/65 via-amber-900/50 to-amber-950/65 shadow-[0_0_14px_rgba(245,158,11,0.14)]";
    case "raise":
      return "border border-orange-400/60 bg-gradient-to-r from-orange-950/75 via-orange-900/60 to-orange-950/75 shadow-[0_0_20px_rgba(251,146,60,0.2)]";
    case "three-bet":
      return "border border-rose-400/65 bg-gradient-to-r from-rose-950/80 via-rose-900/65 to-rose-950/80 shadow-[0_0_28px_rgba(251,113,133,0.25)]";
    case "four-plus-bet":
      return "border border-fuchsia-400/70 bg-gradient-to-r from-fuchsia-950/85 via-rose-900/70 to-fuchsia-950/85 shadow-[0_0_34px_rgba(232,121,249,0.28)]";
    case "all-in":
      return "border border-rose-300/80 bg-gradient-to-r from-rose-950/95 via-red-900/80 to-rose-950/95 shadow-[0_0_42px_rgba(244,63,94,0.34)]";
  }
}

function pressureBadgeClass(tier: BettingPressureTier): string {
  switch (tier) {
    case "bet":
      return "border-amber-300/60 bg-amber-500/20 text-amber-100";
    case "raise":
      return "border-orange-300/70 bg-orange-500/25 text-orange-50";
    case "three-bet":
      return "border-rose-300/75 bg-rose-500/30 text-rose-50";
    case "four-plus-bet":
      return "border-fuchsia-300/80 bg-fuchsia-500/30 text-fuchsia-50";
    case "all-in":
      return "border-rose-200/90 bg-rose-500/40 text-white shadow-[0_0_18px_rgba(251,113,133,0.45)]";
  }
}

export type PlayAreaPotBettingProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
};

/**
 * 팟 + 마지막 베팅 액션 스트립. 공격 액션은 베팅 횟수에 따라 압박 단계를 높인다.
 * 새 핸드(`round_start`) 전까지 유지 — 플랍 오픈 등 비액션 로그는 스트립을 덮지 않음.
 */
export function PlayAreaPotBetting({
  state,
  viewer,
  playerNames,
}: PlayAreaPotBettingProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const snapRef = React.useRef({
    pot: state.pot,
    c0: state.chips[0],
    c1: state.chips[1],
  });
  const [potBumpKey, setPotBumpKey] = React.useState(0);
  const [potAggroKey, setPotAggroKey] = React.useState(0);
  const firstTick = React.useRef(true);

  React.useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false;
      snapRef.current = {
        pot: state.pot,
        c0: state.chips[0]!,
        c1: state.chips[1]!,
      };
      return;
    }
    const prev = snapRef.current;
    const dPot = state.pot - prev.pot;
    const d0 = prev.c0 - state.chips[0]!;
    const d1 = prev.c1 - state.chips[1]!;
    if (dPot > 1e-6 && (d0 > 1e-6 || d1 > 1e-6)) {
      setPotBumpKey((k) => k + 1);
    }
    snapRef.current = {
      pot: state.pot,
      c0: state.chips[0]!,
      c1: state.chips[1]!,
    };
  }, [state.pot, state.chips[0], state.chips[1]]);

  const [strip, setStrip] = React.useState<ActionStripState | null>(null);
  const stripIdRef = React.useRef(0);
  const prevSigRef = React.useRef<string | null>(null);
  const hydrateRef = React.useRef(true);
  const stateRef = React.useRef(state);
  React.useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const logsSig = React.useMemo(() => tailSignature(state.logs), [state.logs]);

  React.useEffect(() => {
    const s = stateRef.current;
    const logs = s.logs;
    const sig = tailSignature(logs);
    if (hydrateRef.current) {
      hydrateRef.current = false;
      prevSigRef.current = sig;
      return;
    }
    if (sig === prevSigRef.current) return;

    const prevL =
      prevSigRef.current != null
        ? Number(prevSigRef.current.split(":")[0])
        : 0;
    const L = logs.length;
    if (L < prevL) {
      prevSigRef.current = sig;
      setStrip(null);
      return;
    }

    prevSigRef.current = sig;
    const last = L > 0 ? logs[L - 1]! : null;
    if (!last) return;

    if (last.t === "round_start") {
      setStrip(null);
      return;
    }

    if (
      last.t !== "preflop_action" &&
      last.t !== "postflop_action" &&
      last.t !== "ia"
    ) {
      return;
    }

    const bb = resolveHandBlinds(s).bb;
    const me = viewer;

    if (last.t === "ia") {
      const isHero = last.player === me;
      const name = playerNames[last.player]!;
      stripIdRef.current += 1;
      if (isHero) playHeroIASound();
      else playBettingIASound();
      setStrip({
        id: stripIdRef.current,
        text: isEn
          ? `${name} · IA (−${chipsAsBbLabel(last.cost, bb)} · from stack)`
          : `${name} · IA (−${chipsAsBbLabel(last.cost, bb)} · 스택에서 차감)`,
        who: isHero ? "hero" : "opp",
        pressure: null,
        specialBadge: "IA",
      });
      return;
    }

    const isHero = last.player === me;
    const name = playerNames[last.player]!;
    const text = formatBettingFlashLine(last, name, bb, isEn);
    if (!text) return;

    const pressure = bettingActionPressure(last, s.betting.raisesThisStreet);

    if (isHero) {
      if (pressure) {
        playHeroRaiseSound(pressure.soundLevel);
      } else if (last.action === "콜") {
        playHeroCallSound();
      } else if (last.action === "체크") {
        playHeroCheckSound();
      }
    } else {
      if (pressure) {
        playBettingRaiseSound(pressure.soundLevel);
        setPotAggroKey((k) => k + 1);
      } else if (last.action === "콜") {
        playBettingCallSound();
      } else if (last.action === "체크") {
        playBettingCheckSound();
      }
    }

    stripIdRef.current += 1;
    setStrip({
      id: stripIdRef.current,
      text,
      who: isHero ? "hero" : "opp",
      pressure,
    });
  }, [logsSig, viewer, playerNames, isEn]);

  const potBbUnit = resolveHandBlinds(state).bb;
  const allInSeats = ([0, 1] as PlayerIndex[]).filter(
    (p) => state.chips[p]! <= 1e-9,
  );
  const liveStreet =
    state.phase === "preflop" ||
    state.phase === "flop" ||
    state.phase === "turn" ||
    state.phase === "river";
  const showAllInUnderPot = state.isAllIn && liveStreet && allInSeats.length > 0;
  const allInText =
    allInSeats.length === 1
      ? `${playerNames[allInSeats[0]!]!} ALL-IN`
      : `${playerNames[allInSeats[0]!]!} / ${playerNames[allInSeats[1]!]!} ALL-IN`;

  const stripBoxClass =
    strip == null
      ? ""
      : strip.pressure
        ? pressureBoxClass(strip.pressure.tier)
        : strip.who === "hero"
          ? strip.specialBadge === "IA"
          ? "border border-emerald-400/50 bg-gradient-to-r from-emerald-950/90 via-emerald-900/65 to-emerald-950/90 shadow-[0_0_18px_rgba(52,211,153,0.2)]"
          : "border border-emerald-600/40 bg-emerald-950/35"
        : strip.specialBadge === "IA"
          ? "border border-amber-400/50 bg-gradient-to-r from-amber-950/85 via-amber-900/70 to-amber-950/85 shadow-[0_0_20px_rgba(251,191,36,0.18)]"
          : "border border-violet-500/40 bg-violet-950/30";

  const stripTextClass =
    strip == null
      ? ""
      : strip.pressure
        ? strip.pressure.tier === "all-in" || strip.pressure.tier === "four-plus-bet"
          ? "text-base text-white sm:text-lg"
          : "text-base text-amber-50 sm:text-lg"
        : strip.who === "hero"
          ? strip.specialBadge === "IA"
          ? "text-base text-emerald-50 sm:text-lg"
          : "text-sm text-emerald-100/95 sm:text-base"
        : strip.specialBadge === "IA"
          ? "text-base text-amber-50 sm:text-lg"
          : "text-sm text-violet-100 sm:text-base";

  const stripAria =
    strip == null
      ? undefined
      : strip.who === "hero"
        ? `내 액션: ${strip.text}`
        : `상대 액션: ${strip.text}`;

  return (
    <div className="rounded-xl border border-amber-900/45 bg-gradient-to-b from-zinc-900/80 to-zinc-800/90 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4 lg:border-amber-800/50">
      <div
        className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5"
        aria-label={
          isEn
            ? `Pot: ${fmtChips(state.pot)} chips = ${potInBbCompact(state.pot, potBbUnit)}`
            : `팟: ${fmtChips(state.pot)}칩 = ${potInBbCompact(state.pot, potBbUnit)}`
        }
      >
        <span className="text-xl font-bold uppercase leading-none tracking-wide text-amber-500/95 lg:text-2xl">
          {isEn ? "POT:  " : "팟:  "}
        </span>
        <span
          key={potBumpKey}
          className="inline-flex items-baseline gap-px font-sans text-xl font-bold leading-none tabular-nums lg:text-2xl"
          style={
            potBumpKey > 0
              ? { animation: "holdem-pot-bump 0.36s ease-out 1" }
              : undefined
          }
        >
          <span
            key={potAggroKey}
            className="text-amber-100"
            style={
              potAggroKey > 0
                ? {
                    animation: "holdem-pot-aggro-color 0.55s ease-out 1",
                  }
                : undefined
            }
          >
            {fmtChips(state.pot)}
          </span>
          <span className="font-sans font-bold text-amber-100/95">
            {isEn ? "chips" : "칩"}
          </span>
        </span>
        <span
          className="select-none text-xl font-bold leading-none text-amber-200/55 lg:text-2xl"
          aria-hidden
        >
          =
        </span>
        <span className="font-sans text-xl font-bold tabular-nums leading-none text-amber-200 lg:text-2xl">
          {potInBbCompact(state.pot, potBbUnit)}
        </span>
      </div>
      {showAllInUnderPot ? (
        <div className="mt-1.5 flex justify-center">
          <span className="rounded-full border border-rose-300/75 bg-rose-900/70 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-rose-50 shadow-[0_0_16px_rgba(244,63,94,0.34)] animate-pulse">
            {allInText}
          </span>
        </div>
      ) : null}

      <div className="mt-3 min-h-[3rem] border-t border-zinc-700/55 pt-3">
        {strip != null ? (
          <div
            key={strip.id}
            className={[
              "rounded-lg px-3 py-2.5 text-center",
              strip.pressure ? "holdem-betting-pressure" : "animate-[holdem-opponent-action-in_0.28s_cubic-bezier(0.22,1,0.36,1)_both]",
              stripBoxClass,
            ].join(" ")}
            style={
              strip.pressure
                ? {
                    animation: `holdem-betting-pressure-in ${strip.pressure.motionMs}ms cubic-bezier(0.22, 1, 0.36, 1) both`,
                  }
                : undefined
            }
            role="status"
            aria-live="polite"
            aria-label={stripAria}
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              {strip.pressure ? (
                <span
                  className={[
                    "holdem-betting-pressure-label rounded-md border px-2 py-0.5 text-xs font-black tracking-[0.12em] sm:text-sm",
                    pressureBadgeClass(strip.pressure.tier),
                  ].join(" ")}
                >
                  {strip.pressure.badge}
                </span>
              ) : strip.specialBadge ? (
                <span className="rounded-md border border-sky-300/60 bg-sky-500/20 px-2 py-0.5 text-xs font-black tracking-[0.12em] text-sky-100 sm:text-sm">
                  {strip.specialBadge}
                </span>
              ) : null}
              <p
                className={[
                  "font-semibold tabular-nums leading-snug",
                  stripTextClass,
                ].join(" ")}
              >
                {strip.text}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex min-h-[2.75rem] items-center justify-center rounded-lg border border-dashed border-zinc-700/50 bg-zinc-900/25 text-[11px] text-zinc-500"
            aria-hidden
          >
            {isEn ? "Betting actions appear here" : "베팅 액션이 여기 표시됩니다"}
          </div>
        )}
      </div>
    </div>
  );
}
