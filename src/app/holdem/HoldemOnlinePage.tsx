"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  HOLDEM_PREFS_CHANGED_EVENT,
  loadRoomNickname,
} from "@/holdem/holdemPrefs";
import { DEFAULT_HOLDEM_DISPLAY_NAMES } from "@/holdem/playerDisplayNames";
import type { PlayerIndex } from "@/holdem/types";
import { useHoldemOnlineGame } from "@/holdem/useHoldemOnlineGame";
import { clearLastActiveRoom } from "@/holdem/roomCredentials";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import { HoldemPlayUI } from "./HoldemPlayUI";
import { HighCardDrawOverlay } from "./components/HighCardDrawOverlay";

export function HoldemOnlinePage(props: {
  roomId: string;
  mySeat: PlayerIndex;
  token: string;
}) {
  const { roomId, mySeat, token } = props;
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const router = useRouter();
  const {
    state,
    dispatch,
    actionTimerSecondsLeft,
    loadError,
    pause,
    sendPauseCmd,
    guestJoined,
    opponentLeft,
    rematchAccepted,
    sendRematchCmd,
  } = useHoldemOnlineGame({ roomId, mySeat, token });

  /* 매치가 끝나면 재접속 기록 삭제 (다음 게임에서 묵은 배너가 뜨지 않도록) */
  React.useEffect(() => {
    if (state?.matchWinner != null) {
      clearLastActiveRoom();
    }
  }, [state?.matchWinner]);

  /* 하이카드 드로우 오버레이: 매치 시작(하이카드 결정) 1회 표시 */
  const [showDrawOverlay, setShowDrawOverlay] = React.useState(false);
  const shownDrawKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (state == null) return;
    if (state.highCardDraw == null) return;
    if (state.phase === "lobby") return;
    const d = state.highCardDraw;
    const drawKey = `${d.ranks[0]}-${d.ranks[1]}-${d.winnerSeat}`;
    if (shownDrawKeyRef.current !== drawKey) {
      shownDrawKeyRef.current = drawKey;
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

  const leaveRoom = React.useCallback(async () => {
    try {
      await fetch(`/api/room/${roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat: mySeat, token }),
        keepalive: true,
      });
    } catch {
      // ignore leave failures
    }
  }, [mySeat, roomId, token]);

  const [cancelingLobby, setCancelingLobby] = React.useState(false);

  const onCancelLobby = React.useCallback(async () => {
    setCancelingLobby(true);
    await leaveRoom();
    clearLastActiveRoom();
    router.replace("/holdem");
  }, [leaveRoom, router]);

  // state 전체가 아닌 파생 boolean만 의존성으로 사용 — 폴링마다 state 참조가 바뀌어도 타이머가 리셋되지 않음
  const opponentLeftActive = opponentLeft && state != null && state.phase !== "lobby";

  const [opponentLeftCountdown, setOpponentLeftCountdown] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!opponentLeftActive) {
      setOpponentLeftCountdown(null);
      return;
    }
    setOpponentLeftCountdown(5);
    const iv = window.setInterval(() => {
      setOpponentLeftCountdown((v) => (v == null ? null : Math.max(0, v - 1)));
    }, 1000);
    const to = window.setTimeout(() => {
      clearLastActiveRoom();
      router.replace("/holdem");
    }, 5000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
  }, [opponentLeftActive, router]);

  const rematchLabel = React.useMemo(() => {
    if (state?.matchWinner == null) return null;
    const meAccepted = rematchAccepted[mySeat];
    const oppAccepted = rematchAccepted[mySeat === 0 ? 1 : 0];
    if (meAccepted && oppAccepted) {
      return isEn ? "Both accepted · restarting" : "양측 수락 완료 · 재시작 중";
    }
    if (meAccepted) {
      return isEn
        ? "Rematch accepted · waiting for opponent"
        : "재경기 수락 완료 · 상대 응답 대기 중";
    }
    return isEn
      ? "Press Rematch to send a request"
      : "재경기 버튼을 누르면 상대에게 수락 요청이 전송됩니다";
  }, [isEn, mySeat, rematchAccepted, state?.matchWinner]);

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

  if (opponentLeftActive) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-900 px-4 text-center text-zinc-100">
        <p className="text-lg font-semibold">
          {isEn ? "Opponent left the room" : "상대방이 방을 나갔습니다"}
        </p>
        <p className="text-sm text-zinc-400">
          {isEn
            ? `Returning to Home in ${opponentLeftCountdown ?? 5}s.`
            : `${opponentLeftCountdown != null ? `${opponentLeftCountdown}초` : "5초"} 후 홈으로 이동합니다.`}
        </p>
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

        {/* 방 취소 / 나가기 버튼 */}
        <button
          type="button"
          disabled={cancelingLobby}
          onClick={() => void onCancelLobby()}
          className="w-full max-w-xs rounded-2xl border border-zinc-700/70 bg-zinc-800/40 py-3 text-sm font-semibold text-zinc-400 transition hover:border-rose-600/50 hover:bg-rose-950/25 hover:text-rose-300 disabled:cursor-wait disabled:opacity-50"
        >
          {cancelingLobby
            ? (isEn ? "Leaving…" : "나가는 중…")
            : isHost
              ? (isEn ? "Cancel room" : "방 취소")
              : (isEn ? "Leave room" : "방 나가기")}
        </button>
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
        onGoHome={() => {
          void leaveRoom().finally(() => {
            clearLastActiveRoom();
            router.push("/holdem");
          });
        }}
        onMatchRematch={() =>
          void sendRematchCmd(rematchAccepted[mySeat] ? "cancel" : "accept")
        }
        matchRematchLabel={rematchLabel}
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
