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
  BET_RAISE_UNIT,
  CHIPS_PER_BB,
  PREFLOP_UI_BB_VS_OPEN_BB,
  PREFLOP_UI_BUTTON_OPEN_BB,
  SMALLEST_CHIP,
} from "@/holdem/constants";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import type { GameAction, GameState, PlayerIndex } from "@/holdem/types";

export type ActionPanelProps = {
  state: GameState;
  dispatch: (a: GameAction) => void | Promise<void>;
  playerNames: [string, string];
  /** 온라인 방: 내 차례일 때만 액션 버튼 표시 */
  mySeat?: PlayerIndex;
};

const btnPrimary =
  "rounded-lg border border-emerald-500/80 bg-emerald-800/45 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-700/45 disabled:cursor-not-allowed disabled:opacity-45";

const btnDanger =
  "rounded-lg border border-rose-600/70 bg-rose-900/45 px-3 py-2 text-xs font-semibold text-rose-50 hover:bg-rose-800/40 disabled:cursor-not-allowed disabled:opacity-45";

const btnIa =
  "rounded-lg border border-indigo-400/60 bg-indigo-900/45 px-3 py-2 text-xs font-semibold text-indigo-50 hover:bg-indigo-800/40 disabled:cursor-not-allowed disabled:opacity-45";

