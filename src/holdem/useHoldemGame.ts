'use client';

import * as React from "react";
import {
  actionTimerLimitMs,
  actionTimerSignature,
  computeTimeoutAction,
} from "./actionTimer";
import { createInitialGameState, holdemReducer } from "./gameReducer";
import type { GameAction, GameState, HoldemGameMode } from "./types";

export function useHoldemGame(gameMode: HoldemGameMode = "classic") {
  const [state, dispatch] = React.useReducer(
    (s: GameState, a: GameAction) => holdemReducer(s, a),
    gameMode,
    createInitialGameState,
  );

  const [localPaused, setLocalPaused] = React.useState(false);

  const stateRef = React.useRef(state);
  React.useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  // dispatch는 useReducer에서 오므로 항상 안정적이지만, 패턴 통일을 위해 ref 사용
  const dispatchRef = React.useRef(dispatch);
  React.useLayoutEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  const [actionTimerLeft, setActionTimerLeft] = React.useState<number | null>(
    null,
  );

  const timerSig = actionTimerSignature(state);
  const limitMs = actionTimerLimitMs(state) ?? 0;

  React.useEffect(() => {
    if (timerSig == null || localPaused) {
      setActionTimerLeft(null);
      return;
    }

    const sigAtStart = timerSig;
    const started = Date.now();

    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((started + limitMs - Date.now()) / 1000),
      );
      setActionTimerLeft(left);
    };
    tick();
    const iv = window.setInterval(tick, 250);

    const to = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur == null) return;
      if (actionTimerSignature(cur) !== sigAtStart) return;
      const a = computeTimeoutAction(cur);
      if (a != null) dispatchRef.current(a);
    }, limitMs);

    return () => {
      window.clearTimeout(to);
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerSig, limitMs, localPaused]);

  const toggleLocalPause = React.useCallback(() => {
    setLocalPaused((v) => !v);
  }, []);

  return {
    state,
    dispatch,
    act: (a: GameAction) => dispatch(a),
    actionTimerSecondsLeft: actionTimerLeft,
    localPaused,
    toggleLocalPause,
  };
}
