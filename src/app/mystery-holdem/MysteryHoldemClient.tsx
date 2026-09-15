"use client";

import * as React from "react";
import Link from "next/link";
import { PlayingCard } from "@/app/holdem/components/Card";
import {
  MADE_FX_CARD_GLOW,
  MADE_FX_CYCLE_AURA_CLASS,
  MADE_FX_IMPACT_CLASS,
  MADE_FX_VARIANT_CLASSES,
} from "@/app/holdem/components/HoleCards";
import { shouldPlayMadeHandBurst } from "@/app/holdem/madeHandFxPresentation";
import type { Card } from "@/holdem/cards";
import { HOLDEM_PREFS_CHANGED_EVENT, loadMadeHandFxEnabled } from "@/holdem/holdemPrefs";
import { handValueDisplayPatternKorean, madeHandFxKind, madeHandFxTier } from "@/holdem/pokerEval";
import type { MadeHandFxKind } from "@/holdem/pokerEval";
import { snapRaiseRangeToStep } from "@/mysteryHoldem/betting";
import { DEFAULT_PROTOTYPE_SEAT_COUNT, MYSTERY_HOLDEM_CONFIG } from "@/mysteryHoldem/config";
import {
  cardTargetCandidates,
  createInitialMysteryGameState,
  currentTotalPot,
  mysteryHoldemReducer,
  pickCardTargetForSeat,
} from "@/mysteryHoldem/gameReducer";
import { CARD_CATEGORY_LABEL, cardCategoryFromLegacy } from "@/mysteryHoldem/mysteryCard";
import { MysteryCardPicker, cardRewardLabel } from "./MysteryCardPicker";
import { positionLabelForSeat } from "@/mysteryHoldem/positions";
import { scoreBreakdownForAll } from "@/mysteryHoldem/scoring";
import {
  displayPotExcludingStreetBets,
  legalActionsForSeat,
  trueSightRevealedCards,
  potLimitMaxRaiseDisplay,
} from "@/mysteryHoldem/selectors";
import { computeBestHandForPlayer, showdownHoleCardsForPlayer } from "@/mysteryHoldem/showdown";
import type {
  MysteryGameAction,
  MysteryGameState,
  PlayerState,
  Seat,
} from "@/mysteryHoldem/types";
import { decideBotAction, pickHoleKeepIndexes, pickMissionId } from "@/mysteryHoldem/bot/botPolicy";

const HERO_SEAT: Seat = 0;
const BOT_DELAY_MS = 650;

function reducerWithRng(state: MysteryGameState, action: MysteryGameAction): MysteryGameState {
  return mysteryHoldemReducer(state, action, Math.random);
}

/**
 * 좌석은 테이블 중심을 기준으로 한 타원 위에 배치한다. 타원의 반지름(--seat-rx/--seat-ry)은
 * 테이블 컨테이너가 클래스로 정해주며, 세로 화면에서는 가로로 좁고 세로로 긴 값이 들어온다.
 * JS로 화면 방향을 감지하지 않고 calc()로 넘겨야 리사이즈·회전에 즉시 반응하고 하이드레이션
 * 불일치도 생기지 않는다.
 */
function seatStyle(indexFromHero: number, total: number): React.CSSProperties {
  const angle = Math.PI / 2 + (indexFromHero / total) * 2 * Math.PI;
  const cos = Math.cos(angle).toFixed(4);
  const sin = Math.sin(angle).toFixed(4);
  return {
    left: `calc(50% + (var(--seat-rx) * ${cos}) * 1%)`,
    top: `calc(50% + (var(--seat-ry) * ${sin}) * 1%)`,
  };
}

/**
 * 좌석이 테이블 아래쪽 절반에 있는지 — 베팅 칩을 프로필 박스 위에 둘지 아래에 둘지 정한다.
 * 칩은 언제나 테이블 안쪽(중앙 방향)에 붙어야 한다.
 */
function seatIsOnLowerHalf(indexFromHero: number, total: number): boolean {
  return Math.sin(Math.PI / 2 + (indexFromHero / total) * 2 * Math.PI) > 0;
}

/** 칩 수집 연출 길이 — globals.css의 .mystery-chip-collect와 맞춰야 한다 */
const CHIP_COLLECT_MS = 560;

function fmt(n: number): string {
  return Math.round(n * 10) / 10 === Math.round(n) ? String(Math.round(n)) : n.toFixed(1);
}

/**
 * 테이블 위에 놓이는 베팅 칩 한 무더기(칩 아이콘 + 금액).
 *
 * 칩 크기는 "작아서 잘 안 보인다"는 피드백으로 기존 대비 15% 키웠다
 * (아이콘 12→13.8px, 글자 10→11.5px).
 */
function BetChipStack({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <div
      className={[
        "flex w-fit items-center gap-[4.6px] rounded-full bg-black/60 px-[7px] py-[2.3px] shadow-lg ring-1 ring-black/50",
        className,
      ].join(" ")}
    >
      <span className="h-[13.8px] w-[13.8px] shrink-0 rounded-full border-2 border-dashed border-amber-100/90 bg-gradient-to-b from-amber-400 to-amber-600 shadow-inner" />
      <span className="text-[11.5px] font-bold tabular-nums leading-none text-amber-100">{fmt(amount)}</span>
    </div>
  );
}

interface ChipCollectBatch {
  id: number;
  bets: { seat: Seat; amount: number }[];
}

interface BetChipState {
  /** 지금 팟으로 날아가는 중인 칩 */
  flying: ChipCollectBatch | null;
  /** 좌석 앞에 칩을 그려도 되는지 — 핸드가 끝난 뒤에는 모두 팟으로 갔다 */
  showSeatChips: boolean;
  /** 홀카드를 공개해도 되는지 — 칩이 팟에 다 모인 뒤에만 true */
  revealCards: boolean;
}

