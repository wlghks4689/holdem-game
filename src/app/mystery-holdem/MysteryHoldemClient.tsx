"use client";

import * as React from "react";
import Link from "next/link";
import { CardBack, PlayingCard } from "@/app/holdem/components/Card";
import { DEFAULT_PROTOTYPE_SEAT_COUNT, MYSTERY_HOLDEM_CONFIG } from "@/mysteryHoldem/config";
import { createInitialMysteryGameState, currentTotalPot, mysteryHoldemReducer } from "@/mysteryHoldem/gameReducer";
import { positionLabelForSeat } from "@/mysteryHoldem/positions";
import { legalActionsForSeat, potLimitMaxRaiseDisplay } from "@/mysteryHoldem/selectors";
import type { MysteryGameAction, MysteryGameState, PlayerState, Seat } from "@/mysteryHoldem/types";
import { decideBotAction, pickHoleKeepIndexes, pickMissionId } from "./mysteryBot";

const HERO_SEAT: Seat = 0;
const BOT_DELAY_MS = 650;

function reducerWithRng(state: MysteryGameState, action: MysteryGameAction): MysteryGameState {
  return mysteryHoldemReducer(state, action, Math.random);
}

function seatStyle(indexFromHero: number, total: number): React.CSSProperties {
  const angle = Math.PI / 2 + (indexFromHero / total) * 2 * Math.PI;
  const rx = 43;
  const ry = 37;
  const x = 50 + rx * Math.cos(angle);
  const y = 50 + ry * Math.sin(angle);
  return { left: `${x}%`, top: `${y}%` };
}

function fmt(n: number): string {
  return Math.round(n * 10) / 10 === Math.round(n) ? String(Math.round(n)) : n.toFixed(1);
}

