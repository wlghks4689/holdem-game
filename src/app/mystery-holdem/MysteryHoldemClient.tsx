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
import { createInitialMysteryGameState, currentTotalPot, mysteryHoldemReducer } from "@/mysteryHoldem/gameReducer";
import { positionLabelForSeat } from "@/mysteryHoldem/positions";
import { scoreBreakdownForAll } from "@/mysteryHoldem/scoring";
import {
  displayPotExcludingStreetBets,
  legalActionsForSeat,
  potLimitMaxRaiseDisplay,
} from "@/mysteryHoldem/selectors";
import { computeBestHandForPlayer, showdownHoleCardsForPlayer } from "@/mysteryHoldem/showdown";
import type { MysteryGameAction, MysteryGameState, PlayerState, Seat } from "@/mysteryHoldem/types";
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
 * 상대 카드가 보이지 않아도 "내 카드"가 메이드되면 기존 홀덤과 동일한 연출을 재생한다(§25 재사용).
 * 상대(봇) 좌석에는 절대 적용하지 않는다 — 이 연출은 본인 시야 전용이다.
 */
function useHeroMadeHandFx(state: MysteryGameState, hero: PlayerState | undefined): HeroMadeFx {
  const enabled = useMadeHandFxEnabled();
  return React.useMemo(() => {
    if (!enabled || hero == null || hero.holeCards.length === 0) return NO_MADE_FX;
    const board = state.board.slice(0, state.boardRevealed);
    const value = computeBestHandForPlayer(hero, board);
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
      replayKey: `mystery-made-fx-${state.round}-${kind}`,
    };
  }, [enabled, hero, state.board, state.boardRevealed, state.round]);
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
  const heroFx = useHeroMadeHandFx(state, hero);
  const chips = useBetChipCollect(state);

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

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-6 sm:px-6">
        <TopBar state={state} />
        <ScoreboardDrawer state={state} />

        {/*
          세로 화면(모바일·태블릿 세로)에서는 16:10 가로 테이블의 높이가 너무 낮아 좌석 배지와
          커뮤니티 카드가 서로 겹친다. 세로에서는 테이블 자체를 세로로 세우고 좌석 타원도
          가로로 좁게 / 세로로 길게 바꾼다.
        */}
        <div className="relative mx-auto aspect-[16/10] w-full max-w-3xl rounded-[999px] border-4 border-emerald-900/60 bg-gradient-to-b from-emerald-800/40 to-emerald-950/60 shadow-2xl [--bet-rx:31] [--bet-ry:25] [--seat-rx:43] [--seat-ry:37] portrait:aspect-[3/4] portrait:[--bet-rx:25] portrait:[--bet-ry:31] portrait:[--seat-rx:39] portrait:[--seat-ry:41]">
          <div className="absolute inset-[10%] rounded-[999px] border border-emerald-700/40 bg-emerald-900/30" />

          {/* 커뮤니티 카드 + 팟 */}
          <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 portrait:top-[48%]">
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
            <div
              // 팟이 바뀔 때마다 재마운트해 칩이 도착하는 타이밍에 맞춰 한 번 튕긴다.
              key={`pot-${pot}`}
              className="rounded-full bg-black/50 px-4 py-1 text-sm font-semibold text-amber-300 shadow"
              style={{ animation: "holdem-pot-bump 0.36s ease-out 1" }}
            >
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
                heroFx={p.seat === HERO_SEAT ? heroFx : NO_MADE_FX}
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
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-zinc-700/70 bg-zinc-900/60 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">MysteryHoldem</span>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          홈
        </Link>
      </div>
      <div className="flex items-center gap-3 whitespace-nowrap text-xs text-zinc-300">
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

/**
 * 매치 중 언제든 펼쳐볼 수 있는 점수표 서랍.
 * PlayerState의 chipPoint/totalPoint는 매치 종료 시에만 채워지는 캐시라서,
 * 진행 중에는 현재 스택에서 매번 다시 계산해야 실시간 값이 나온다.
 */
function ScoreboardDrawer({ state }: { state: MysteryGameState }) {
  const rows = scoreBreakdownForAll(state.players)
    .map((score) => ({ score, player: state.players.find((p) => p.seat === score.seat)! }))
    .sort((a, b) => b.score.totalPoint - a.score.totalPoint);

  return (
    <details className="group rounded-xl border border-zinc-700/70 bg-zinc-900/60">
      <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <span className="text-zinc-500 transition-transform group-open:rotate-180">▾</span>
          점수표
          <span className="font-normal text-zinc-500">스택 환산 · Mission · Bounty</span>
        </span>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          1위 {fmt(rows[0]?.score.totalPoint ?? 0)}pt
        </span>
      </summary>
      <div className="overflow-x-auto border-t border-zinc-800 px-3 pb-3 pt-2">
        <table className="w-full min-w-[330px] text-left text-[11px]">
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
          {isHero ? (
            <HeroCardsWithMadeFx cards={revealedHole} size="compact" fx={heroFx} />
          ) : (
            revealedHole.map((c, i) => <PlayingCard key={i} card={c} size="compact" />)
          )}
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
  setKeepPicks: React.Dispatch<React.SetStateAction<number[]>>;
  onConfirmHole: (a: number, b: number) => void;
  onConfirmMission: (missionId: string) => void;
}) {
  // 함수형 업데이트를 써야 한다. 두 장을 빠르게 연속 클릭하면 두 핸들러가 같은 렌더의
  // keepPicks(빈 배열)를 읽어 뒤 클릭이 앞 클릭을 덮어쓰고, 한 장만 선택된 채로 남는다.
  const toggle = (idx: number) => {
    setKeepPicks((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : prev.length < 2 ? [...prev, idx] : prev,
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
