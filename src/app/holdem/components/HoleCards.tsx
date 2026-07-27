"use client";

import * as React from "react";
import type { CSSProperties } from "react";
import {
  best5Of7,
  bestFiveCardsFromSeven,
  compareHandValue,
  currentCompactHandLabel,
  madeHandFxKind,
  madeHandFxTier,
} from "@/holdem/pokerEval";
import type { MadeHandFxKind } from "@/holdem/pokerEval";
import {
  HOLDEM_PREFS_CHANGED_EVENT,
  loadMadeHandFxEnabled,
} from "@/holdem/holdemPrefs";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import { iaCategoryHandListText, iaCategoryLabelKo } from "@/holdem/handPool";
import {
  headsUpPositionLabel,
  HU_DEALER_SB_LABEL,
} from "@/holdem/headsUpLabels";
import type { GameState, PlayerIndex } from "@/holdem/types";
import { useHoldemMotionMode } from "../HoldemMotionRuntime";
import { useTurnPulse } from "../hooks/useTurnPulse";
import { currentShowdownHandLabels } from "../showdownPresentation";
import { CardBack, PlayingCard } from "./Card";

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** 이전 빌드의 상세 쇼다운 문구가 섞여 들어와도 패널에는 키커를 노출하지 않는다. */
function withoutKickerDetail(label: string | null): string | null {
  if (label == null) return null;
  return label
    .replace(/\s*·\s*kickers?\b.*$/i, "")
    .replace(/\s*·\s*[2-9TJQKA]+\s+kicker\b.*$/i, "")
    .replace(/\s*·\s*키커\b.*$/, "");
}

/** 메이드 연출용 — 선 형태의 링 없이 족보 색상이 번지는 카드 후광 */
export const MADE_FX_CARD_GLOW: Record<number, string> = {
  1: "holdem-made-card-glow-t1",
  2: "holdem-made-card-glow-t2",
  3: "holdem-made-card-glow-t3",
  4: "holdem-made-card-glow-t4",
  5: "holdem-made-card-glow-t5",
};

/** 내 턴 패널 — 메이드 티어가 있으면 메이드 연출 색으로 에메랄드 대체 */
export const MADE_TURN_PANEL: Record<number, string> = {
  1: "border-zinc-600/70 bg-amber-950/29 shadow-[0_0_26px_rgba(251,191,36,0.29)] z-[2]",
  2: "border-zinc-600/70 bg-sky-950/29 shadow-[0_0_35px_rgba(14,165,233,0.36)] z-[2]",
  3: "border-zinc-600/70 bg-violet-950/31 shadow-[0_0_44px_rgba(167,139,250,0.41)] z-[2]",
  4: "border-zinc-600/70 bg-rose-950/31 shadow-[0_0_53px_rgba(244,63,94,0.46)] z-[2]",
  5: "border-zinc-600/70 bg-sky-950/22 shadow-[0_0_56px_rgba(192,132,252,0.4)] z-[2]",
};

const MADE_TURN_ACTION_BADGE: Record<number, string> = {
  1: "rounded-full bg-amber-600/38 px-2 py-0.5 text-[9px] font-bold text-amber-100",
  2: "rounded-full bg-sky-600/38 px-2 py-0.5 text-[9px] font-bold text-sky-100",
  3: "rounded-full bg-violet-600/38 px-2 py-0.5 text-[9px] font-bold text-violet-100",
  4: "rounded-full bg-amber-500/38 px-2 py-0.5 text-[9px] font-bold text-amber-50",
  5: "rounded-full bg-yellow-500/35 px-2 py-0.5 text-[9px] font-bold text-yellow-50",
};

const MADE_FX_IMPACT_CLASS: Partial<Record<MadeHandFxKind, string>> = {
  straight: "holdem-preview-impact-t1-fx",
  flush: "holdem-preview-impact-t2-fx",
  "full-house": "holdem-preview-impact-t3-fx",
};

const MADE_FX_CYCLE_AURA_CLASS: Partial<Record<MadeHandFxKind, string>> = {
  straight: "holdem-preview-cycle-aura-straight",
  flush: "holdem-preview-cycle-aura-flush",
  "full-house": "holdem-preview-cycle-aura-full-house",
  quads: "holdem-preview-cycle-aura-quads",
};

type MadeFxVariantClasses = {
  panel: string;
  fx: string;
  card: string;
  label: string;
  badge: string;
};

const MADE_FX_VARIANT_CLASSES: Partial<
  Record<MadeHandFxKind, MadeFxVariantClasses>
