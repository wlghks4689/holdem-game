"use client";

import * as React from "react";
import Link from "next/link";
import { STARTING_CHIPS, TOTAL_ROUNDS } from "@/holdem/constants";
import type { RoomPauseState } from "@/holdem/roomPause";
import type { GameAction, GameState, PlayerIndex, SelectedHand } from "@/holdem/types";
import { HEADS_UP_RULES_BLURB } from "@/holdem/headsUpLabels";
import { DEFAULT_HOLDEM_DISPLAY_NAMES } from "@/holdem/playerDisplayNames";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import { headsUpPositionLabel } from "@/holdem/headsUpLabels";
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
import { useAllInShowdownCinema } from "./hooks/useAllInShowdownCinema";

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

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
  onlineMeta,
  localPause,
  onlinePause,
}: HoldemPlayUIProps) {
  const { t } = useHoldemI18n();

  const showdownCinema = useAllInShowdownCinema(state);
  const winnerCinematicPulse =
    showdownCinema.active && showdownCinema.phase === "result";

  const showResultBannerSlot =
    state.phase === "showdown" ||
    (state.phase === "hand_over" && state.handEndMode === "fold");

  const showdownHoleCtx =
    state.phase === "showdown" &&
    state.holes[0] != null &&
    state.holes[1] != null
      ? {
          holes: [state.holes[0]!, state.holes[1]!] as [SelectedHand, SelectedHand],
          board: state.board,
        }
      : null;

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
        ? "재개"
        : "퍼즈"
      : onlinePause == null
        ? ""
        : onlinePause.pause.kind === "paused"
          ? "재개"
          : onlinePause.pause.kind === "pending" &&
              onlinePause.pause.from === onlinePause.mySeat
            ? "요청 취소"
            : "퍼즈";

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-800 via-zinc-800 to-zinc-900 text-zinc-50">
      <div className="relative mx-auto max-w-3xl px-3 py-4 pb-14 sm:px-4 sm:py-5 sm:pb-16 lg:max-w-6xl lg:px-8 lg:py-6 lg:pb-8">
        {showPauseChrome ? (
          <div className="pointer-events-auto absolute right-3 top-3 z-40 flex max-w-[min(19rem,calc(100%-1.5rem))] flex-col items-end gap-2 sm:right-5 sm:top-5">
            {onlinePause != null &&
            onlinePause.pause.kind === "pending" &&
            onlinePause.pause.from !== onlinePause.mySeat ? (
              <div
                className="w-full rounded-lg border border-amber-500/55 bg-amber-950/95 px-3 py-2.5 text-left shadow-lg ring-1 ring-amber-400/25"
                role="dialog"
                aria-label="퍼즈 요청"
              >
                <p className="text-xs font-semibold leading-snug text-amber-50">
                  상대가 퍼즈를 요청하였습니다
                </p>
                <p className="mt-1 text-[10px] text-amber-200/80">
                  수락 시 게임이 멈추고, 거절 시 그대로 진행됩니다.
                </p>
                <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onlinePause.onAccept()}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    onClick={() => onlinePause.onReject()}
                    className="rounded-md border border-zinc-500 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
                  >
                    거절
                  </button>
                </div>
              </div>
            ) : null}
            {onlinePause != null &&
            onlinePause.pause.kind === "pending" &&
            onlinePause.pause.from === onlinePause.mySeat ? (
              <p className="rounded-md border border-zinc-600 bg-zinc-900/90 px-2 py-1 text-[10px] text-zinc-300">
                상대의 응답을 기다리는 중…
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
              <Link
                href="/holdem"
                className="rounded-lg border border-zinc-600/80 bg-zinc-800/80 px-3 py-2 text-xs font-semibold text-zinc-300 shadow-md hover:bg-zinc-700/80"
              >
                홈으로
              </Link>
            ) : null}
          </div>
        ) : null}
        <header className="mb-3 flex flex-col gap-2 pr-[5.5rem] sm:pr-[6rem] lg:mb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-base font-bold text-zinc-50 sm:text-lg lg:text-xl">
              {t("home.title")}
            </h1>
            {playMode === "local" ? (
              <p
                className="text-[11px] text-zinc-400 sm:text-xs"
                title={`${HEADS_UP_RULES_BLURB} · 표시 이름은 이 기기에 저장됩니다`}
              >
                <span className="sm:hidden">
                  {TOTAL_ROUNDS}R · {STARTING_CHIPS}칩 · 1bb=1칩
                </span>
                <span className="hidden sm:inline">
                  {TOTAL_ROUNDS}라운드 · 시작 {STARTING_CHIPS}칩 (1bb=1칩) ·{" "}
                  {HEADS_UP_RULES_BLURB} · 이름 로컬 저장
                </span>
              </p>
            ) : playMode === "single" ? (
              <p className="text-xs text-zinc-400">
                싱글플레이 · AI{" "}
                <span className={
                  singleDifficulty === "hard" ? "font-semibold text-rose-400" :
                  singleDifficulty === "normal" ? "font-semibold text-amber-400" :
                  "font-semibold text-emerald-400"
                }>
                  {singleDifficulty === "hard" ? "Hard" : singleDifficulty === "normal" ? "Normal" : "Easy"}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-600/90 bg-zinc-700/50 p-1.5 sm:gap-2 sm:p-2 lg:min-w-[18rem]">
            {playMode === "local" && setViewer != null ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-1 text-[10px] font-medium uppercase text-zinc-400">
                    보기 관점
                  </span>
                  {([0, 1] as PlayerIndex[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setViewer(p)}
                      title={`${playerNames[p]} 관점으로 카드를 표시합니다.`}
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
                    첫 플레이어 표시 이름
                    <input
                      type="text"
                      value={playerNames[0]!}
                      onChange={(e) => updateName(0, e.target.value)}
                      maxLength={24}
                      className="rounded border border-zinc-500 bg-zinc-800 px-2 py-1 text-xs text-zinc-50"
                      placeholder={DEFAULT_HOLDEM_DISPLAY_NAMES[0]!}
                    />
                  </label>
                  <label className="flex min-w-[7rem] flex-1 flex-col gap-0.5 text-[10px] text-zinc-400">
                    두 번째 플레이어 표시 이름
                    <input
                      type="text"
                      value={playerNames[1]!}
                      onChange={(e) => updateName(1, e.target.value)}
                      maxLength={24}
                      className="rounded border border-zinc-500 bg-zinc-800 px-2 py-1 text-xs text-zinc-50"
                      placeholder={DEFAULT_HOLDEM_DISPLAY_NAMES[1]!}
                    />
                  </label>
                </div>
              </>
            ) : (
              <div className="px-1 py-0.5 text-xs text-zinc-200">
                <span className="text-[10px] font-medium uppercase text-zinc-400">
                  내 좌석 ·{" "}
                </span>
                {mySeat != null ? (
                  <span className="font-semibold">{playerNames[mySeat]}</span>
                ) : null}
              </div>
            )}
          </div>
        </header>

        <div className="mb-3 space-y-2 lg:mb-4 lg:grid lg:grid-cols-1 lg:gap-3">
          <TableHeaderBar state={state} playerNames={playerNames} />
        </div>

        <section
          className={[
            "relative mb-4 rounded-2xl border border-zinc-600/80 bg-zinc-800/35 p-3 shadow-[0_0_40px_rgba(0,0,0,0.2)] sm:p-4",
            state.phase === "showdown"
              ? "space-y-2 sm:space-y-2.5 lg:space-y-3"
              : "space-y-3 sm:space-y-4",
            "lg:mx-auto lg:mb-6 lg:max-w-5xl lg:rounded-[2rem] lg:border-zinc-700/70",
            "lg:bg-gradient-to-b lg:from-zinc-800 lg:via-zinc-800/95 lg:to-zinc-900/90",
            "lg:p-6 lg:shadow-[0_0_80px_rgba(0,0,0,0.45)]",
            showdownCinema.blockingInput ? "pointer-events-none select-none" : "",
          ].join(" ")}
          aria-label="플레이 영역"
        >
          {effectivePaused ? (
            <div className="absolute inset-0 z-20 flex items-start justify-center rounded-[inherit] bg-zinc-950/60 pt-16 backdrop-blur-[2px] lg:pt-24">
              <p className="mx-4 rounded-xl border border-zinc-500/80 bg-zinc-900/95 px-4 py-3 text-center text-sm font-semibold text-zinc-100 shadow-xl">
                일시 정지 중
              </p>
            </div>
          ) : null}
          {/* 상대 카드 — 쇼다운·핸드오버: 전체 공개, 평시: compact 한 줄 배너 */}
          {state.phase === "showdown" || state.phase === "hand_over" ? (
            <div className="hidden space-y-2 lg:block">
              <HoleCards
                state={state}
                viewer={viewer}
                playerNames={playerNames}
                seatFilter="opponent"
                cinematicWinnerPulse={winnerCinematicPulse}
              />
              <div className="pt-1">
                <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
              </div>
            </div>
          ) : (
            <div className="hidden lg:block">
              <OpponentCompactBanner
                state={state}
                viewer={viewer}
                oppName={playerNames[other(viewer)]!}
              />
              <div className="mt-2">
                <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
              </div>
            </div>
          )}

          <AllInBanner state={state} />
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

          <div
            className={[
              "mx-auto w-full max-w-3xl lg:max-w-2xl",
              state.phase === "showdown" ? "-mt-0.5 pt-0" : "",
            ].join(" ")}
          >
            <BoardDisplay
              state={state}
              visualRevealedOverride={showdownCinema.visualRevealed}
              streetLabelOverride={showdownCinema.boardStreetLabelKo}
              cinematicFlip={showdownCinema.active}
              cinemaStreetPulse={showdownCinema.streetPulse}
            />
          </div>

          <div className="mx-auto w-full max-w-3xl lg:max-w-2xl">
            <PlayAreaPotBetting
              state={state}
              viewer={viewer}
              playerNames={playerNames}
            />
          </div>

          <div className="mx-auto max-w-lg lg:max-w-xl">
            <HandSelectPanel
              state={state}
              playerNames={playerNames}
              mySeat={mySeat}
              onSelect={(player, templateId) =>
                void dispatch({ type: "SELECT_HAND", player, templateId })
              }
            />
          </div>

          <div className="space-y-3 lg:hidden">
            <ActionPanel
              state={state}
              dispatch={(a) => void dispatch(a)}
              playerNames={playerNames}
              mySeat={mySeat}
              actionTimerSecondsLeft={actionTimerSecondsLeft}
            />
            {/* 모바일 상대 카드 — 쇼다운에서만 전체 표시 */}
            {state.phase === "showdown" || state.phase === "hand_over" ? (
              <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/40 p-3">
                <div className="mb-2 text-xs font-medium uppercase text-zinc-400">
                  홀 카드
                </div>
                <HoleCards
                  state={state}
                  viewer={viewer}
                  playerNames={playerNames}
                  seatFilter="both"
                  cinematicWinnerPulse={winnerCinematicPulse}
                />
              </div>
            ) : (
              <>
                <OpponentCompactBanner
                  state={state}
                  viewer={viewer}
                  oppName={playerNames[other(viewer)]!}
                />
                <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/40 p-3">
                  <HoleCards
                    state={state}
                    viewer={viewer}
                    playerNames={playerNames}
                    seatFilter="hero"
                    cinematicWinnerPulse={winnerCinematicPulse}
                  />
                </div>
              </>
            )}
            <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
          </div>

          <div className="mt-2 hidden gap-8 lg:mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
            <div className="min-w-0">
              <div className="rounded-xl border border-emerald-900/35 bg-zinc-900/30 p-3 lg:p-4">
                <HoleCards
                  state={state}
                  viewer={viewer}
                  playerNames={playerNames}
                  seatFilter="hero"
                  cinematicWinnerPulse={winnerCinematicPulse}
                />
              </div>
            </div>
            <div className="min-w-0 lg:pt-6">
              <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 lg:text-left">
                액션
              </p>
              <ActionPanel
                state={state}
                dispatch={(a) => void dispatch(a)}
                playerNames={playerNames}
                mySeat={mySeat}
                actionTimerSecondsLeft={actionTimerSecondsLeft}
              />
            </div>
          </div>
        </section>

        {showdownCinema.active ? (
          <AllInShowdownCinemaOverlay
            phase={showdownCinema.phase}
            onSkip={showdownCinema.skip}
          />
        ) : null}


        <div className="mx-auto max-w-4xl lg:max-w-5xl">
          <HandLog
            logs={state.logs}
            playerNames={playerNames}
            showdownHoleCtx={playMode === "online" || playMode === "single" ? null : showdownHoleCtx}
            playMode={playMode}
          />
        </div>
      </div>
    </div>
  );
}

// ─── 상대 compact 배너 ────────────────────────────────────────────────────────

function OpponentCompactBanner({
  state,
  viewer,
  oppName,
}: {
  state: GameState;
  viewer: PlayerIndex;
  oppName: string;
}) {
  const opp = other(viewer);
  const bettingLive =
    state.phase === "preflop" ||
    state.phase === "flop" ||
    state.phase === "turn" ||
    state.phase === "river";
  const isToAct = state.toAct === opp && bettingLive && state.matchWinner == null;
  const selecting = state.phase === "hand_select";
  const isHandPickChoosing = selecting && state.handPickPending[opp] == null && state.holes[opp] == null;
  const isHandPickSubmitted = selecting && state.handPickPending[opp] != null && state.holes[opp] == null;
  const posLabel = headsUpPositionLabel(state, opp);

  return (
    <div
      className={[
        "flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors duration-200",
        isToAct
          ? "border-emerald-400/40 bg-emerald-900/20"
          : "border-zinc-700/60 bg-zinc-800/30",
      ].join(" ")}
    >
      {/* 미니 카드 뒷면 × 2 */}
      <div className="flex shrink-0 gap-1">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex h-7 w-5 items-center justify-center rounded border border-zinc-500/70 bg-gradient-to-br from-slate-700 to-slate-900"
          >
            <span className="text-[10px] text-slate-400" aria-hidden>♠</span>
          </div>
        ))}
      </div>

      {/* 이름 + 포지션 */}
      <span className="text-sm font-medium text-zinc-200">{oppName}</span>
      <span className="rounded bg-zinc-600/80 px-1.5 py-px text-[9px] text-zinc-300">
        {posLabel}
      </span>

      {/* 상태 배지 */}
      <div className="ml-auto">
        {isToAct ? (
          <span className="rounded-full bg-emerald-600/30 px-2 py-0.5 text-[9px] font-bold text-emerald-200">
            액션 턴
          </span>
        ) : isHandPickChoosing ? (
          <span className="rounded-full bg-amber-600/30 px-2 py-0.5 text-[9px] font-bold text-amber-200">
            핸드 선택
          </span>
        ) : isHandPickSubmitted ? (
          <span className="rounded-full bg-emerald-700/30 px-2 py-0.5 text-[9px] font-bold text-emerald-100">
            확정됨
          </span>
        ) : null}
      </div>
    </div>
  );
}
