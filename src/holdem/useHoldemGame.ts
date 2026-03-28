'use client';

import * as React from "react";
import {
  actionTimerLimitMs,
  actionTimerSignature,
  computeTimeoutAction,
} from "./actionTimer";
import { createInitialGameState, holdemReducer } from "./gameReducer";
import type { GameAction, GameState } from "./types";

export function useHoldemGame() {
  const [state, dispatch] = React.useReducer(
    (s: GameState, a: GameAction) => holdemReducer(s, a),
    undefined,
    createInitialGameState,
  );

  const [localPaused, setLocalPaused] = React.useState(false);

  const stateRef = React.useRef(state);
  React.useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

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
      if (a != null) dispatch(a);
    }, limitMs);

    return () => {
      window.clearTimeout(to);
      window.clearInterval(iv);
    };
  }, [timerSig, limitMs, dispatch, localPaused]);

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
