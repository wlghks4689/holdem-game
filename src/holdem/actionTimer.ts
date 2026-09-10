import {
  ACTION_TIMER_SECONDS,
  HAND_SELECT_TIMER_SECONDS,
  IA_RIVER_ACTION_EXTRA_SECONDS,
} from "./constants";
import { facingFor } from "./bettingHelpers";
import {
  canSelectHandTemplate,
  canUseMysteryHand,
  getHandTemplatesForMode,
  shouldForceRandomHand,
} from "./handPool";
import type { GameAction, GameState } from "./types";

export { ACTION_TIMER_SECONDS, HAND_SELECT_TIMER_SECONDS };

export type ActionTimerWindow = {
  signature: string;
  deadlineMs: number;
  limitMs: number;
  pausedRemainingMs: number | null;
};

/** 동일 액션 창의 마감 시각을 유지하고, 제한 시간 증감·일시정지를 반영한다. */
export function reconcileActionTimerWindow(
  current: ActionTimerWindow | null,
  signature: string | null,
  limitMs: number,
  paused: boolean,
  nowMs: number,
): ActionTimerWindow | null {
  if (signature == null) return null;

  const next = current == null || current.signature !== signature
    ? {
        signature,
        deadlineMs: nowMs + limitMs,
        limitMs,
        pausedRemainingMs: null,
      }
    : { ...current };

  if (next.limitMs !== limitMs) {
    const delta = limitMs - next.limitMs;
    next.limitMs = limitMs;
    if (next.pausedRemainingMs != null) {
      next.pausedRemainingMs = Math.max(0, next.pausedRemainingMs + delta);
    } else {
      next.deadlineMs += delta;
    }
  }

  if (paused) {
    if (next.pausedRemainingMs == null) {
      next.pausedRemainingMs = Math.max(0, next.deadlineMs - nowMs);
    }
  } else if (next.pausedRemainingMs != null) {
    next.deadlineMs = nowMs + next.pausedRemainingMs;
    next.pausedRemainingMs = null;
  }
  return next;
}

/** Fisher-Yates shuffle (in-place) */
function shuffled<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 아직 미확정인 좌석부터 자동 제출 (0 → 1 순) — 선택 가능한 전체 풀에서 무작위 */
function buildAutoSelectHand(
  state: GameState,
  playerOnly?: 0 | 1,
): GameAction | null {
  if (state.handSelectPhase === "done") return null;
  const players = playerOnly == null ? [0, 1] as const : [playerOnly] as const;
  for (const player of players) {
    if (state.handPickPending[player] != null) continue;
    if (shouldForceRandomHand(state, player)) {
      return { type: "SELECT_FORCED_RANDOM", player };
    }
    const available = getHandTemplatesForMode(state.gameMode).filter((tpl) =>
      canSelectHandTemplate(state, player, tpl),
    );
    if (available.length === 0 && canUseMysteryHand(state, player)) {
      return { type: "SELECT_MYSTERY_HAND", player };
    }
    if (available.length === 0) continue;
    const pick = shuffled(available)[0]!;
    return { type: "SELECT_HAND", player, templateId: pick.id };
  }
  return null;
}

function pendingHandChoiceKey(state: GameState, player: 0 | 1): string | null {
  const pending = state.handPickPending[player];
  if (pending == null) return null;
  return pending.kind === "selected"
    ? `${pending.kind}:${pending.templateId}`
    : pending.kind;
}

/**
 * 같은 값이면 동일 "액션 창" — 타이머 리셋 없음.
 * 실제 액션 순서가 바뀔 때만 새 제한 시간을 시작한다.
 */
export function actionTimerSignature(state: GameState): string | null {
  if (state.matchEnded) return null;
  if (state.phase === "showdown" || state.phase === "hand_over") return null;

  if (state.phase === "hand_select" && state.handSelectPhase !== "done") {
    // p0/p1 는 의도적으로 제외: 핸드 선택·변경이 타이머를 리셋해선 안 됨.
    // 라운드·버튼이 바뀌는 시점(새 핸드 시작)에만 타이머를 새로 시작한다.
    return JSON.stringify({
      kind: "hand_select",
      round: state.roundNumber,
      button: state.button,
    });
  }

  if (state.toAct == null) return null;
  return JSON.stringify({
    kind: "street",
    phase: state.phase,
    toAct: state.toAct,
    round: state.roundNumber,
    c0: state.betting.contributed[0],
    c1: state.betting.contributed[1],
    pref: state.preflopStage,
    rd: state.betting.raiseDone,
    chk: state.betting.checksThisStreet,
  });
}

/** 같은 액션 창 안에서 타임아웃 처리에 영향을 주는 진행 상태. */
export function actionTimerProgressKey(state: GameState): string | null {
  const signature = actionTimerSignature(state);
  if (signature == null) return null;
  if (state.phase !== "hand_select") return signature;
  return JSON.stringify({
    signature,
    pending0: pendingHandChoiceKey(state, 0),
    pending1: pendingHandChoiceKey(state, 1),
  });
}

/** 현재 상태의 액션 타이머 길이(ms). 타이머 없으면 null */
export function actionTimerLimitMs(state: GameState): number | null {
  if (actionTimerSignature(state) == null) return null;
  if (state.phase === "hand_select" && state.handSelectPhase !== "done") {
    return HAND_SELECT_TIMER_SECONDS * 1000;
  }
  const base = ACTION_TIMER_SECONDS * 1000;
  if (
    state.phase === "river" &&
    state.toAct != null &&
    state.iaUsed[state.toAct]
  ) {
    return base + IA_RIVER_ACTION_EXTRA_SECONDS * 1000;
  }
  return base;
}

/** 초과 시 디스패치할 액션 (핸드 자동 선택 / 체크 / 폴드) */
export function computeTimeoutAction(
  state: GameState,
  handSelectPlayer?: 0 | 1,
): GameAction | null {
  if (state.matchEnded) return null;
  if (state.phase === "showdown" || state.phase === "hand_over") return null;

  if (state.phase === "hand_select" && state.handSelectPhase !== "done") {
    return buildAutoSelectHand(state, handSelectPlayer);
  }

  if (state.toAct == null) return null;

  const p = state.toAct;
  const facing = facingFor(p, state.betting);

  if (state.phase === "preflop") {
    const st = state.preflopStage;
    if (st == null) return null;
    if (st === "bb_option" && facing === 0) {
      return { type: "PREFLOP_CHECK" };
    }
    if (facing > 0) {
      // button_acts is the only preflop branch where fold is disallowed.
      return st === "button_acts" ? { type: "PREFLOP_CALL" } : { type: "FOLD" };
    }
    return null;
  }

  if (state.phase === "flop" || state.phase === "turn" || state.phase === "river") {
    if (facing === 0) {
      return { type: "POSTFLOP_CHECK" };
    }
    return { type: "FOLD" };
  }

  return null;
}
