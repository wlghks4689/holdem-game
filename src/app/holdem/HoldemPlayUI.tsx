"use client";

import * as React from "react";
import Link from "next/link";
import { STARTING_CHIPS, TOTAL_ROUNDS } from "@/holdem/constants";
import type { GameAction, GameState, PlayerIndex, SelectedHand } from "@/holdem/types";
import { HEADS_UP_RULES_BLURB } from "@/holdem/headsUpLabels";
import {
  DEFAULT_HOLDEM_DISPLAY_NAMES,
} from "@/holdem/playerDisplayNames";
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
import { TurnBanner } from "./components/TurnBanner";
import { ViewerHandStrength } from "./components/ViewerHandStrength";

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
  /** 로컬 vs 온라인 헤더 설명 */
  playMode: "local" | "online";
  /** 온라인일 때 방 ID 표시 등 */
  onlineMeta?: { roomId: string };
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
  onlineMeta,
}: HoldemPlayUIProps) {
  const [inviteToast, setInviteToast] = React.useState<string | null>(null);
  const inviteToastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const copyInviteLink = React.useCallback(() => {
    if (!onlineMeta || typeof window === "undefined") return;
    const url = `${window.location.origin}/holdem/room/${onlineMeta.roomId}`;
    void navigator.clipboard.writeText(url).then(
      () => {
        if (inviteToastTimer.current) clearTimeout(inviteToastTimer.current);
        setInviteToast("초대 링크를 복사했습니다.");
        inviteToastTimer.current = setTimeout(() => {
          setInviteToast(null);
          inviteToastTimer.current = null;
        }, 2200);
      },
      () => {
        setInviteToast("복사에 실패했습니다. 링크를 직접 보내 주세요.");
        if (inviteToastTimer.current) clearTimeout(inviteToastTimer.current);
        inviteToastTimer.current = setTimeout(() => {
          setInviteToast(null);
          inviteToastTimer.current = null;
        }, 2800);
      },
    );
  }, [onlineMeta]);

  React.useEffect(() => {
    return () => {
      if (inviteToastTimer.current) clearTimeout(inviteToastTimer.current);
    };
  }, []);

  const showResultBanner =
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

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-800 via-zinc-800 to-zinc-900 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-6 pb-16 lg:max-w-6xl lg:px-8 lg:py-8 lg:pb-10">
        <header className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-50 lg:text-xl">
              핸드 풀 홀덤
            </h1>
            <p className="text-xs text-zinc-400">
              {playMode === "local" ? (
                <>
                  {TOTAL_ROUNDS}라운드 · 시작 {STARTING_CHIPS}칩 (1bb=1칩) ·{" "}
                  {HEADS_UP_RULES_BLURB} · 표시 이름은 이 기기에 저장됩니다
                </>
              ) : (
                <>
                  {TOTAL_ROUNDS}라운드 · 온라인 대전 · {HEADS_UP_RULES_BLURB} · 상대
                  홀 카드는 쇼다운 전까지 이 기기로 전달되지 않습니다
                </>
              )}
            </p>
            {playMode === "online" && onlineMeta ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  초대 링크 복사
                </button>
                <Link
                  href="/holdem"
                  className="rounded-lg border border-zinc-500/80 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700/50"
                >
                  홈으로
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-600/90 bg-zinc-700/50 p-2 lg:min-w-[18rem]">
            {playMode === "local" && setViewer ? (
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
                  <>
                    <span className="font-semibold">{playerNames[mySeat]}</span>
                    <span className="mt-1 block text-[10px] text-zinc-500">
                      상대 카드는 이 기기로 전송되지 않습니다. 표시 이름은 기기마다
                      독립입니다.
                    </span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </header>

        <div className="mb-4 space-y-3 lg:mb-5 lg:grid lg:grid-cols-1 lg:gap-4">
          <TableHeaderBar state={state} playerNames={playerNames} />
        </div>

        <section
          className={[
            "mb-6 rounded-2xl border border-zinc-600/80 bg-zinc-800/35 p-4 shadow-[0_0_40px_rgba(0,0,0,0.2)]",
            state.phase === "showdown"
              ? "space-y-2.5 lg:space-y-3"
              : "space-y-4",
            "lg:mx-auto lg:mb-8 lg:max-w-5xl lg:rounded-[2rem] lg:border-zinc-700/70",
            "lg:bg-gradient-to-b lg:from-zinc-800 lg:via-zinc-800/95 lg:to-zinc-900/90",
            "lg:p-8 lg:shadow-[0_0_80px_rgba(0,0,0,0.45)]",
          ].join(" ")}
          aria-label="플레이 영역"
        >
          <div className="hidden space-y-3 lg:block">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              상대 · {playerNames[other(viewer)]}
            </p>
            <HoleCards
              state={state}
              viewer={viewer}
              playerNames={playerNames}
              seatFilter="opponent"
            />
            <div className="pt-1">
              <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
            </div>
          </div>

          <TurnBanner
            state={state}
            playerNames={playerNames}
            actionTimerSecondsLeft={actionTimerSecondsLeft}
          />

          <AllInBanner state={state} />
          {showResultBanner ? (
            <HandResultBanner state={state} playerNames={playerNames} />
          ) : null}

          <div
            className={[
              "mx-auto w-full max-w-3xl lg:max-w-2xl",
              state.phase === "showdown" ? "-mt-0.5 pt-0" : "",
            ].join(" ")}
          >
            <BoardDisplay state={state} />
          </div>

          <div className="mx-auto w-full max-w-3xl space-y-3 lg:max-w-2xl">
            <PlayAreaPotBetting state={state} viewer={viewer} />
            <ViewerHandStrength state={state} viewer={viewer} />
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
            />
            <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/40 p-3">
              <div className="mb-2 text-xs font-medium uppercase text-zinc-400">
                홀 카드
              </div>
              <HoleCards
                state={state}
                viewer={viewer}
                playerNames={playerNames}
                seatFilter="both"
              />
            </div>
            <IaBanner state={state} viewer={viewer} playerNames={playerNames} />
          </div>

          <div className="mt-2 hidden gap-8 lg:mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
            <div className="min-w-0">
              <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400/90 lg:text-left">
                나 · {playerNames[viewer]}
              </p>
              <div className="rounded-xl border border-emerald-900/35 bg-zinc-900/30 p-3 lg:p-4">
                <HoleCards
                  state={state}
                  viewer={viewer}
                  playerNames={playerNames}
                  seatFilter="hero"
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
              />
            </div>
          </div>
        </section>

        {inviteToast ? (
          <div
            className="fixed bottom-6 left-1/2 z-50 max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-lg border border-emerald-700/60 bg-emerald-950/95 px-4 py-2.5 text-center text-sm text-emerald-50 shadow-lg"
            role="status"
          >
            {inviteToast}
          </div>
        ) : null}

        <div className="mx-auto max-w-4xl lg:max-w-5xl">
          <HandLog
            logs={state.logs}
            playerNames={playerNames}
            showdownHoleCtx={playMode === "online" ? null : showdownHoleCtx}
            playMode={playMode}
          />
        </div>
      </div>
    </div>
  );
}
