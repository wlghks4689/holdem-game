"use client";

import * as React from "react";
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

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

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
): string {
  const amt = m.amount;
  if (m.action === "체크(자동)") return "";
  if (m.action === "체크") return `${name} · 체크`;
  if (m.action === "콜") {
    const tail =
      amt != null ? `${FLASH_ARROW}${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · 콜${tail}`;
  }
  if (m.action === "올인 콜") {
    const tail =
      amt != null ? `${FLASH_ARROW}${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · 올인 콜${tail}`;
  }
  if (m.action === "레이즈") {
    const tail =
      amt != null ? `${FLASH_ARROW}총 ${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · 레이즈${tail}`;
  }
  if (m.action === "베트") {
    const tail =
      amt != null ? `${FLASH_ARROW}${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · 베팅${tail}`;
  }
  if (m.action === "올인") {
    const tail =
      amt != null ? `${FLASH_ARROW}총 ${chipsAsBbLabel(amt, bbUnit)}` : "";
    return `${name} · 올인${tail}`;
  }
  return `${name} · ${m.action}`;
}

function isAggressiveAction(
  action: string,
): action is "레이즈" | "베트" | "올인" | "올인 콜" {
  return (
    action === "레이즈" ||
    action === "베트" ||
    action === "올인" ||
    action === "올인 콜"
  );
}

type ActionStripState = {
  id: number;
  text: string;
  who: "hero" | "opp";
  agg: boolean;
};

export type PlayAreaPotBettingProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
};

/**
 * 팟 + 마지막 베팅 액션 스트립(내 액션=에메랄드 / 상대=바이올렛·앰버).
 * 새 핸드(`round_start`) 전까지 유지 — 플랍 오픈 등 비액션 로그는 스트립을 덮지 않음.
 */
export function PlayAreaPotBetting({
  state,
  viewer,
  playerNames,
}: PlayAreaPotBettingProps) {
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
    const opp = other(viewer);

    if (last.t === "ia") {
      const isHero = last.player === me;
      const name = playerNames[last.player]!;
      stripIdRef.current += 1;
      if (isHero) playHeroIASound();
      else playBettingIASound();
      setStrip({
        id: stripIdRef.current,
        text: `${name} · IA (−${chipsAsBbLabel(last.cost, bb)} · 팟에서 차감)`,
        who: isHero ? "hero" : "opp",
        agg: true,
      });
      return;
    }

    const isHero = last.player === me;
    const name = playerNames[last.player]!;
    const text = formatBettingFlashLine(last, name, bb);
    if (!text) return;

    const agg = isAggressiveAction(last.action);

    if (isHero) {
      if (agg) {
        playHeroRaiseSound();
      } else if (last.action === "콜") {
        playHeroCallSound();
      } else if (last.action === "체크") {
        playHeroCheckSound();
      }
    } else {
      if (agg) {
        playBettingRaiseSound();
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
      agg,
    });
  }, [logsSig, viewer, playerNames]);

  const potBbUnit = resolveHandBlinds(state).bb;

  const stripBoxClass =
    strip == null
      ? ""
      : strip.who === "hero"
        ? strip.agg
          ? "border border-emerald-400/50 bg-gradient-to-r from-emerald-950/90 via-emerald-900/65 to-emerald-950/90 shadow-[0_0_18px_rgba(52,211,153,0.2)]"
          : "border border-emerald-600/40 bg-emerald-950/35"
        : strip.agg
          ? "border border-amber-400/50 bg-gradient-to-r from-amber-950/85 via-amber-900/70 to-amber-950/85 shadow-[0_0_20px_rgba(251,191,36,0.18)]"
          : "border border-violet-500/40 bg-violet-950/30";

  const stripTextClass =
    strip == null
      ? ""
      : strip.who === "hero"
        ? strip.agg
          ? "text-base text-emerald-50 sm:text-lg"
          : "text-sm text-emerald-100/95 sm:text-base"
        : strip.agg
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
        aria-label={`팟: ${fmtChips(state.pot)}칩 = ${potInBbCompact(state.pot, potBbUnit)}`}
      >
        <span className="text-xl font-bold uppercase leading-none tracking-wide text-amber-500/95 lg:text-2xl">
          팟{":  "}
        </span>
        <span
          key={potBumpKey}
          className="inline-flex items-baseline gap-px text-xl font-bold leading-none lg:text-2xl"
          style={
            potBumpKey > 0
              ? { animation: "holdem-pot-bump 0.36s ease-out 1" }
              : undefined
          }
        >
          <span
            key={potAggroKey}
            className="font-mono tabular-nums text-amber-100"
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
          <span className="font-sans font-bold text-amber-100/95">칩</span>
        </span>
        <span
          className="select-none text-xl font-bold leading-none text-amber-200/55 lg:text-2xl"
          aria-hidden
        >
          =
        </span>
        <span className="font-mono text-xl font-bold tabular-nums leading-none text-amber-200 lg:text-2xl">
          {potInBbCompact(state.pot, potBbUnit)}
        </span>
      </div>

      <div className="mt-3 min-h-[3rem] border-t border-zinc-700/55 pt-3">
        {strip != null ? (
          <div
            key={strip.id}
            className={[
              "rounded-lg px-3 py-2.5 text-center",
              "animate-[holdem-opponent-action-in_0.28s_cubic-bezier(0.22,1,0.36,1)_both]",
              stripBoxClass,
            ].join(" ")}
            role="status"
            aria-live="polite"
            aria-label={stripAria}
          >
            <p
              className={[
                "font-semibold tabular-nums leading-snug",
                stripTextClass,
              ].join(" ")}
            >
              {strip.text}
            </p>
          </div>
        ) : (
          <div
            className="flex min-h-[2.75rem] items-center justify-center rounded-lg border border-dashed border-zinc-700/50 bg-zinc-900/25 text-[11px] text-zinc-500"
            aria-hidden
          >
            베팅 액션이 여기 표시됩니다
          </div>
        )}
      </div>
    </div>
  );
}
