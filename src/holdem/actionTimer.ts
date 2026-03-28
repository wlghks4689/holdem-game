import {
  ACTION_TIMER_SECONDS,
  HAND_SELECT_TIMER_SECONDS,
} from "./constants";
import { facingFor } from "./bettingHelpers";
import { ALL_HAND_TEMPLATES, normalizeHandPoolRemaining } from "./handPool";
import type { GameAction, GameState, PlayerIndex } from "./types";

export { ACTION_TIMER_SECONDS, HAND_SELECT_TIMER_SECONDS };

/** 아직 미확정인 좌석부터 자동 제출 (0 → 1 순) */
function buildAutoSelectHand(state: GameState): GameAction | null {
  if (state.handSelectPhase === "done") return null;
  const pools = normalizeHandPoolRemaining(state.handPoolRemaining as unknown);
  for (const player of [0, 1] as const) {
    if (state.handPickPending[player] != null) continue;
    const poolForActor = pools[player] ?? {};
    const canPick = (tid: string): boolean => (poolForActor[tid] ?? 0) > 0;
    for (const tpl of ALL_HAND_TEMPLATES) {
      if (!canPick(tpl.id)) continue;
      return { type: "SELECT_HAND", player, templateId: tpl.id };
    }
  }
  return null;
}

/**
 * 같은 값이면 동일 "액션 창" — 타이머 리셋 없음.
 * 팟·칩·IA·핸드 선택 진행 변경 시 새 제한 시간.
 */
export function actionTimerSignature(state: GameState): string | null {
  if (state.matchWinner != null) return null;
  if (state.phase === "showdown" || state.phase === "hand_over") return null;

  if (state.phase === "hand_select" && state.handSelectPhase !== "done") {
    return JSON.stringify({
      kind: "hand_select",
      round: state.roundNumber,
      button: state.button,
      p0: state.handPickPending[0]?.templateId ?? null,
      p1: state.handPickPending[1]?.templateId ?? null,
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
    pot: state.pot,
    chip0: state.chips[0],
    chip1: state.chips[1],
    ia0: state.iaUsed[0],
    ia1: state.iaUsed[1],
  });
}

/** 현재 상태의 액션 타이머 길이(ms). 타이머 없으면 null */
export function actionTimerLimitMs(state: GameState): number | null {
  if (actionTimerSignature(state) == null) return null;
  if (state.phase === "hand_select" && state.handSelectPhase !== "done") {
    return HAND_SELECT_TIMER_SECONDS * 1000;
  }
  return ACTION_TIMER_SECONDS * 1000;
}

/** 초과 시 디스패치할 액션 (핸드 자동 선택 / 체크 / 폴드) */
export function computeTimeoutAction(state: GameState): GameAction | null {
  if (state.matchWinner != null) return null;
  if (state.phase === "showdown" || state.phase === "hand_over") return null;

  if (state.phase === "hand_select" && state.handSelectPhase !== "done") {
    return buildAutoSelectHand(state);
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
      return { type: "PREFLOP_CALL" };
    }
    return null;
  }

  if (state.phase === "flop" || state.phase === "turn" || state.phase === "river") {
    if (facing === 0) {
      return { type: "POSTFLOP_CHECK" };
    }
    return { type: "POSTFLOP_CALL" };
  }

  return null;
}
