"use client";

import * as React from "react";
import { formatBlindLineFull, resolveHandBlinds } from "@/holdem/blindLevels";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import { totalRoundsForMode } from "@/holdem/gameModeRules";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { GameState, PlayerIndex } from "@/holdem/types";
import {
  bettingActionDisplayAmount,
  bettingActionLabel,
} from "../bettingActionPressure";
import { BoardDisplay, type BoardRabbitHuntUi } from "./BoardDisplay";
import { HoleCards } from "./HoleCards";
import { PlayAreaPotBetting } from "./PlayAreaPotBetting";

type HoldemTableStageProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
  cinematicWinnerPulse?: boolean;
  showdownFxArmed?: boolean;
  showdownRunoutFx?: boolean;
  showdownHoleCardsRevealed?: boolean;
  visualRevealedOverride?: number | null;
  cinematicFlip?: boolean;
  cinemaStreetPulse?: "flop" | "turn" | "river" | null;
  cinemaAnticipation?: "flop" | "turn" | "river" | null;
  rabbitHunt?: BoardRabbitHuntUi | null;
};

function fmtChips(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function TableBetChip({ amount }: { amount: number }) {
  if (amount <= 1e-9) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-full bg-black/60 px-2 py-1 shadow-md ring-1 ring-black/45"
      aria-label={`Bet ${fmtChips(amount)}`}
    >
      <span className="h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-amber-100/90 bg-gradient-to-b from-amber-400 to-amber-600 shadow-inner" />
      <span className="text-[10px] font-bold tabular-nums leading-none text-amber-100 sm:text-xs">
        {fmtChips(amount)}
      </span>
    </div>
  );
}

type TableSeatActionState = {
  id: number;
  label: string;
  amountLabel?: string;
};

function currentStreetSeatActions(state: GameState): [TableSeatActionState | null, TableSeatActionState | null] {
  let actions: [TableSeatActionState | null, TableSeatActionState | null] = [null, null];
  let raisesThisStreet = 0;
  const start = Math.max(
    0,
    state.logs.map((message) => message.t).lastIndexOf("round_start"),
  );

  state.logs.slice(start).forEach((message, offset) => {
    const id = start + offset;
    if (message.t === "street_cards") {
      actions = [null, null];
      raisesThisStreet = 0;
      return;
    }
    if (message.t === "ia") {
      actions[message.player] = {
        id,
        label: "IA",
        amountLabel: `−${chipsAsBbLabel(message.cost, resolveHandBlinds(state).bb)}`,
      };
      return;
    }
    if (message.t === "showdown" && message.folder != null) {
      actions[message.folder] = { id, label: "FOLD" };
      return;
    }
    if (message.t !== "preflop_action" && message.t !== "postflop_action") return;

    if (message.action === "레이즈") raisesThisStreet += 1;
    const amount = bettingActionDisplayAmount(message, message.amount);
    actions[message.player] = {
      id,
      label: bettingActionLabel(message, raisesThisStreet),
      amountLabel:
        amount != null
          ? chipsAsBbLabel(amount, resolveHandBlinds(state).bb)
          : undefined,
    };
  });

  return actions;
}

function TableSeatAction({
  action,
  isHero,
  playerName,
}: {
  action: TableSeatActionState | null;
  isHero: boolean;
  playerName: string;
}) {
  const intense = action?.label === "ALL-IN" || action?.label.includes("4-BET");
  const raised = action?.label === "RAISE" || action?.label.includes("3-BET");
  return (
    <div
      key={action?.id ?? "empty"}
      className={[
        "flex min-h-[2.65rem] w-12 shrink-0 flex-col items-center justify-center rounded-lg border px-1 py-1 text-center shadow-md transition-all sm:w-[5.5rem]",
        action == null
          ? "pointer-events-none border-transparent opacity-0"
          : intense
            ? "border-rose-300/75 bg-rose-950/90 text-white shadow-[0_0_22px_rgba(244,63,94,0.32)]"
            : raised
              ? "border-orange-400/65 bg-orange-950/80 text-orange-50 shadow-[0_0_16px_rgba(251,146,60,0.2)]"
              : isHero
                ? "border-emerald-400/45 bg-emerald-950/70 text-emerald-100"
                : "border-violet-400/45 bg-violet-950/70 text-violet-100",
        action != null
          ? "animate-[holdem-opponent-action-in_0.28s_cubic-bezier(0.22,1,0.36,1)_both]"
          : "",
      ].join(" ")}
      aria-label={
        action == null
          ? undefined
          : `${playerName} ${action.label}${action.amountLabel ? ` ${action.amountLabel}` : ""}`
      }
      aria-hidden={action == null ? true : undefined}
    >
      <span className="text-[9px] font-black leading-none tracking-[0.06em] sm:text-[10px]">
        {action?.label ?? "WAIT"}
      </span>
      {action?.amountLabel ? (
        <span className="mt-1 text-[9px] font-bold tabular-nums leading-none opacity-85 sm:text-[10px]">
          {action.amountLabel}
        </span>
      ) : null}
    </div>
  );
}