function isRevealPhase(phase: MysteryGameState["phase"]): boolean {
  return phase === "showdown" || phase === "hand_over" || phase === "match_over";
}

/**
 * 좌석 앞 베팅 칩을 언제 팟으로 모을지 결정한다. 회수 시점은 두 가지다.
 *
 * 1. 스트리트 전환 — 엔진이 streetContribution을 0으로 만들므로, 직전 값을 스냅샷으로
 *    붙잡아 두고 연출이 끝나면 버린다.
 * 2. 핸드 종료(쇼다운·폴드 승리) — 엔진의 resetStreetContributions는 스트리트 전환에서만
 *    돌기 때문에 마지막 스트리트 베팅이 그대로 남는다. 그대로 두면 공개된 홀카드 위에
 *    칩이 겹치므로 여기서 직접 회수하고, 그동안 카드 공개를 미룬다.
 *
 * 2번은 반드시 렌더 중에 판정해야 한다. useEffect로 미루면 쇼다운 첫 프레임에 카드와 칩이
 * 함께 보였다가 사라지고 다시 나타나는 깜빡임이 생긴다. 시간이 필요한 것은 "연출이 끝났는가"
 * 하나뿐이므로 그것만 상태로 둔다.
 */
function useBetChipCollect(state: MysteryGameState): BetChipState {
  const revealing = isRevealPhase(state.phase);
  const liveBets = state.players
    .filter((p) => p.streetContribution > 1e-9)
    .map((p) => ({ seat: p.seat, amount: p.streetContribution }));

  const [collectedRound, setCollectedRound] = React.useState<number | null>(null);
  const endCollecting = revealing && liveBets.length > 0 && collectedRound !== state.round;

  React.useEffect(() => {
    if (!endCollecting) return;
    const timer = setTimeout(() => setCollectedRound(state.round), CHIP_COLLECT_MS);
    return () => clearTimeout(timer);
  }, [endCollecting, state.round]);

  const [streetFlying, setStreetFlying] = React.useState<ChipCollectBatch | null>(null);
  const prevBetsRef = React.useRef<{ seat: Seat; amount: number }[]>([]);
  const idRef = React.useRef(0);

  React.useEffect(() => {
    const prev = prevBetsRef.current;
    prevBetsRef.current = liveBets;
    if (revealing || prev.length === 0 || liveBets.length > 0) return;
    idRef.current += 1;
    setStreetFlying({ id: idRef.current, bets: prev });
    // liveBets는 매 렌더 새 배열이라 의존성에 넣을 수 없다. 상태가 바뀔 때만 판정하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  React.useEffect(() => {
    if (streetFlying == null) return;
    const timer = setTimeout(() => setStreetFlying(null), CHIP_COLLECT_MS);
    return () => clearTimeout(timer);
  }, [streetFlying]);

  return {
    // 핸드 종료 회수가 스트리트 전환 회수보다 우선한다(동시에 일어나지 않는다).
    flying: endCollecting ? { id: -state.round, bets: liveBets } : streetFlying,
    showSeatChips: !revealing,
    revealCards: revealing && !endCollecting,
  };
}

