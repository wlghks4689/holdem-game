"use client";

import * as React from "react";
import {
  DEFAULT_HOLDEM_DISPLAY_NAMES,
  loadHoldemDisplayNames,
  saveHoldemDisplayNames,
} from "@/holdem/playerDisplayNames";
import { STARTING_CHIPS, TOTAL_ROUNDS } from "@/holdem/constants";
import type { PlayerIndex, SelectedHand } from "@/holdem/types";
import { useHoldemGame } from "@/holdem/useHoldemGame";
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

export default function HoldemPageClient() {
  const { state, dispatch, actionTimerSecondsLeft } = useHoldemGame();
  const [viewer, setViewer] = React.useState<PlayerIndex>(1);
  const [playerNames, setPlayerNames] = React.useState<[string, string]>([
    DEFAULT_HOLDEM_DISPLAY_NAMES[0]!,
    DEFAULT_HOLDEM_DISPLAY_NAMES[1]!,
  ]);

  React.useEffect(() => {
    setPlayerNames(loadHoldemDisplayNames());
  }, []);

  const updateName = React.useCallback((p: PlayerIndex, raw: string) => {
    setPlayerNames((prev) => {
      const fb =
        p === 0
          ? DEFAULT_HOLDEM_DISPLAY_NAMES[0]!
          : DEFAULT_HOLDEM_DISPLAY_NAMES[1]!;
      const t = raw.trim();
      const nextName = t.length > 0 ? t.slice(0, 24) : fb;
      const next: [string, string] =
        p === 0 ? [nextName, prev[1]!] : [prev[0]!, nextName];
      saveHoldemDisplayNames(next);
      return next;
    });
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
              핸드 풀 홀덤 (로컬 2인)
            </h1>
            <p className="text-xs text-zinc-400">
              {TOTAL_ROUNDS}라운드 · 시작 {STARTING_CHIPS}칩 (1bb=1칩) · 표시 이름은
              이 기기에 저장됩니다
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-600/90 bg-zinc-700/50 p-2 lg:min-w-[18rem]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-1 text-[10px] font-medium uppercase text-zinc-400">
                내 좌석
              </span>
              {([0, 1] as PlayerIndex[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setViewer(p)}
                  title={`${playerNames[p]} (P${p}) 관점으로 카드를 표시합니다.`}
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
                P0 표시 이름
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
                P1 표시 이름
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
              상대 · {playerNames[other(viewer)]} (P{other(viewer)})
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
              onSelect={(player, templateId) =>
                dispatch({ type: "SELECT_HAND", player, templateId })
              }
            />
          </div>

          <div className="space-y-3 lg:hidden">
            <ActionPanel
              state={state}
              dispatch={dispatch}
              playerNames={playerNames}
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
                나 · {playerNames[viewer]} (P{viewer})
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
                dispatch={dispatch}
                playerNames={playerNames}
              />
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-4xl lg:max-w-5xl">
          <HandLog
            logs={state.logs}
            playerNames={playerNames}
            showdownHoleCtx={showdownHoleCtx}
          />
        </div>
      </div>
    </div>
  );
}