function TableRoundBlind({ state }: { state: GameState }) {
  const totalRounds = totalRoundsForMode(state.gameMode, state.costStructure);
  return (
    <div className="max-w-full truncate rounded-full border border-emerald-400/15 bg-black/20 px-2 py-0.5 text-[9px] font-semibold tabular-nums tracking-tight text-emerald-100/45 sm:text-[10px]">
      R{state.roundNumber}
      <span className="text-emerald-100/25"> / {totalRounds} · </span>
      {formatBlindLineFull(resolveHandBlinds(state))}
    </div>
  );
}

function TableSeatBadge({
  state,
  player,
}: {
  state: GameState;
  player: PlayerIndex;
}) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const blinds = resolveHandBlinds(state);

  return (
    <div className="px-1.5 pb-1 pt-1 text-center">
      <p className="whitespace-nowrap font-mono text-[11px] font-bold tabular-nums text-zinc-100 portrait:text-[10px] sm:text-xs">
        {fmtChips(state.chips[player]!)}
        <span className="font-sans font-medium text-zinc-400">{isEn ? " chips" : "칩"}</span>
        <span className="px-1 text-zinc-600">·</span>
        <span className="text-amber-200">{chipsAsBbLabel(state.chips[player]!, blinds.bb)}</span>
      </p>
    </div>
  );
}

function TableSeat({
  state,
  player,
  viewer,
  playerNames,
  action,
  cinematicWinnerPulse,
  showdownFxArmed,
  showdownRunoutFx,
  showdownHoleCardsRevealed,
}: {
  state: GameState;
  player: PlayerIndex;
  viewer: PlayerIndex;
  playerNames: [string, string];
  action: TableSeatActionState | null;
  cinematicWinnerPulse?: boolean;
  showdownFxArmed?: boolean;
  showdownRunoutFx?: boolean;
  showdownHoleCardsRevealed?: boolean;
}) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const activeBetting = ["preflop", "flop", "turn", "river"].includes(state.phase);
  const acting = activeBetting && state.toAct === player && !state.matchEnded;
  const folded =
    state.phase === "hand_over" &&
    state.handEndMode === "fold" &&
    state.winner != null &&
    state.winner !== player;
  const wonHand =
    (state.phase === "showdown" || state.phase === "hand_over") &&
    state.winner != null &&
    state.winner === player;
  const lostHand =
    (state.phase === "showdown" || state.phase === "hand_over") &&
    state.winner != null &&
    state.winner !== player;

  return (
    <div className="z-30 flex min-h-[7.25rem] w-full items-center justify-center">
      <div className="flex items-end justify-center gap-1 sm:gap-2">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="flex h-5 items-center justify-center">
            <TableBetChip amount={state.betting.contributed[player]!} />
          </div>
          <div
            className={[
              "relative w-[7.25rem] rounded-xl border px-1 pb-0.5 pt-1 shadow-lg backdrop-blur-[3px] transition-[border-color,background-color,box-shadow,opacity] duration-200 sm:w-[8.75rem]",
              wonHand
                ? "border-amber-300/90 bg-amber-950/85 shadow-[0_0_26px_rgba(251,191,36,0.34)]"
                : lostHand || folded
                  ? "border-zinc-700/80 bg-zinc-950/80 opacity-60"
                  : acting
                    ? "border-emerald-300/90 bg-emerald-950/88 shadow-[0_0_24px_rgba(52,211,153,0.3)]"
                    : player === viewer
                      ? "border-sky-500/55 bg-sky-950/80"
                      : "border-violet-500/50 bg-violet-950/75",
            ].join(" ")}
            data-table-seat={player === viewer ? "hero" : "opponent"}
          >
            {state.button === player ? (
              <span
                className="absolute right-0.5 top-0.5 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-amber-200/80 bg-amber-400 text-[8px] font-black leading-none text-amber-950 shadow-[0_1px_5px_rgba(0,0,0,0.55)]"
                title={isEn ? "Dealer" : "딜러"}
                aria-label={isEn ? "Dealer button" : "딜러 버튼"}
              >
                D
              </span>
            ) : null}
            <div className="[&>div>div]:border-0 [&>div>div]:bg-transparent [&>div>div]:shadow-none">
              <HoleCards
                state={state}
                viewer={viewer}
                playerNames={playerNames}
                seatFilter={player === viewer ? "hero" : "opponent"}
                variant="table"
                tableCardSize="seat"
                embedded
                cinematicWinnerPulse={cinematicWinnerPulse}
                showdownFxArmed={showdownFxArmed}
                showdownRunoutFx={showdownRunoutFx}
                showdownHoleCardsRevealed={showdownHoleCardsRevealed}
              />
            </div>
            <TableSeatBadge state={state} player={player} />
          </div>
        </div>
        <TableSeatAction
          action={action}
          isHero={player === viewer}
          playerName={playerNames[player]}
        />
      </div>
    </div>
  );
}

