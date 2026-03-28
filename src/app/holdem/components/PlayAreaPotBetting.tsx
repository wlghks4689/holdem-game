"use client";

import * as React from "react";
import {
  effectiveCallPay,
  facingFor,
} from "@/holdem/bettingHelpers";
import { resolveHandBlinds } from "@/holdem/blindLevels";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import type { GameState, PlayerIndex } from "@/holdem/types";

function fmtChips(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(1);
}

/** 팟을 BB로 — 정수면 소수 없음, 아니면 최대 소수 1자리(끝 .0 제거) */
function potInBbCompact(pot: number, bbUnit: number): string {
  if (bbUnit < 1e-9) return "—";
  const bb = pot / bbUnit;
  if (Math.abs(bb - Math.round(bb)) < 1e-6) return `${Math.round(bb)}BB`;
  return `${bb.toFixed(1).replace(/\.0$/, "")}BB`;
}

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

export type PlayAreaPotBettingProps = {
  state: GameState;
  viewer: PlayerIndex;
};

function EmBb({ n }: { n: string }) {
  return (
    <span className="font-bold tabular-nums text-amber-200">{n}</span>
  );
}

/**
 * 뷰어(히어로) 기준 상대 액션 설명 + 내 콜/올인 안내.
 * `toAct === viewer`일 때만 상세 규칙 적용.
 */
function opponentActionNarrative(
  state: GameState,
  viewer: PlayerIndex,
): { primary: React.ReactNode; secondary: React.ReactNode } {
  const bbUnit = resolveHandBlinds(state).bb;
  const dead =
    state.matchWinner != null ||
    state.phase === "showdown" ||
    state.phase === "hand_over" ||
    state.phase === "hand_select";

  if (dead) {
    return {
      primary: <span className="text-zinc-500">—</span>,
      secondary: null,
    };
  }

  if (state.toAct !== viewer) {
    return {
      primary: (
        <span className="text-zinc-300">
          지금은 <span className="font-semibold text-zinc-100">상대 차례</span>
          입니다.
        </span>
      ),
      secondary: (
        <span className="text-zinc-500">상대 액션을 기다리세요.</span>
      ),
    };
  }

  const opp = other(viewer);
  const facing = facingFor(viewer, state.betting);
  const oppContrib = state.betting.contributed[opp]!;
  const oppStack = state.chips[opp]!;
  const myStack = state.chips[viewer]!;
  const pay = effectiveCallPay(viewer, state);
  const oppAllIn = oppStack <= 1e-9;
  const callIsMyAllIn = facing > 1e-9 && pay > 1e-9 && Math.abs(pay - myStack) < 1e-6;

  const zeroCall = (
    <>
      콜해야 하는 금액 <EmBb n="0" />
    </>
  );

  /** 콜 액 표시 (항상 실제 지불 가능액) */
  const callLineNormal = (
    <>
      콜해야 하는 금액 <EmBb n={chipsAsBbLabel(pay, bbUnit)} />
    </>
  );

  const callLineAllIn = (
    <>
      콜하면 올인 (내 칩 <EmBb n={chipsAsBbLabel(pay, bbUnit)} />)
    </>
  );

  const line2 =
    facing <= 1e-9
      ? zeroCall
      : callIsMyAllIn
        ? callLineAllIn
        : callLineNormal;

  // --- 프리플랍 ---
  if (state.phase === "preflop" && state.preflopStage != null) {
    if (state.preflopStage === "button_acts" && facing > 1e-9) {
      return {
        primary: (
          <>
            콜 — 플랫{" "}
            <EmBb n={chipsAsBbLabel(facing, bbUnit)} />
          </>
        ),
        secondary: callLineNormal,
      };
    }
    if (state.preflopStage === "bb_option" && facing <= 1e-9) {
      return {
        primary: <span className="text-zinc-200">상대 콜로 맞춤</span>,
        secondary: zeroCall,
      };
    }
    if (state.preflopStage === "facing_raise" && facing > 1e-9) {
      const line1 = oppAllIn ? (
        <>
          상대 올인 <EmBb n={chipsAsBbLabel(oppContrib, bbUnit)} />
        </>
      ) : state.preflopRaiseCount >= 2 ? (
        <>
          상대 레이즈 <EmBb n={chipsAsBbLabel(oppContrib, bbUnit)} />
        </>
      ) : (
        <>
          상대 베팅 <EmBb n={chipsAsBbLabel(oppContrib, bbUnit)} />
        </>
      );
      return {
        primary: line1,
        secondary: line2,
      };
    }
  }

  // --- 포스트플랍 ---
  if (
    state.phase === "flop" ||
    state.phase === "turn" ||
    state.phase === "river"
  ) {
    if (facing <= 1e-9) {
      if (state.betting.checksThisStreet >= 1) {
        return {
          primary: <span className="text-zinc-200">상대 체크</span>,
          secondary: zeroCall,
        };
      }
      return {
        primary: (
          <span className="text-zinc-200">아직 베팅이 없습니다</span>
        ),
        secondary: zeroCall,
      };
    }

    const isFirstAggression = !state.betting.raiseDone;
    const line1 = oppAllIn ? (
      <>
        상대 올인 <EmBb n={chipsAsBbLabel(oppContrib, bbUnit)} />
      </>
    ) : isFirstAggression ? (
      <>
        상대 베팅 <EmBb n={chipsAsBbLabel(oppContrib, bbUnit)} />
      </>
    ) : (
      <>
        상대 레이즈 <EmBb n={chipsAsBbLabel(oppContrib, bbUnit)} />
      </>
    );
    return {
      primary: line1,
      secondary: line2,
    };
  }

  return {
    primary: <span className="text-zinc-400">진행 중</span>,
    secondary: line2,
  };
}

/**
 * 핵심 플레이 영역: 팟 + 상대 액션 기반 설명문
 */
export function PlayAreaPotBetting({ state, viewer }: PlayAreaPotBettingProps) {
  const snapRef = React.useRef({
    pot: state.pot,
    c0: state.chips[0],
    c1: state.chips[1],
  });
  const [potBumpKey, setPotBumpKey] = React.useState(0);
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

  const { primary, secondary } = opponentActionNarrative(state, viewer);
  const potBbUnit = resolveHandBlinds(state).bb;

  return (
    <div className="rounded-xl border border-amber-900/45 bg-gradient-to-b from-zinc-900/80 to-zinc-800/90 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:border-amber-800/50 lg:py-4">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 lg:items-center lg:justify-center lg:gap-10">
        <div className="text-center sm:text-left lg:text-center">
          <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5 sm:justify-start lg:justify-center">
            <span className="text-2xl font-bold uppercase leading-none tracking-wide text-amber-500/95 lg:text-3xl">
              팟
            </span>
            <span
              key={potBumpKey}
              className="font-mono text-2xl font-bold tabular-nums leading-none text-amber-100 lg:text-3xl"
              style={
                potBumpKey > 0
                  ? { animation: "holdem-pot-bump 0.36s ease-out 1" }
                  : undefined
              }
            >
              {fmtChips(state.pot)}
            </span>
            <span
              className="select-none text-2xl font-bold leading-none text-amber-200/55 lg:text-3xl"
              aria-hidden
            >
              =
            </span>
            <span className="font-mono text-2xl font-bold tabular-nums leading-none text-amber-200 lg:text-3xl">
              {potInBbCompact(state.pot, potBbUnit)}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left lg:max-w-md lg:text-center">
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            상대 액션
          </div>
          <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-100">
            {primary}
          </p>
          {secondary ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-300">{secondary}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
