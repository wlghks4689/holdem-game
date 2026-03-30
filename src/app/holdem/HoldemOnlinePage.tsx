"use client";

import * as React from "react";
import {
  HOLDEM_PREFS_CHANGED_EVENT,
  loadRoomNickname,
} from "@/holdem/holdemPrefs";
import { DEFAULT_HOLDEM_DISPLAY_NAMES } from "@/holdem/playerDisplayNames";
import type { PlayerIndex } from "@/holdem/types";
import { useHoldemOnlineGame } from "@/holdem/useHoldemOnlineGame";
import { clearLastActiveRoom } from "@/holdem/roomCredentials";
import { HoldemPlayUI } from "./HoldemPlayUI";
import { HighCardDrawOverlay } from "./components/HighCardDrawOverlay";

export function HoldemOnlinePage(props: {
  roomId: string;
  mySeat: PlayerIndex;
  token: string;
}) {
  const { roomId, mySeat, token } = props;
  const {
    state,
    dispatch,
    actionTimerSecondsLeft,
    loadError,
    pause,
    sendPauseCmd,
    guestJoined,
  } = useHoldemOnlineGame({ roomId, mySeat, token });

  /* 매치가 끝나면 재접속 기록 삭제 (다음 게임에서 묵은 배너가 뜨지 않도록) */
  React.useEffect(() => {
    if (state?.matchWinner != null) {
      clearLastActiveRoom();
    }
  }, [state?.matchWinner]);

  /* 하이카드 드로우 오버레이: highCardDraw가 세팅된 직후 한 번 표시 */
  const [showDrawOverlay, setShowDrawOverlay] = React.useState(false);
  const prevPhaseRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (state == null) return;
    const wasLobby = prevPhaseRef.current === "lobby";
    prevPhaseRef.current = state.phase;
    if (wasLobby && state.phase === "hand_select" && state.highCardDraw != null) {
      setShowDrawOverlay(true);
    }
  }, [state]);

  const buildOnlinePlayerNames = React.useCallback((): [string, string] => {
    const nick = loadRoomNickname();
    const d = DEFAULT_HOLDEM_DISPLAY_NAMES;
    const myName =
      nick.length > 0 ? nick : d[mySeat]!;
    return mySeat === 0 ? [myName, d[1]!] : [d[0]!, myName];
  }, [mySeat]);

  const [playerNames, setPlayerNames] = React.useState<[string, string]>(() => {
    const nick = loadRoomNickname();
    const d = DEFAULT_HOLDEM_DISPLAY_NAMES;
    const seat = mySeat;
    const myName = nick.length > 0 ? nick : d[seat]!;
    return seat === 0 ? [myName, d[1]!] : [d[0]!, myName];
  });

  React.useEffect(() => {
    setPlayerNames(buildOnlinePlayerNames());
  }, [buildOnlinePlayerNames]);

  React.useEffect(() => {
    const onPrefs = () => {
      setPlayerNames(buildOnlinePlayerNames());
    };
    window.addEventListener(HOLDEM_PREFS_CHANGED_EVENT, onPrefs);
    return () => window.removeEventListener(HOLDEM_PREFS_CHANGED_EVENT, onPrefs);
  }, [buildOnlinePlayerNames]);

  const updateName = React.useCallback((_p: PlayerIndex, _raw: string) => {
    /* 온라인: 닉네임은 환경설정에서만 변경 */
  }, []);

  if (loadError && state == null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-900 px-4 text-center text-zinc-100">
        <p className="text-lg font-semibold">방에 연결할 수 없습니다</p>
        <p className="max-w-md text-sm text-zinc-400">{loadError}</p>
        <a
          className="mt-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          href="/holdem"
        >
          홈으로
        </a>
      </div>
    );
  }

  if (state == null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-900 text-zinc-400">
        방 상태 불러오는 중…
      </div>
    );
  }

  /* ── 로비 화면 ── */
  if (state.phase === "lobby") {
    const isHost = mySeat === 0;
    const canStart = isHost && guestJoined;
    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/holdem/room/${roomId}`
        : "";

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-gradient-to-b from-zinc-900 to-zinc-950 px-4 text-zinc-100">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-400">
            핸드 풀 홀덤
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            대기실
          </h1>
        </div>

        {/* 입장 현황 */}
        <div className="flex w-full max-w-xs flex-col gap-3 rounded-2xl border border-zinc-700/60 bg-zinc-800/50 p-5">
          {/* 호스트 */}
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600/30 text-[11px] font-bold text-sky-300 ring-1 ring-sky-500/50">
              P1
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-100">
                {playerNames[0]}
                {mySeat === 0 ? " (나)" : ""}
              </p>
              <p className="text-[11px] text-sky-300">호스트 · 입장 완료</p>
            </div>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
          </div>

          <div className="my-0.5 h-px bg-zinc-700/50" />

          {/* 게스트 */}
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-700/50 text-[11px] font-bold text-zinc-400 ring-1 ring-zinc-600/50">
              P2
            </span>
            <div className="min-w-0 flex-1">
              {guestJoined ? (
                <>
                  <p className="text-sm font-semibold text-zinc-100">
                    {playerNames[1]}
                    {mySeat === 1 ? " (나)" : ""}
                  </p>
                  <p className="text-[11px] text-emerald-300">입장 완료</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-zinc-500">상대방 대기 중…</p>
                  <p
                    className="text-[11px] text-zinc-600"
                    style={{ animation: "holdem-lobby-pulse 1.6s ease-in-out infinite" }}
                  >
                    초대 링크를 보내세요
                  </p>
                </>
              )}
            </div>
            {guestJoined ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
            ) : (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-600"
                style={{ animation: "holdem-lobby-pulse 1.6s ease-in-out infinite" }}
              />
            )}
          </div>
        </div>

        {/* 초대 링크 */}
        {isHost && (
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <p className="text-[11px] text-zinc-500">초대 링크 (상대에게 보내세요)</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-[11px] text-zinc-300"
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 active:scale-95"
                onClick={() => void navigator.clipboard.writeText(inviteUrl)}
              >
                복사
              </button>
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        {isHost ? (
          <button
            type="button"
            disabled={!canStart}
            onClick={() => void dispatch({ type: "START_GAME" })}
            className={[
              "w-full max-w-xs rounded-2xl py-3.5 text-base font-extrabold tracking-tight transition-all active:scale-[0.98]",
              canStart
                ? "border border-emerald-500/70 bg-emerald-700/50 text-emerald-50 shadow-[0_0_24px_rgba(52,211,153,0.3)] hover:bg-emerald-600/55"
                : "cursor-not-allowed border border-zinc-700 bg-zinc-800/50 text-zinc-600",
            ].join(" ")}
            title={canStart ? "게임을 시작합니다" : "상대방이 입장해야 시작할 수 있습니다"}
          >
            {canStart ? "게임 시작 →" : "상대방 입장 대기 중…"}
          </button>
        ) : (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 px-6 py-3.5 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              {guestJoined ? "호스트가 게임을 시작할 때까지 대기 중입니다" : "방에 입장했습니다"}
            </p>
            <p
              className="mt-1 text-xs text-zinc-500"
              style={{ animation: "holdem-lobby-pulse 1.6s ease-in-out infinite" }}
            >
              호스트의 시작 버튼을 기다리는 중…
            </p>
          </div>
        )}

        {loadError ? (
          <p className="text-xs text-amber-300">{loadError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {loadError ? (
        <div className="border-b border-amber-600/50 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-100">
          {loadError}{" "}
          <span className="text-amber-200/80">(동기화를 다시 시도합니다)</span>
        </div>
      ) : null}

      {/* 하이카드 드로우 결과 오버레이 */}
      {showDrawOverlay && state.highCardDraw != null ? (
        <HighCardDrawOverlay
          draw={state.highCardDraw}
          playerNames={playerNames}
          mySeat={mySeat}
          onClose={() => setShowDrawOverlay(false)}
        />
      ) : null}

      <HoldemPlayUI
        state={state}
        dispatch={dispatch}
        actionTimerSecondsLeft={actionTimerSecondsLeft}
        viewer={mySeat}
        playerNames={playerNames}
        updateName={updateName}
        mySeat={mySeat}
        playMode="online"
        onlineMeta={{ roomId }}
        onlinePause={{
          pause,
          mySeat,
          onRequest: () => void sendPauseCmd("request"),
          onCancelRequest: () => void sendPauseCmd("cancel_request"),
          onAccept: () => void sendPauseCmd("accept"),
          onReject: () => void sendPauseCmd("reject"),
          onResume: () => void sendPauseCmd("resume"),
        }}
      />
    </>
  );
}
