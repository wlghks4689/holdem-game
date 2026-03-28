'use client';

import {
  ACTION_TIMER_SECONDS,
  HAND_SELECT_TIMER_SECONDS,
} from "@/holdem/constants";
import { headsUpPositionLabel } from "@/holdem/headsUpLabels";
import type { GameState, PlayerIndex } from "@/holdem/types";

function blindHint(state: GameState, p: PlayerIndex): string {
  return headsUpPositionLabel(state, p);
}

export type TurnBannerProps = {
  state: GameState;
  playerNames: [string, string];
  /** null이면 타이머 미표시(핸드 선택·결과 등) */
  actionTimerSecondsLeft?: number | null;
};

/** 라이브 플레이 중 누가 행동해야 하는지 강조 */
export function TurnBanner({
  state,
  playerNames,
  actionTimerSecondsLeft = null,
}: TurnBannerProps) {
  if (state.matchWinner != null || state.toAct == null) return null;

  const p = state.toAct as PlayerIndex;
  const name = playerNames[p] ?? `플레이어 ${p + 1}`;
  const phase = state.phase;
  const live =
    phase === "hand_select" ||
    phase === "preflop" ||
    phase === "flop" ||
    phase === "turn" ||
    phase === "river";

  if (!live) return null;

  const sub =
    phase === "hand_select"
      ? "핸드 선택"
      : phase === "preflop" && state.preflopStage === "button_acts"
        ? "프리플랍 · 딜러·SB 액션"
        : phase === "preflop" && state.preflopStage === "bb_option"
          ? "프리플랍 · BB 옵션"
          : phase === "preflop"
            ? "프리플랍"
            : `${phase}`;

  return (
    <div className="rounded-xl border border-emerald-500/45 bg-gradient-to-r from-emerald-900/50 via-zinc-800/85 to-emerald-900/50 px-4 py-3 shadow-[0_0_28px_rgba(16,185,129,0.14)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xl leading-tight sm:text-2xl" aria-hidden>
            👉
          </span>
          <span className="text-lg font-bold tracking-tight text-emerald-100 sm:text-xl">
            {name} 행동 중
          </span>
          <span className="rounded-md bg-zinc-700/90 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
            {blindHint(state, p)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 sm:items-end">
          <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-200/70">
            {sub}
          </div>
          {actionTimerSecondsLeft != null ? (
            <div
              className={[
                "rounded-md px-2 py-0.5 font-mono text-xs font-bold tabular-nums",
                actionTimerSecondsLeft <= 10
                  ? "bg-rose-900/55 text-rose-100 ring-1 ring-rose-500/45"
                  : "bg-zinc-700/95 text-amber-50",
              ].join(" ")}
              title={
                state.phase === "hand_select"
                  ? `${HAND_SELECT_TIMER_SECONDS}초 안에 선택이 없으면 풀에서 가능한 첫 핸드로 자동 제출됩니다.`
                  : `${ACTION_TIMER_SECONDS}초 안에 액션이 없으면 자동 체크(맞출 베팅이 없을 때) 또는 폴드됩니다.`
              }
            >
              남은 시간 {actionTimerSecondsLeft}s
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