> = {
  quads: {
    panel: "holdem-preview-quads-coral-panel",
    fx: "holdem-preview-quads-coral-fx",
    card: "holdem-preview-quads-coral-card",
    label: "holdem-preview-quads-coral-label",
    badge: "holdem-preview-quads-coral-badge",
  },
  "straight-flush": {
    panel: "holdem-preview-straight-flush-rainbow-panel",
    fx: "holdem-preview-straight-flush-rainbow-fx",
    card: "holdem-preview-straight-flush-rainbow-card",
    label: "holdem-preview-straight-flush-rainbow-label",
    badge: "holdem-preview-straight-flush-rainbow-badge",
  },
  "royal-flush": {
    panel: "holdem-preview-royal-flush-panel",
    fx: "holdem-preview-royal-flush-fx",
    card: "holdem-preview-royal-flush-card",
    label: "holdem-preview-royal-flush-label",
    badge: "holdem-preview-royal-flush-badge",
  },
};

function turnPulseAnimation(madeTier: number | null, subtle: boolean): string {
  if (madeTier != null && madeTier >= 1 && madeTier <= 5) {
    return subtle
      ? `holdem-turn-ring-t${madeTier}-subtle 0.24s ease-out 1`
      : `holdem-turn-ring-t${madeTier} 0.32s ease-out 1`;
  }
  return subtle
    ? "holdem-turn-ring-subtle 0.24s ease-out 1"
    : "holdem-turn-ring 0.32s ease-out 1";
}

function useMadeHandFxEnabled(): boolean {
  const [on, setOn] = React.useState(() =>
    typeof window !== "undefined" ? loadMadeHandFxEnabled() : true,
  );
  React.useEffect(() => {
    setOn(loadMadeHandFxEnabled());
    const h = () => setOn(loadMadeHandFxEnabled());
    window.addEventListener(HOLDEM_PREFS_CHANGED_EVENT, h);
    return () => window.removeEventListener(HOLDEM_PREFS_CHANGED_EVENT, h);
  }, []);
  return on;
}

export type HoleCardsProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
  /** `both`(기본). 테이블 레이아웃: 상대만 / 나만 분리 표시 */
  seatFilter?: "both" | "opponent" | "hero";
  /** 올인 쇼다운 연출 마지막: 승자 패널 펄스 */
  cinematicWinnerPulse?: boolean;
  /** 쇼다운 승패 강조를 활성화할지(시네마 resolve 단계에서만 true) */
  showdownFxArmed?: boolean;
  /** 향후 정확한 올인 승률 계산기가 연결될 때 사용할 표시 슬롯 */
  showdownEquityPercent?: [number | null, number | null];
  /** 올인 런아웃에서 새 스트리트 공개 후 현재 메이드 족보 연출을 허용 */
  showdownRunoutFx?: boolean;
};

function showdownCompare(state: GameState): number | null {
  if (state.phase !== "showdown") return null;
  const h0 = state.holes[0];
  const h1 = state.holes[1];
  if (!h0 || !h1) return null;
  const v0 = best5Of7([...h0.hole, ...state.board]);
  const v1 = best5Of7([...h1.hole, ...state.board]);
  return compareHandValue(v0, v1);
}

