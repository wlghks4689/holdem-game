'use client';

import * as React from "react";
import {
  actorStackBb,
  actorAllInActionKind,
  bettingMatched,
  effectiveCallPay,
  facingFor,
  iaAppliedCostFromStack,
  isLegalPreflopRaiseTarget,
  levelFromContributions,
  postflopCustomMaxRaiseToLevel,
  postflopRaiseTargetCappedByOpponent,
  headsUpSubBbVoluntaryEnabled,
  postflopMaxOpenBetForActor,
  postflopMinRaiseTargetForActor,
  preflopRaiseSliderRange,
  preflopAllInTotalContribution,
  roundHalfChip,
  streetRaiseCapReached,
} from "@/holdem/bettingHelpers";
import {
  ACTION_TIMER_SECONDS,
  HAND_SELECT_TIMER_SECONDS,
  IA_RIVER_ACTION_EXTRA_SECONDS,
  NEW_HAND_AUTO_SECONDS,
  SMALLEST_CHIP,
} from "@/holdem/constants";
import { actionTimerLimitMs } from "@/holdem/actionTimer";
import { resolveHandBlinds } from "@/holdem/blindLevels";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import { headsUpPositionLabel } from "@/holdem/headsUpLabels";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { GameAction, GameState, PlayerIndex } from "@/holdem/types";

// ─── types ────────────────────────────────────────────────────────────────────

export type ActionPanelProps = {
  state: GameState;
  dispatch: (a: GameAction) => void | Promise<void>;
  playerNames: [string, string];
  /** 온라인 방: 내 차례일 때만 액션 버튼 표시 */
  mySeat?: PlayerIndex;
  /** 액션/핸드선택 제한시간 남은 초 — 헤더 우측 표시 */
  actionTimerSecondsLeft?: number | null;
};

// ─── ActionTimerChip ──────────────────────────────────────────────────────────

function ActionTimerChip({
  secondsLeft,
  isHandSelect,
  limitSeconds,
  isEn = false,
}: {
  secondsLeft: number;
  isHandSelect: boolean;
  limitSeconds?: number;
  isEn?: boolean;
}) {
  const limitForTitle =
    limitSeconds ?? (isHandSelect ? HAND_SELECT_TIMER_SECONDS : ACTION_TIMER_SECONDS);
  return (
    <div
      className={[
        "shrink-0 rounded-md px-2 py-0.5 font-mono font-bold tabular-nums leading-tight",
        secondsLeft <= 10
          ? "bg-rose-900/55 text-rose-100 ring-1 ring-rose-500/45"
          : "bg-zinc-800/95 text-amber-50",
      ].join(" ")}
      style={{ fontSize: "calc(0.75rem * 1.3)" }}
      title={
        isHandSelect
          ? isEn
            ? `Unconfirmed seats auto-submit in ${HAND_SELECT_TIMER_SECONDS}s.`
            : `${HAND_SELECT_TIMER_SECONDS}초 안에 미확정 좌석은 풀에서 가능한 첫 핸드로 자동 제출됩니다.`
          : isEn
            ? `No action in ${limitForTitle}s triggers auto-check/fold by state.`
            : `${limitForTitle}초 안에 액션이 없으면 자동 체크(맞출 베팅이 없을 때) 또는 폴드됩니다.`
      }
    >
      {isEn ? "Time left" : "남은 시간"} {secondsLeft}s
    </div>
  );
}

// ─── BetAmountInput ───────────────────────────────────────────────────────────