export function ActionPanel({ state, dispatch, playerNames, mySeat }: ActionPanelProps) {
  const pl = (p: PlayerIndex) => playerNames[p] ?? `P${p}`;
  const p = state.toAct;
  const [betAmt, setBetAmt] = React.useState(BET_RAISE_UNIT);
  const [postRaiseTo, setPostRaiseTo] = React.useState(BET_RAISE_UNIT * 2);

  const phase = state.phase;
  const betting = state.betting;

  React.useEffect(() => {
    if (p == null) return;
    const f = facingFor(p, betting);
    const lv = levelFromContributions(betting);
    if (phase === "flop" || phase === "turn" || phase === "river") {
      const maxB = postflopMaxBet(state.pot, state.chips[p]!);
      if (maxB >= BET_RAISE_UNIT) {
        setBetAmt(
          Math.min(
            maxB,
            Math.max(BET_RAISE_UNIT, roundHalfChip(maxB / 2)),
          ),
        );
      } else {
        setBetAmt(BET_RAISE_UNIT);
      }
      if (f > 0) {
        const maxT = postflopEffectiveMaxRaiseToLevel(
          state.pot,
          f,
          betting.contributed[p]!,
          state.chips[p]!,
        );
        const minR = postflopMinRaiseToLevelChips(lv, f);
        setPostRaiseTo(Math.min(minR, maxT));
      }
    }
  }, [p, phase, betting, state.preflopStage, state.button, state.pot, state.chips, state.preflopRaiseCount, state.toAct]);

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
      <div className="rounded-xl border border-zinc-600/90 bg-zinc-700/55 p-3 text-sm text-zinc-300">
        위 패널에서 차례인 플레이어가 핸드를 고르세요.
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
        <button
          type="button"
          title="새 핸드를 시작합니다. 버튼이 넘어가고 핸드를 다시 고릅니다."
          className={btnPrimary + " w-full"}
          onClick={() => dispatch({ type: "NEW_HAND" })}
        >
          다음 핸드
        </button>
      </div>
    );
  }

  if (p == null) return null;

  if (mySeat != null && p !== mySeat) {
    return (
      <div className="rounded-xl border border-zinc-600/90 bg-zinc-800/50 p-4 text-center">
        <p className="text-sm font-medium text-zinc-200">
          지금은 <span className="text-amber-100">{pl(p)}</span> 차례입니다.
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          상대가 액션할 때까지 기다려 주세요.
        </p>
      </div>
    );
  }

  const chips = state.chips[p]!;
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

  const iaCost = iaCostFromPot(state.pot);
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

  const callMatchLabel = `콜 (총 ${chipsAsBbLabel(level)})`;
  const callDetailTitle = `이번 스트리트에서 ${chipsAsBbLabel(facing)} 추가로 상대가 쌓인 액수(${chipsAsBbLabel(level)})에 맞춥니다.`;

  const callPay = effectiveCallPay(p, state);
  const isAllInCallUi =
    facing > 0 && callPay > 0 && Math.abs(callPay - chips) < 1e-6;
  const callPayBb = chipsAsBbLabel(callPay);
  const callButtonTitle = isAllInCallUi
    ? `스택 전부 ${callPayBb}를 맞춥니다. 남은 보드가 자동으로 깔린 뒤 쇼다운합니다.`
    : callDetailTitle;
  const preflopCallFacingTitle = `맞춰야 할 추가 칩: ${chipsAsBbLabel(facing)}.`;

  const preMaxBbLabel = chipsAsBbLabel(preRaiseCap);

  const betClamped = roundHalfChip(Math.min(betAmt, maxBet));
  const postRaiseClamped = roundHalfChip(
    Math.min(
      Math.max(postRaiseTo, postRaiseMin),
      postRaiseCap,
    ),
  );

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

  const streetLabelKo =
    phase === "preflop"
      ? "프리플랍"
      : phase === "flop"
        ? "플랍"
        : phase === "turn"
          ? "턴"
          : phase === "river"
            ? "리버"
            : String(phase);
  const posShort = state.button === p ? "SB" : "BB";
  const levelLabel = level > 1e-9 ? chipsAsBbLabel(level) : "—";

  return (
    <div className="space-y-3 rounded-xl border border-zinc-600/90 bg-zinc-700/55 p-3">
      <div className="space-y-0.5 border-b border-zinc-600/55 pb-2">
        <p className="text-sm font-semibold text-zinc-50">
          <span className="mr-0.5" aria-hidden>
            👉
          </span>
          {pl(p)} 액션 ({posShort})
        </p>
        <p className="text-[11px] text-zinc-400">
          {streetLabelKo} · 스트리트 최고 {levelLabel}
        </p>
      </div>
      {state.lastActionNote ? (
        <p className="text-[11px] text-zinc-400">{state.lastActionNote}</p>
      ) : null}

      {respondToShoveOnly ? (
        <p className="rounded-md border border-amber-500/35 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-100/90">
          상대 올인 — <span className="font-semibold">폴드</span> 또는{" "}
          <span className="font-semibold">콜(스택 전부)</span>만 가능합니다.
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
              −{chipsAsBbLabel(iaCost)}
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
                버튼(SB) — 콜은 BB 총액 (+{chipsAsBbLabel(facing)}).
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
                        ? `올인 콜 (${callPayBb})`
                        : `콜 (BB · +${chipsAsBbLabel(facing)})`}
                    </button>
                  ) : null}
                  {showPreflopRaise && !hideReraiseStreet
                    ? PREFLOP_UI_BUTTON_OPEN_BB.map((mult) => {
                        const target = roundHalfChip(mult * CHIPS_PER_BB);
                        if (!isLegalPreflopRaiseTarget(state, target)) return null;
                        if (Math.abs(target - preRaiseCap) < 1e-6) return null;
                        return (
                          <button
                            key={mult}
                            type="button"
                            className={btnPrimary}
                            title={`총 기여 ${chipsAsBbLabel(target)} (상한 ${preMaxBbLabel})`}
                            onClick={() =>
                              dispatch({
                                type: "PREFLOP_RAISE",
                                toLevelChips: target,
                              })
                            }
                          >
                            레이즈 {mult}bb
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
                      title={`최대 총 기여 ${chipsAsBbLabel(preRaiseCap)} (${preMaxBbLabel} 상한)`}
                      onClick={() =>
                        dispatch({
                          type: "PREFLOP_RAISE",
                          toLevelChips: roundHalfChip(preRaiseCap),
                        })
                      }
                    >
                      레이즈 MAX ({chipsAsBbLabel(preRaiseCap)})
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
                    폴드
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
                    체크
                  </button>
                ) : null}
                {showPreflopRaise && !hideReraiseStreet
                  ? PREFLOP_UI_BUTTON_OPEN_BB.map((mult) => {
                      const target = roundHalfChip(mult * CHIPS_PER_BB);
                      if (!isLegalPreflopRaiseTarget(state, target)) return null;
                      if (Math.abs(target - preRaiseCap) < 1e-6) return null;
                      return (
                        <button
                          key={`bb-${mult}`}
                          type="button"
                          className={btnPrimary}
                          title={`총 기여 ${chipsAsBbLabel(target)}`}
                          onClick={() =>
                            dispatch({
                              type: "PREFLOP_RAISE",
                              toLevelChips: target,
                            })
                          }
                        >
                          레이즈 {mult}bb
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
                    title={`최대 총 기여 ${chipsAsBbLabel(preRaiseCap)}`}
                    onClick={() =>
                      dispatch({
                        type: "PREFLOP_RAISE",
                        toLevelChips: roundHalfChip(preRaiseCap),
                      })
                    }
                  >
                    레이즈 MAX ({chipsAsBbLabel(preRaiseCap)})
                  </button>
                ) : null}
              </div>
            </div>
          ) : state.preflopStage === "facing_raise" && isBbToAct ? (
            <div>
              <p className="mb-1.5 text-[10px] text-zinc-400">
                BB — 버튼 오픈에 응답 · 상한{" "}
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
                        ? `올인 콜 (${callPayBb})`
                        : `콜 (+${chipsAsBbLabel(facing)})`}
                    </button>
                  ) : null}
                  {showPreflopRaise && !hideReraiseStreet
                    ? PREFLOP_UI_BB_VS_OPEN_BB.map((mult) => {
                        const target = roundHalfChip(mult * CHIPS_PER_BB);
                        if (!isLegalPreflopRaiseTarget(state, target)) return null;
                        if (Math.abs(target - preRaiseCap) < 1e-6) return null;
                        return (
                          <button
                            key={`bb3-${mult}`}
                            type="button"
                            className={btnPrimary}
                            title={`총 기여 ${chipsAsBbLabel(target)}`}
                            onClick={() =>
                              dispatch({
                                type: "PREFLOP_RAISE",
                                toLevelChips: target,
                              })
                            }
                          >
                            레이즈 {mult}bb
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
                      title={`최대 총 기여 ${chipsAsBbLabel(preRaiseCap)}`}
                      onClick={() =>
                        dispatch({
                          type: "PREFLOP_RAISE",
                          toLevelChips: roundHalfChip(preRaiseCap),
                        })
                      }
                    >
                      레이즈 MAX ({chipsAsBbLabel(preRaiseCap)})
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
                    폴드
                  </button>
                ) : null}
              </div>
            </div>
          ) : state.preflopStage === "facing_raise" && p === state.button ? (
            <div>
              <p className="mb-1.5 text-[10px] text-zinc-400">
                버튼(SB) — BB 리레이즈에 맞출 칩만 추가할 수 있습니다.
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
                        ? `올인 콜 (${callPayBb})`
                        : `콜 (+${chipsAsBbLabel(facing)})`}
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
                    폴드
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
                  체크
                </button>
              ) : null}
              {facing > 0 && callPay > 0 ? (
                <button
                  type="button"
                  className={btnPrimary}
                  title={isAllInCallUi ? callButtonTitle : callDetailTitle}
                  onClick={() => dispatch({ type: "POSTFLOP_CALL" })}
                >
                  {isAllInCallUi ? `올인 콜 (${callPayBb})` : callMatchLabel}
                </button>
              ) : null}
              {bettingMatched(betting) &&
              !betting.raiseDone &&
              maxBet > 0 &&
              !isAllIn ? (
                <>
                  <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
                    베트 (≤{maxBet})
                    <input
                      type="number"
                      min={BET_RAISE_UNIT}
                      max={maxBet}
                      step={SMALLEST_CHIP}
                      value={Math.min(betAmt, maxBet)}
                      onChange={(e) => setBetAmt(Number(e.target.value))}
                      className="w-20 rounded border border-zinc-500 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-50"
                    />
                  </label>
                  <button
                    type="button"
                    className={btnPrimary}
                    title={`이번 스트리트에 팟으로 ${chipsAsBbLabel(betClamped)}를 넣습니다.`}
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_BET",
                        amount: betClamped,
                      })
                    }
                  >
                    베트 ({chipsAsBbLabel(betClamped)})
                  </button>
                  <button
                    type="button"
                    className={
                      btnPrimary +
                      " border-amber-500/70 ring-1 ring-amber-500/35"
                    }
                    title={`이번 스트리트 허용 최대 베트 ${chipsAsBbLabel(maxBet)}`}
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_BET",
                        amount: maxBet,
                      })
                    }
                  >
                    베트 MAX ({chipsAsBbLabel(maxBet)})
                  </button>
                </>
              ) : null}
              {facing > 0 &&
              !betting.raiseDone &&
              !hideReraiseStreet &&
              canPostflopRaiseToMin ? (
                <>
                  <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
                    {`최소 레이즈: ${chipsAsBbLabel(postRaiseMin)} · 최대 레이즈: ${chipsAsBbLabel(postRaiseRuleCap)} (팟+콜 한도)${
                      postRaiseOnlyByStack
                        ? ` — 적용 ${chipsAsBbLabel(postRaiseCap)} (칩 부족)`
                        : ""
                    }`}
                    <input
                      type="number"
                      min={postRaiseMin}
                      max={postRaiseCap}
                      step={SMALLEST_CHIP}
                      value={Math.min(
                        Math.max(postRaiseTo, postRaiseMin),
                        postRaiseCap,
                      )}
                      onChange={(e) => setPostRaiseTo(Number(e.target.value))}
                      className="w-24 rounded border border-zinc-500 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-50"
                    />
                  </label>
                  <button
                    type="button"
                    className={btnPrimary}
                    title={`콜 후 이번 스트리트 총 기여를 ${chipsAsBbLabel(postRaiseClamped)}까지 올립니다.`}
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_RAISE",
                        toLevelChips: postRaiseClamped,
                      })
                    }
                  >
                    레이즈 (총 {chipsAsBbLabel(postRaiseClamped)})
                  </button>
                  <button
                    type="button"
                    className={
                      btnPrimary +
                      " border-amber-500/70 ring-1 ring-amber-500/35"
                    }
                    title={
                      postRaiseOnlyByStack
                        ? `한도 ${chipsAsBbLabel(postRaiseRuleCap)} — 칩으로 ${chipsAsBbLabel(postRaiseCap)}까지`
                        : `최대 레이즈 총액 ${chipsAsBbLabel(postRaiseRuleCap)} (팟+콜)`
                    }
                    onClick={() =>
                      dispatch({
                        type: "POSTFLOP_RAISE",
                        toLevelChips: postRaiseCap,
                      })
                    }
                  >
                    레이즈 MAX (총 {chipsAsBbLabel(postRaiseCap)})
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
                폴드
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
