'use client';

import * as React from "react";
import {
  bettingMatched,
  effectiveCallPay,
  facingFor,
  iaCostFromPot,
  isLegalPreflopRaiseTarget,
  levelFromContributions,
  postflopMaxBet,
  postflopCustomMaxRaiseToLevel,
  postflopEffectiveMaxRaiseToLevel,
  postflopMinRaiseToLevelChips,
  preflopHasLegalRaise,
  preflopMaxRaiseTargetForActor,
  roundHalfChip,
} from "@/holdem/bettingHelpers";
import {
  ACTION_TIMER_SECONDS,
  HAND_SELECT_TIMER_SECONDS,
  NEW_HAND_AUTO_SECONDS,
  PREFLOP_UI_BB_VS_OPEN_BB,
  PREFLOP_UI_BUTTON_OPEN_BB,
  SMALLEST_CHIP,
} from "@/holdem/constants";
import { resolveHandBlinds } from "@/holdem/blindLevels";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import { headsUpPositionLabel } from "@/holdem/headsUpLabels";
import type { GameAction, GameState, PlayerIndex } from "@/holdem/types";

export type ActionPanelProps = {
  state: GameState;
  dispatch: (a: GameAction) => void | Promise<void>;
  playerNames: [string, string];
  /** 온라인 방: 내 차례일 때만 액션 버튼 표시 */
  mySeat?: PlayerIndex;
  /** 액션/핸드선택 제한시간 남은 초 — 헤더 우측 표시 */
  actionTimerSecondsLeft?: number | null;
};

function ActionTimerChip({
  secondsLeft,
  isHandSelect,
}: {
  secondsLeft: number;
  isHandSelect: boolean;
}) {
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
          ? `${HAND_SELECT_TIMER_SECONDS}초 안에 미확정 좌석은 풀에서 가능한 첫 핸드로 자동 제출됩니다.`
          : `${ACTION_TIMER_SECONDS}초 안에 액션이 없으면 자동 체크(맞출 베팅이 없을 때) 또는 폴드됩니다.`
      }
    >
      남은 시간 {secondsLeft}s
    </div>
  );
}

const btnPrimary =
  "rounded-lg border border-emerald-500/80 bg-emerald-800/45 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-700/45 disabled:cursor-not-allowed disabled:opacity-45";

const btnDanger =
  "rounded-lg border border-rose-600/70 bg-rose-900/45 px-3 py-2 text-xs font-semibold text-rose-50 hover:bg-rose-800/40 disabled:cursor-not-allowed disabled:opacity-45";

const btnIa =
  "rounded-lg border border-indigo-400/60 bg-indigo-900/45 px-3 py-2 text-xs font-semibold text-indigo-50 hover:bg-indigo-800/40 disabled:cursor-not-allowed disabled:opacity-45";

/** 입력 문자열을 [minV, maxV]로 클램프 후 0.5칩 단위 스냅 */
function clampChipField(draft: string, minV: number, maxV: number): number {
  const t = draft.trim().replace(",", ".");
  if (t === "" || t === "-" || t === ".") return roundHalfChip(minV);
  const n = Number(t);
  if (!Number.isFinite(n)) return roundHalfChip(minV);
  return roundHalfChip(Math.min(maxV, Math.max(minV, n)));
}