function BetAmountInput({
  value,
  min,
  max,
  pot,
  bbUnit,
  onChange,
  onSubmit,
  isEn,
}: {
  value: number;
  min: number;
  max: number;
  pot: number;
  bbUnit: number;
  onChange: (v: number) => void;
  onSubmit: (v: number) => void;
  isEn: boolean;
}) {
  const toBb = React.useCallback(
    (chips: number) => chips / Math.max(bbUnit, 1e-9),
    [bbUnit],
  );
  const formatBb = React.useCallback(
    (chips: number) => String(Math.round(toBb(chips) * 100) / 100),
    [toBb],
  );
  const clamp = React.useCallback(
    (chips: number) => Math.max(min, Math.min(max, roundHalfChip(chips))),
    [max, min],
  );
  const [draft, setDraft] = React.useState(() => formatBb(value));
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDraft(formatBb(value));
    setMessage(null);
  }, [formatBb, value]);

  const setChips = React.useCallback(
    (chips: number) => {
      const next = clamp(chips);
      onChange(next);
      setDraft(formatBb(next));
      return next;
    },
    [clamp, formatBb, onChange],
  );

  const commit = React.useCallback(
    (submit: boolean) => {
      const parsedBb = Number(draft.trim().replace(",", "."));
      if (!Number.isFinite(parsedBb)) {
        setMessage(isEn ? "Enter a valid number." : "올바른 숫자를 입력해 주세요.");
        setDraft(formatBb(value));
        return;
      }
      const requested = roundHalfChip(parsedBb * bbUnit);
      const next = setChips(requested);
      const wasClamped = Math.abs(requested - next) > 1e-9;
      setMessage(
        wasClamped
          ? isEn
            ? `Adjusted to ${formatBb(min)}–${formatBb(max)} BB.`
            : `가능 범위(${formatBb(min)}~${formatBb(max)} BB)로 자동 조정했습니다.`
          : null,
      );
      if (submit) onSubmit(next);
    },
    [bbUnit, draft, formatBb, isEn, max, min, onSubmit, setChips, value],
  );

  const halfPot = clamp(pot * 0.5);
  const threeQPot = clamp(pot * 0.75);
  const fullPot = clamp(pot);
  const step = Math.max(SMALLEST_CHIP, bbUnit * 0.5);

  return (
    <div className="w-full space-y-2.5">
      <div>
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            aria-label={isEn ? "Decrease by 0.5 BB" : "0.5BB 감소"}
            onClick={() => setChips(value - step)}
            className="min-w-12 rounded-lg border border-zinc-600/80 bg-zinc-800 px-2 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
          >
            −0.5
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft}
              aria-label={isEn ? "Bet amount in big blinds" : "BB 기준 베팅 금액"}
              aria-describedby={message ? "bet-amount-message" : undefined}
              onChange={(event) => {
                const next = event.target.value;
                if (/^\d*(?:[.,]\d*)?$/.test(next)) {
                  setDraft(next);
                  setMessage(null);
                }
              }}
              onBlur={() => commit(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit(true);
                }
              }}
              className="h-11 w-full rounded-lg border border-emerald-500/70 bg-zinc-950/80 px-3 pr-11 text-center font-mono text-lg font-extrabold tabular-nums text-emerald-100 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/25"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
              BB
            </span>
          </div>
          <button
            type="button"
            aria-label={isEn ? "Increase by 0.5 BB" : "0.5BB 증가"}
            onClick={() => setChips(value + step)}
            className="min-w-12 rounded-lg border border-zinc-600/80 bg-zinc-800 px-2 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
          >
            +0.5
          </button>
        </div>
        <div className="mt-2 flex items-start justify-between gap-2 text-sm font-medium text-zinc-300">
          <span>
            {isEn
              ? `Min ${formatBb(min)}BB · Max ${formatBb(max)}BB`
              : `최소 ${formatBb(min)}BB · 최대 ${formatBb(max)}BB`}
          </span>
          {message ? (
            <span id="bet-amount-message" className="text-right text-amber-300">{message}</span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => setChips(halfPot)}
          className="rounded border border-zinc-600/70 bg-zinc-700/60 py-1.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-600/60 active:scale-95"
        >
          1/2 Pot
        </button>
        <button
          type="button"
          onClick={() => setChips(threeQPot)}
          className="rounded border border-zinc-600/70 bg-zinc-700/60 py-1.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-600/60 active:scale-95"
        >
          3/4 Pot
        </button>
        <button
          type="button"
          onClick={() => setChips(fullPot)}
          className="rounded border border-zinc-600/70 bg-zinc-700/60 py-1.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-600/60 active:scale-95"
        >
          Pot
        </button>
        <button
          type="button"
          onClick={() => setChips(max)}
          className="rounded border border-amber-500/55 bg-amber-950/40 py-1.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-900/50 active:scale-95"
        >
          MAX
        </button>
      </div>
    </div>
  );
}

// ─── 버튼 스타일 ──────────────────────────────────────────────────────────────

const btnPrimary =
  "rounded-lg border border-emerald-500/80 bg-emerald-800/45 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-700/45 disabled:cursor-not-allowed disabled:opacity-45";
const btnAllInCall =
  "rounded-lg border border-amber-300/80 bg-amber-800/70 px-3 py-2 text-xs font-extrabold text-amber-50 shadow-[0_0_16px_rgba(251,191,36,0.28)] transition hover:bg-amber-700/70 hover:shadow-[0_0_22px_rgba(251,191,36,0.36)] disabled:cursor-not-allowed disabled:opacity-45";

const btnDanger =
  "rounded-lg border border-rose-600/70 bg-rose-900/45 px-3 py-2 text-xs font-semibold text-rose-50 hover:bg-rose-800/40 disabled:cursor-not-allowed disabled:opacity-45";

const btnIa =
  "rounded-lg border border-indigo-400/60 bg-indigo-900/45 px-3 py-2 text-xs font-semibold text-indigo-50 hover:bg-indigo-800/40 disabled:cursor-not-allowed disabled:opacity-45";

const btnPreflopAllIn =
  "rounded-lg border border-rose-400/75 bg-rose-900/65 px-3 py-2 text-xs font-extrabold text-rose-50 shadow-[0_0_16px_rgba(244,63,94,0.28)] transition hover:bg-rose-800/60 hover:shadow-[0_0_22px_rgba(244,63,94,0.36)] animate-pulse disabled:cursor-not-allowed disabled:opacity-45";
const btnPostflopAllIn =
  "rounded-lg border border-rose-400/80 bg-rose-900/70 px-3 py-2 text-xs font-extrabold text-rose-50 shadow-[0_0_18px_rgba(244,63,94,0.32)] transition hover:bg-rose-800/60 hover:shadow-[0_0_24px_rgba(244,63,94,0.4)] animate-pulse disabled:cursor-not-allowed disabled:opacity-45";

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function preflopCompactRaiseKeyFromState(state: GameState): string {
  if (state.toAct == null) return "";
  const preflop = state.phase === "preflop" && state.preflopStage != null;
  const range = preflop ? preflopRaiseSliderRange(state) : null;
  if (!preflop || state.isAllIn || range == null) return "";
  const level = levelFromContributions(state.betting);
  return [
    state.roundNumber,
    state.preflopStage,
    state.toAct,
    range.min,
    range.max,
    state.betting.contributed[0],
    state.betting.contributed[1],
    level,
    state.betting.raisesThisStreet ?? 0,
  ].join("|");
}

