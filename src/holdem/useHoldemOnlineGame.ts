"use client";

import * as React from "react";
import { clearLastActiveRoom } from "./roomCredentials";
import { useActionTimer } from "./useActionTimer";
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
  const roomExpiredRef = React.useRef(false);

  const fetchSnapshot = React.useCallback(async () => {
    if (roomExpiredRef.current) return;
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
      if (r.status === 404 || r.status === 410) {
        roomExpiredRef.current = true;
        clearLastActiveRoom();
        setState(null);
        setLoadError("방이 종료되었거나 만료되었습니다. 새 방을 만들어 주세요.");
        return;
      }
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
    roomExpiredRef.current = false;
    const poll = () => void fetchSnapshot().catch(() => setLoadError("네트워크 연결을 확인해 주세요."));
    poll();
    const iv = window.setInterval(poll, 1200);
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

  const paused = pause.kind === "paused";
  const timerEnabled = state != null && (
    state.phase === "hand_select" || state.toAct === mySeat
  );
  const actionTimerLeft = useActionTimer({
    state,
    paused,
    enabled: timerEnabled,
    dispatch,
    handSelectPlayer: mySeat,
  });

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