export function HoleCards({
  state,
  viewer,
  playerNames,
  seatFilter = "both",
  cinematicWinnerPulse = false,
  showdownFxArmed = true,
  showdownEquityPercent = [null, null],
  showdownRunoutFx = false,
}: HoleCardsProps) {
  const { t, locale } = useHoldemI18n();
  const motionMode = useHoldemMotionMode();
  const subtleMotion = motionMode === "subtle";
  const madeHandFxOn = useMadeHandFxEnabled();
  const selecting = state.phase === "hand_select";
  const opp = other(viewer);
  const showdownReveal = state.phase === "showdown";
  const sdCmp = showdownCompare(state);
  const showdownHandLabels = React.useMemo(() => {
    const h0 = state.holes[0];
    const h1 = state.holes[1];
    if (!showdownReveal || !h0 || !h1) return [null, null] as const;
    return currentShowdownHandLabels(
      [h0.hole, h1.hole],
      state.board,
      state.boardRevealed,
      locale,
    );
  }, [locale, showdownReveal, state.board, state.boardRevealed, state.holes]);
  const showdownMade = React.useMemo(() => {
    if (!showdownFxArmed || state.phase !== "showdown") return null;
    const h0 = state.holes[0];
    const h1 = state.holes[1];
    if (!h0 || !h1) return null;
    // 보드 5장이 모두 공개된 뒤에만 확실하게 "메이드 5장"을 보여준다.
    if (state.boardRevealed < 5) return null;

    const all0 = [...h0.hole, ...state.board];
    const all1 = [...h1.hole, ...state.board];
    const v0 = best5Of7(all0);
    const v1 = best5Of7(all1);
    const cmp = compareHandValue(v0, v1);
    const key = (c: { rank: number; suit: string }) => `${c.rank}:${c.suit}`;

    if (cmp === 0) {
      const s0 = new Set(bestFiveCardsFromSeven(all0).map(key));
      const s1 = new Set(bestFiveCardsFromSeven(all1).map(key));
      return { kind: "tie" as const, winSeat: null, sets: [s0, s1] as const };
    }
    const winSeat = (cmp > 0 ? 0 : 1) as 0 | 1;
    const winAll = winSeat === 0 ? all0 : all1;
    const winSet = new Set(bestFiveCardsFromSeven(winAll).map(key));
    return { kind: "win" as const, winSeat, winSet };
  }, [showdownFxArmed, state.board, state.boardRevealed, state.holes, state.phase]);
  const turnPulse = useTurnPulse(
    state.phase !== "showdown" && state.phase !== "hand_over"
      ? state.toAct
      : null,
    { holdMs: subtleMotion ? 240 : 320 },
  );
  const iaCategoryForOpp =
    state.phase !== "hand_select" && state.iaReveal[viewer] != null
      ? state.iaReveal[viewer]
      : null;
  const iaOpponentLearnedAboutMe =
    state.phase !== "hand_select" ? state.iaReveal[other(viewer)] : null;

  return (
    <div
      className={[
        "grid gap-3",
        seatFilter === "both" ? "sm:grid-cols-2" : "grid-cols-1",
      ].join(" ")}
    >
      {([0, 1] as PlayerIndex[]).map((p) => {
        if (seatFilter === "hero" && p !== viewer) return null;
        if (seatFilter === "opponent" && p !== opp) return null;
        const sel = state.holes[p];
        const pending = state.handPickPending[p];
        const showPendingOnly = selecting && pending != null && sel == null;
        const isMe = p === viewer;
        const bettingLive =
          state.phase === "preflop" ||
          state.phase === "flop" ||
          state.phase === "turn" ||
          state.phase === "river";

        const isToAct =
          state.toAct === p &&
          !state.matchEnded &&
          state.phase !== "showdown" &&
          state.phase !== "hand_over";

        const isHandPickChoosing =
          selecting && pending == null && sel == null;
        const isHandPickSubmitted =
          selecting && pending != null && sel == null;

        const dimForNonTurn =
          bettingLive &&
          state.toAct != null &&
          state.toAct !== p &&
          !state.matchEnded;

        const showFaces =
          sel != null &&
          (showdownReveal ||
            (isMe && (state.phase === "hand_over" || !selecting)));

        const showOpponentBacks =
          sel != null && !isMe && !selecting && !showdownReveal;

        const boardUsedForFx = state.board.slice(0, state.boardRevealed);
        let madeFxTier = 0;
        let madeFxKind: MadeHandFxKind = "none";
        if (
          sel != null &&
          showFaces &&
          (madeHandFxOn || showdownReveal)
        ) {
          const all = [...sel.hole, ...boardUsedForFx];
          if (all.length >= 5) {
            const madeValue = best5Of7(all);
            madeFxTier = madeHandFxTier(madeValue);
            madeFxKind = madeHandFxKind(madeValue);
          }
        }
        const madeFxImpactClass = MADE_FX_IMPACT_CLASS[madeFxKind];
        const madeFxCycleAuraClass = MADE_FX_CYCLE_AURA_CLASS[madeFxKind];
        const madeFxVariant = MADE_FX_VARIANT_CLASSES[madeFxKind];
        const madeFxCardClass =
          madeFxVariant?.card ??
          (madeFxTier > 0 ? MADE_FX_CARD_GLOW[madeFxTier] : "");
        const madeFxOuterKey =
          madeFxTier > 0
            ? showdownRunoutFx
              ? `made-fx-runout-${state.roundNumber}-${madeFxKind}-p${p}`
              : `made-fx-${state.roundNumber}-${state.boardRevealed}-${madeFxKind}-p${p}`
            : showdownReveal
              ? `showdown-default-fx-${state.roundNumber}-p${p}`
              : `hole-row-${p}`;
        /** 메이드 연출이 보이도록: 내 패가 스트레이트↑일 때 상대 턴 디밍 제외 */
        const dimPanelForIdleTurn =
          dimForNonTurn && !(isMe && madeFxTier > 0);

        const winnerShowdown =
          showdownFxArmed &&
          showdownReveal &&
          sdCmp != null &&
          sdCmp !== 0 &&
          ((sdCmp > 0 && p === 0) || (sdCmp < 0 && p === 1));
        const tieShowdown = showdownFxArmed && showdownReveal && sdCmp === 0;
        const loserShowdown =
          showdownFxArmed && showdownReveal && sdCmp !== 0 && !winnerShowdown && !tieShowdown;

        const heroMadeTurnGlow =
          isMe &&
          madeHandFxOn &&
          madeFxTier >= 1 &&
          madeFxTier <= 5 &&
          isToAct &&
          !loserShowdown;

        const showdownResultGlow =
          showdownReveal && (winnerShowdown || tieShowdown);
        const showMadeFx =
          madeFxTier > 0 &&
          (!showdownReveal || showdownResultGlow || showdownRunoutFx);
        const showDefaultShowdownGlow =
          showdownResultGlow && madeFxTier === 0;
        const royalPanelCelebration =
          showMadeFx && madeFxKind === "royal-flush" && !loserShowdown;

        /** 쇼다운 승자·무승부 패널도 족보 색상, 트리플 이하는 에메랄드로 통일 */
        const showdownFrame =
          showdownResultGlow
            ? madeFxTier > 0
              ? madeFxVariant?.panel ?? MADE_TURN_PANEL[madeFxTier]!
              : "border-zinc-600/70 bg-emerald-950/28 shadow-[0_0_38px_rgba(52,211,153,0.34)]"
            : "";

        const showdownResultBadgeClass =
          madeFxTier > 0
            ? madeFxVariant?.badge ?? MADE_TURN_ACTION_BADGE[madeFxTier]!
            : "bg-emerald-500/22 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.28)]";

        let toneFrame = "";
        if (!loserShowdown) {
          if (isToAct) {
            toneFrame = heroMadeTurnGlow
              ? madeFxVariant?.panel ?? MADE_TURN_PANEL[madeFxTier]!
              : "border-emerald-400/70 bg-emerald-900/35 shadow-[0_0_30px_rgba(52,211,153,0.38)] ring-2 ring-emerald-400/50 z-[2]";
          } else if (isHandPickChoosing) {
            toneFrame =
              "border-amber-400/60 bg-amber-950/28 shadow-[0_0_26px_rgba(251,191,36,0.28)] ring-2 ring-amber-400/40 z-[1]";
          } else if (isHandPickSubmitted) {
            toneFrame =
              "border-emerald-500/40 bg-emerald-950/18 ring-1 ring-emerald-500/35";
          } else if (showdownFrame) {
            toneFrame = showdownFrame;
          } else {
            toneFrame = "border-zinc-600/90 bg-zinc-700/45";
          }
        }

        const frameClass = [
          "rounded-xl border transition-[box-shadow,background-color,border-color,opacity,filter] duration-200",
          showdownReveal ? "px-2 py-2" : "px-3 py-3",
          loserShowdown
            ? "border-zinc-800/85 bg-zinc-950/45 text-zinc-600 opacity-[0.48] brightness-[0.72] saturate-50"
            : toneFrame,
          dimPanelForIdleTurn ? "opacity-[0.52] brightness-[0.88] saturate-75" : "",
          cinematicWinnerPulse && winnerShowdown
            ? "z-[1] scale-[1.02]"
            : "",
          royalPanelCelebration
            ? "holdem-preview-royal-panel-celebration"
            : "",
        ].join(" ");

        const frameStyle: CSSProperties | undefined =
          isToAct && turnPulse
            ? heroMadeTurnGlow
              ? undefined
              : {
                animation: turnPulseAnimation(
                  heroMadeTurnGlow ? madeFxTier : null,
                  subtleMotion,
                ),
                }
            : isHandPickChoosing
              ? {
                  animation: subtleMotion
                    ? "holdem-hand-pick-glow-subtle 1.1s ease-in-out infinite"
                    : "holdem-hand-pick-glow 1.8s ease-in-out infinite",
                }
              : cinematicWinnerPulse && winnerShowdown
                ? {
                    animation: subtleMotion
                      ? "holdem-showdown-win-pulse-subtle 0.75s ease-in-out 2"
                      : "holdem-showdown-win-pulse 1.15s ease-in-out 2",
                  }
                : undefined;

        const seatName = playerNames[p]!;
        const rawPositionLabel = headsUpPositionLabel(state, p);
        const positionLabel =
          locale === "en" && rawPositionLabel === HU_DEALER_SB_LABEL
            ? "BTN · SB"
            : rawPositionLabel;

        // 내 카드 헤더용 compact 족보 (핸드셀렉·쇼다운 제외)
        const compactHand =
          isMe &&
          sel != null &&
          state.phase !== "hand_select" &&
          state.phase !== "showdown"
            ? currentCompactHandLabel(
                sel.hole,
                state.board,
                state.boardRevealed,
                locale,
              )
            : "";
        const showdownHand = withoutKickerDetail(showdownHandLabels[p]);
        const equityPercent = showdownEquityPercent[p];

        const cardSize =
          showdownReveal ? ("hero" as const) : isMe ? ("hero" as const) : ("board" as const);

        const showdownCardClass = loserShowdown ? "opacity-55" : "";
        const madeKey = (c: { rank: number; suit: string }) => `${c.rank}:${c.suit}`;
        return (
          <div key={p} className={frameClass} style={frameStyle}>
            {royalPanelCelebration ? (
              <div
                key={`royal-panel-flash-${madeFxOuterKey}`}
                className="holdem-preview-royal-panel-flash"
                aria-hidden
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium uppercase text-zinc-400">
              <span className="text-zinc-200">{seatName}</span>
              <span
                className="rounded bg-zinc-600/80 px-1.5 py-px text-zinc-300"
                style={{ fontSize: "calc(9px * 1.3)" }}
              >
                {positionLabel}
              </span>
              {isMe ? (
                <span className="text-emerald-300">{t("hole.myCards")}</span>
              ) : (
                <span className="text-zinc-500">{t("hole.opponent")}</span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {showdownReveal && showdownFxArmed ? (
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider",
                      winnerShowdown || tieShowdown
                        ? showdownResultBadgeClass
                        : "bg-zinc-800/75 text-zinc-500 ring-1 ring-zinc-700/60",
                    ].join(" ")}
                  >
                    {tieShowdown
                      ? locale === "en"
                        ? "SPLIT POT"
                        : "팟 분배"
                      : winnerShowdown
                        ? locale === "en"
                          ? "WINNER"
                          : "승자"
                        : locale === "en"
                          ? "LOSE"
                          : "패자"}
                  </span>
                ) : isToAct ? (
                  <span
                    className={
                      heroMadeTurnGlow
                        ? madeFxVariant?.badge ??
                          MADE_TURN_ACTION_BADGE[madeFxTier]!
                        : "rounded-full bg-emerald-600/30 px-2 py-0.5 text-[9px] font-bold text-emerald-200"
                    }
                  >
                    {t("hole.actionTurn")}
                  </span>
                ) : isHandPickChoosing ? (
                  <span className="rounded-full bg-amber-600/35 px-2 py-0.5 text-[9px] font-bold text-amber-100">
                    {t("hole.handPick")}
                  </span>
                ) : isHandPickSubmitted ? (
                  <span className="rounded-full bg-emerald-700/35 px-2 py-0.5 text-[9px] font-bold text-emerald-100">
                    {t("hole.submitted")}
                  </span>
                ) : null}
              </div>
            </div>

            {sel && showFaces ? (
              <div className="mt-2">
                <div
                  className={[
                    "flex flex-col items-center justify-center gap-2.5 text-center",
                    showdownReveal ? "sm:gap-3" : "",
                  ].join(" ")}
                >
                  {/* 카드 2장 — 스트레이트↑ 메이드 시 티어별 연출 */}
                  <div
                    key={madeFxOuterKey}
                    className={[
                      showMadeFx
                        ? `holdem-made-fx holdem-made-fx-t${madeFxTier} overflow-visible`
                        : showDefaultShowdownGlow
                          ? "holdem-made-fx holdem-showdown-default-fx overflow-visible"
                        : "",
                      showMadeFx ? madeFxImpactClass ?? "" : "",
                      showMadeFx ? madeFxVariant?.fx ?? "" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {showMadeFx && madeFxCycleAuraClass ? (
                      <span
                        className={`holdem-preview-cycle-aura ${madeFxCycleAuraClass}`}
                        aria-hidden
                      />
                    ) : null}
                    <div
                      className={[
                        "flex shrink-0",
                        "gap-3",
                        showMadeFx || showDefaultShowdownGlow
                          ? "holdem-made-fx-stack"
                          : "",
                      ].join(" ")}
                    >
                      {sel.hole.map((c, i) => (
                        <div
                          key={i}
                          className={showMadeFx ? "holdem-made-fx-card" : undefined}
                          style={
                            showMadeFx
                              ? { animationDelay: `${i * 0.08}s` }
                              : undefined
                          }
                        >
                          {(() => {
                            const inMade5 =
                              showdownMade?.kind === "tie"
                                ? showdownMade.sets[p].has(madeKey(c))
                                : showdownMade?.kind === "win"
                                  ? p === showdownMade.winSeat &&
                                    showdownMade.winSet.has(madeKey(c))
                                  : false;
                            const dimNonMade =
                              showdownMade != null &&
                              (showdownMade.kind === "tie" || showdownMade.winSeat === p) &&
                              !inMade5;
                            const showRing = showdownMade != null && inMade5;
                            return (
                              <PlayingCard
                                card={c}
                                size={cardSize}
                                className={[
                                  showdownReveal ? showdownCardClass : "",
                                  showMadeFx &&
                                  (!showdownReveal || showdownRunoutFx)
                                    ? madeFxCardClass
                                    : "",
                                  showRing
                                    ? madeFxTier > 0
                                      ? madeFxCardClass
                                      : "holdem-showdown-default-card-glow"
                                    : "",
                                  dimNonMade
                                    ? "opacity-35 brightness-[0.78] saturate-50 grayscale-[0.18]"
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              />
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex min-h-7 w-full flex-wrap items-center justify-center gap-2 px-1">
                    {/* 일반 진행은 내 족보, 쇼다운은 양쪽 현재 족보를 카드 아래에 표시한다. */}
                    {(showdownHand ?? compactHand) ? (
                      <span
                        key={
                          showdownHand
                            ? `showdown-hand-label-${p}-${showdownHand}`
                            : `hand-label-${madeFxOuterKey}`
                        }
                        className={[
                          "inline-block text-center text-lg font-extrabold leading-tight tracking-tight drop-shadow-sm sm:text-xl",
                          showdownHand ? "holdem-showdown-hand-change text-amber-50" : "",
                          showMadeFx
                            ? [
                                "holdem-made-hand-label",
                                madeFxVariant?.label ??
                                  `holdem-made-hand-label-t${madeFxTier}`,
                              ].join(" ")
                            : showDefaultShowdownGlow
                              ? "text-emerald-100 drop-shadow-[0_0_10px_rgba(52,211,153,0.48)]"
                            : "text-zinc-50",
                        ].join(" ")}
                      >
                        {showdownHand ?? compactHand}
                      </span>
                    ) : null}
                    {showdownReveal && equityPercent != null ? (
                      <span className="rounded-full border border-sky-400/35 bg-sky-950/35 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-100">
                        {Math.max(0, Math.min(100, equityPercent)).toFixed(1)}%
                      </span>
                    ) : null}
                  </div>
                </div>
                {isMe &&
                iaOpponentLearnedAboutMe != null &&
                !showdownReveal ? (
                  <p className="mt-2 text-center text-[11px] leading-snug text-indigo-200/90 sm:text-left">
                    {t("hole.iaLearnedPrefix")}{" "}
                    <span className="font-semibold text-indigo-100">
                      {iaCategoryLabelKo(iaOpponentLearnedAboutMe)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] font-normal text-indigo-300/85">
                      {iaCategoryHandListText(iaOpponentLearnedAboutMe)}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : showOpponentBacks ? (
              <div className="mt-1.5 space-y-2">
                <div className="flex justify-center gap-2 sm:justify-start">
                  <CardBack size={showdownReveal ? "compact" : "board"} />
                  <CardBack size={showdownReveal ? "compact" : "board"} />
                </div>
                {p === opp && iaCategoryForOpp ? (
                  <p className="text-[11px] leading-snug text-indigo-200/90">
                    {t("hole.iaOppCategory")}{" "}
                    <span className="font-semibold text-indigo-100">
                      {iaCategoryLabelKo(iaCategoryForOpp)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-indigo-100/85">
                      {iaCategoryHandListText(iaCategoryForOpp)}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-normal text-indigo-300/70">
                      {t("hole.iaHidden")}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : showPendingOnly ? (
              <p className="mt-2 text-[11px] text-zinc-400">
                {t("hole.pendingReveal")}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">
                {t("hole.pickWait")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
