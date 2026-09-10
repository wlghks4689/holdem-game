"use client";

import * as React from "react";
import {
  actionTimerLimitMs,
  actionTimerProgressKey,
  actionTimerSignature,
  computeTimeoutAction,
  reconcileActionTimerWindow,
  type ActionTimerWindow,
} from "./actionTimer";
import type { GameAction, GameState, PlayerIndex } from "./types";

/**
 * 액션 창의 절대 마감 시각을 유지한다.
 * 같은 창의 상태 갱신은 시간을 초기화하지 않고, IA는 증가한 제한 시간만 더한다.
 */
export function useActionTimer({
  state,
  paused,
  enabled = true,
  dispatch,
  handSelectPlayer,
}: {
  state: GameState | null;
  paused: boolean;
  enabled?: boolean;
  dispatch: (action: GameAction) => void | Promise<void>;
  handSelectPlayer?: PlayerIndex;
}): number | null {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const stateRef = React.useRef<GameState | null>(state);
  const dispatchRef = React.useRef(dispatch);
  const pausedRef = React.useRef(paused);
  const enabledRef = React.useRef(enabled);
  const handSelectPlayerRef = React.useRef(handSelectPlayer);
  const windowRef = React.useRef<ActionTimerWindow | null>(null);
  const lastTimeoutProgressRef = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    stateRef.current = state;
    dispatchRef.current = dispatch;
    pausedRef.current = paused;
    enabledRef.current = enabled;
    handSelectPlayerRef.current = handSelectPlayer;
  }, [dispatch, enabled, handSelectPlayer, paused, state]);

  const signature = state == null ? null : actionTimerSignature(state);
  const progressKey = state == null ? null : actionTimerProgressKey(state);
  const limitMs = state == null ? 0 : actionTimerLimitMs(state) ?? 0;

  React.useEffect(() => {
    const now = Date.now();
    if (signature == null) {
      windowRef.current = null;
      lastTimeoutProgressRef.current = null;
      return;
    }

    const previousSignature = windowRef.current?.signature ?? null;
    const timerWindow = reconcileActionTimerWindow(
      windowRef.current,
      signature,
      limitMs,
      paused || !enabled,
      now,
    )!;
    windowRef.current = timerWindow;
    if (previousSignature !== signature) {
      lastTimeoutProgressRef.current = null;
    }

    if (paused || !enabled) {
      return;
    }

    const tick = () => {
      const active = windowRef.current;
      if (active == null || active.signature !== signature) return;
      setSecondsLeft(Math.max(0, Math.ceil((active.deadlineMs - Date.now()) / 1000)));
    };

    const fireTimeout = () => {
      const current = stateRef.current;
      if (current == null) return;
      const currentProgress = actionTimerProgressKey(current);
      if (
        pausedRef.current ||
        !enabledRef.current ||
        actionTimerSignature(current) !== signature ||
        currentProgress == null ||
        lastTimeoutProgressRef.current === currentProgress
      ) {
        return;
      }
      lastTimeoutProgressRef.current = currentProgress;
      const action = computeTimeoutAction(current, handSelectPlayerRef.current);
      if (action != null) void dispatchRef.current(action);
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    const timeoutId = window.setTimeout(
      fireTimeout,
      Math.max(0, timerWindow.deadlineMs - now),
    );
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [enabled, limitMs, paused, progressKey, signature]);

  return signature == null || paused || !enabled ? null : secondsLeft;
}
