"use client";

import * as React from "react";
import Link from "next/link";
import {
  HELL_AI_EXTRA_STARTING_CHIPS,
  STARTING_CHIPS,
} from "@/holdem/constants";
import { resolveHandBlinds } from "@/holdem/blindLevels";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import { startingChipsForMode, totalRoundsForMode } from "@/holdem/gameModeRules";
import type { RoomPauseState } from "@/holdem/roomPause";
import type { GameAction, GameState, PlayerIndex, SelectedHand } from "@/holdem/types";
import { HEADS_UP_RULES_BLURB } from "@/holdem/headsUpLabels";
import { DEFAULT_HOLDEM_DISPLAY_NAMES } from "@/holdem/playerDisplayNames";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import { HU_DEALER_SB_LABEL, headsUpPositionLabel } from "@/holdem/headsUpLabels";
import { AllInShowdownCinemaOverlay } from "./components/AllInShowdownCinemaOverlay";
import { AllInBanner } from "./components/AllInBanner";
import { ActionPanel } from "./components/ActionPanel";
import { BoardDisplay } from "./components/BoardDisplay";
import { HandLog } from "./components/HandLog";
import { HandSelectPanel } from "./components/HandSelectPanel";
import { HandResultBanner } from "./components/HandResultBanner";
import { HoleCards } from "./components/HoleCards";
import { IaBanner } from "./components/IaBanner";
import { PlayAreaPotBetting } from "./components/PlayAreaPotBetting";
import { TableHeaderBar } from "./components/TableHeaderBar";
import { rabbitHuntInfo, viewerMayUseRabbit } from "@/holdem/rabbitHunt";
import { useAllInShowdownCinema } from "./hooks/useAllInShowdownCinema";

export type HoldemPlayUIProps = {
  state: GameState;
  dispatch: (a: GameAction) => void | Promise<void>;
  actionTimerSecondsLeft: number | null;
  viewer: PlayerIndex;
  setViewer?: (v: PlayerIndex) => void;
  playerNames: [string, string];
  updateName: (p: PlayerIndex, raw: string) => void;
  /** 온라인 방: 내 좌석 — 핸드 선택·액션 패널을 이 좌석에만 표시 */
  mySeat?: PlayerIndex;
  /** 로컬 vs 온라인 vs 싱글플레이 헤더 설명 */
  playMode: "local" | "online" | "single";
  /** 싱글플레이 난이도 (playMode === "single" 일 때) */
  singleDifficulty?: import("@/holdem/aiPlayer").Difficulty;
  /** 싱글 Hell 등: 재경기 시 초기 스택 (RESET_MATCH) */
  singlePlayerResetChips?: [number, number];
  /** 온라인일 때 방 ID 표시 등 */
  onlineMeta?: { roomId: string };
  /** 연습: 즉시 토글 퍼즈 */
  localPause?: { paused: boolean; onToggle: () => void };
  /** 온라인: 서버 동기화 퍼즈 */
  onlinePause?: {
    pause: RoomPauseState;
    mySeat: PlayerIndex;
    onRequest: () => void;
    onCancelRequest: () => void;
    onAccept: () => void;
    onReject: () => void;
    onResume: () => void;
  };
  /** 매치 종료 후 재경기 요청(온라인은 양측 수락 기반, 로컬/싱글은 즉시 재시작) */
  onMatchRematch?: () => void;
  /** 매치 종료 모달 내 재경기 상태 라벨(온라인 동기화 표시) */
  matchRematchLabel?: string | null;
  /** 상단 홈 이동 버튼 커스텀 동작 */
  onGoHome?: () => void | Promise<void>;
};