/** 기존 홀덤(§25 공용 모듈)의 메이드 연출 설정을 그대로 공유한다 */
function useMadeHandFxEnabled(): boolean {
  const [on, setOn] = React.useState(() => (typeof window !== "undefined" ? loadMadeHandFxEnabled() : true));
  React.useEffect(() => {
    setOn(loadMadeHandFxEnabled());
    const handler = () => setOn(loadMadeHandFxEnabled());
    window.addEventListener(HOLDEM_PREFS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(HOLDEM_PREFS_CHANGED_EVENT, handler);
  }, []);
  return on;
}

interface HeroMadeFx {
  tier: number;
  kind: MadeHandFxKind;
  label: string;
  cardClass: string;
  labelClass: string;
  outerFxClass: string;
  cycleAuraClass: string | undefined;
  showBurst: boolean;
  replayKey: string;
}

const NO_MADE_FX: HeroMadeFx = {
  tier: 0,
  kind: "none",
  label: "",
  cardClass: "",
  labelClass: "",
  outerFxClass: "",
  cycleAuraClass: undefined,
  showBurst: false,
  replayKey: "no-fx",
};

/**
 * 한 플레이어의 현재 족보로 메이드 연출 설정을 만든다(§25 공용 모듈 재사용).
 *
 * 히어로의 진행 중 연출과 쇼다운에서의 상대 공개 연출이 같은 계산을 쓰도록 순수 함수로
 * 분리했다. 다른 점은 "언제 부르는가"뿐이다 — 상대 것은 카드가 실제로 공개되는 순간에만
 * 계산해야 한다. 플레이 중에 상대 좌석에 연출이 뜨면 비공개여야 할 패가 새어 나간다.
 */
function buildMadeFx(
  enabled: boolean,
  player: PlayerState,
  board: Card[],
  keyPrefix: string,
): HeroMadeFx {
  if (!enabled || player.holeCards.length === 0) return NO_MADE_FX;
  const value = computeBestHandForPlayer(player, board);
  const tier = madeHandFxTier(value);
  if (tier <= 0) return NO_MADE_FX;
  const kind = madeHandFxKind(value);
  const variant = MADE_FX_VARIANT_CLASSES[kind];
  const cardClass = variant?.card ?? MADE_FX_CARD_GLOW[tier] ?? "";
  const labelClass = variant?.label ?? `holdem-made-hand-label-t${tier}`;
  const impactClass = MADE_FX_IMPACT_CLASS[kind] ?? "";
  const outerFxClass = ["holdem-made-fx", `holdem-made-fx-t${tier}`, "overflow-visible", impactClass, variant?.fx ?? ""]
    .filter(Boolean)
    .join(" ");
  const showBurst = shouldPlayMadeHandBurst({
    madeFxTier: tier,
    showdownReveal: false,
    showdownResultGlow: false,
    showdownRunoutFx: false,
  });
  return {
    tier,
    kind,
    label: handValueDisplayPatternKorean(value),
    cardClass,
    labelClass,
    outerFxClass,
    cycleAuraClass: MADE_FX_CYCLE_AURA_CLASS[kind],
    showBurst,
    // 같은 라운드에서 족보 종류가 유지되는 동안은 재마운트하지 않고, 실제로 족보가
    // 바뀔 때만(예: 트립스→풀하우스) 새 키를 받아 연출을 다시 재생한다.
    replayKey: `${keyPrefix}-${kind}`,
  };
}

/** 진행 중 "내 카드"의 메이드 연출. 상대 좌석에는 절대 쓰지 않는다. */
function useHeroMadeHandFx(state: MysteryGameState, hero: PlayerState | undefined): HeroMadeFx {
  const enabled = useMadeHandFxEnabled();
  return React.useMemo(() => {
    if (hero == null) return NO_MADE_FX;
    const board = state.board.slice(0, state.boardRevealed);
    return buildMadeFx(enabled, hero, board, `mystery-made-fx-${state.round}`);
  }, [enabled, hero, state.board, state.boardRevealed, state.round]);
}

/**
 * 쇼다운에서 공개된 **상대 좌석**의 메이드 연출.
 *
 * 카드가 실제로 열린 뒤에만 계산한다(revealCards). 폴드한 좌석은 카드를 공개하지 않으므로
 * 제외한다. 히어로는 진행 중 연출을 그대로 이어 쓰므로 여기서 다루지 않는다.
 */
function useShowdownMadeFx(state: MysteryGameState, revealCards: boolean): Map<Seat, HeroMadeFx> {
  const enabled = useMadeHandFxEnabled();
  return React.useMemo(() => {
    const map = new Map<Seat, HeroMadeFx>();
    if (!revealCards) return map;
    const board = state.board.slice(0, state.boardRevealed);
    for (const p of state.players) {
      if (p.seat === HERO_SEAT || !p.inHand || p.folded) continue;
      const fx = buildMadeFx(enabled, p, board, `mystery-showdown-fx-${state.round}-s${p.seat}`);
      if (fx.tier > 0) map.set(p.seat, fx);
    }
    return map;
  }, [enabled, revealCards, state.players, state.board, state.boardRevealed, state.round]);
}

function HeroCardsWithMadeFx({
  cards,
  size,
  fx,
}: {
  cards: Card[];
  size: "compact" | "hero";
  fx: HeroMadeFx;
}) {
  if (fx.tier <= 0) {
    return (
      <div className="flex gap-1.5">
        {cards.map((c, i) => (
          <PlayingCard key={i} card={c} size={size} />
        ))}
      </div>
    );
  }
  return (
    <div key={fx.replayKey} className={["mystery-hole-fx-bounds", fx.outerFxClass].join(" ")}>
      {fx.showBurst && fx.cycleAuraClass ? (
        <span className={`holdem-preview-cycle-aura ${fx.cycleAuraClass}`} aria-hidden />
      ) : null}
      <div className="flex gap-1.5 holdem-made-fx-stack">
        {cards.map((c, i) => (
          <div
            key={i}
            className={fx.showBurst ? "holdem-made-fx-card" : undefined}
            style={fx.showBurst ? { animationDelay: `${i * 0.08}s` } : undefined}
          >
            <PlayingCard card={c} size={size} className={fx.cardClass} />
          </div>
        ))}
      </div>
      {size === "hero" ? (
        <p className={["holdem-made-hand-copy mt-1 text-center text-xs font-extrabold tracking-tight", fx.labelClass].join(" ")}>
          {fx.label}
        </p>
      ) : null}
    </div>
  );
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
          const dealt = state.players.find((p) => p.seat === botHoleSeat)?.pendingDeal ?? [];
          dispatch({
            type: "SELECT_HOLE_CARDS",
            seat: botHoleSeat,
            keepIndexes: pickHoleKeepIndexes(dealt),
          });
          return;
        }
        const botMissionSeat = state.awaitingMissionSelection.find((s) => s !== HERO_SEAT);
        if (botMissionSeat != null) {
          const missionId = pickMissionId(state.missionOffers[botMissionSeat] ?? [], botMissionSeat, Math.random);
          if (missionId) dispatch({ type: "SELECT_MISSION", seat: botMissionSeat, missionId });
        }
        return;
      }
      // 플랍 대상 지정(§22). 지정을 마치기 전에는 그 좌석이 액션할 수 없으므로 베팅보다 먼저 처리한다.
      const botTargetSeat = state.awaitingCardTarget.find((s) => s !== HERO_SEAT);
      if (botTargetSeat != null) {
        const targetSeat = pickCardTargetForSeat(state, botTargetSeat, Math.random);
        if (targetSeat != null) dispatch({ type: "SELECT_CARD_TARGET", seat: botTargetSeat, targetSeat });
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

  // 로비 단계에도 훅 호출 순서를 동일하게 유지해야 하므로(Rules of Hooks),
  // hero가 아직 없을 수 있는 상태 그대로 무조건 호출한다.
  const hero = state.players.find((p) => p.seat === HERO_SEAT);
  const chips = useBetChipCollect(state);
  const heroFx = useHeroMadeHandFx(state, hero);
  const showdownFx = useShowdownMadeFx(state, chips.revealCards);

  if (state.phase === "lobby" || hero == null) {
    return <LobbyScreen seatCount={seatCount} onSeatCount={setSeatCount} onStart={() => dispatch({ type: "START_MATCH", seatCount })} />;
  }

  const legal = legalActionsForSeat(state, HERO_SEAT);
  const potMax = potLimitMaxRaiseDisplay(state, HERO_SEAT);
  // 좌석 앞 칩은 아직 팟이 아니므로 표시용 팟에서 뺀다. 핸드가 끝난 뒤에는 전액이 팟이며,
  // 날아가는 중인 칩은 도착(연출 종료) 시점에 팟 숫자로 더해진다.
  const flyingTotal = chips.flying?.bets.reduce((sum, b) => sum + b.amount, 0) ?? 0;
  const potBase = chips.showSeatChips ? displayPotExcludingStreetBets(state) : currentTotalPot(state);
  const pot = potBase - flyingTotal;
  const heroNeedsHoleSelection = state.awaitingHoleSelection.includes(HERO_SEAT);
  const heroNeedsMission = state.awaitingMissionSelection.includes(HERO_SEAT);
  const heroNeedsCardTarget = state.awaitingCardTarget.includes(HERO_SEAT);
  // 탈락한 뒤에도 매치는 계속된다(라운드 종료 또는 Last Player Standing까지).
  // 그동안 히어로는 관전자다 — 액션 패널 대신 관전 안내를 보여준다.
  const heroIsOut = hero.busted && !hero.inHand;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-6 sm:px-6">
        <TopBar state={state} />

        {/*
          세로 화면(모바일·태블릿 세로)에서는 16:10 가로 테이블의 높이가 너무 낮아 좌석 배지와
          커뮤니티 카드가 서로 겹친다. 세로에서는 테이블 자체를 세로로 세우고 좌석 타원도
          가로로 좁게 / 세로로 길게 바꾼다.
        */}
        <div className="relative mx-auto aspect-[16/10] w-full max-w-3xl rounded-[999px] border-4 border-emerald-900/60 bg-gradient-to-b from-emerald-800/40 to-emerald-950/60 shadow-2xl [--bet-rx:31] [--bet-ry:25] [--seat-rx:43] [--seat-ry:37] portrait:aspect-[3/4] portrait:[--bet-rx:25] portrait:[--bet-ry:31] portrait:[--seat-rx:39] portrait:[--seat-ry:41]">
          <div className="absolute inset-[10%] rounded-[999px] border border-emerald-700/40 bg-emerald-900/30" />

          {/* 커뮤니티 카드 + 팟 (진행 정보는 보드 바로 위에) */}
          <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 portrait:top-[48%]">
            <TableInfoStrip state={state} />
            {/* 세로 화면에서는 좌우 좌석 배지와 겹치지 않도록 보드 전체를 축소한다. */}
            <div className="flex gap-1 portrait:scale-[0.72] sm:gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i}>
                  {i < state.board.length ? (
                    // 좁은 화면에서 5장이 항상 한 줄에 들어가는 board 규격을 쓴다.
                    <PlayingCard card={state.board[i]!} size="board" />
                  ) : (
                    <div className="h-[3.6rem] w-[2.6rem] rounded-lg border border-dashed border-emerald-700/40 sm:h-[5.38rem] sm:w-[3.85rem]" />
                  )}
                </div>
              ))}
            </div>
            <PotBanners state={state} mainPot={pot} />
          </div>

          {/*
            탈락한 좌석은 테이블에서 치운다. 버스트 표시를 매치가 끝날 때까지 남겨 두면
            빈 의자가 계속 쌓여 실제로 겨루는 사람이 누구인지 읽기 어려워진다.

            단, 버스트가 일어난 그 핸드 동안에는 남겨 둔다(busted면서 inHand인 상태).
            쇼다운에서 진 사람의 카드가 그 자리에서 사라지면 승부가 어떻게 끝났는지
            읽을 수 없다. inHand는 다음 핸드가 시작될 때 false가 되므로 그때 사라진다.
          */}
          {state.players.filter((p) => !p.busted || p.inHand).map((p) => {
            const idx = (p.seat - HERO_SEAT + state.seatCount) % state.seatCount;
            return (
              <SeatView
                key={p.seat}
                player={p}
                state={state}
                style={seatStyle(idx, state.seatCount)}
                isHero={p.seat === HERO_SEAT}
                heroFx={p.seat === HERO_SEAT ? heroFx : (showdownFx.get(p.seat) ?? NO_MADE_FX)}
                revealCards={chips.revealCards}
                chipBelowBadge={!seatIsOnLowerHalf(idx, state.seatCount)}
                showChip={chips.showSeatChips}
              />
            );
          })}

          {/* 팟으로 빨려 들어가는 중인 칩 — 좌석 위치에서 출발해 중앙으로 모인다 */}
          {chips.flying?.bets.map((b) => (
            <div
              key={`collect-${chips.flying!.id}-${b.seat}`}
              className="mystery-chip-collect absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={seatStyle((b.seat - HERO_SEAT + state.seatCount) % state.seatCount, state.seatCount)}
            >
              <BetChipStack amount={b.amount} />
            </div>
          ))}
        </div>

        {heroNeedsCardTarget ? (
          <CardTargetPanel
            state={state}
            onPick={(targetSeat) =>
              dispatch({ type: "SELECT_CARD_TARGET", seat: HERO_SEAT, targetSeat })
            }
          />
        ) : null}

        {heroIsOut ? <SpectatorPanel state={state} /> : null}

        {!heroIsOut &&
        ["preflop", "flop", "turn", "river"].includes(state.phase) &&
        !heroNeedsHoleSelection &&
        !heroNeedsMission &&
        !heroNeedsCardTarget ? (
          <HeroPanel
            hero={hero}
            heroFx={heroFx}
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

      {heroNeedsHoleSelection ? (
        <HoleCardPicker
          hero={hero}
          keepPicks={keepPicks}
          setKeepPicks={setKeepPicks}
          onConfirm={(a, b) =>
            dispatch({ type: "SELECT_HOLE_CARDS", seat: HERO_SEAT, keepIndexes: [a, b] })
          }
        />
      ) : null}

      {heroNeedsMission && !heroNeedsHoleSelection ? (
        <MysteryCardPicker
          offers={state.missionOffers[HERO_SEAT] ?? []}
          onConfirm={(id) => dispatch({ type: "SELECT_MISSION", seat: HERO_SEAT, missionId: id })}
        />
      ) : null}
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
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-fuchsia-400">Mystery Card Poker</p>
        <h1 className="mb-2 text-2xl font-bold">MysteryHoldem</h1>
        <p className="mb-6 text-sm leading-relaxed text-zinc-400">
          3장 중 2장을 골라 시작하고, 비공개 Mystery Card로 추가 점수를 노리세요. Chip Point + Mission
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

/**
 * 최상단은 홈 버튼과 점수표만 남긴다. 라운드·블라인드·레이즈 정보는 테이블 안(보드 위)으로
 * 옮겨서 세로 공간을 아낀다 — TableInfoStrip 참고.
 */
function TopBar({ state }: { state: MysteryGameState }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold text-zinc-100 shadow transition hover:border-zinc-400 hover:bg-zinc-700"
      >
        <span aria-hidden>←</span> 홈
      </Link>
      <ScoreboardDrawer state={state} />
    </div>
  );
}

/**
 * 팟 배너. 사이드 팟이 생기면 "(Side x1)" 같은 축약 표기 대신 배너를 따로 쌓아
 * 메인 팟과 사이드 팟을 눈으로 구분할 수 있게 한다.
 *
 * 베팅이 진행 중인 동안에는 좌석 앞 칩이 아직 팟이 아니므로 사이드 팟 분할도 확정되지
 * 않는다. 그래서 정산으로 팟이 확정된 뒤(= state.pots가 채워진 뒤)에만 나눠서 보여준다.
 */
function PotBanners({ state, mainPot }: { state: MysteryGameState; mainPot: number }) {
  const settled = state.pots.length > 1 ? state.pots : null;

  if (settled == null) {
    return (
      <div
        // 팟이 바뀔 때마다 재마운트해 칩이 도착하는 타이밍에 맞춰 한 번 튕긴다.
        key={`pot-${mainPot}`}
        className="rounded-full bg-black/50 px-4 py-1 text-sm font-semibold text-amber-300 shadow"
        style={{ animation: "holdem-pot-bump 0.36s ease-out 1" }}
      >
        Pot {fmt(mainPot)}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {settled.map((p, i) => (
        <div
          key={i}
          className={
            i === 0
              ? "rounded-full bg-black/50 px-4 py-1 text-sm font-semibold text-amber-300 shadow"
              : "rounded-full bg-black/45 px-3 py-0.5 text-xs font-semibold text-sky-300 shadow"
          }
        >
          {i === 0 ? `Main Pot ${fmt(p.amount)}` : `Side Pot ${settled.length > 2 ? i : ""} ${fmt(p.amount)}`}
        </div>
      ))}
    </div>
  );
}

/** 보드 바로 위에 붙는 진행 정보 — 라운드 / 블라인드 / 레이즈 횟수 */
function TableInfoStrip({ state }: { state: MysteryGameState }) {
  return (
    // 절대배치 컬럼 안이라 가용 폭이 좁다. 줄바꿈시키면 2줄이 되어 보드를 밀어내므로
    // 보드 카드행처럼 한 줄로 두고 넘치게 둔다.
    <div className="flex w-max flex-nowrap items-center justify-center gap-x-2 whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[11px] text-zinc-300 shadow portrait:gap-x-1.5 portrait:px-2 portrait:text-[10px]">
      <span>
        Round <span className="font-bold text-zinc-50">{state.round}</span>/{state.config.totalRounds}
      </span>
      <span className="text-zinc-600" aria-hidden>·</span>
      <span className="text-zinc-400">
        {state.config.smallBlind}/{state.config.bigBlind}
        {/* 세로 화면에서는 스트립이 좌우 좌석을 침범하지 않도록 부가 정보를 접는다 */}
        <span className="text-zinc-500 portrait:hidden"> (Ante {state.config.bigBlindAnte})</span>
      </span>
      {state.betting.raiseCap > 0 ? (
        <>
          <span className="text-zinc-600" aria-hidden>·</span>
          <span className="text-zinc-400">
            Raise {state.betting.raisesUsed}/{state.betting.raiseCap}
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * 매치 중 언제든 펼쳐볼 수 있는 점수표 서랍.
 * PlayerState의 chipPoint/totalPoint는 매치 종료 시에만 채워지는 캐시라서,
 * 진행 중에는 현재 스택에서 매번 다시 계산해야 실시간 값이 나온다.
 */
function ScoreboardDrawer({ state }: { state: MysteryGameState }) {
  const rows = scoreBreakdownForAll(state.players)
    .map((score) => ({ score, player: state.players.find((p) => p.seat === score.seat)! }))
    .sort((a, b) => b.score.totalPoint - a.score.totalPoint);

  const leader = rows[0];

  return (
    // 펼쳤을 때 보드를 아래로 밀지 않도록, 패널을 absolute로 띄워 테이블 위에 겹쳐 보여준다.
    <details className="group relative">
      <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-xs shadow transition hover:border-zinc-400 hover:bg-zinc-700 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-zinc-100">점수표</span>
        {leader ? (
          <span className="whitespace-nowrap text-zinc-300">
            1위
            <span className="text-zinc-500"> · </span>
            {leader.player.name}
            {leader.player.seat === HERO_SEAT ? " (you)" : ""}
            <span className="text-zinc-500"> · </span>
            <span className="font-bold tabular-nums text-amber-300">{fmt(leader.score.totalPoint)}PT</span>
          </span>
        ) : null}
        <span className="text-zinc-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.375rem)] z-30 max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-auto rounded-xl border border-zinc-600 bg-zinc-900/95 px-3 pb-3 pt-2 shadow-2xl backdrop-blur">
        <table className="w-full text-left text-[11px]">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">Player</th>
              <th className="py-1 pr-2 text-right font-medium">스택 환산</th>
              <th className="py-1 pr-2 text-right font-medium">Mission</th>
              <th className="py-1 pr-2 text-right font-medium">Bounty</th>
              <th className="py-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ score, player }, rank) => (
              <tr
                key={score.seat}
                className={[
                  "border-t border-zinc-800/70",
                  player.busted ? "text-zinc-600 line-through" : "text-zinc-200",
                  player.seat === HERO_SEAT ? "font-semibold text-fuchsia-200" : "",
                ].join(" ")}
              >
                <td className="py-1 pr-2 text-zinc-500">{rank + 1}</td>
                <td className="py-1 pr-2">
                  {player.name}
                  {player.seat === HERO_SEAT ? " (you)" : ""}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{fmt(score.chipPoint)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{fmt(score.missionPoint)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{fmt(score.bountyPoint)}</td>
                <td className="py-1 text-right font-bold tabular-nums text-amber-300">
                  {fmt(score.totalPoint)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          스택 환산 = 보유 칩 ÷ {state.config.chipPointDivisor} · Total = 세 점수의 합
        </p>
      </div>
    </details>
  );
}

/**
 * True Sight(§17)로 드러난 상대 카드. 보유자 본인 화면에만 나타난다.
 *
 * 셀렉터가 좌석을 보고 필터링하므로, 이 컴포넌트를 어디에 두든 다른 좌석에는 빈 배열이
 * 돌아온다 — 상대 UI에는 공개 사실조차 드러나지 않는다.
 */
function TrueSightPanel({ state }: { state: MysteryGameState }) {
  const revealed = trueSightRevealedCards(state, HERO_SEAT);
  if (revealed.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-sky-700/50 bg-sky-950/20 px-3 py-2">
      <p className="text-[10px] font-bold tracking-wide text-sky-400">TRUE SIGHT · 나에게만 보입니다</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {revealed.map((r) => (
          <li key={r.seat} className="text-[11px] text-zinc-300">
            <span className="text-zinc-500">{r.name} · </span>
            <span className="text-zinc-500">[{r.category}] </span>
            <span className="font-semibold text-sky-200">{r.cardName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 지정형 카드(Mission Breaker / Parasite)의 플랍 대상 선택 패널(§22).
 *
 * 규칙상 "플랍에서 자신의 첫 액션 전"에 골라야 하므로, 고르기 전까지는 엔진이 액션을
 * 거부한다. 그래서 이 패널이 떠 있는 동안에는 베팅 UI를 아예 감춰 막다른 길을 만들지 않는다.
 * 선택 내용은 본인에게만 보이고, 핸드가 끝난 뒤 결과 로그에서 공개된다.
 */
function CardTargetPanel({
  state,
  onPick,
}: {
  state: MysteryGameState;
  onPick: (targetSeat: Seat) => void;
}) {
  const hero = state.players.find((p) => p.seat === HERO_SEAT);
  const def = hero?.mission?.def;
  const candidates = cardTargetCandidates(state, HERO_SEAT);

  return (
    <div className="rounded-2xl border border-fuchsia-700/60 bg-fuchsia-950/20 p-4">
      <p className="text-sm font-semibold text-zinc-100">
        {def?.name ?? "Mystery Card"} — 대상을 지정하세요
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        팟에 남아 있는 상대 한 명을 고릅니다. 지정은 이번 핸드 동안 고정되며 상대에게는 보이지 않습니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {candidates.map((seat) => {
          const p = state.players.find((x) => x.seat === seat)!;
          return (
            <button
              key={seat}
              type="button"
              onClick={() => onPick(seat)}
              className="rounded-xl border border-zinc-700 bg-zinc-950/50 px-4 py-2 text-left transition hover:border-fuchsia-500/70 hover:bg-fuchsia-900/30"
            >
              <span className="block text-sm font-semibold text-zinc-100">{p.name}</span>
              <span className="block text-[11px] tabular-nums text-zinc-500">{fmt(p.chips)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/**
 * 내 Mystery Card 칩. 클릭하면 고정되고 마우스를 올리면 잠깐 뜨는 설명 팝오버를 단다.
 * 상대에게는 어차피 보이지 않는 정보이므로 본인 패널에서만 쓴다.
 */
function MysteryCardChip({ mission }: { mission: NonNullable<PlayerState["mission"]> }) {
  const [pinned, setPinned] = React.useState(false);
  const def = mission.def;

  return (
    <div className="relative max-w-[55%]">
      <button
        type="button"
        onClick={() => setPinned((v) => !v)}
        aria-expanded={pinned}
        className="peer w-full rounded-lg border border-fuchsia-700/50 bg-fuchsia-950/20 px-3 py-1.5 text-right transition hover:border-fuchsia-400 hover:bg-fuchsia-900/30"
      >
        <p className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-fuchsia-400">
          My Mystery Card
          <span className="rounded-full border border-fuchsia-500/60 px-1 text-[9px] leading-none text-fuchsia-300">?</span>
        </p>
        <p className="text-xs font-semibold text-zinc-100">{def.name}</p>
      </button>

      <div
        className={[
          "absolute bottom-[calc(100%+0.375rem)] right-0 z-30 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-fuchsia-700/60 bg-zinc-900/95 p-3 text-left shadow-2xl backdrop-blur",
          // 클릭하면 고정, 아니면 호버/포커스에만 표시
          pinned ? "" : "hidden peer-hover:block peer-focus-visible:block",
        ].join(" ")}
      >
        <p className="text-[10px] font-bold tracking-wide text-fuchsia-400">
          [{CARD_CATEGORY_LABEL[cardCategoryFromLegacy(def.category)]}]
        </p>
        <p className="mt-0.5 text-sm font-bold text-zinc-50">{def.name}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{def.description}</p>
        {/* def.trigger는 기획 문서용 내부 문자열이라 노출하지 않는다 */}
        <p className="mt-2 text-[11px] font-semibold text-amber-300">{cardRewardLabel(def).text}</p>
      </div>
    </div>
  );
}

function SeatView({
  player,
  state,
  style,
  isHero,
  heroFx,
  revealCards,
  chipBelowBadge,
  showChip,
}: {
  player: PlayerState;
  state: MysteryGameState;
  style: React.CSSProperties;
  isHero: boolean;
  heroFx: HeroMadeFx;
  /** 카드를 공개할 시점인지 — 쇼다운이어도 칩 회수 연출이 끝나기 전에는 false */
  revealCards: boolean;
  /** 칩을 프로필 박스 아래에 둘지(위쪽 좌석) 위에 둘지(아래쪽 좌석) */
  chipBelowBadge: boolean;
  showChip: boolean;
}) {
  const pos = positionLabelForSeat(player.seat, state.players, state.buttonSeat, state.seatCount);
  const isActing = state.toActSeat === player.seat;
  // Four Card(홀 4장)는 정확히 2장만 쓰므로 쇼다운에서도 실제로 쓴 2장만 공개한다.
  // 4장을 다 보여주면 규칙과 달리 전부 쓴 것처럼 보이고 좌석 폭도 넘친다.
  const revealedHole = showdownHoleCardsForPlayer(player, state.board.slice(0, state.boardRevealed));
  // 칩은 좌석 컬럼 안에 넣는다. 절대좌표 타원 위에 따로 띄우면 10인처럼 좌석이 촘촘할 때
  // 이웃 좌석의 배지를 침범한다(실측 확인). 좌석에 붙여 두면 인원수와 무관하게 안전하다.
  const chipAmount =
    showChip && player.streetContribution > 1e-9 && !player.busted ? player.streetContribution : null;

  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={style}
    >
      {/*
        히어로의 홀카드는 하단 HeroPanel에 이미 표시되고, 상대 카드는 뒷면이어도 보드 카드와
        자리가 겹치므로 플레이 중에는 좌석 위에 카드를 그리지 않는다. 쇼다운/핸드 종료 시에만
        기존 좌석 위치에 실제 카드를 공개한다.
      */}
      {!chipBelowBadge && chipAmount != null ? <BetChipStack amount={chipAmount} /> : null}
      {revealCards && revealedHole.length > 0 && !player.folded ? (
        // 세로 화면에서는 공개 카드를 축소해 좁은 테이블 폭 안에 머물게 한다.
        <div className="flex origin-bottom gap-0.5 portrait:scale-[0.72]">
          {/*
            쇼다운에서는 상대 좌석도 메이드 연출을 받는다. 누가 무엇으로 이겼는지가
            카드 숫자를 읽기 전에 전달되는 것이 이 연출의 목적이다. heroFx는 히어로면
            진행 중 연출, 상대면 공개 시점에 계산된 연출이 들어온다(없으면 NO_MADE_FX).
          */}
          <HeroCardsWithMadeFx cards={revealedHole} size="compact" fx={heroFx} />
        </div>
      ) : null}
      <div
        className={[
          "flex min-w-[92px] flex-col items-center rounded-lg border px-2 py-1 text-center shadow portrait:min-w-[54px] portrait:px-1 portrait:py-0.5",
          player.busted
            ? "border-zinc-800 bg-zinc-900/70 opacity-50"
            : isActing
              ? "border-amber-400 bg-amber-950/50"
              : player.folded
                ? "border-zinc-700 bg-zinc-900/60 opacity-60"
                : "border-zinc-600 bg-zinc-900/80",
        ].join(" ")}
      >
        <span className="whitespace-nowrap text-[11px] font-semibold text-zinc-100 portrait:text-[10px]">
          {player.name} {isHero ? "(you)" : ""}
        </span>
        <span className="whitespace-nowrap text-[10px] text-zinc-400 portrait:text-[9px]">
          {pos} · {player.busted ? "Busted" : fmt(player.chips)}
        </span>
        {player.folded && !player.busted ? (
          <span className="text-[10px] text-rose-400 portrait:text-[9px]">Fold</span>
        ) : null}
        {player.allIn ? <span className="text-[10px] text-amber-400 portrait:text-[9px]">All-In</span> : null}
        {/* 베팅 금액은 프로필 박스가 아니라 테이블 위 칩(BetChipStack)으로 보여준다 */}
      </div>
      {chipBelowBadge && chipAmount != null ? <BetChipStack amount={chipAmount} /> : null}
    </div>
  );
}

/**
 * 히어로가 탈락한 뒤의 관전 안내.
 *
 * 탈락해도 매치는 끝나지 않는다(15라운드 종료 또는 Last Player Standing까지). 그동안
 * 아무 안내 없이 빈 화면을 두면 게임이 멈춘 것처럼 보이므로, 지금 무엇을 보고 있는지와
 * 최종 점수가 어떻게 남았는지를 알려준다.
 */
function SpectatorPanel({ state }: { state: MysteryGameState }) {
  const hero = state.players.find((p) => p.seat === HERO_SEAT)!;
  const alive = state.players.filter((p) => !p.busted).length;

  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/60 p-4 text-center shadow-xl">
      <p className="text-[11px] font-bold tracking-widest text-zinc-500">SPECTATING</p>
      <p className="mt-1 text-sm font-semibold text-zinc-200">탈락했습니다 — 남은 승부를 지켜보세요</p>
      <p className="mt-2 text-xs text-zinc-400">
        남은 플레이어 {alive}명 · 매치는 {state.config.totalRounds}라운드까지 이어집니다
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        내 최종 점수{" "}
        <span className="font-bold tabular-nums text-amber-300">{fmt(hero.totalPoint)}PT</span>
        <span className="text-zinc-600">
          {" "}
          (Mission {fmt(hero.missionPoint)} · Bounty {fmt(hero.bountyPoint)})
        </span>
      </p>
    </div>
  );
}

/**
 * 홀카드 선택(3장 중 2장) 모달.
 *
 * 원래는 테이블 아래에 인라인으로 붙어 있었는데, 테이블이 화면을 거의 다 채우는 탓에
 * 이 패널이 접힌 화면 밖으로 밀려나 "선택 단계가 나오지 않는" 것처럼 보였다
 * (실측: 패널 top 784px / 뷰포트 694px, 스크롤 0). 게임이 멈춘 채 아무 안내도 없는
 * 상태가 되므로, Mystery Card 선택과 똑같이 중앙 모달로 올려 반드시 눈에 들어오게 한다.
 */
function HoleCardPicker({
  hero,
  keepPicks,
  setKeepPicks,
  onConfirm,
}: {
  hero: PlayerState;
  keepPicks: number[];
  setKeepPicks: React.Dispatch<React.SetStateAction<number[]>>;
  onConfirm: (a: number, b: number) => void;
}) {
  // 함수형 업데이트를 써야 한다. 두 장을 빠르게 연속 클릭하면 두 핸들러가 같은 렌더의
  // keepPicks(빈 배열)를 읽어 뒤 클릭이 앞 클릭을 덮어쓰고, 한 장만 선택된 채로 남는다.
  const toggle = (idx: number) => {
    setKeepPicks((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : prev.length < 2 ? [...prev, idx] : prev,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="홀카드 선택"
    >
      <div className="my-auto w-full max-w-lg">
        <div className="mb-4 text-center sm:mb-5">
          <h2 className="text-lg font-black tracking-wide text-zinc-50 sm:text-2xl">홀카드 선택</h2>
          <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
            3장 중 2장을 고르세요. 고르지 않은 1장은 버려집니다.
          </p>
        </div>

        <div className="flex justify-center gap-3 sm:gap-4">
          {hero.pendingDeal.map((c, idx) => {
            const picked = keepPicks.includes(idx);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggle(idx)}
                aria-pressed={picked}
                className={[
                  "relative rounded-xl p-1.5 transition duration-200",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  picked
                    ? "-translate-y-2 bg-fuchsia-500/15 ring-2 ring-fuchsia-400"
                    : "opacity-75 hover:-translate-y-1 hover:opacity-100",
                ].join(" ")}
              >
                <PlayingCard card={c} size="hero" />
                {picked ? (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-black text-zinc-900"
                    aria-hidden
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={keepPicks.length !== 2}
            onClick={() => onConfirm(keepPicks[0]!, keepPicks[1]!)}
            className="w-full max-w-xs rounded-xl bg-fuchsia-600 px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 disabled:shadow-none"
          >
            선택 확정
          </button>
          <p className="h-4 text-[11px] text-zinc-500">
            {keepPicks.length === 2 ? "2장 선택됨" : `${2 - keepPicks.length}장 더 선택하세요`}
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroPanel({
  hero,
  heroFx,
  state,
  legal,
  potMax,
  raiseTo,
  setRaiseTo,
  dispatch,
}: {
  hero: PlayerState;
  heroFx: HeroMadeFx;
  state: MysteryGameState;
  legal: ReturnType<typeof legalActionsForSeat>;
  potMax: number;
  raiseTo: number | null;
  setRaiseTo: (n: number | null) => void;
  dispatch: (a: MysteryGameAction) => void;
}) {
  const isMyTurn = state.toActSeat === HERO_SEAT;
  const range = legal.raiseRange ? snapRaiseRangeToStep(legal.raiseRange) : null;
  const sliderValue = raiseTo ?? range?.min ?? 0;

  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <HeroCardsWithMadeFx cards={hero.holeCards} size="hero" fx={heroFx} />
        {hero.mission ? <MysteryCardChip mission={hero.mission} /> : null}
      </div>

      <TrueSightPanel state={state} />

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
                step={range.step}
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
      // "Pot #1 / #2"는 사이드 팟이 왜 생겼는지 모르는 사람에게 의미가 전달되지 않는다.
      return `${l.potIndex === 0 ? "메인 팟" : `사이드 팟 ${l.potIndex}`} ${fmt(l.potAmount)} → ${l.desc}`;
    case "mission_result":
    {
      // 지정형 카드는 핸드가 끝난 뒤에 대상을 공개한다(§22).
      const target = l.targetSeat != null ? ` (지정: Seat ${l.targetSeat})` : "";
      // 무효화된 카드는 achieved가 true인 채로 보상만 0이 된다 — "성공 +0pt"로 보이면 안 되므로
      // 지워진 점수를 먼저 확인한다.
      if (l.deniedReward > 0) return `Seat ${l.seat} Mystery Card 무효화 (-${l.deniedReward}pt)${target}`;
      if (!l.achieved) return `Seat ${l.seat} Mystery Card 실패${target}`;
      // Forced Split / Four Card처럼 점수가 없는 카드는 "+0pt"가 아니라 발동 사실만 알린다.
      const gain = l.reward > 0 ? ` +${l.reward}pt` : "";
      return `Seat ${l.seat} Mystery Card 발동${gain}${target}`;
    }
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
