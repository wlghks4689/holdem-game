"use client";

import * as React from "react";
import {
  actionTimerLimitMs,
  actionTimerSignature,
  computeTimeoutAction,
} from "./actionTimer";
import type { GameAction, GameState, PlayerIndex } from "./types";

export function useHoldemOnlineGame(opts: {
  roomId: string;
  mySeat: PlayerIndex;
  token: string;
}) {
  const { roomId, mySeat, token } = opts;
  const [state, setState] = React.useState<GameState | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const stateRef = React.useRef<GameState | null>(null);
  React.useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fetchSnapshot = React.useCallback(async () => {
    const r = await fetch(
      `/api/room/${roomId}?seat=${mySeat}&token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const j = (await r.json().catch(() => ({}))) as { error?: string; state?: GameState };
    if (!r.ok) {
      setLoadError(j.error ?? r.statusText);
      return;
    }
    if (j.state) {
      setLoadError(null);
      setState(j.state);
    }
  }, [roomId, mySeat, token]);

  React.useEffect(() => {
    void fetchSnapshot();
    const iv = window.setInterval(() => void fetchSnapshot(), 1200);
    return () => window.clearInterval(iv);
  }, [fetchSnapshot]);

  const dispatch = React.useCallback(
    async (action: GameAction) => {
      const r = await fetch(`/api/room/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat: mySeat, token, action }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; state?: GameState };
      if (!r.ok) {
        // 양측 자동 NEW_HAND 등으로 한쪽이 먼저 진행된 뒤면 400 — 에러 없이 동기화
        if (action.type === "NEW_HAND" && r.status === 400) {
          setLoadError(null);
          void fetchSnapshot();
          return;
        }
        setLoadError(j.error ?? "action failed");
        void fetchSnapshot();
        return;
      }
      if (j.state) {
        setState(j.state);
        setLoadError(null);
      }
    },
    [roomId, mySeat, token, fetchSnapshot],
  );

  const [actionTimerLeft, setActionTimerLeft] = React.useState<number | null>(null);
  const timerSig = state != null ? actionTimerSignature(state) : null;
  const limitMs = state != null ? actionTimerLimitMs(state) ?? 0 : 0;

  React.useEffect(() => {
    if (state == null || timerSig == null) {
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
      if (a != null) void dispatch(a);
    }, limitMs);

    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
    // `state`는 폴링마다 새 참조라 deps에 넣으면 타이머가 계속 리셋됨. 시그니처·한도만 본다.
  }, [timerSig, limitMs, dispatch]);

  return {
    state,
    dispatch,
    actionTimerSecondsLeft: actionTimerLeft,
    loadError,
    refetch: fetchSnapshot,
  };
}