export function HoldemPlayUI({
  state,
  dispatch,
  actionTimerSecondsLeft,
  viewer,
  setViewer,
  playerNames,
  updateName,
  mySeat,
  playMode,
  singleDifficulty,
  singlePlayerResetChips,
  localPause,
  onlinePause,
  onMatchRematch,
  matchRematchLabel,
  onGoHome,
}: HoldemPlayUIProps) {
  const { t, locale } = useHoldemI18n();
  const isEn = locale === "en";
  const gameModeLabel = state.gameMode === "cost" ? "Cost" : "Classic";
  const configuredStartingChips = startingChipsForMode(state.gameMode);
  const configuredTotalRounds = totalRoundsForMode(state.gameMode);
  const selecting = state.phase === "hand_select";
  const isHellSingle =
    playMode === "single" && singleDifficulty === "hell";

  const showdownCinema = useAllInShowdownCinema(state);
  const cinemaDisplayState = React.useMemo<GameState>(() => {
    const flash = state.potAwardFlash;
    const visualRevealed =
      showdownCinema.visualRevealed ?? state.boardRevealed;
    const hiddenResolution =
      showdownCinema.active && showdownCinema.phase !== "showdown-resolve";
    const heldState: GameState =
      showdownCinema.holdAwardedChips && flash != null
        ? {
            ...state,
            chips: [
              Math.max(0, state.chips[0]! - Math.max(0, flash[0]!)),
              Math.max(0, state.chips[1]! - Math.max(0, flash[1]!)),
            ],
            pot: Math.max(0, flash[0]!) + Math.max(0, flash[1]!),
            potAwardFlash: null,
          }
        : state;
    if (!showdownCinema.holdAwardedChips && !hiddenResolution) return heldState;
    return {
      ...heldState,
      boardRevealed: showdownCinema.active
        ? visualRevealed
        : heldState.boardRevealed,
      winner: hiddenResolution ? null : heldState.winner,
      // 올인 콜 직후 양쪽 홀카드는 즉시 공개하고 승패 강조만 마지막까지 숨긴다.
      holes: heldState.holes,
      matchEnded: false,
      matchWinner: null,
      potAwardFlash: null,
    };
  }, [
    showdownCinema.active,
    showdownCinema.holdAwardedChips,
    showdownCinema.phase,
    showdownCinema.visualRevealed,
    state,
  ]);
  const winnerCinematicPulse =
    showdownCinema.active && showdownCinema.phase === "showdown-resolve";
  const showdownFxArmed =
    !showdownCinema.active || showdownCinema.phase === "showdown-resolve";
  const runoutStartRevealed = Math.min(
    5,
    Math.max(0, Math.round(state.runoutUiStartRevealed ?? 0)),
  );
  const showdownRunoutFx =
    showdownCinema.active &&
    showdownCinema.phase !== "showdown-resolve" &&
    (showdownCinema.visualRevealed ?? 0) > runoutStartRevealed;
  const showResultBannerSlot =
    state.phase === "hand_over" && state.handEndMode === "fold";

  const showdownHoleCtx =
    state.phase === "showdown" &&
    state.holes[0] != null &&
    state.holes[1] != null
      ? {
          holes: [state.holes[0]!, state.holes[1]!] as [SelectedHand, SelectedHand],
          board: state.board,
        }
      : null;

  const [rabbitBoardOpen, setRabbitBoardOpen] = React.useState(false);
  const rhInfo = rabbitHuntInfo(state);
  const rabbitBoardUi =
    rhInfo.ok && viewerMayUseRabbit(viewer, mySeat, rhInfo.folder)
      ? {
          active: true,
          open: rabbitBoardOpen,
          onToggle: () => setRabbitBoardOpen((v) => !v),
          revealedAtFold: rhInfo.revealedAtFold as 3 | 4,
        }
      : null;

  React.useEffect(() => {
    if (!rhInfo.ok) setRabbitBoardOpen(false);
  }, [rhInfo.ok, state.roundNumber]);

  React.useEffect(() => {
    if (state.phase === "hand_select") setRabbitBoardOpen(false);
  }, [state.phase, state.roundNumber]);

  const effectivePaused =
    localPause?.paused === true ||
    (onlinePause != null && onlinePause.pause.kind === "paused");
  const showPauseChrome = localPause != null || onlinePause != null;

  const onPauseMainClick = () => {
    if (localPause) {
      localPause.onToggle();
      return;
    }
    if (!onlinePause) return;
    const ps = onlinePause.pause;
    if (ps.kind === "running") onlinePause.onRequest();
    else if (ps.kind === "pending" && ps.from === onlinePause.mySeat)
      onlinePause.onCancelRequest();
    else if (ps.kind === "paused") onlinePause.onResume();
  };

  const pauseMainDisabled =
    onlinePause != null &&
    onlinePause.pause.kind === "pending" &&
    onlinePause.pause.from !== onlinePause.mySeat;

  const pauseMainLabel =
    localPause != null
      ? localPause.paused
        ? isEn
          ? "Resume"
          : "재개"
        : isEn
          ? "Pause"
          : "퍼즈"
      : onlinePause == null
        ? ""
        : onlinePause.pause.kind === "paused"
          ? isEn
            ? "Resume"
            : "재개"
          : onlinePause.pause.kind === "pending" &&
              onlinePause.pause.from === onlinePause.mySeat
            ? isEn
              ? "Cancel request"
              : "요청 취소"
            : isEn
              ? "Pause"
              : "퍼즈";

  const [endMenuOpen, setEndMenuOpen] = React.useState(false);
  const endMenuDelayArmedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!state.matchEnded) {
      setEndMenuOpen(false);
      endMenuDelayArmedRef.current = null;
      return;
    }
    const resultSettled =
      state.phase === "hand_over" ||
      (state.phase === "showdown" &&
        (!showdownCinema.active || showdownCinema.phase === "showdown-resolve"));
    if (!resultSettled) return;
    const armKey = `${state.roundNumber}-${state.matchWinner ?? "draw"}`;
    if (endMenuDelayArmedRef.current === armKey) return;
    endMenuDelayArmedRef.current = armKey;
    const t = window.setTimeout(() => setEndMenuOpen(true), 15000);
    return () => window.clearTimeout(t);
  }, [
    state.matchEnded,
    state.matchWinner,
    state.phase,
    state.roundNumber,
    showdownCinema.active,
    showdownCinema.phase,
  ]);

  const handleRematch = React.useCallback(() => {
    if (onMatchRematch) {
      onMatchRematch();
      return;
    }
    void dispatch(
      playMode === "single" && singlePlayerResetChips != null
        ? { type: "RESET_MATCH", initialChips: singlePlayerResetChips }
        : { type: "RESET_MATCH" },
    );
  }, [dispatch, onMatchRematch, playMode, singlePlayerResetChips]);

  const handleExitGame = React.useCallback(() => {
    if (typeof window === "undefined") return;
    window.close();
    window.location.replace("about:blank");
  }, []);

  return (
    <div
      className={[
        "min-h-dvh text-zinc-50",
        isHellSingle
          ? "bg-gradient-to-b from-fuchsia-950/55 via-zinc-900 to-zinc-950"
          : "bg-gradient-to-b from-zinc-800 via-zinc-800 to-zinc-900",
      ].join(" ")}
    >
      <div
        inert={showdownCinema.blockingInput ? true : undefined}
        className={[
          "relative mx-auto max-w-3xl px-3 py-4 pb-14 sm:px-4 sm:py-5 sm:pb-16 lg:py-6 lg:pb-8",
          selecting ? "lg:max-w-[1280px] lg:px-6" : "lg:max-w-6xl lg:px-8",
        ].join(" ")}
      >
        {showPauseChrome ? (
          <div className="pointer-events-auto absolute right-3 top-3 z-40 flex max-w-[min(19rem,calc(100%-1.5rem))] flex-col items-end gap-2 sm:right-5 sm:top-5">
            {onlinePause != null &&
            onlinePause.pause.kind === "pending" &&
            onlinePause.pause.from !== onlinePause.mySeat ? (
              <div
                className="w-full rounded-lg border border-amber-500/55 bg-amber-950/95 px-3 py-2.5 text-left shadow-lg ring-1 ring-amber-400/25"
                role="dialog"
                aria-label={isEn ? "Pause request" : "퍼즈 요청"}
              >
                <p className="text-xs font-semibold leading-snug text-amber-50">
                  {isEn ? "Opponent requested pause" : "상대가 퍼즈를 요청하였습니다"}
                </p>
                <p className="mt-1 text-[10px] text-amber-200/80">
                  {isEn
                    ? "Accept to pause game, reject to continue."
                    : "수락 시 게임이 멈추고, 거절 시 그대로 진행됩니다."}
                </p>
                <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onlinePause.onAccept()}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    {isEn ? "Accept" : "수락"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onlinePause.onReject()}
                    className="rounded-md border border-zinc-500 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
                  >
                    {isEn ? "Reject" : "거절"}
                  </button>
                </div>
              </div>
            ) : null}
            {onlinePause != null &&
            onlinePause.pause.kind === "pending" &&
            onlinePause.pause.from === onlinePause.mySeat ? (
              <p className="rounded-md border border-zinc-600 bg-zinc-900/90 px-2 py-1 text-[10px] text-zinc-300">
                {isEn ? "Waiting for opponent response…" : "상대의 응답을 기다리는 중…"}
              </p>
            ) : null}
            <button
              type="button"
              disabled={pauseMainDisabled}
              onClick={onPauseMainClick}
              className={[
                "rounded-lg px-3 py-2 text-xs font-bold shadow-md transition-colors sm:text-sm",
                effectivePaused
                  ? "border border-sky-500/70 bg-sky-700 text-white hover:bg-sky-600"
                  : "border border-zinc-500 bg-zinc-700 text-zinc-100 hover:bg-zinc-600",
                pauseMainDisabled ? "cursor-not-allowed opacity-45" : "",
              ].join(" ")}
            >
              {pauseMainLabel}
            </button>
            {playMode === "online" || playMode === "single" ? (
              onGoHome ? (
                <button
                  type="button"
                  onClick={() => void onGoHome()}
                  className="rounded-lg border border-zinc-600/80 bg-zinc-800/80 px-3 py-2 text-xs font-semibold text-zinc-300 shadow-md hover:bg-zinc-700/80"
                >
                  {isEn ? "Home" : "홈으로"}
                </button>
              ) : (
                <Link
                  href="/holdem"
                  className="rounded-lg border border-zinc-600/80 bg-zinc-800/80 px-3 py-2 text-xs font-semibold text-zinc-300 shadow-md hover:bg-zinc-700/80"
                >
                  {isEn ? "Home" : "홈으로"}
                </Link>
              )
            ) : null}
          </div>
        ) : null}
        <header className="mb-3 flex flex-col gap-2 pr-[5.5rem] sm:pr-[6rem] lg:mb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-base font-bold text-zinc-50 sm:text-lg lg:text-xl">
              {t("home.title")}
            </h1>
            <div className="mt-1 inline-flex rounded-md border border-zinc-600 bg-zinc-800/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
              {gameModeLabel}
            </div>
            {playMode === "local" ? (
              <p
                className="text-[11px] text-zinc-400 sm:text-xs"
                title={
                  isEn
                    ? "Heads-up hold'em: BTN posts SB, opponent posts BB. The BTN alternates each hand."
                    : `${HEADS_UP_RULES_BLURB} · 표시 이름은 이 기기에 저장됩니다`
                }
              >
                <span className="sm:hidden">
                  {isEn
                    ? `${configuredTotalRounds}R · ${configuredStartingChips} chips · 1bb=1 chip`
                    : `${configuredTotalRounds}R · ${configuredStartingChips}칩 · 1bb=1칩`}
                </span>
                <span className="hidden sm:inline">
                  {isEn
                    ? `${configuredTotalRounds} rounds · start ${configuredStartingChips} chips (1bb=1 chip) · Heads-up hold'em: BTN posts SB, opponent posts BB. The BTN alternates each hand. · names saved locally`
                    : `${configuredTotalRounds}라운드 · 시작 ${configuredStartingChips}칩 (1bb=1칩) · ${HEADS_UP_RULES_BLURB} · 이름 로컬 저장`}
                </span>
              </p>
            ) : playMode === "single" ? (
              <p className="text-xs text-zinc-400">
                {isEn ? "Single-player · AI " : "싱글플레이 · AI "}
                <span
                  className={
                    singleDifficulty === "hell"
                      ? "font-semibold text-fuchsia-400"
                      : singleDifficulty === "hard"
                        ? "font-semibold text-rose-400"
                        : singleDifficulty === "normal"
                          ? "font-semibold text-amber-400"
                          : "font-semibold text-emerald-400"
                  }
                >
                  {singleDifficulty === "hell"
                    ? "Hell"
                    : singleDifficulty === "hard"
                      ? "Hard"
                      : singleDifficulty === "normal"
                        ? "Normal"
                        : "Easy"}
                </span>
                {singleDifficulty === "hell" ? (
                  <span className="text-zinc-500">
                    {isEn
                      ? ` · You ${STARTING_CHIPS} / AI ${STARTING_CHIPS + HELL_AI_EXTRA_STARTING_CHIPS} chips`
                      : ` · 본인 ${STARTING_CHIPS} / AI ${STARTING_CHIPS + HELL_AI_EXTRA_STARTING_CHIPS}칩`}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-600/90 bg-zinc-700/50 p-1.5 sm:gap-2 sm:p-2 lg:min-w-[18rem]">
            {playMode === "local" && setViewer != null ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-1 text-[10px] font-medium uppercase text-zinc-400">
                  {isEn ? "View" : "보기 관점"}
                  </span>
                  {([0, 1] as PlayerIndex[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setViewer(p)}
                      title={
                        isEn
                          ? `Show cards from ${playerNames[p]}'s point of view.`
                          : `${playerNames[p]} 관점으로 카드를 표시합니다.`
                      }
                      className={[
                        "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                        viewer === p
                          ? "bg-violet-600 text-white"
                          : "text-zinc-300 hover:bg-zinc-600/80 hover:text-zinc-50",
                      ].join(" ")}
                    >
                      {playerNames[p]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-2 border-t border-zinc-600/60 pt-2">
                  <label className="flex min-w-[7rem] flex-1 flex-col gap-0.5 text-[10px] text-zinc-400">
                    {isEn ? "Player 1 display name" : "첫 플레이어 표시 이름"}
                    <input
                      type="text"
                      value={playerNames[0]!}
                      onChange={(e) => updateName(0, e.target.value)}
                      maxLength={24}
                      className="rounded border border-zinc-500 bg-zinc-800 px-2 py-1 text-xs text-zinc-50"
                      placeholder={isEn ? "Villain" : DEFAULT_HOLDEM_DISPLAY_NAMES[0]!}
                    />
                  </label>
                  <label className="flex min-w-[7rem] flex-1 flex-col gap-0.5 text-[10px] text-zinc-400">
                    {isEn ? "Player 2 display name" : "두 번째 플레이어 표시 이름"}
                    <input
                      type="text"
                      value={playerNames[1]!}
                      onChange={(e) => updateName(1, e.target.value)}
                      maxLength={24}
                      className="rounded border border-zinc-500 bg-zinc-800 px-2 py-1 text-xs text-zinc-50"
                      placeholder={isEn ? "Hero" : DEFAULT_HOLDEM_DISPLAY_NAMES[1]!}
                    />
                  </label>
                </div>
              </>
            ) : (
              <div className="px-1 py-0.5 text-xs text-zinc-200">
                <span className="text-[10px] font-medium uppercase text-zinc-400">
                  {isEn ? "My seat · " : "내 좌석 · "}
                </span>
                {mySeat != null ? (
                  <span className="font-semibold">{playerNames[mySeat]}</span>
                ) : null}
              </div>
            )}
          </div>
        </header>

        <div
          className={[
            selecting ? "mb-2 lg:mb-3" : "mb-3 space-y-2 lg:mb-4 lg:grid lg:grid-cols-1 lg:gap-3",
            showdownCinema.blockingInput ? "hidden" : "",
          ].join(" ")}
        >
          {selecting ? (
            <HandSelectStatusBar
              state={state}
              playerNames={playerNames}
              mySeat={mySeat}
              actionTimerSecondsLeft={actionTimerSecondsLeft}
            />
          ) : (
            <TableHeaderBar state={cinemaDisplayState} playerNames={playerNames} />
          )}
        </div>

        <section
          className={[
            "relative mb-4 rounded-2xl border p-3 sm:p-4",
            isHellSingle
              ? "border-fuchsia-500/35 bg-gradient-to-b from-fuchsia-950/25 via-zinc-800/45 to-zinc-950/90 shadow-[0_0_44px_rgba(147,51,234,0.14),inset_0_1px_0_rgba(244,114,182,0.06)]"
              : "border-zinc-600/80 bg-zinc-800/35 shadow-[0_0_40px_rgba(0,0,0,0.2)]",
            selecting
              ? "space-y-0"
              : state.phase === "showdown"
                ? "space-y-2 sm:space-y-2.5 lg:space-y-3"
                : "space-y-3 sm:space-y-4",
            selecting
              ? "lg:mx-auto lg:mb-5 lg:max-w-none lg:rounded-[1.5rem] lg:p-4"
              : "lg:mx-auto lg:mb-6 lg:max-w-5xl lg:rounded-[2rem] lg:p-6",
            isHellSingle
              ? "lg:border-fuchsia-800/45 lg:bg-gradient-to-b lg:from-fuchsia-950/30 lg:via-zinc-800/95 lg:to-zinc-950/92 lg:shadow-[0_0_88px_rgba(126,34,206,0.22),inset_0_1px_0_rgba(232,121,249,0.08)]"
              : "lg:border-zinc-700/70 lg:bg-gradient-to-b lg:from-zinc-800 lg:via-zinc-800/95 lg:to-zinc-900/90 lg:shadow-[0_0_80px_rgba(0,0,0,0.45)]",
            showdownCinema.blockingInput ? "pointer-events-none select-none" : "",
            showdownCinema.active ? "holdem-cinema-active" : "",
            showdownCinema.phase === "allin-lock" ? "holdem-allin-lock" : "",
            showdownCinema.phase === "street-windup" ? "holdem-street-windup" : "",
            showdownCinema.phase === "showdown-reveal" ? "holdem-showdown-reveal" : "",
            showdownCinema.phase === "showdown-hold" ? "holdem-showdown-hold" : "",
            showdownCinema.phase === "showdown-resolve" ? "holdem-showdown-resolve" : "",
          ].join(" ")}
          data-allin-cinema-phase={showdownCinema.active ? showdownCinema.phase : "off"}
          aria-label={isEn ? "Play area" : "플레이 영역"}
        >
          {effectivePaused ? (
            <div className="absolute inset-0 z-20 flex items-start justify-center rounded-[inherit] bg-zinc-950/60 pt-16 backdrop-blur-[2px] lg:pt-24">
              <p className="mx-4 rounded-xl border border-zinc-500/80 bg-zinc-900/95 px-4 py-3 text-center text-sm font-semibold text-zinc-100 shadow-xl">
                {isEn ? "Paused" : "일시 정지 중"}
              </p>
            </div>
          ) : null}
          {/* 쇼다운 비교 패널은 보드 위 한 곳에서 양쪽을 함께 보여준다. */}
          {!selecting && state.phase === "showdown" ? (
            <div className="holdem-cinema-hole-stage mx-auto w-full max-w-3xl transition-all duration-500">
              <HoleCards
                state={cinemaDisplayState}
                viewer={viewer}
                playerNames={playerNames}
                seatFilter="both"
                cinematicWinnerPulse={winnerCinematicPulse}
                showdownFxArmed={showdownFxArmed}
                showdownRunoutFx={showdownRunoutFx}
              />
            </div>
          ) : null}
          {!selecting && state.phase !== "showdown" ? state.phase === "hand_over" ? (
            <div
              className={[
                "holdem-cinema-hole-stage hidden space-y-2 transition-all duration-500 lg:block",
              ].join(" ")}
            >
              <HoleCards
                state={cinemaDisplayState}
                viewer={viewer}
                playerNames={playerNames}
                seatFilter="opponent"
                cinematicWinnerPulse={winnerCinematicPulse}
                showdownFxArmed={showdownFxArmed}
              />
              {!showdownCinema.blockingInput ? (
                <div className="pt-1">
                  <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className={[
                "hidden transition-opacity duration-500 lg:block",
                showdownCinema.active && showdownCinema.phase !== "showdown-resolve"
                  ? "opacity-55"
                  : "",
              ].join(" ")}
            >
              <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
            </div>
          ) : null}

          {!selecting && !showdownCinema.blockingInput ? <AllInBanner state={state} /> : null}
          {showResultBannerSlot ? (
            <HandResultBanner
              state={state}
              playerNames={playerNames}
              visible={
                state.phase === "hand_over" ||
                !showdownCinema.active ||
                showdownCinema.showHandResult
              }
            />
          ) : null}
          {!selecting ? (
            <div
              className={[
                "holdem-cinema-board-stage mx-auto w-full max-w-3xl transition-all duration-500",
                showdownCinema.blockingInput ? "lg:max-w-4xl" : "lg:max-w-2xl",
                state.phase === "showdown" ? "-mt-0.5 pt-0" : "",
              ].join(" ")}
            >
              <BoardDisplay
                state={cinemaDisplayState}
                visualRevealedOverride={showdownCinema.visualRevealed}
                streetLabelOverride={showdownCinema.boardStreetLabelKo}
                cinematicFlip={showdownCinema.active && showdownCinema.phase === "showdown-reveal"}
                cinemaStreetPulse={showdownCinema.streetPulse}
                cinemaAnticipation={showdownCinema.activeStreet}
                rabbitHunt={rabbitBoardUi}
              />
            </div>
          ) : null}

          {!selecting ? (
            <div
              className={[
                "holdem-cinema-pot-stage mx-auto w-full max-w-3xl transition-all duration-500 lg:max-w-2xl",
                showdownCinema.active && showdownCinema.phase !== "showdown-resolve"
                  ? "opacity-85"
                  : "",
              ].join(" ")}
            >
              <PlayAreaPotBetting
                state={cinemaDisplayState}
                viewer={viewer}
                playerNames={playerNames}
              />
            </div>
          ) : null}

          {selecting ? (
            <div className="mx-auto w-full max-w-none">
              <HandSelectPanel
                state={state}
                playerNames={playerNames}
                mySeat={mySeat}
                onSelect={(player, templateId) =>
                  void dispatch({ type: "SELECT_HAND", player, templateId })
                }
                onMystery={(player) =>
                  void dispatch({ type: "SELECT_MYSTERY_HAND", player })
                }
              />
            </div>
          ) : null}

          {!selecting ? <div
            className={[
              "space-y-3 transition-all duration-500 lg:hidden",
              showdownCinema.blockingInput ? "holdem-cinema-hole-stage" : "",
            ].join(" ")}
          >
            {!showdownCinema.blockingInput ? (
              <ActionPanel
                state={state}
                dispatch={(a) => void dispatch(a)}
                playerNames={playerNames}
                mySeat={mySeat}
                actionTimerSecondsLeft={actionTimerSecondsLeft}
              />
            ) : null}
            {/* 모바일 상대 카드 — 쇼다운에서만 전체 표시 */}
            {state.phase === "hand_over" ? (
              <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/40 p-3">
                <HoleCards
                  state={cinemaDisplayState}
                  viewer={viewer}
                  playerNames={playerNames}
                  seatFilter="both"
                  cinematicWinnerPulse={winnerCinematicPulse}
                  showdownFxArmed={showdownFxArmed}
                />
              </div>
            ) : state.phase !== "showdown" ? (
              <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/40 p-3">
                <HoleCards
                  state={cinemaDisplayState}
                  viewer={viewer}
                  playerNames={playerNames}
                  seatFilter="hero"
                  cinematicWinnerPulse={winnerCinematicPulse}
                  showdownFxArmed={showdownFxArmed}
                />
              </div>
            ) : null}
            {!showdownCinema.blockingInput ? (
              <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
            ) : null}
          </div> : null}

          {!selecting ? <div
            className={[
              "mt-2 hidden gap-8 transition-all duration-500 lg:mt-8 lg:grid lg:items-start lg:gap-10",
              showdownCinema.blockingInput
                ? "holdem-cinema-hole-stage lg:mx-auto lg:w-full lg:max-w-2xl lg:grid-cols-1"
                : state.phase === "showdown"
                  ? "lg:mx-auto lg:w-full lg:max-w-2xl lg:grid-cols-1"
                  : "lg:grid-cols-2",
            ].join(" ")}
          >
            {state.phase !== "showdown" ? (
              <div className="min-w-0">
                <div className="rounded-xl border border-emerald-900/35 bg-zinc-900/30 p-3 lg:p-4">
                  <HoleCards
                    state={cinemaDisplayState}
                    viewer={viewer}
                    playerNames={playerNames}
                    seatFilter="hero"
                    cinematicWinnerPulse={winnerCinematicPulse}
                    showdownFxArmed={showdownFxArmed}
                  />
                </div>
              </div>
            ) : null}
            {!showdownCinema.blockingInput ? (
              <div className="min-w-0 lg:pt-6">
                <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 lg:text-left">
                  {isEn ? "Action" : "액션"}
                </p>
                <ActionPanel
                  state={state}
                  dispatch={(a) => void dispatch(a)}
                  playerNames={playerNames}
                  mySeat={mySeat}
                  actionTimerSecondsLeft={actionTimerSecondsLeft}
                />
              </div>
            ) : null}
          </div> : null}
        </section>

        {showdownCinema.active ? (
          <AllInShowdownCinemaOverlay
            phase={showdownCinema.phase}
            activeStreet={showdownCinema.activeStreet}
            visualRevealed={showdownCinema.visualRevealed ?? state.boardRevealed}
            isEn={isEn}
            subtleMotion={showdownCinema.subtleMotion}
          />
        ) : null}

        {state.matchEnded && endMenuOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-600/70 bg-zinc-900/95 p-4 shadow-2xl">
              <p className="text-center text-lg font-extrabold text-zinc-50">
                {isEn ? "Game Over" : "게임 종료"}
              </p>
              <p className="mt-1 text-center text-xs text-zinc-400">
                {isEn ? "Choose your next action." : "다음 동작을 선택하세요."}
              </p>
              {matchRematchLabel ? (
                <p className="mt-2 text-center text-[11px] font-semibold text-emerald-300">
                  {matchRematchLabel}
                </p>
              ) : null}
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={handleRematch}
                  className="rounded-lg border border-emerald-400/70 bg-emerald-700/50 px-3 py-2 text-sm font-bold text-emerald-50 hover:bg-emerald-600/55"
                >
                  {isEn ? "Rematch" : "재경기"}
                </button>
                <Link
                  href="/holdem"
                  className="rounded-lg border border-sky-400/60 bg-sky-800/40 px-3 py-2 text-center text-sm font-bold text-sky-50 hover:bg-sky-700/45"
                >
                  {isEn ? "Home" : "홈으로"}
                </Link>
                <button
                  type="button"
                  onClick={handleExitGame}
                  className="rounded-lg border border-rose-500/60 bg-rose-900/45 px-3 py-2 text-sm font-bold text-rose-100 hover:bg-rose-800/50"
                  title={
                    isEn
                      ? "Browser policy may prevent closing this tab."
                      : "브라우저 정책에 따라 탭이 닫히지 않을 수 있습니다."
                  }
                >
                  {isEn ? "Exit" : "게임 종료"}
                </button>
              </div>
            </div>
          </div>
        ) : null}


        {!selecting ? (
          <div className="mx-auto max-w-4xl lg:max-w-5xl">
            <HandLog
              logs={state.logs}
              playerNames={playerNames}
              showdownHoleCtx={playMode === "online" || playMode === "single" ? null : showdownHoleCtx}
              playMode={playMode}
              gameMode={state.gameMode}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HandSelectStatusBar({
  state,
  playerNames,
  mySeat,
  actionTimerSecondsLeft,
}: {
  state: GameState;
  playerNames: [string, string];
  mySeat?: PlayerIndex;
  actionTimerSecondsLeft: number | null;
}) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const bbUnit = resolveHandBlinds(state).bb;

  return (
    <section
      className="rounded-xl border border-zinc-600/80 bg-zinc-800/65 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-3 lg:flex lg:items-center lg:gap-3"
      aria-label={isEn ? "Hand selection status" : "핸드 선택 상태"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-600/60 pb-2 lg:shrink-0 lg:border-b-0 lg:pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-zinc-50 sm:text-base">
            {isEn ? "Round" : "라운드"} {state.roundNumber}
            <span className="text-zinc-400"> / {totalRoundsForMode(state.gameMode)}</span>
          </span>
          <span className="rounded-full border border-violet-400/35 bg-violet-950/40 px-2 py-0.5 text-[10px] font-bold text-violet-100 sm:text-[11px]">
            {isEn ? "HAND SELECT" : "핸드 선택"}
          </span>
        </div>
        {actionTimerSecondsLeft != null ? (
          <span
            className={[
              "rounded-md px-2.5 py-1 font-mono text-sm font-bold tabular-nums",
              actionTimerSecondsLeft <= 10
                ? "bg-rose-900/65 text-rose-100 ring-1 ring-rose-500/50"
                : "bg-zinc-950/75 text-amber-100 ring-1 ring-amber-400/25",
            ].join(" ")}
          >
            {isEn ? "Time" : "남은 시간"} {actionTimerSecondsLeft}s
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 lg:mt-0 lg:min-w-0 lg:flex-1">
        {([0, 1] as PlayerIndex[]).map((player) => {
          const position = headsUpPositionLabel(state, player);
          return (
            <div
              key={player}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-700/70 bg-zinc-900/35 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-zinc-100 sm:text-sm">
                    {playerNames[player]}
                  </span>
                  {mySeat === player ? (
                    <span className="shrink-0 rounded bg-emerald-900/55 px-1.5 py-0.5 text-[8px] font-bold text-emerald-200 sm:text-[9px]">
                      {isEn ? "YOU" : "내 좌석"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10px] text-violet-200/85 sm:text-[11px]">
                  {isEn && position === HU_DEALER_SB_LABEL ? "BTN · SB" : position}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs font-bold text-zinc-100 sm:text-sm">
                  {isEn ? "Stack " : "스택 "}{chipsAsBbLabel(state.chips[player], bbUnit)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