export function HoldemTableStage({
  state,
  viewer,
  playerNames,
  cinematicWinnerPulse,
  showdownFxArmed,
  showdownRunoutFx,
  showdownHoleCardsRevealed,
  visualRevealedOverride,
  cinematicFlip,
  cinemaStreetPulse,
  cinemaAnticipation,
  rabbitHunt,
}: HoldemTableStageProps) {
  const opponent: PlayerIndex = viewer === 0 ? 1 : 0;
  const revealSeatCards = state.phase === "showdown" || state.phase === "hand_over";
  const awardedPot = state.potAwardFlash?.reduce(
    (sum, value) => sum + Math.max(0, value),
    0,
  ) ?? 0;
  const displayedPotState =
    revealSeatCards && state.pot <= 1e-9 && awardedPot > 1e-9
      ? { ...state, pot: awardedPot }
      : state;
  const seatActions = currentStreetSeatActions(state);

  return (
    <div
      className="holdem-shared-table relative mx-auto aspect-[5/3] w-full max-w-4xl overflow-hidden rounded-[4rem] border-4 border-emerald-900/70 bg-gradient-to-b from-emerald-800/45 via-emerald-900/50 to-emerald-950/75 shadow-[0_20px_56px_rgba(0,0,0,0.42),inset_0_0_60px_rgba(6,78,59,0.3)] portrait:aspect-auto portrait:min-h-[25rem] portrait:rounded-[3rem]"
      aria-label="Heads-up poker table"
    >
      <div className="pointer-events-none absolute inset-[7%] rounded-[999px] border border-emerald-600/35 bg-emerald-950/18 shadow-[inset_0_0_40px_rgba(0,0,0,0.2)]" />
      <div className="pointer-events-none absolute inset-[13%] rounded-[999px] border border-dashed border-emerald-500/15" />

      <div className="relative z-10 flex h-full min-h-[inherit] flex-col items-center justify-between px-3 py-3 portrait:px-1 sm:px-8 sm:py-4 lg:px-12">
        <TableSeat
          state={state}
          player={opponent}
          viewer={viewer}
          playerNames={playerNames}
          action={seatActions[opponent]}
          cinematicWinnerPulse={cinematicWinnerPulse}
          showdownFxArmed={showdownFxArmed}
          showdownRunoutFx={showdownRunoutFx}
          showdownHoleCardsRevealed={showdownHoleCardsRevealed}
        />

        <div className="flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-1.5 sm:gap-2">
          <TableRoundBlind state={state} />
          <div className="w-full">
            <BoardDisplay
              state={state}
              variant="table"
              visualRevealedOverride={visualRevealedOverride}
              cinematicFlip={cinematicFlip}
              cinemaStreetPulse={cinemaStreetPulse}
              cinemaAnticipation={cinemaAnticipation}
              showdownFxArmed={showdownFxArmed}
              rabbitHunt={rabbitHunt}
            />
          </div>
          <div className="w-[88%] max-w-xl portrait:w-[94%]">
            <PlayAreaPotBetting
              state={displayedPotState}
              viewer={viewer}
              playerNames={playerNames}
              variant="table"
            />
          </div>
        </div>

        <TableSeat
          state={state}
          player={viewer}
          viewer={viewer}
          playerNames={playerNames}
          action={seatActions[viewer]}
          cinematicWinnerPulse={cinematicWinnerPulse}
          showdownFxArmed={showdownFxArmed}
          showdownRunoutFx={showdownRunoutFx}
          showdownHoleCardsRevealed={showdownHoleCardsRevealed}
        />
      </div>
    </div>
  );
}
