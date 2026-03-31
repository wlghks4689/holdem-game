"use client";

import * as React from "react";
import {
  actionTimerLimitMs,
  actionTimerSignature,
  computeTimeoutAction,
} from "./actionTimer";
import {
  normalizeRoomPause,
  type RoomPauseState,
} from "./roomPause";
import type { GameAction, GameState, PlayerIndex } from "./types";

export type OnlinePauseCmd =
  | "request"
  | "cancel_request"
  | "accept"
  | "reject"
  | "resume";
export type OnlineRematchCmd = "accept" | "cancel";

export function useHoldemOnlineGame(opts: {
  roomId: string;
  mySeat: PlayerIndex;
  token: string;
}) {
  const { roomId, mySeat, token } = opts;
  const [state, setState] = React.useState<GameState | null>(null);
  const [pause, setPause] = React.useState<RoomPauseState>({
    kind: "running",
  });
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [guestJoined, setGuestJoined] = React.useState(false);
  const [opponentLeft, setOpponentLeft] = React.useState(false);
  const [rematchAccepted, setRematchAccepted] = React.useState<[boolean, boolean]>([
    false,
    false,
  ]);
  const stateVersionRef = React.useRef(0);

  const stateRef = React.useRef<GameState | null>(null);
  React.useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fetchSnapshot = React.useCallback(async () => {
    const r = await fetch(
      `/api/room/${roomId}?seat=${mySeat}&token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const j = (await r.json().catch(() => ({}))) as {
      error?: string;
      state?: GameState;
      stateVersion?: number;
      pause?: unknown;
      guestJoined?: boolean;
      opponentLeft?: boolean;
      rematchAccepted?: [boolean, boolean];
    };
    if (!r.ok) {
      setLoadError(j.error ?? r.statusText);
      return;
    }
    if (j.state) {
      setLoadError(null);
      setState(j.state);
      setPause(normalizeRoomPause(j.pause));
      if (typeof j.stateVersion === "number" && Number.isFinite(j.stateVersion)) {
        stateVersionRef.current = j.stateVersion;
      }
    }
    if (typeof j.guestJoined === "boolean") {
      setGuestJoined(j.guestJoined);
    }
    if (typeof j.opponentLeft === "boolean") {
      setOpponentLeft(j.opponentLeft);
    } else {
      setOpponentLeft(false);
    }
    if (Array.isArray(j.rematchAccepted) && j.rematchAccepted.length === 2) {
      setRematchAccepted([Boolean(j.rematchAccepted[0]), Boolean(j.rematchAccepted[1])]);
    } else {
      setRematchAccepted([false, false]);
    }
  }, [roomId, mySeat, token]);

  React.useEffect(() => {
    void fetchSnapshot();
    const iv = window.setInterval(() => void fetchSnapshot(), 1200);
    return () => window.clearInterval(iv);
  }, [fetchSnapshot]);

  const dispatch = React.useCallback(
    async (action: GameAction) => {
      const send = async (version: number) =>
        fetch(`/api/room/${roomId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seat: mySeat, token, action, stateVersion: version }),
        });
      let r = await send(stateVersionRef.current);
      let j = (await r.json().catch(() => ({}))) as {
        error?: string;
        state?: GameState;
        stateVersion?: number;
        pause?: unknown;
      };
      if (r.status === 409) {
        if (j.state) {
          setState(j.state);
        }
        if (typeof j.stateVersion === "number" && Number.isFinite(j.stateVersion)) {
          stateVersionRef.current = j.stateVersion;
          r = await send(j.stateVersion);
          j = (await r.json().catch(() => ({}))) as {
            error?: string;
            state?: GameState;
            stateVersion?: number;
            pause?: unknown;
          };
        }
      }
      if (!r.ok) {
        if (action.type === "NEW_HAND" && r.status === 400) {
          setLoadError(null);
          void fetchSnapshot();
          return;
        }
        if (r.status === 403 && j.error === "game paused") {
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
      if (typeof j.stateVersion === "number" && Number.isFinite(j.stateVersion)) {
        stateVersionRef.current = j.stateVersion;
      }
      if ("pause" in j) {
        setPause(normalizeRoomPause(j.pause));
      }
    },
    [roomId, mySeat, token, fetchSnapshot],
  );

  // dispatch ref: 타이머 effect deps에서 제거해도 항상 최신 참조 유지
  const dispatchRef = React.useRef(dispatch);
  React.useLayoutEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  const sendPauseCmd = React.useCallback(
    async (cmd: OnlinePauseCmd) => {
      const r = await fetch(`/api/room/${roomId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat: mySeat, token, cmd }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        state?: GameState;
        pause?: unknown;
      };
      if (!r.ok) {
        setLoadError(j.error ?? "pause request failed");
        void fetchSnapshot();
        return;
      }
      setLoadError(null);
      if (j.state) {
        setState(j.state);
      }
      setPause(normalizeRoomPause(j.pause));
    },
    [roomId, mySeat, token, fetchSnapshot],
  );

  const sendRematchCmd = React.useCallback(
    async (cmd: OnlineRematchCmd) => {
      const r = await fetch(`/api/room/${roomId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat: mySeat, token, cmd }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        state?: GameState;
        stateVersion?: number;
        rematchAccepted?: [boolean, boolean];
      };
      if (!r.ok) {
        setLoadError(j.error ?? "rematch request failed");
        void fetchSnapshot();
        return;
      }
      setLoadError(null);
      if (j.state) setState(j.state);
      if (typeof j.stateVersion === "number" && Number.isFinite(j.stateVersion)) {
        stateVersionRef.current = j.stateVersion;
      }
      if (Array.isArray(j.rematchAccepted) && j.rematchAccepted.length === 2) {
        setRematchAccepted([Boolean(j.rematchAccepted[0]), Boolean(j.rematchAccepted[1])]);
      } else {
        setRematchAccepted([false, false]);
      }
    },
    [fetchSnapshot, mySeat, roomId, token],
  );

  const [actionTimerLeft, setActionTimerLeft] = React.useState<number | null>(
    null,
  );
  const timerSig = state != null ? actionTimerSignature(state) : null;
  const limitMs = state != null ? actionTimerLimitMs(state) ?? 0 : 0;
  const paused = pause.kind === "paused";

  React.useEffect(() => {
    if (state == null || timerSig == null || paused) {
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
      if (a != null) void dispatchRef.current(a);
    }, limitMs);

    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerSig, limitMs, paused]);

  return {
    state,
    dispatch,
    actionTimerSecondsLeft: actionTimerLeft,
    loadError,
    refetch: fetchSnapshot,
    pause,
    sendPauseCmd,
    guestJoined,
    opponentLeft,
    rematchAccepted,
    sendRematchCmd,
  };
}