export function MysteryHoldemClient() {
  const [state, dispatch] = React.useReducer(reducerWithRng, undefined, createInitialMysteryGameState);
  const [seatCount, setSeatCount] = React.useState(DEFAULT_PROTOTYPE_SEAT_COUNT);
  const [keepPicks, setKeepPicks] = React.useState<number[]>([]);
  const [raiseTo, setRaiseTo] = React.useState<number | null>(null);

  // 봇 자동 진행: hand_setup 선택 및 베팅 턴을 순차적으로 처리한다.
  React.useEffect(() => {
    if (state.phase === "lobby" || state.matchEnded) return;
    const timer = setTimeout(() => {
      if (state.phase === "hand_setup") {
        const botHoleSeat = state.awaitingHoleSelection.find((s) => s !== HERO_SEAT);
        if (botHoleSeat != null) {
          dispatch({ type: "SELECT_HOLE_CARDS", seat: botHoleSeat, keepIndexes: pickHoleKeepIndexes() });
          return;
        }
        const botMissionSeat = state.awaitingMissionSelection.find((s) => s !== HERO_SEAT);
        if (botMissionSeat != null) {
          const missionId = pickMissionId(state, botMissionSeat, Math.random);
          if (missionId) dispatch({ type: "SELECT_MISSION", seat: botMissionSeat, missionId });
        }
        return;
      }
      if (state.toActSeat != null && state.toActSeat !== HERO_SEAT) {
        dispatch(decideBotAction(state, state.toActSeat, Math.random));
      }
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  React.useEffect(() => {
    setKeepPicks([]);
    setRaiseTo(null);
  }, [state.round, state.phase]);

  if (state.phase === "lobby") {
    return <LobbyScreen seatCount={seatCount} onSeatCount={setSeatCount} onStart={() => dispatch({ type: "START_MATCH", seatCount })} />;
  }

  const hero = state.players.find((p) => p.seat === HERO_SEAT)!;
  const legal = legalActionsForSeat(state, HERO_SEAT);
  const potMax = potLimitMaxRaiseDisplay(state, HERO_SEAT);
  const pot = currentTotalPot(state);
  const heroNeedsHoleSelection = state.awaitingHoleSelection.includes(HERO_SEAT);
  const heroNeedsMission = state.awaitingMissionSelection.includes(HERO_SEAT);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-6 sm:px-6">
        <TopBar state={state} />

        <div className="relative mx-auto aspect-[16/10] w-full max-w-3xl rounded-[999px] border-4 border-emerald-900/60 bg-gradient-to-b from-emerald-800/40 to-emerald-950/60 shadow-2xl">
          <div className="absolute inset-[10%] rounded-[999px] border border-emerald-700/40 bg-emerald-900/30" />

          {/* 커뮤니티 카드 + 팟 */}
          <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i}>
                  {i < state.board.length ? (
                    <PlayingCard card={state.board[i]!} size="community" />
                  ) : (
                    <div className="h-[clamp(4.7178rem,20.97vw,5.535rem)] w-[clamp(3.54375rem,15.75vw,4.158rem)] rounded-lg border border-dashed border-emerald-700/40" />
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-full bg-black/50 px-4 py-1 text-sm font-semibold text-amber-300 shadow">
              Pot {fmt(pot)}
              {state.pots.length > 1 ? ` (Side x${state.pots.length - 1})` : ""}
            </div>
          </div>

          {state.players.map((p) => {
            const idx = (p.seat - HERO_SEAT + state.seatCount) % state.seatCount;
            return (
              <SeatView
                key={p.seat}
                player={p}
                state={state}
                style={seatStyle(idx, state.seatCount)}
                isHero={p.seat === HERO_SEAT}
              />
            );
          })}
        </div>

        {heroNeedsHoleSelection || heroNeedsMission ? (
          <HandSetupPanel
            state={state}
            hero={hero}
            needsHole={heroNeedsHoleSelection}
            needsMission={heroNeedsMission}
            keepPicks={keepPicks}
            setKeepPicks={setKeepPicks}
            onConfirmHole={(a, b) => dispatch({ type: "SELECT_HOLE_CARDS", seat: HERO_SEAT, keepIndexes: [a, b] })}
            onConfirmMission={(id) => dispatch({ type: "SELECT_MISSION", seat: HERO_SEAT, missionId: id })}
          />
        ) : null}

        {["preflop", "flop", "turn", "river"].includes(state.phase) && !heroNeedsHoleSelection && !heroNeedsMission ? (
          <HeroPanel
            hero={hero}
            state={state}
            legal={legal}
            potMax={potMax}
            raiseTo={raiseTo}
            setRaiseTo={setRaiseTo}
            dispatch={dispatch}
          />
        ) : null}

        {state.phase === "hand_over" && !state.matchEnded ? (
          <HandOverPanel state={state} onContinue={() => dispatch({ type: "START_NEXT_HAND" })} />
        ) : null}

        {state.phase === "match_over" || state.matchEnded ? (
          <MatchOverPanel state={state} onPlayAgain={() => dispatch({ type: "START_MATCH", seatCount })} />
        ) : null}

        <LogPanel state={state} />
      </div>
    </div>
  );
}

function LobbyScreen({
  seatCount,
  onSeatCount,
  onStart,
}: {
  seatCount: number;
  onSeatCount: (n: number) => void;
  onStart: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 px-4 text-zinc-50">
      <div className="w-full max-w-md rounded-2xl border border-fuchsia-700/50 bg-zinc-900/70 p-6 shadow-2xl">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-fuchsia-400">Mystery Mission Poker</p>
        <h1 className="mb-2 text-2xl font-bold">MysteryHoldem</h1>
        <p className="mb-6 text-sm leading-relaxed text-zinc-400">
          3장 중 2장을 골라 시작하고, 비공개 Mystery Mission으로 추가 점수를 노리세요. Chip Point + Mission
          Point + Bounty Point 합산 Total Point 최고점이 15라운드 후 승리합니다.
        </p>

        <div className="mb-5 rounded-xl border border-zinc-700 bg-zinc-950/50 p-3 text-xs text-zinc-400">
          <div className="flex justify-between py-0.5">
            <span>시작 칩</span>
            <span className="text-zinc-200">{MYSTERY_HOLDEM_CONFIG.startingChips.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>블라인드 / 앤티</span>
            <span className="text-zinc-200">
              {MYSTERY_HOLDEM_CONFIG.smallBlind}/{MYSTERY_HOLDEM_CONFIG.bigBlind} · BB Ante{" "}
              {MYSTERY_HOLDEM_CONFIG.bigBlindAnte}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>전체 라운드</span>
            <span className="text-zinc-200">{MYSTERY_HOLDEM_CONFIG.totalRounds}</span>
          </div>
        </div>

        <label className="mb-2 block text-xs font-semibold text-zinc-400">
          플레이어 수 (본인 포함, 나머지는 로컬 봇): {seatCount}명
        </label>
        <input
          type="range"
          min={MYSTERY_HOLDEM_CONFIG.minSeats}
          max={MYSTERY_HOLDEM_CONFIG.maxSeats}
          value={seatCount}
          onChange={(e) => onSeatCount(Number(e.target.value))}
          className="mb-6 w-full accent-fuchsia-500"
        />

        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-xl bg-fuchsia-600 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition hover:bg-fuchsia-500 active:scale-[0.99]"
        >
          게임 시작
        </button>

        <Link href="/" className="mt-4 block text-center text-xs text-zinc-500 hover:text-zinc-300">
          ← 홈으로
        </Link>
      </div>
    </div>
  );
}

function TopBar({ state }: { state: MysteryGameState }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-700/70 bg-zinc-900/60 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">MysteryHoldem</span>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          홈
        </Link>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-300">
        <span>
          Round <span className="font-bold text-zinc-50">{state.round}</span>/{state.config.totalRounds}
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 uppercase tracking-wide text-zinc-400">
          {state.phase}
        </span>
        {state.betting.raiseCap > 0 ? (
          <span className="text-zinc-500">
            Raise {state.betting.raisesUsed}/{state.betting.raiseCap}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SeatView({
  player,
  state,
  style,
  isHero,
}: {
  player: PlayerState;
  state: MysteryGameState;
  style: React.CSSProperties;
  isHero: boolean;
}) {
  const pos = positionLabelForSeat(player.seat, state.buttonSeat, state.seatCount);
  const isActing = state.toActSeat === player.seat;
  const showCards = isHero || state.phase === "showdown" || state.phase === "hand_over" || state.phase === "match_over";

  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={style}
    >
      <div className="flex gap-0.5">
        {player.holeCards.length > 0 && !player.folded
          ? player.holeCards.map((c, i) =>
              showCards && !player.folded ? (
                <PlayingCard key={i} card={c} size="compact" />
              ) : (
                <CardBack key={i} size="compact" />
              ),
            )
          : null}
      </div>
      <div
        className={[
          "flex min-w-[92px] flex-col items-center rounded-lg border px-2 py-1 text-center shadow",
          player.busted
            ? "border-zinc-800 bg-zinc-900/70 opacity-50"
            : isActing
              ? "border-amber-400 bg-amber-950/50"
              : player.folded
                ? "border-zinc-700 bg-zinc-900/60 opacity-60"
                : "border-zinc-600 bg-zinc-900/80",
        ].join(" ")}
      >
        <span className="text-[11px] font-semibold text-zinc-100">
          {player.name} {isHero ? "(you)" : ""}
        </span>
        <span className="text-[10px] text-zinc-400">
          {pos} · {player.busted ? "Busted" : fmt(player.chips)}
        </span>
        {player.folded && !player.busted ? <span className="text-[10px] text-rose-400">Fold</span> : null}
        {player.allIn ? <span className="text-[10px] text-amber-400">All-In</span> : null}
        {player.streetContribution > 0 && !player.folded && !player.busted ? (
          <span className="text-[10px] text-emerald-300">Bet {fmt(player.streetContribution)}</span>
        ) : null}
      </div>
    </div>
  );
}

function HandSetupPanel({
  state,
  hero,
  needsHole,
  needsMission,
  keepPicks,
  setKeepPicks,
  onConfirmHole,
  onConfirmMission,
}: {
  state: MysteryGameState;
  hero: PlayerState;
  needsHole: boolean;
  needsMission: boolean;
  keepPicks: number[];
  setKeepPicks: (v: number[]) => void;
  onConfirmHole: (a: number, b: number) => void;
  onConfirmMission: (missionId: string) => void;
}) {
  const toggle = (idx: number) => {
    setKeepPicks(
      keepPicks.includes(idx)
        ? keepPicks.filter((i) => i !== idx)
        : keepPicks.length < 2
          ? [...keepPicks, idx]
          : keepPicks,
    );
  };

  return (
    <div className="rounded-2xl border border-fuchsia-700/50 bg-zinc-900/70 p-4 shadow-xl">
      {needsHole ? (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-zinc-200">3장 중 2장을 선택하세요 (1장 버림)</p>
          <div className="flex gap-3">
            {hero.pendingDeal.map((c, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggle(idx)}
                className={[
                  "rounded-lg p-1 transition",
                  keepPicks.includes(idx) ? "ring-2 ring-fuchsia-400" : "opacity-70 hover:opacity-100",
                ].join(" ")}
              >
                <PlayingCard card={c} size="hero" />
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={keepPicks.length !== 2}
            onClick={() => onConfirmHole(keepPicks[0]!, keepPicks[1]!)}
            className="mt-3 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-40"
          >
            선택 확정
          </button>
        </div>
      ) : null}

      {needsMission ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-zinc-200">Mystery Mission을 선택하세요(비공개)</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(state.missionOffers[hero.seat] ?? []).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onConfirmMission(m.id)}
                className="flex flex-col gap-1 rounded-xl border border-zinc-700 bg-zinc-950/50 p-3 text-left transition hover:border-fuchsia-500/70 hover:bg-fuchsia-950/20"
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-400">
                  {m.category}
                </span>
                <span className="text-sm font-semibold text-zinc-100">{m.name}</span>
                <span className="text-xs leading-snug text-zinc-400">{m.description}</span>
                <span className="mt-1 text-[11px] font-semibold text-amber-300">+{m.reward} Mission Point</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeroPanel({
  hero,
  state,
  legal,
  potMax,
  raiseTo,
  setRaiseTo,
  dispatch,
}: {
  hero: PlayerState;
  state: MysteryGameState;
  legal: ReturnType<typeof legalActionsForSeat>;
  potMax: number;
  raiseTo: number | null;
  setRaiseTo: (n: number | null) => void;
  dispatch: (a: MysteryGameAction) => void;
}) {
  const isMyTurn = state.toActSeat === HERO_SEAT;
  const range = legal.raiseRange;
  const sliderValue = raiseTo ?? range?.min ?? 0;

  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1.5">
          {hero.holeCards.map((c, i) => (
            <PlayingCard key={i} card={c} size="hero" />
          ))}
        </div>
        {hero.mission ? (
          <div className="max-w-[55%] rounded-lg border border-fuchsia-700/50 bg-fuchsia-950/20 px-3 py-1.5 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-400">My Mission</p>
            <p className="text-xs font-semibold text-zinc-100">{hero.mission.def.name}</p>
          </div>
        ) : null}
      </div>

      {!isMyTurn ? (
        <p className="text-center text-xs text-zinc-500">
          {state.toActSeat == null ? "정산 중..." : `Seat ${state.toActSeat} 차례를 기다리는 중...`}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: "FOLD", seat: HERO_SEAT })}
            className="rounded-lg border border-rose-700/60 bg-rose-950/30 px-4 py-2 text-xs font-bold uppercase text-rose-200 hover:bg-rose-900/40"
          >
            Fold
          </button>
          {legal.canCheck ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "CHECK", seat: HERO_SEAT })}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-xs font-bold uppercase text-zinc-100 hover:bg-zinc-700"
            >
              Check
            </button>
          ) : null}
          {legal.canCall ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "CALL", seat: HERO_SEAT })}
              className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-xs font-bold uppercase text-emerald-200 hover:bg-emerald-900/40"
            >
              Call {fmt(legal.callAmount)}
            </button>
          ) : null}
          {legal.canAllIn ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "ALL_IN", seat: HERO_SEAT })}
              className="rounded-lg border border-amber-600/60 bg-amber-950/30 px-4 py-2 text-xs font-bold uppercase text-amber-200 hover:bg-amber-900/40"
            >
              All-In
            </button>
          ) : null}

          {(legal.canBet || legal.canRaise) && range ? (
            <div className="flex w-full items-center gap-2 pt-1 sm:w-auto">
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={1}
                value={Math.min(Math.max(sliderValue, range.min), range.max)}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                className="w-40 accent-fuchsia-500"
              />
              <span className="w-16 text-xs text-zinc-300">{fmt(Math.min(Math.max(sliderValue, range.min), range.max))}</span>
              <button
                type="button"
                onClick={() =>
                  dispatch(
                    legal.canBet
                      ? { type: "BET", seat: HERO_SEAT, amount: Math.min(Math.max(sliderValue, range.min), range.max) }
                      : { type: "RAISE", seat: HERO_SEAT, toAmount: Math.min(Math.max(sliderValue, range.min), range.max) },
                  )
                }
                className="rounded-lg border border-fuchsia-600/60 bg-fuchsia-950/30 px-4 py-2 text-xs font-bold uppercase text-fuchsia-200 hover:bg-fuchsia-900/40"
              >
                {legal.canBet ? "Bet" : "Raise"} (Pot Limit Max {fmt(potMax)})
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function HandOverPanel({ state, onContinue }: { state: MysteryGameState; onContinue: () => void }) {
  const recentLogs = state.logs.filter(
    (l) => l.t === "showdown" || l.t === "fold_win" || l.t === "mission_result" || l.t === "bounty_awarded" || l.t === "player_busted",
  );
  const lastRoundStartIdx = [...state.logs].reverse().findIndex((l) => l.t === "round_start");
  const sliceFrom = lastRoundStartIdx >= 0 ? state.logs.length - 1 - lastRoundStartIdx : 0;
  const thisHandLogs = recentLogs.filter((l) => state.logs.indexOf(l) >= sliceFrom);

  return (
    <div className="rounded-2xl border border-amber-700/50 bg-zinc-900/70 p-4 shadow-xl">
      <p className="mb-2 text-sm font-bold text-amber-300">Round {state.round} 결과</p>
      <ul className="mb-3 flex flex-col gap-1 text-xs text-zinc-300">
        {thisHandLogs.map((l, i) => (
          <li key={i}>{describeLog(l)}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-amber-500"
      >
        다음 라운드
      </button>
    </div>
  );
}

function MatchOverPanel({ state, onPlayAgain }: { state: MysteryGameState; onPlayAgain: () => void }) {
  const rows = [...state.players].sort((a, b) => b.totalPoint - a.totalPoint);
  return (
    <div className="rounded-2xl border border-fuchsia-700/60 bg-zinc-900/80 p-5 shadow-2xl">
      <p className="mb-1 text-lg font-bold text-fuchsia-300">
        {state.matchEndReason === "last_player_standing" ? "Last Player Standing!" : "게임 종료"}
      </p>
      <p className="mb-4 text-xs text-zinc-400">
        {state.matchEndReason === "last_player_standing"
          ? "한 명을 제외한 전원이 버스트되어 즉시 승리합니다."
          : `${state.config.totalRounds}라운드가 종료되었습니다.`}
        {state.matchWinners && state.matchWinners.length > 1 ? " (동점 — 무승부)" : ""}
      </p>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 pr-2">Seat</th>
              <th className="py-1 pr-2">Chip Point</th>
              <th className="py-1 pr-2">Mission Point</th>
              <th className="py-1 pr-2">Bounty Point</th>
              <th className="py-1 pr-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const isWinner = state.matchWinners?.includes(p.seat);
              return (
                <tr
                  key={p.seat}
                  className={isWinner ? "font-bold text-amber-300" : "text-zinc-200"}
                >
                  <td className="py-1 pr-2">
                    {p.name} {isWinner ? "🏆" : ""}
                  </td>
                  <td className="py-1 pr-2">{fmt(p.chipPoint)}</td>
                  <td className="py-1 pr-2">{fmt(p.missionPoint)}</td>
                  <td className="py-1 pr-2">{fmt(p.bountyPoint)}</td>
                  <td className="py-1 pr-2">{fmt(p.totalPoint)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onPlayAgain}
        className="rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-fuchsia-500"
      >
        새 게임
      </button>
    </div>
  );
}

function LogPanel({ state }: { state: MysteryGameState }) {
  const tail = state.logs.slice(-8);
  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-500">
      <summary className="cursor-pointer select-none text-zinc-400">진행 로그</summary>
      <ul className="mt-2 flex flex-col gap-0.5">
        {tail.map((l, i) => (
          <li key={i}>{describeLog(l)}</li>
        ))}
      </ul>
    </details>
  );
}

function describeLog(l: MysteryGameState["logs"][number]): string {
  switch (l.t) {
    case "match_start":
      return `매치 시작 (${l.seatCount}인)`;
    case "round_start":
      return `Round ${l.round} 시작 (버튼: Seat ${l.buttonSeat})`;
    case "blinds_posted":
      return `블라인드: SB(${l.sb}) ${l.sbAmount} / BB(${l.bb}) ${l.bbAmount} + Ante ${l.anteAmount}`;
    case "hole_selected":
      return `Seat ${l.seat} 카드 선택 완료`;
    case "mission_offered":
      return `Seat ${l.seat} Mission 후보 제시`;
    case "mission_selected":
      return `Seat ${l.seat} Mission 선택`;
    case "action":
      return `Seat ${l.seat} ${l.action}${l.amount != null ? ` ${fmt(l.amount)}` : ""} (${l.street})`;
    case "street_cards":
      return `${l.street} 오픈 (Pot ${fmt(l.pot)})`;
    case "fold_win":
      return `Seat ${l.winner} 폴드 승리 (Pot ${fmt(l.pot)})`;
    case "showdown":
      return `Pot #${l.potIndex + 1} (${fmt(l.potAmount)}) → ${l.desc}`;
    case "mission_result":
      return l.achieved ? `Seat ${l.seat} Mission 성공! +${l.reward}pt` : `Seat ${l.seat} Mission 실패`;
    case "bounty_awarded":
      return `Seat ${l.seat} Bounty +${fmt(l.reward)}pt (버스트: Seat ${l.bustedSeat})`;
    case "player_busted":
      return `Seat ${l.seat} 버스트`;
    case "match_over":
      return `매치 종료 (${l.reason}) — 승자: ${l.winners.join(", ")}`;
    default:
      return "";
  }
}