export function ActionPanel({
  state,
  dispatch,
  playerNames,
  mySeat,
  actionTimerSecondsLeft = null,
}: ActionPanelProps) {
  const pl = (p: PlayerIndex) => playerNames[p] ?? `플레이어 ${p + 1}`;
  const p = state.toAct;
  /** 포스트플랍 베트·레이즈 숫자 입력(폴링 등으로 매 틱 덮어쓰지 않도록 문자열 유지) */
  const [betDraft, setBetDraft] = React.useState("1");
  const [raiseDraft, setRaiseDraft] = React.useState("2");

  const phase = state.phase;
  const betting = state.betting;

  const postFlopSyncKey = React.useMemo(() => {
    if (state.matchWinner != null) return "";
    if (state.phase !== "flop" && state.phase !== "turn" && state.phase !== "river")
      return "";
    if (state.toAct == null) return "";
    const actor = state.toAct;
    const b = state.betting;
    const f = facingFor(actor, b);
    const lv = levelFromContributions(b);
    const maxBetHere = postflopMaxBet(state.pot, state.chips[actor]!);
    const minR = f > 0 ? postflopMinRaiseToLevelChips(lv, f) : 0;
    const maxT =
      f > 0
        ? postflopEffectiveMaxRaiseToLevel(
            state.pot,
            f,
            b.contributed[actor]!,
            state.chips[actor]!,
          )
        : 0;
    return [
      state.roundNumber,
      state.phase,
      actor,
      lv,
      f,
      b.raiseDone,
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
    ].join("|");
  }, [
    state.matchWinner,
    state.roundNumber,
    state.phase,
    state.toAct,
    state.handBlinds,
    state.betting.raiseDone,
    state.betting.checksThisStreet,
    state.betting.contributed[0],
    state.betting.contributed[1],
    state.betting.currentLevel,
    state.pot,
    state.chips[0],
    state.chips[1],
  ]);

  const postFlopDraftsKey = React.useRef<string | null>(null);

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
    const lv = levelFromContributions(b);
    const maxB = postflopMaxBet(state.pot, state.chips[actor]!);
    const streetBb = resolveHandBlinds(state).bb;
    if (maxB >= streetBb) {
      setBetDraft(
        String(
          roundHalfChip(
            Math.min(maxB, Math.max(streetBb, roundHalfChip(maxB / 2))),
          ),
        ),
      );
    } else {
      setBetDraft(String(streetBb));
    }
    if (f > 0) {
      const maxT = postflopEffectiveMaxRaiseToLevel(
        state.pot,
        f,
        b.contributed[actor]!,
        state.chips[actor]!,
      );
      const minR = postflopMinRaiseToLevelChips(lv, f);
      setRaiseDraft(String(roundHalfChip(minR)));
    }
  }, [postFlopSyncKey]);

  const inNextHandPause =
    state.matchWinner == null &&
    (phase === "showdown" || phase === "hand_over");
  const nextHandAutoKey = inNextHandPause
    ? `${state.roundNumber}-${phase}`
    : null;
  const [nextHandAutoLeft, setNextHandAutoLeft] = React.useState<number | null>(
    null,
  );
  const skipAutoNewHandRef = React.useRef(false);

  React.useEffect(() => {
    if (nextHandAutoKey == null) {
      setNextHandAutoLeft(null);
      return;
    }
    skipAutoNewHandRef.current = false;
    const ms = NEW_HAND_AUTO_SECONDS * 1000;
    const tEnd = Date.now() + ms;
    const tick = () => {
      setNextHandAutoLeft(
        Math.max(0, Math.ceil((tEnd - Date.now()) / 1000)),
      );
    };
    tick();
    const iv = window.setInterval(tick, 250);
    const to = window.setTimeout(() => {
      if (skipAutoNewHandRef.current) return;
      void dispatch({ type: "NEW_HAND" });
    }, ms);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
  }, [nextHandAutoKey, dispatch]);

  if (state.matchWinner != null) {
    return (
      <div className="rounded-xl border border-emerald-600/50 bg-emerald-900/25 p-4 text-center">
        <p className="text-lg font-bold text-emerald-200">매치 종료</p>
        <p className="mt-1 text-sm text-zinc-200">
          승자:{" "}
          <span className="font-mono text-emerald-100">{pl(state.matchWinner)}</span>
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-400">
          칩 {pl(0)} {state.chips[0]} · {pl(1)} {state.chips[1]}
        </p>
      </div>
    );
  }

  if (phase === "hand_select") {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-2.5 text-sm text-amber-50/95">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-[13px] leading-snug">
            핸드 풀에서 <strong className="text-amber-100">동시에</strong> 고를 수
            있습니다. 상단에서 확정하면 프리플랍으로 넘어갑니다.
          </p>
          {actionTimerSecondsLeft != null ? (
            <ActionTimerChip
              secondsLeft={actionTimerSecondsLeft}
              isHandSelect
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === "showdown" || phase === "hand_over") {
    const w =
      state.winner != null
        ? `이번 판 승자: ${pl(state.winner)}`
        : "이번 판 종료";
    const foldEnd = state.handEndMode === "fold";
    return (
      <div className="space-y-2 rounded-xl border border-zinc-600/90 bg-zinc-700/55 p-3">
        <p className="text-sm font-medium text-zinc-100">{w}</p>
        {phase === "showdown" ? (
          <p className="text-[11px] text-zinc-400">
            족보 비교는 상단 쇼다운 박스를 참고하세요.
          </p>
        ) : null}
        {foldEnd ? (
          <p className="text-[11px] text-zinc-400">
            폴드 종료 — 상대 홀 카드는 공개되지 않았습니다.
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
            다음 핸드
          </button>
          <div
            className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-zinc-600/80 bg-zinc-800/50 px-3 py-2 text-center sm:min-w-[6.5rem]"
            title={`${NEW_HAND_AUTO_SECONDS}초 후 자동으로 다음 라운드(핸드 선택)가 시작됩니다.`}
          >
            <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">
              자동 시작
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
            지금은 <span className="text-amber-100/90">{pl(p)}</span> 차례
          </p>
          {actionTimerSecondsLeft != null ? (
            <ActionTimerChip
              secondsLeft={actionTimerSecondsLeft}
              isHandSelect={false}
            />
          ) : null}
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          상대 액션 대기 중
        </p>
      </div>
    );
  }

  const chips = state.chips[p]!;
  const bbUnit = resolveHandBlinds(state).bb;
  const facing = facingFor(p, betting);
  const level = levelFromContributions(betting);
  const isAllIn = state.isAllIn;
  /** 올인 상황에서 베팅 불가일 때 오픈 액션(체크·오픈·레이즈) 숨김 — 맞춰야 할 액이 있으면 콜/폴드만 */
  const blockVoluntaryOpen = isAllIn && facing <= 1e-9;
  const hideReraiseStreet = isAllIn;
  /** 한쪽 올인 후 상대만 응답: 폴드 + 올인(일반) 콜만 */
  const respondToShoveOnly = isAllIn && chips > 1e-9 && facing > 1e-9;

  const preflop = phase === "preflop" && state.preflopStage != null;
  const post =
    phase === "flop" || phase === "turn" || phase === "river";
  /**
   * 스택 0이고 맞출 액 없음 — 런아웃/쇼다운 처리 대기(중간 프레임).
   */
  const idleAllInWaiting =
    isAllIn && chips <= 1e-9 && facing <= 1e-9 && (preflop || post);

  const iaCost = iaCostFromPot(state.pot, bbUnit);
  const canIa =
    phase === "river" &&
    !state.iaUsed[p] &&
    chips >= iaCost &&
    state.pot > 0 &&
    !isAllIn;

  const preRaiseCap = preflop ? preflopMaxRaiseTargetForActor(state) : 0;
  const showPreflopRaise = preflop && preflopHasLegalRaise(state);
  const isBbToAct = preflop && p !== state.button;

  const maxBet = post ? postflopMaxBet(state.pot, chips) : 0;
  const maxAffordableRaiseTotal = roundHalfChip(
    betting.contributed[p]! + chips,
  );
  const postRaiseRuleCap =
    facing > 0 ? postflopCustomMaxRaiseToLevel(state.pot, facing) : level;
  const postRaiseCap =
    facing > 0
      ? postflopEffectiveMaxRaiseToLevel(
          state.pot,
          facing,
          betting.contributed[p]!,
          chips,
        )
      : level;
  const postRaiseOnlyByStack =
    facing > 0 && postRaiseCap + 1e-9 < postRaiseRuleCap;
  const postRaiseMin =
    facing > 0 ? postflopMinRaiseToLevelChips(level, facing) : level;
  const canPostflopRaiseToMin =
    post &&
    facing > 0 &&
    !betting.raiseDone &&
    postRaiseMin <= postRaiseCap + 1e-9 &&
    postRaiseMin <= maxAffordableRaiseTotal + 1e-9;

  const callMatchLabel = `Call (total ${chipsAsBbLabel(level, bbUnit)})`;
  const callDetailTitle = `이번 스트리트에서 ${chipsAsBbLabel(facing, bbUnit)} 추가로 상대가 쌓인 액수(${chipsAsBbLabel(level, bbUnit)})에 맞춥니다.`;

  const callPay = effectiveCallPay(p, state);
  const isAllInCallUi =
    facing > 0 && callPay > 0 && Math.abs(callPay - chips) < 1e-6;
  const callPayBb = chipsAsBbLabel(callPay, bbUnit);
  const callButtonTitle = isAllInCallUi
    ? `스택 전부 ${callPayBb}를 맞춥니다. 남은 보드가 자동으로 깔린 뒤 쇼다운합니다.`
    : callDetailTitle;
  const preflopCallFacingTitle = `맞춰야 할 추가 칩: ${chipsAsBbLabel(facing, bbUnit)}.`;

  const preMaxBbLabel = chipsAsBbLabel(preRaiseCap, bbUnit);

  const betClamped =
    post && maxBet > 0 ? clampChipField(betDraft, bbUnit, maxBet) : bbUnit;
  const postRaiseClamped =
    post && facing > 0
      ? clampChipField(raiseDraft, postRaiseMin, postRaiseCap)
      : postRaiseMin;

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

  return (
    <div
      className={[
        "space-y-2 rounded-xl border-2 bg-zinc-700/55 p-2.5 transition-[box-shadow] duration-300",
        mySeat != null
          ? "border-emerald-500/55 shadow-[0_0_28px_rgba(52,211,153,0.22)] ring-1 ring-emerald-400/35"
          : "border-emerald-400/50 shadow-[0_0_32px_rgba(52,211,153,0.28)] ring-1 ring-emerald-400/40",
      ].join(" ")}
      style={{ animation: "holdem-active-turn-glow 2.4s ease-in-out infinite" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-zinc-600/55 pb-1.5">
        <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-50">
          <span className="mr-0.5" aria-hidden>
            👉
          </span>
          {pl(p)} 액션 ({posShort})
        </p>
        {actionTimerSecondsLeft != null ? (
          <ActionTimerChip
            secondsLeft={actionTimerSecondsLeft}
            isHandSelect={false}
          />
        ) : null}
      </div>

      {respondToShoveOnly ? (
        <p className="rounded-md border border-amber-500/35 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-100/90">
          Villain all-in — <span className="font-semibold">Fold</span> or{" "}
          <span className="font-semibold">Call (full stack)</span> only.
        </p>
      ) : null}

      {canIa ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-600/80 pb-2">
          <button
            type="button"
            className={[btnIa, "inline-flex items-center gap-1.5"].join(" ")}
            title="스택에서 칩이 차감되며, 상대 홀 카드의 ‘카테고리’만 표시됩니다. 액면은 공개되지 않습니다."
            onClick={() => dispatch({ type: "USE_IA" })}
          >
            <span className="font-semibold text-indigo-50">IA</span>
            <span className="text-[10px] font-normal text-indigo-200/90">비용</span>
            <span className="text-sm font-extrabold tabular-nums tracking-tight text-amber-200">
              −{chipsAsBbLabel(iaCost, bbUnit)}
            </span>
          </button>
          <span className="text-[10px] text-indigo-200/80">
            스택에서 차감 · 리버 · 액션 전 · 카테고리만 공개
          </span>
        </div>
      ) : null}

      {preflop ? (
        <div className="space-y-1.5">
          {state.preflopStage === "button_acts" && p === state.button ? (
            <div>
              <p className="mb-1.5 text-[10px] text-zinc-400">
                딜러·SB — BB 총액까지 맞추기 (+{chipsAsBbLabel(facing, bbUnit)}).
              </p>
              <div className="flex w-full flex-wrap items-end justify-between gap-x-2 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  {facing > 0 && callPay > 0 ? (
                    <button
                      type="button"
                      className={btnPrimary}
                      title={isAllInCallUi ? callButtonTitle : preflopCallFacingTitle}
                      onClick={() => dispatch({ type: "PREFLOP_CALL" })}
                    >
                      {isAllInCallUi
                        ? `All-in Call (${callPayBb})`
                        : `Call (BB · +${chipsAsBbLabel(facing, bbUnit)})`}
                    </button>
                  ) : null}
                  {showPreflopRaise && !hideReraiseStreet
                    ? PREFLOP_UI_BUTTON_OPEN_BB.map((mult) => {
                        const target = roundHalfChip(mult * bbUnit);
                        if (!isLegalPreflopRaiseTarget(state, target)) return null;
                        if (Math.abs(target - preRaiseCap) < 1e-6) return null;
                        return (
                          <button
                            key={mult}
                            type="button"
                            className={btnPrimary}
                            title={`총 기여 ${chipsAsBbLabel(target, bbUnit)} (상한 ${preMaxBbLabel})`}
                            onClick={() =>
                              dispatch({
                                type: "PREFLOP_RAISE",
                                toLevelChips: target,
                              })
                            }
                          >
                            Raise {mult}bb
                          </button>
                        );
                      })
                    : null}
                  {showPreflopRaise &&
                  !hideReraiseStreet &&
                  isLegalPreflopRaiseTarget(state, roundHalfChip(preRaiseCap)) ? (
                    <button
                      type="button"
                      className={
                        btnPrimary +
                        " border-amber-500/70 ring-1 ring-amber-500/35"
                      }
                      title={`최대 총 기여 ${chipsAsBbLabel(preRaiseCap, bbUnit)} (${preMaxBbLabel} 상한)`}
                      onClick={() =>
                        dispatch({
                          type: "PREFLOP_RAISE",
                          toLevelChips: roundHalfChip(preRaiseCap),
                        })
                      }
                    >
                      Raise MAX ({chipsAsBbLabel(preRaiseCap, bbUnit)})
                    </button>
                  ) : null}
                </div>
                {facing > 0 ? (
                  <button
                    type="button"
                    className={btnDanger + " shrink-0"}
                    title="이번 판을 포기합니다."
                    onClick={() => dispatch({ type: "FOLD" })}
                  >
                    Fold
                  </button>
                ) : null}
              </div>
            </div>
          ) : state.preflopStage === "bb_option" && isBbToAct ? (
            <div>
              <p className="mb-1.5 text-[10px] text-zinc-400">
                BB 오픈 상한 {preMaxBbLabel}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {facing === 0 && !blockVoluntaryOpen ? (
                  <button
                    type="button"
                    className={btnPrimary}
                    title="추가 칩 없이 프리플랍을 통과합니다."
                    onClick={() => dispatch({ type: "PREFLOP_CHECK" })}
                  >
                    Check
                  </button>
                ) : null}
                {showPreflopRaise && !hideReraiseStreet
                  ? PREFLOP_UI_BUTTON_OPEN_BB.map((mult) => {
                      const target = roundHalfChip(mult * bbUnit);
                      if (!isLegalPreflopRaiseTarget(state, target)) return null;
                      if (Math.abs(target - preRaiseCap) < 1e-6) return null;
                      return (
                        <button
                          key={`bb-${mult}`}
                          type="button"
                          className={btnPrimary}
                          title={`총 기여 ${chipsAsBbLabel(target, bbUnit)}`}
                          onClick={() =>
                            dispatch({
                              type: "PREFLOP_RAISE",
                              toLevelChips: target,
                            })
                          }
                        >
                          Raise {mult}bb
                        </button>
                      );
                    })
                  : null}
                {showPreflopRaise &&
                !hideReraiseStreet &&
                isLegalPreflopRaiseTarget(state, roundHalfChip(preRaiseCap)) ? (
                  <button
                    type="button"
                    className={
                      btnPrimary +
                      " border-amber-500/70 ring-1 ring-amber-500/35"
                    }
                    title={`최대 총 기여 ${chipsAsBbLabel(preRaiseCap, bbUnit)}`}
                    onClick={() =>
                      dispatch({
                        type: "PREFLOP_RAISE",
                        toLevelChips: roundHalfChip(preRaiseCap),
                      })
                    }
                  >
                    Raise MAX ({chipsAsBbLabel(preRaiseCap, bbUnit)})
                  </button>
                ) : null}
              </div>
            </div>
          ) : state.preflopStage === "facing_raise" && isBbToAct ? (
            <div>
              <p className="mb-1.5 text-[10px] text-zinc-400">
                BB — 딜러·SB 오픈에 응답 · 상한{" "}
                <span className="font-mono text-zinc-300">{preMaxBbLabel}</span>
              </p>
              <div className="flex w-full flex-wrap items-end justify-between gap-x-2 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  {facing > 0 && callPay > 0 ? (
                    <button
                      type="button"
                      className={btnPrimary}
                      title={isAllInCallUi ? callButtonTitle : preflopCallFacingTitle}
                      onClick={() => dispatch({ type: "PREFLOP_CALL" })}
                    >
                      {isAllInCallUi
                        ? `All-in Call (${callPayBb})`
                        : `Call (+${chipsAsBbLabel(facing, bbUnit)})`}
                    </button>
                  ) : null}
                  {showPreflopRaise && !hideReraiseStreet
                    ? PREFLOP_UI_BB_VS_OPEN_BB.map((mult) => {
                        const target = roundHalfChip(mult * bbUnit);
                        if (!isLegalPreflopRaiseTarget(state, target)) return null;
                        if (Math.abs(target - preRaiseCap) < 1e-6) return null;
                        return (
                          <button
                            key={`bb3-${mult}`}
                            type="button"
                            className={btnPrimary}
                            title={`총 기여 ${chipsAsBbLabel(target, bbUnit)}`}
                            onClick={() =>
                              dispatch({
                                type: "PREFLOP_RAISE",
                                toLevelChips: target,
                              })
                            }
                          >
                            Raise {mult}bb
                          </button>
                        );
                      })
                    : null}
                  {showPreflopRaise &&
                  !hideReraiseStreet &&
                  isLegalPreflopRaiseTarget(state, roundHalfChip(preRaiseCap)) ? (
                    <button
                      type="button"
                      className={
                        btnPrimary +
                        " border-amber-500/70 ring-1 ring-amber-500/35"
                      }
                      title={`최대 총 기여 ${chipsAsBbLabel(preRaiseCap, bbUnit)}`}
                      onClick={() =>
                        dispatch({
                          type: "PREFLOP_RAISE",
                          toLevelChips: roundHalfChip(preRaiseCap),
                        })
                      }
                    >
                      Raise MAX ({chipsAsBbLabel(preRaiseCap, bbUnit)})
                    </button>
                  ) : null}
                </div>
                {facing > 0 ? (
                  <button
                    type="button"
                    className={btnDanger + " shrink-0"}
                    title="이번 판을 포기합니다."
                    onClick={() => dispatch({ type: "FOLD" })}
                  >
                    Fold
                  </button>
                ) : null}
              </div>
            </div>
          ) : state.preflopStage === "facing_raise" && p === state.button ? (
            <div>
              <p className="mb-1.5 text-[10px] text-zinc-400">
                딜러·SB — BB 리레이즈에 맞출 칩만 추가할 수 있습니다.
              </p>
              <div className="flex w-full flex-wrap items-end justify-between gap-x-2 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  {facing > 0 && callPay > 0 ? (
                    <button
                      type="button"
                      className={btnPrimary}
                      title={isAllInCallUi ? callButtonTitle : preflopCallFacingTitle}
                      onClick={() => dispatch({ type: "PREFLOP_CALL" })}
                    >
                      {isAllInCallUi
                        ? `All-in Call (${callPayBb})`
                        : `Call (+${chipsAsBbLabel(facing, bbUnit)})`}
                    </button>
                  ) : null}
                </div>
                {facing > 0 ? (
                  <button
                    type="button"
                    className={btnDanger + " shrink-0"}
                    title="이번 판을 포기합니다."
                    onClick={() => dispatch({ type: "FOLD" })}
                  >
                    Fold
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {post ? (
        <div>
          <div className="flex w-full flex-wrap items-end justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-end gap-2">
              {facing === 0 && !blockVoluntaryOpen ? (
                <button
                  type="button"
                  className={btnPrimary}
                  title="베팅이 없을 때 팟을 늘리지 않고 넘깁니다."
                  onClick={() => dispatch({ type: "POSTFLOP_CHECK" })}
                >
                  Check
                </button>
              ) : null}
              {facing > 0 && callPay > 0 ? (
                <button
                  type="button"
                  className={btnPrimary}
                  title={isAllInCallUi ? callButtonTitle : callDetailTitle}
                  onClick={() => dispatch({ type: "POSTFLOP_CALL" })}
                >
                  {isAllInCallUi ? `All-in Call (${callPayBb})` : callMatchLabel}
                </button>
              ) : null}
              {bettingMatched(betting) &&
              !betting.raiseDone &&
              maxBet > 0 &&
              !isAllIn ? (
                <>
                  <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
                    Bet (≤{chipsAsBbLabel(maxBet, bbUnit)})
                    <input
                      type="number"
                      min={bbUnit}
                      max={maxBet}
                      step={SMALLEST_CHIP}
                      inputMode="decimal"
                      value={betDraft}
                      onChange={(e) => setBetDraft(e.target.value)}
                      onBlur={() =>
                        setBetDraft(
                          String(
                            clampChipField(betDraft, bbUnit, maxBet),
                          ),
                        )
                      }
                      className="w-20 rounded border border-zinc-500 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-50"
                    />
                  </label>
                  <button
                    type="button"
                    className={btnPrimary}
                    title={`Bet ${chipsAsBbLabel(betClamped, bbUnit)} into the pot this street.`}
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_BET",
                        amount: betClamped,
                      })
                    }
                  >
                    Bet ({chipsAsBbLabel(betClamped, bbUnit)})
                  </button>
                  <button
                    type="button"
                    className={
                      btnPrimary +
                      " border-amber-500/70 ring-1 ring-amber-500/35"
                    }
                    title={`Maximum bet this street: ${chipsAsBbLabel(maxBet, bbUnit)}`}
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_BET",
                        amount: maxBet,
                      })
                    }
                  >
                    Bet MAX ({chipsAsBbLabel(maxBet, bbUnit)})
                  </button>
                </>
              ) : null}
              {facing > 0 &&
              !betting.raiseDone &&
              !hideReraiseStreet &&
              canPostflopRaiseToMin ? (
                <>
                  <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
                    {`Min raise: ${chipsAsBbLabel(postRaiseMin, bbUnit)} · Max raise: ${chipsAsBbLabel(postRaiseRuleCap, bbUnit)} (pot+call cap)${
                      postRaiseOnlyByStack
                        ? ` — effective ${chipsAsBbLabel(postRaiseCap, bbUnit)} (stack)`
                        : ""
                    }`}
                    <input
                      type="number"
                      min={postRaiseMin}
                      max={postRaiseCap}
                      step={SMALLEST_CHIP}
                      inputMode="decimal"
                      value={raiseDraft}
                      onChange={(e) => setRaiseDraft(e.target.value)}
                      onBlur={() =>
                        setRaiseDraft(
                          String(
                            clampChipField(
                              raiseDraft,
                              postRaiseMin,
                              postRaiseCap,
                            ),
                          ),
                        )
                      }
                      className="w-24 rounded border border-zinc-500 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-50"
                    />
                  </label>
                  <button
                    type="button"
                    className={btnPrimary}
                    title={`Raise total contribution to ${chipsAsBbLabel(postRaiseClamped, bbUnit)} this street.`}
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_RAISE",
                        toLevelChips: postRaiseClamped,
                      })
                    }
                  >
                    Raise (total {chipsAsBbLabel(postRaiseClamped, bbUnit)})
                  </button>
                  <button
                    type="button"
                    className={
                      btnPrimary +
                      " border-amber-500/70 ring-1 ring-amber-500/35"
                    }
                    title={
                      postRaiseOnlyByStack
                        ? `Cap ${chipsAsBbLabel(postRaiseRuleCap, bbUnit)} — stack allows ${chipsAsBbLabel(postRaiseCap, bbUnit)}`
                        : `Maximum raise total ${chipsAsBbLabel(postRaiseRuleCap, bbUnit)} (pot+call)`
                    }
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_RAISE",
                        toLevelChips: postRaiseCap,
                      })
                    }
                  >
                    Raise MAX (total {chipsAsBbLabel(postRaiseCap, bbUnit)})
                  </button>
                </>
              ) : null}
            </div>
            {facing > 0 ? (
              <button
                type="button"
                className={btnDanger + " shrink-0"}
                title="상대의 베팅을 따라가지 않고 이번 판을 포기합니다. 상대 홀 카드는 공개되지 않습니다."
                onClick={() => dispatch({ type: "FOLD" })}
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