// ─── ActionPanel ──────────────────────────────────────────────────────────────

export function ActionPanel({
  state,
  dispatch,
  playerNames,
  mySeat,
  actionTimerSecondsLeft = null,
}: ActionPanelProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const pl = (p: PlayerIndex) =>
    playerNames[p] ?? `${isEn ? "Player" : "플레이어"} ${p + 1}`;
  const p = state.toAct;

  // ── 슬라이더 값 상태 (string draft → number로 변경) ─────────────────────
  const [betValue, setBetValue] = React.useState<number>(1);
  const [raiseValue, setRaiseValue] = React.useState<number>(2);
  const [preflopRaiseValue, setPreflopRaiseValue] = React.useState<number>(2);

  const preflopRaiseDraftKeyRef = React.useRef<string | null>(null);
  const phase = state.phase;
  const betting = state.betting;

  // ── 타이머 표시 ───────────────────────────────────────────────────────────
  const streetActionLimitSec = React.useMemo(() => {
    const ms = actionTimerLimitMs(state);
    return ms != null ? Math.round(ms / 1000) : ACTION_TIMER_SECONDS;
  }, [state]);

  // ── 포스트플랍 싱크 키 ────────────────────────────────────────────────────
  const postFlopSyncKey = React.useMemo(() => {
    if (state.matchEnded) return "";
    if (state.phase !== "flop" && state.phase !== "turn" && state.phase !== "river")
      return "";
    if (state.toAct == null) return "";
    const actor = state.toAct;
    const b = state.betting;
    const f = facingFor(actor, b);
    const lv = levelFromContributions(b);
    const maxBetHere = postflopMaxOpenBetForActor(state);
    const minR = f > 0 ? postflopMinRaiseTargetForActor(state) : 0;
    const maxT = f > 0 ? postflopRaiseTargetCappedByOpponent(state) : 0;
    return [
      state.roundNumber,
      state.phase,
      actor,
      lv,
      f,
      b.checksThisStreet,
      b.contributed[0],
      b.contributed[1],
      state.pot,
      state.chips[0],
      state.chips[1],
      maxBetHere,
      minR,
      maxT,
      state.handBlinds.bb,
      state.betting.raisesThisStreet ?? 0,
    ].join("|");
  }, [state]);

  const postFlopDraftsKey = React.useRef<string | null>(null);

  // 스트리트 변경 시 숫자 입력 초기값 설정 (기본: ½ 팟)
  React.useEffect(() => {
    if (postFlopSyncKey === "") {
      postFlopDraftsKey.current = null;
      return;
    }
    if (postFlopDraftsKey.current === postFlopSyncKey) return;
    postFlopDraftsKey.current = postFlopSyncKey;

    const actor = state.toAct!;
    const b = state.betting;
    const f = facingFor(actor, b);
    const maxB = postflopMaxOpenBetForActor(state);
    const streetBb = resolveHandBlinds(state).bb;
    // 기본 베팅: ½ 팟 (최소 1bb, 최대 maxBet)
    const relaxed = headsUpSubBbVoluntaryEnabled(state);
    const minB = relaxed ? SMALLEST_CHIP : streetBb;
    const halfPot = roundHalfChip(state.pot * 0.5);
    setBetValue(
      roundHalfChip(Math.min(maxB, Math.max(minB, halfPot))),
    );
    if (f > 0) {
      const minR = postflopMinRaiseTargetForActor(state);
      setRaiseValue(roundHalfChip(minR));
    }
  }, [postFlopSyncKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 다음 핸드 자동 시작 타이머 ────────────────────────────────────────────
  const inNextHandPause =
    !state.matchEnded &&
    (phase === "showdown" || phase === "hand_over");
  const inAllInRunoutShowdown =
    phase === "showdown" &&
    state.handEndMode === "showdown" &&
    state.runoutUiStartRevealed != null;
  // 올인 런아웃 시네마(턴/리버 순차 공개 + 결과 확인) 시간을 보장하기 위한 추가 유예.
  const nextHandAutoSeconds =
    NEW_HAND_AUTO_SECONDS + (inAllInRunoutShowdown ? 5 : 0);
  const nextHandAutoKey = inNextHandPause
    ? `${state.roundNumber}-${phase}-${inAllInRunoutShowdown ? "runout" : "normal"}`
    : null;
  const [nextHandAutoLeft, setNextHandAutoLeft] = React.useState<number | null>(null);
  const skipAutoNewHandRef = React.useRef(false);
  const dispatchRef = React.useRef(dispatch);
  React.useLayoutEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  React.useEffect(() => {
    if (nextHandAutoKey == null) {
      setNextHandAutoLeft(null);
      return;
    }
    skipAutoNewHandRef.current = false;
    const ms = nextHandAutoSeconds * 1000;
    const tEnd = Date.now() + ms;
    const tick = () => {
      setNextHandAutoLeft(Math.max(0, Math.ceil((tEnd - Date.now()) / 1000)));
    };
    tick();
    const iv = window.setInterval(tick, 250);
    const to = window.setTimeout(() => {
      if (skipAutoNewHandRef.current) return;
      void dispatchRef.current({ type: "NEW_HAND" });
    }, ms);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
  }, [nextHandAutoKey, nextHandAutoSeconds]);

  // ── 프리플랍 레이즈 싱크 ──────────────────────────────────────────────────
  const preflopCompactRaiseKey = React.useMemo(
    () => preflopCompactRaiseKeyFromState(state),
    [state],
  );

  React.useEffect(() => {
    if (preflopCompactRaiseKey === "") {
      preflopRaiseDraftKeyRef.current = null;
      return;
    }
    if (preflopRaiseDraftKeyRef.current === preflopCompactRaiseKey) return;
    preflopRaiseDraftKeyRef.current = preflopCompactRaiseKey;
    if (state.toAct == null) return;
    const range = preflopRaiseSliderRange(state);
    if (range != null) {
      setPreflopRaiseValue(roundHalfChip(range.min));
    }
  }, [preflopCompactRaiseKey, state]);

  // ── Early returns ─────────────────────────────────────────────────────────

  if (state.matchEnded) {
    return (
      <div className="rounded-xl border border-emerald-600/50 bg-emerald-900/25 p-4 text-center">
        <p className="text-lg font-bold text-emerald-200">
          {isEn ? "Match over" : "매치 종료"}
        </p>
        <p className="mt-1 text-sm text-zinc-200">
          {state.matchWinner == null ? (isEn ? "Draw" : "무승부") : <>
            {isEn ? "Winner:" : "승자:"}{" "}
            <span className="font-mono text-emerald-100">{pl(state.matchWinner)}</span>
          </>}
        </p>
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/40 p-3 text-center text-sm text-zinc-500">
        {isEn ? "Waiting for game start…" : "게임 시작 대기 중…"}
      </div>
    );
  }

  if (phase === "hand_select") {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-2 text-sm text-amber-50/95">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-[13px] leading-snug">
            {isEn
              ? "Pick your hand and lock it in before the timer ends."
              : "제한 시간 내 핸드를 선택하고 확정하세요."}
          </p>
          {actionTimerSecondsLeft != null ? (
            <ActionTimerChip
              secondsLeft={actionTimerSecondsLeft}
              isHandSelect
              isEn={isEn}
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === "showdown" || phase === "hand_over") {
    const w =
      state.winner != null
        ? isEn
          ? `Hand winner: ${pl(state.winner)}`
          : `이번 판 승자: ${pl(state.winner)}`
        : isEn
          ? "Hand finished"
          : "이번 판 종료";
    const foldEnd = state.handEndMode === "fold";
    return (
      <div className="space-y-1.5 rounded-xl border border-zinc-600/90 bg-zinc-700/55 p-2.5">
        <p className="text-sm font-medium text-zinc-100">{w}</p>
        {phase === "showdown" ? (
          <p className="text-[11px] text-zinc-400">
            {isEn
              ? "See the showdown panel above for hand comparison."
              : "족보 비교는 상단 쇼다운 박스를 참고하세요."}
          </p>
        ) : null}
        {foldEnd ? (
          <p className="text-[11px] text-zinc-400">
            {isEn
              ? "Fold end — opponent hole cards stayed hidden."
              : "폴드 종료 — 상대 홀 카드는 공개되지 않았습니다."}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
          <button
            type="button"
            title="다음 핸드: 헤즈업 규칙에 따라 딜러 버튼(SB)이 교대되고, 다시 핸드를 고릅니다."
            className={btnPrimary + " w-full flex-1"}
            onClick={() => {
              skipAutoNewHandRef.current = true;
              void dispatch({ type: "NEW_HAND" });
            }}
          >
            {isEn ? "Next hand" : "다음 핸드"}
          </button>
          <div
            className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-zinc-600/80 bg-zinc-800/50 px-3 py-2 text-center sm:min-w-[6.5rem]"
            title={`${nextHandAutoSeconds}초 후 자동으로 다음 라운드(핸드 선택)가 시작됩니다.`}
          >
            <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">
              {isEn ? "AUTO START" : "자동 시작"}
            </span>
            <span className="font-mono text-base font-semibold tabular-nums text-emerald-300">
              {nextHandAutoLeft != null ? `${nextHandAutoLeft}s` : "…"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (p == null) return null;

  if (mySeat != null && p !== mySeat) {
    return (
      <div className="rounded-xl border border-zinc-600/60 bg-zinc-900/45 p-2.5 opacity-[0.72] shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-700/50 pb-2">
          <p className="text-sm font-medium text-zinc-300">
            {isEn ? (
              <>
                Waiting for <span className="text-amber-100/90">{pl(p)}</span>
              </>
            ) : (
              <>
                지금은 <span className="text-amber-100/90">{pl(p)}</span> 차례
              </>
            )}
          </p>
          {actionTimerSecondsLeft != null ? (
            <ActionTimerChip
              secondsLeft={actionTimerSecondsLeft}
              isHandSelect={false}
              limitSeconds={streetActionLimitSec}
              isEn={isEn}
            />
          ) : null}
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          {isEn ? "Waiting for opponent action" : "상대 액션 대기 중"}
        </p>
      </div>
    );
  }

  // ── 베팅 파생값 계산 ──────────────────────────────────────────────────────

  const chips = state.chips[p]!;
  const bbUnit = resolveHandBlinds(state).bb;
  const facing = facingFor(p, betting);
  const level = levelFromContributions(betting);
  const streetCapped = streetRaiseCapReached(betting);
  const isAllIn = state.isAllIn;
  const opponent = p === 0 ? 1 : 0;
  const opponentAllInPending = state.chips[opponent]! <= 1e-9 && facing > 1e-9;
  const blockVoluntaryOpen = isAllIn && facing <= 1e-9;
  const hideReraiseStreet = isAllIn || opponentAllInPending;
  const respondToShoveOnly = opponentAllInPending && chips > 1e-9;

  const preflop = phase === "preflop" && state.preflopStage != null;
  const post = phase === "flop" || phase === "turn" || phase === "river";
  const idleAllInWaiting =
    isAllIn && chips <= 1e-9 && facing <= 1e-9 && (preflop || post);

  const iaCost = iaAppliedCostFromStack(state.pot, chips, bbUnit);
  const canIa =
    phase === "river" &&
    !state.iaUsed[p] &&
    iaCost > 1e-9 &&
    state.pot > 0 &&
    chips >= iaCost - 1e-9 &&
    !isAllIn;

  // ── 프리플랍 ──────────────────────────────────────────────────────────────
  const preflopRange = preflop ? preflopRaiseSliderRange(state) : null;
  const showPreflopRaise = preflopRange != null;
  const isBbToAct = preflop && p !== state.button;

  const preflopRaiseClamped =
    preflopRange != null
      ? Math.max(preflopRange.min, Math.min(preflopRange.max, preflopRaiseValue))
      : 0;
  const preflopRaiseValid =
    showPreflopRaise && isLegalPreflopRaiseTarget(state, preflopRaiseClamped);

  // ── 포스트플랍 ────────────────────────────────────────────────────────────
  const maxBet = post ? postflopMaxOpenBetForActor(state) : 0;
  const maxAffordableRaiseTotal = roundHalfChip(betting.contributed[p]! + chips);
  const postRaiseRuleCap =
    facing > 0 ? postflopCustomMaxRaiseToLevel(state.pot, facing) : level;
  const postRaiseCap =
    facing > 0 ? postflopRaiseTargetCappedByOpponent(state) : level;
  const postRaiseOnlyByStack = facing > 0 && postRaiseCap + 1e-9 < postRaiseRuleCap;
  const postRaiseMin =
    facing > 0 ? postflopMinRaiseTargetForActor(state) : level;
  const canPostflopRaise =
    post &&
    facing > 0 &&
    !streetCapped &&
    postRaiseMin <= postRaiseCap + 1e-9 &&
    postRaiseMin <= maxAffordableRaiseTotal + 1e-9;

  const relaxedOpen = post && headsUpSubBbVoluntaryEnabled(state);
  const minOpenBet = relaxedOpen ? SMALLEST_CHIP : bbUnit;
  const betClamped =
    post && maxBet > 0
      ? Math.max(minOpenBet, Math.min(maxBet, betValue))
      : minOpenBet;
  const postRaiseClamped =
    post && facing > 0
      ? Math.max(postRaiseMin, Math.min(postRaiseCap, raiseValue))
      : postRaiseMin;
  const allInActionKind = actorAllInActionKind(state);
  const postAllInBetAmount = roundHalfChip(Math.min(chips, maxBet));
  const postAllInRaiseTotal = roundHalfChip(maxAffordableRaiseTotal);

  // ── 콜 / 폴드 표시 ────────────────────────────────────────────────────────
  const callPay = effectiveCallPay(p, state);
  const isAllInCallUi = facing > 0 && callPay > 0 && Math.abs(callPay - chips) < 1e-6;
  const callPayBb = chipsAsBbLabel(callPay, bbUnit);
  const callDetailTitle = `이번 스트리트에서 ${chipsAsBbLabel(facing, bbUnit)} 추가로 상대가 쌓인 액수(${chipsAsBbLabel(level, bbUnit)})에 맞춥니다.`;
  const callButtonTitle = isAllInCallUi
    ? `스택 전부 ${callPayBb}를 맞춥니다. 남은 보드가 자동으로 깔린 뒤 쇼다운합니다.`
    : callDetailTitle;
  const preflopCallFacingTitle = `맞춰야 할 추가 칩: ${chipsAsBbLabel(facing, bbUnit)}.`;
  const postAllInDisplayAmount = allInActionKind === "call"
    ? callPay
    : allInActionKind === "bet"
      ? postAllInBetAmount
      : postAllInRaiseTotal;
  const postAllInTitle = allInActionKind === "call"
    ? `남은 스택 전부 ${chipsAsBbLabel(callPay, bbUnit)}를 콜합니다.`
    : allInActionKind === "bet"
      ? `남은 스택 전부 ${chipsAsBbLabel(postAllInBetAmount, bbUnit)}를 베팅합니다.`
      : `남은 스택 전부로 총 ${chipsAsBbLabel(postAllInRaiseTotal, bbUnit)}까지 올인 레이즈합니다.`;
  const dispatchPostflopAllIn = () => {
    if (allInActionKind === "call") {
      void dispatch({ type: "POSTFLOP_CALL" });
    } else if (allInActionKind === "bet") {
      void dispatch({ type: "POSTFLOP_BET", amount: postAllInBetAmount });
    } else if (allInActionKind === "raise") {
      void dispatch({
        type: "POSTFLOP_RAISE",
        toLevelChips: postAllInRaiseTotal,
      });
    }
  };

  const preflopAllInAllowed = preflop && allInActionKind != null;
  const preflopAllInTotalChips = preflopAllInAllowed
    ? preflopAllInTotalContribution(state)
    : 0;
  const preflopAllInTitle = allInActionKind === "call"
    ? `남은 스택 ${chipsAsBbLabel(callPay, bbUnit)} 전부를 콜합니다.`
    : `프리플랍 전액 레이즈(총 ${chipsAsBbLabel(preflopAllInTotalChips, bbUnit)}). 남은 스택 ${actorStackBb(state).toFixed(1)}bb로 전액 올인 가능합니다.`;
  const preflopAllInLabel = allInActionKind === "call"
    ? `All-in Call (${callPayBb})`
    : `All-in (${chipsAsBbLabel(preflopAllInTotalChips, bbUnit)})`;
  const dispatchPreflopAllIn = () => {
    if (allInActionKind === "call") {
      void dispatch({ type: "PREFLOP_CALL" });
      return;
    }
    if (allInActionKind === "raise") void dispatch({ type: "PREFLOP_ALL_IN" });
  };
  const submitPreflopRaise = (toLevelChips: number) => {
    if (
      allInActionKind === "raise" &&
      Math.abs(toLevelChips - preflopAllInTotalChips) < 1e-6
    ) {
      dispatchPreflopAllIn();
      return;
    }
    if (!isLegalPreflopRaiseTarget(state, toLevelChips)) return;
    void dispatch({ type: "PREFLOP_RAISE", toLevelChips });
  };
  const submitPostflopBet = (amount: number) => {
    if (
      allInActionKind === "bet" &&
      Math.abs(amount - postAllInBetAmount) < 1e-6
    ) {
      dispatchPostflopAllIn();
      return;
    }
    void dispatch({ type: "POSTFLOP_BET", amount });
  };
  const submitPostflopRaise = (toLevelChips: number) => {
    if (
      allInActionKind === "raise" &&
      Math.abs(toLevelChips - postAllInRaiseTotal) < 1e-6
    ) {
      dispatchPostflopAllIn();
      return;
    }
    void dispatch({ type: "POSTFLOP_RAISE", toLevelChips });
  };

  if (idleAllInWaiting) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-600/45 bg-amber-950/25 p-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200">
          ALL-IN
        </p>
        <p className="text-sm font-medium text-zinc-100">보드 자동 공개 중</p>
        <p className="text-[11px] text-amber-200/80">쇼다운까지 잠시만 기다려 주세요.</p>
      </div>
    );
  }

  const posShort = headsUpPositionLabel(state, p);
  // ── 프리플랍 레이즈 입력 블록 ─────────────────────────────────────────────
  const preflopRaiseBlock =
    showPreflopRaise && preflopRange != null && !hideReraiseStreet ? (
      <div className="space-y-2 rounded-lg border border-zinc-600/45 bg-zinc-800/30 p-3">
        <BetAmountInput
          value={preflopRaiseClamped}
          min={preflopRange.min}
          max={preflopRange.max}
          pot={state.pot}
          bbUnit={bbUnit}
          onChange={setPreflopRaiseValue}
          onSubmit={submitPreflopRaise}
          isEn={isEn}
        />
        <button
          type="button"
          className={btnPrimary + " w-full"}
          disabled={!preflopRaiseValid}
          title={
            preflopRaiseValid
              ? `총 기여 ${chipsAsBbLabel(preflopRaiseClamped, bbUnit)}로 레이즈`
              : "유효하지 않은 레이즈"
          }
          onClick={() => submitPreflopRaise(preflopRaiseClamped)}
        >
          Raise ({chipsAsBbLabel(preflopRaiseClamped, bbUnit)})
        </button>
      </div>
    ) : null;

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        "space-y-2 rounded-xl border-2 bg-zinc-700/55 p-2 transition-[box-shadow] duration-300",
        mySeat != null
          ? "border-emerald-500/55 shadow-[0_0_28px_rgba(52,211,153,0.22)] ring-1 ring-emerald-400/35"
          : "border-emerald-400/50 shadow-[0_0_32px_rgba(52,211,153,0.28)] ring-1 ring-emerald-400/40",
      ].join(" ")}
      style={{ animation: "holdem-active-turn-glow 2.4s ease-in-out infinite" }}
    >
      {/* ── 헤더 ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 border-b border-zinc-600/55 pb-1">
        <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-50">
          <span className="mr-0.5" aria-hidden>
            👉
          </span>
          {isEn ? `${pl(p)} action` : `${pl(p)} 액션`} ({posShort})
        </p>
        {actionTimerSecondsLeft != null ? (
          <ActionTimerChip
            secondsLeft={actionTimerSecondsLeft}
            isHandSelect={false}
            limitSeconds={streetActionLimitSec}
            isEn={isEn}
          />
        ) : null}
      </div>

      {/* 올인 대응 알림 */}
      {respondToShoveOnly ? (
        <p className="rounded-md border border-amber-500/35 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-100/90">
          Villain all-in —{" "}
          <span className="font-semibold">Fold</span> or{" "}
          <span className="font-semibold">
            {isAllInCallUi ? "Call (full stack)" : "Call"}
          </span>{" "}
          only.
        </p>
      ) : facing > 0 && streetCapped ? (
        <p className="rounded-md border border-sky-500/40 bg-sky-950/25 px-2 py-1.5 text-[11px] text-sky-100/95">
          {isEn ? (
            <>
              <span className="font-semibold">Raise cap</span> — raise limit reached this street.{" "}
              <span className="font-semibold">Call</span> or{" "}
              <span className="font-semibold">Fold</span> only.
            </>
          ) : (
            <>
              <span className="font-semibold">레이즈 캡</span> — 이번 스트리트에서
              레이즈가 허용 횟수에 도달했습니다.{" "}
              <span className="font-semibold">콜</span> 또는{" "}
              <span className="font-semibold">폴드</span>만 가능합니다.
            </>
          )}
        </p>
      ) : null}

      {/* IA 버튼 */}
      {canIa ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-600/80 pb-2">
          <button
            type="button"
            className={[btnIa, "inline-flex items-center gap-1.5"].join(" ")}
            title={`내 스택에서 비용이 차감되고 상대 홀의 카테고리만 공개됩니다. 사용 직후 이 리버 액션에 ${IA_RIVER_ACTION_EXTRA_SECONDS}초가 추가됩니다.`}
            onClick={() => void dispatch({ type: "USE_IA" })}
          >
            <span className="font-semibold text-indigo-50">IA</span>
            <span className="text-[10px] font-normal text-indigo-200/90">
              {isEn ? "Cost" : "비용"}
            </span>
            <span className="text-sm font-extrabold tabular-nums tracking-tight text-amber-200">
              −{chipsAsBbLabel(iaCost, bbUnit)}
            </span>
          </button>
          <span className="text-[10px] text-indigo-200/80">
            {isEn
              ? `Deduct from your stack · reveal category only · +${IA_RIVER_ACTION_EXTRA_SECONDS}s`
              : `내 스택 차감 · 카테고리만 공개 · 사용 시 ${IA_RIVER_ACTION_EXTRA_SECONDS}s 추가`}
          </span>
        </div>
      ) : null}

      {/* ══════════════════ PREFLOP ══════════════════ */}
      {preflop ? (
        <div className="space-y-1.5">
          {/* button_acts: 딜러(SB) 첫 액션 */}
          {state.preflopStage === "button_acts" && p === state.button ? (
            <>
              {preflopRaiseBlock}
              <div className="flex flex-wrap gap-2">
                {facing > 0 && callPay > 0 && !isAllInCallUi ? (
                  <button
                    type="button"
                    className={(isAllInCallUi ? btnAllInCall : btnPrimary) + " flex-1"}
                    title={isAllInCallUi ? callButtonTitle : preflopCallFacingTitle}
                    onClick={() => void dispatch({ type: "PREFLOP_CALL" })}
                  >
                    {isAllInCallUi
                      ? `All-in Call (${callPayBb})`
                      : `Call (BB · +${chipsAsBbLabel(facing, bbUnit)})`}
                  </button>
                ) : null}
                {preflopAllInAllowed ? (
                  <button
                    type="button"
                    className={btnPreflopAllIn}
                    title={preflopAllInTitle}
                    onClick={dispatchPreflopAllIn}
                  >
                    {preflopAllInLabel}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {/* bb_option: BB의 체크/레이즈 */}
          {state.preflopStage === "bb_option" && isBbToAct ? (
            <>
              {preflopRaiseBlock}
              <div className="flex flex-wrap gap-2">
                {facing === 0 && !blockVoluntaryOpen ? (
                  <button
                    type="button"
                    className={(isAllInCallUi ? btnAllInCall : btnPrimary) + " flex-1"}
                    title="추가 칩 없이 프리플랍을 통과합니다."
                    onClick={() => void dispatch({ type: "PREFLOP_CHECK" })}
                  >
                    Check
                  </button>
                ) : null}
                {preflopAllInAllowed ? (
                  <button
                    type="button"
                    className={btnPreflopAllIn}
                    title={preflopAllInTitle}
                    onClick={dispatchPreflopAllIn}
                  >
                    {preflopAllInLabel}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {/* facing_raise: BB — 리레이즈·콜·폴드 */}
          {state.preflopStage === "facing_raise" && isBbToAct ? (
            <>
              {preflopRaiseBlock}
              <div className="flex flex-wrap gap-2">
                {facing > 0 && callPay > 0 && !isAllInCallUi ? (
                  <button
                    type="button"
                    className={(isAllInCallUi ? btnAllInCall : btnPrimary) + " flex-1"}
                    title={isAllInCallUi ? callButtonTitle : preflopCallFacingTitle}
                    onClick={() => void dispatch({ type: "PREFLOP_CALL" })}
                  >
                    {isAllInCallUi
                      ? `All-in Call (${callPayBb})`
                      : `Call (+${chipsAsBbLabel(facing, bbUnit)})`}
                  </button>
                ) : null}
                {preflopAllInAllowed ? (
                  <button
                    type="button"
                    className={btnPreflopAllIn}
                    title={preflopAllInTitle}
                    onClick={dispatchPreflopAllIn}
                  >
                    {preflopAllInLabel}
                  </button>
                ) : null}
                {facing > 0 ? (
                  <button
                    type="button"
                    className={btnDanger}
                    title="이번 판을 포기합니다."
                    onClick={() => void dispatch({ type: "FOLD" })}
                  >
                    Fold
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {/* facing_raise: 딜러(SB) — 4-bet+·콜·폴드 */}
          {state.preflopStage === "facing_raise" && p === state.button ? (
            <>
              {preflopRaiseBlock}
              <div className="flex flex-wrap gap-2">
                {facing > 0 && callPay > 0 && !isAllInCallUi ? (
                  <button
                    type="button"
                    className={btnPrimary + " flex-1"}
                    title={isAllInCallUi ? callButtonTitle : preflopCallFacingTitle}
                    onClick={() => void dispatch({ type: "PREFLOP_CALL" })}
                  >
                    {isAllInCallUi
                      ? `All-in Call (${callPayBb})`
                      : `Call (+${chipsAsBbLabel(facing, bbUnit)})`}
                  </button>
                ) : null}
                {preflopAllInAllowed ? (
                  <button
                    type="button"
                    className={btnPreflopAllIn}
                    title={preflopAllInTitle}
                    onClick={dispatchPreflopAllIn}
                  >
                    {preflopAllInLabel}
                  </button>
                ) : null}
                {facing > 0 ? (
                  <button
                    type="button"
                    className={btnDanger}
                    title="이번 판을 포기합니다."
                    onClick={() => void dispatch({ type: "FOLD" })}
                  >
                    Fold
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ══════════════════ POSTFLOP ══════════════════ */}
      {post ? (
        <div className="space-y-2">
          {/* Bet 입력 (베팅 없는 상황) */}
          {bettingMatched(betting) && maxBet >= minOpenBet - 1e-9 && !isAllIn ? (
            <div className="space-y-2 rounded-lg border border-zinc-600/45 bg-zinc-800/30 px-3 pb-3 pt-2.5">
              <BetAmountInput
                value={betClamped}
                min={minOpenBet}
                max={maxBet}
                pot={state.pot}
                bbUnit={bbUnit}
                onChange={setBetValue}
                onSubmit={submitPostflopBet}
                isEn={isEn}
              />
              <button
                type="button"
                className={btnPrimary + " w-full"}
                title={`Bet ${chipsAsBbLabel(betClamped, bbUnit)} into the pot.`}
                onClick={() => submitPostflopBet(betClamped)}
              >
                Bet ({chipsAsBbLabel(betClamped, bbUnit)})
              </button>
            </div>
          ) : null}

          {/* Raise 입력 */}
          {canPostflopRaise && !hideReraiseStreet ? (
            <div className="space-y-2 rounded-lg border border-zinc-600/45 bg-zinc-800/30 p-3">
              <BetAmountInput
                value={postRaiseClamped}
                min={postRaiseMin}
                max={postRaiseCap}
                pot={state.pot}
                bbUnit={bbUnit}
                onChange={setRaiseValue}
                onSubmit={submitPostflopRaise}
                isEn={isEn}
              />
              <button
                type="button"
                className={btnPrimary + " w-full"}
                title={
                  postRaiseOnlyByStack
                    ? `Rule cap ${chipsAsBbLabel(postRaiseRuleCap, bbUnit)} — stack allows ${chipsAsBbLabel(postRaiseCap, bbUnit)}`
                    : `Raise total contribution to ${chipsAsBbLabel(postRaiseClamped, bbUnit)}.`
                }
                onClick={() => submitPostflopRaise(postRaiseClamped)}
              >
                Raise (total {chipsAsBbLabel(postRaiseClamped, bbUnit)})
              </button>
            </div>
          ) : null}

          {/* Check / Call / Fold */}
          <div className="flex flex-wrap gap-2">
            {facing === 0 && !blockVoluntaryOpen ? (
              <button
                type="button"
                className={(isAllInCallUi ? btnAllInCall : btnPrimary) + " flex-1"}
                title="베팅이 없을 때 팟을 늘리지 않고 넘깁니다."
                onClick={() => void dispatch({ type: "POSTFLOP_CHECK" })}
              >
                Check
              </button>
            ) : null}
            {allInActionKind != null ? (
              <button
                type="button"
                className={btnPostflopAllIn}
                title={postAllInTitle}
                onClick={dispatchPostflopAllIn}
              >
                {allInActionKind === "call" ? "All-in Call" : "All-in"} ({chipsAsBbLabel(postAllInDisplayAmount, bbUnit)})
              </button>
            ) : null}
            {facing > 0 && callPay > 0 && !isAllInCallUi ? (
              <button
                type="button"
                className={btnPrimary + " flex-1"}
                title={isAllInCallUi ? callButtonTitle : callDetailTitle}
                onClick={() => void dispatch({ type: "POSTFLOP_CALL" })}
              >
                {isAllInCallUi
                  ? `All-in Call (${callPayBb})`
                  : `Call (total ${chipsAsBbLabel(level, bbUnit)})`}
              </button>
            ) : null}
            {facing > 0 ? (
              <button
                type="button"
                className={btnDanger}
                title="상대의 베팅을 따라가지 않고 이번 판을 포기합니다. 상대 홀 카드는 공개되지 않습니다."
                onClick={() => void dispatch({ type: "FOLD" })}
              >
                Fold
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
