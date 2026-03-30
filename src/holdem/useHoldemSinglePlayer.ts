"use client";

import * as React from "react";
import {
  actionTimerLimitMs,
  actionTimerSignature,
  computeTimeoutAction,
} from "./actionTimer";
import {
  computeAIBettingAction,
  generatePersonality,
  pickAIHandTemplateId,
  shouldAIUseIA,
  type AIPersonality,
  type Difficulty,
} from "./aiPlayer";
import { shouldAIUseIAHardEv } from "./riverEvAi";
import { iaAppliedCostFromPot } from "./bettingHelpers";
import { resolveHandBlinds } from "./blindLevels";
import { SINGLE_PLAYER_AI_THINK_EXTRA_MS } from "./constants";
import { createInitialGameState, holdemReducer } from "./gameReducer";
import type { GameAction, GameState, PlayerIndex } from "./types";

// ─── 훅 반환 타입 ─────────────────────────────────────────────────────────────

export interface HoldemSinglePlayerResult {
  state: GameState;
  dispatch: (a: GameAction) => void;
  act: (a: GameAction) => void;
  actionTimerSecondsLeft: number | null;
  localPaused: boolean;
  toggleLocalPause: () => void;
  difficulty: Difficulty;
  aiSeat: PlayerIndex;
}

// ─── 훅 ──────────────────────────────────────────────────────────────────────

export function useHoldemSinglePlayer({
  difficulty,
  aiSeat = 1,
}: {
  difficulty: Difficulty;
  aiSeat?: PlayerIndex;
}): HoldemSinglePlayerResult {
  const humanSeat = (1 - aiSeat) as PlayerIndex;

  // ── 게임 상태 ──────────────────────────────────────────────────────────────
  const [state, dispatch] = React.useReducer(
    (s: GameState, a: GameAction) => holdemReducer(s, a),
    undefined,
    createInitialGameState,
  );
  const [localPaused, setLocalPaused] = React.useState(false);

  // 최신 상태를 항상 참조할 수 있도록 ref 유지
  const stateRef = React.useRef(state);
  React.useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchRef = React.useRef(dispatch);
  React.useLayoutEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // ── AI 성향 (라운드마다 칩 비율에 따라 재생성) ─────────────────────────────
  const [personality, setPersonality] = React.useState<AIPersonality>(() =>
    generatePersonality(difficulty, [50, 50], aiSeat),
  );

  const personalityRef = React.useRef(personality);
  React.useLayoutEffect(() => {
    personalityRef.current = personality;
  }, [personality]);

  React.useEffect(() => {
    // 새 핸드 시작 시 성향 갱신 (칩 차이 반영)
    if (state.phase === "hand_select") {
      setPersonality(generatePersonality(difficulty, state.chips, aiSeat));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roundNumber]);

  // ── 액션 타이머 (human 차례용) ─────────────────────────────────────────────
  const [actionTimerLeft, setActionTimerLeft] = React.useState<number | null>(null);

  const timerSig = actionTimerSignature(state);
  const limitMs = actionTimerLimitMs(state) ?? 0;

  React.useEffect(() => {
    // AI 차례이거나 일시정지 중이면 타이머 표시 안 함
    const isAITurn = state.toAct === aiSeat;
    if (timerSig == null || localPaused || isAITurn) {
      setActionTimerLeft(null);
      return;
    }

    const sigAtStart = timerSig;
    const started = Date.now();

    const tick = () => {
      const left = Math.max(0, Math.ceil((started + limitMs - Date.now()) / 1000));
      setActionTimerLeft(left);
    };
    tick();
    const iv = window.setInterval(tick, 250);

    const to = window.setTimeout(() => {
      const cur = stateRef.current;
      if (actionTimerSignature(cur) !== sigAtStart) return;
      const a = computeTimeoutAction(cur);
      if (a != null) dispatchRef.current(a);
    }, limitMs);

    return () => {
      window.clearTimeout(to);
      window.clearInterval(iv);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerSig, limitMs, localPaused, state.toAct]);

  // ── AI 핸드 선택 ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (state.phase !== "hand_select") return;
    if (state.handSelectPhase === "done") return;
    if (state.handPickPending[aiSeat] != null) return; // 이미 선택함

    // 0.8 ~ 2.2 초 + 추가 생각 시간 후 핸드 선택
    const delay =
      SINGLE_PLAYER_AI_THINK_EXTRA_MS + 800 + Math.random() * 1400;
    const timer = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur.phase !== "hand_select") return;
      if (cur.handPickPending[aiSeat] != null) return;

      const templateId = pickAIHandTemplateId(cur, aiSeat, difficulty);
      if (templateId) {
        dispatchRef.current({ type: "SELECT_HAND", player: aiSeat, templateId });
      }
    }, delay);

    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.phase,
    state.handSelectPhase,
    state.roundNumber,
    // handPickPending 변경 시 재평가 (AI가 이미 선택했는지 확인)
    state.handPickPending[aiSeat],
  ]);

  // ── AI 베팅 액션 ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (state.toAct !== aiSeat) return;
    if (
      state.phase !== "preflop" &&
      state.phase !== "flop" &&
      state.phase !== "turn" &&
      state.phase !== "river"
    ) return;
    if (localPaused) return;

    // 0.6 ~ 1.6 초 + 추가 생각 시간 후 AI 액션
    const delay =
      SINGLE_PLAYER_AI_THINK_EXTRA_MS + 600 + Math.random() * 1000;
    const timer = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur.toAct !== aiSeat) return;

      // 리버에서 IA 사용 여부 먼저 결정
      const bb = resolveHandBlinds(cur).bb;
      const iaCost = iaAppliedCostFromPot(cur.pot, bb);
      const canIA =
        cur.phase === "river" &&
        !cur.iaUsed[aiSeat] &&
        iaCost > 1e-9 &&
        cur.pot > 0 &&
        !cur.isAllIn;

      if (canIA) {
        const useIa =
          difficulty === "hard"
            ? shouldAIUseIAHardEv(cur, aiSeat)
            : shouldAIUseIA(cur, aiSeat, personalityRef.current, difficulty);
        if (useIa) {
          dispatchRef.current({ type: "USE_IA" });
          return;
        }
      }

      // 베팅 결정
      const action = computeAIBettingAction(cur, aiSeat, difficulty, personalityRef.current);
      if (action) {
        dispatchRef.current(action);
      } else {
        // 안전 폴백
        const fallback = computeTimeoutAction(cur);
        if (fallback) dispatchRef.current(fallback);
      }
    }, delay);

    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.toAct,
    state.phase,
    state.preflopStage,
    state.betting.contributed[0],
    state.betting.contributed[1],
    state.iaUsed[aiSeat],
    state.iaReveal[aiSeat],
    localPaused,
  ]);

  const toggleLocalPause = React.useCallback(() => setLocalPaused((v) => !v), []);

  return {
    state,
    dispatch,
    act: (a: GameAction) => dispatch(a),
    actionTimerSecondsLeft: actionTimerLeft,
    localPaused,
    toggleLocalPause,
    difficulty,
    aiSeat,
  };
}
