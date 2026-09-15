"use client";

import * as React from "react";
import Link from "next/link";
import { PlayingCard } from "@/app/holdem/components/Card";
import { handValueSummaryKorean } from "@/holdem/pokerEval";
import { snapBetAmountToStep, snapRaiseRangeToStep } from "@/mysteryHoldem/betting";
import { DEFAULT_PROTOTYPE_SEAT_COUNT, MYSTERY_HOLDEM_CONFIG } from "@/mysteryHoldem/config";
import {
  cardTargetCandidates,
  createInitialMysteryGameState,
  currentTotalPot,
  mysteryHoldemReducer,
  pickCardTargetForSeat,
} from "@/mysteryHoldem/gameReducer";
import { CARD_CATEGORY_LABEL, cardCategoryFromLegacy } from "@/mysteryHoldem/mysteryCard";
import { findMissionDef } from "@/mysteryHoldem/mysteryMissions";
import { cardKey } from "@/holdem/showdownFocus";
import {
  BOARD_DIM_CLASS,
  BOARD_FOCUS_FILTER,
  HOLE_DIM_CLASS,
  NEUTRAL_FOCUS_GLOW,
  SEAT_DIM_CLASS,
  SHOWDOWN_BOARD_GLOW,
} from "@/app/holdem/components/showdownFocusStyles";
import {
  mainPotResultFromLogs,
  showdownFocusForMainPot,
  type MainPotShowdownFocus,
} from "@/mysteryHoldem/showdownFocus";
import { missionSuccessSeatsFromLogs } from "@/mysteryHoldem/missionFeedback";
import {
  HeroCardsWithMadeFx,
  NO_MADE_FX,
  buildMadeFx,
  useMadeHandFxEnabled,
  type HeroMadeFx,
} from "./madeFx";
import { MysteryCardFace, MysteryCardPicker, cardRewardLabel } from "./MysteryCardPicker";
import { positionLabelForSeat } from "@/mysteryHoldem/positions";
import { scoreBreakdownForAll, survivalRewardForRank } from "@/mysteryHoldem/scoring";
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

/**
 * 좌석에 공개되는 홀카드의 배율.
 *
 * 1.0이면 커뮤니티 카드와 크기·폰트가 정확히 같다(같은 board 규격을 쓴다). 좌석이 늘수록
 * 한 좌석에 주어지는 원주가 짧아져 그 크기로는 이웃 좌석을 침범하므로, 겹침이 실제로
 * 측정되는 지점부터만 배율을 내린다. 값은 전부 실측으로 정했다(1280×800 기준, 10개 좌석을
 * 전부 공개한 최악의 경우로 계산):
 *
 *   6인 이하  1.00 — 겹침 0. 커뮤니티 카드와 동일.
 *   8인       0.92 — 1.00에서는 좌우 좌석이 10px² 닿는다.
 *   10인      0.58 — 0.64면 325px², 0.68이면 647px²가 겹친다.
 *
 * 10인만 뚝 떨어지는 이유는 카드를 프로필 박스 "위"로 통일했기 때문이다. 좌우에 세로로
 * 늘어선 좌석들끼리 아래 좌석의 카드가 위 좌석의 박스를 밀고 올라온다. 10인에서 크기와
 * 겹침을 동시에 만족시킬 수는 없어 겹치지 않는 쪽을 택했다.
 */
function seatCardScale(seatCount: number): number {
  if (seatCount <= 6) return 1;
  if (seatCount <= 8) return 0.92;
  return 0.58;
}

/**
 * 세로 화면에서 보드 전체에 걸리는 축소율.
 *
 * 좌석 카드도 같은 값을 그대로 쓴다. 세로 테이블은 3/4 비율이라 좌석당 세로 여유가 가로
 * 화면보다 넉넉해서, 375px에서 2·4·6·8·10인을 전부 측정해도 축소가 필요 없었다. 곧 세로
 * 화면에서는 **인원수와 무관하게 커뮤니티 카드와 크기·폰트가 정확히 같다**.
 */
const BOARD_PORTRAIT_SCALE = 0.72;

/**
 * 좌석 배율을 실측해서 정한 **기준 테이블 크기**.
 *
 * 좌석 위치는 테이블 대비 %라 테이블이 줄면 같이 촘촘해지는데, 카드는 px 고정이라 그대로다.
 * 그래서 테이블이 기준보다 작아지면 그 비율만큼 카드도 줄여야 겹침이 생기지 않는다.
 * 가로/세로는 좌석 링 모양이 달라 기준도 따로 둔다(각각 1280×800, 375×812에서 측정한 값).
 */
const TABLE_REFERENCE = {
  landscape: { w: 768, h: 480 },
  portrait: { w: 351, h: 468 },
} as const;

/**
 * 기준 대비 지금 테이블이 얼마나 작은지(≤ 1).
 *
 * 커뮤니티 카드와 좌석 홀카드에 **똑같이** 곱한다 — 한쪽만 줄이면 둘의 크기가 어긋난다.
 * 화면 폭으로 미디어 쿼리를 걸어 봤지만, 테이블 크기가 이제 화면 **높이**에도 좌우되므로
 * 폭만으로는 맞출 수 없다. 실제 렌더된 크기를 재는 쪽이 정확하다.
 */
function useTableCardFit(): { tableRef: (el: HTMLDivElement | null) => void; cardFit: number } {
  const [cardFit, setCardFit] = React.useState(1);
  const observer = React.useRef<ResizeObserver | null>(null);

  /*
    useRef + useEffect가 아니라 **콜백 ref**여야 한다. 테이블은 로비를 지나야 렌더되는데,
    첫 마운트(로비) 시점에는 ref.current가 null이라 effect가 그냥 반환해 버리고,
    의존성이 ref 하나뿐이라 테이블이 나타난 뒤에도 다시 붙지 않는다(실측: --card-fit이 1로 고정).
  */
  const tableRef = React.useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (el == null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (width < 1 || height < 1) return;
      const r = height > width ? TABLE_REFERENCE.portrait : TABLE_REFERENCE.landscape;
      // 소수점 둘째 자리로 끊는다. 리사이즈마다 미세하게 바뀌면 렌더가 계속 돈다.
      setCardFit(Math.round(Math.min(1, width / r.w, height / r.h) * 100) / 100);
    });
    ro.observe(el);
    observer.current = ro;
  }, []);

  return { tableRef, cardFit };
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
  const { tableRef, cardFit } = useTableCardFit();

  /*
    쇼다운 포커스. 보드 5장이 다 열리고 칩 회수가 끝난 뒤에만 켠다 — 런아웃 도중에 켜면
    아직 공개되지 않은 결과를 미리 알려 주는 스포일러가 된다(§23).
    폴드 승리에는 켜지 않는다. 겨룬 카드가 없으므로 강조할 BEST 5가 없다(§24).
  */
  const showdownFocus = React.useMemo(() => {
    if (!chips.revealCards || state.boardRevealed < 5) return null;
    return showdownFocusForMainPot(
      mainPotResultFromLogs(state.logs),
      state.players,
      state.board.slice(0, 5),
    );
  }, [chips.revealCards, state.boardRevealed, state.logs, state.players, state.board]);
  // 판정은 순수 함수(missionFeedback.ts)에 있다 — 성공률이 낮아 브라우저에서 우연히
  // 뜨기를 기다릴 수 없어 테스트로 고정했다.
  const missionSuccessSeats = React.useMemo(
    () => (chips.revealCards ? missionSuccessSeatsFromLogs(state.logs) : new Set<Seat>()),
    [state.logs, chips.revealCards],
  );

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
      {/*
        --chrome = 테이블을 뺀 나머지가 세로로 쓰는 양(상단바·카드 헤드룸·패널·간격).
        테이블 높이를 이 값으로 깎아 세로 스크롤 없이 한 화면에 들어가게 한다. 실측으로 정했다.
      */}
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-3 pb-3 pt-3 [--chrome:25rem] portrait:[--chrome:21.5rem] lg:[--chrome:20rem] sm:px-6">
        <TopBar state={state} />

        {/*
          좌석은 펠트 **바깥 림**에 앉는다(가로 53/52, 세로 46/51 — 모두 반경 50 안팎).
          예전에는 펠트 안에 두었는데, 중앙의 정보 스트립·커뮤니티 카드·팟 배너가 세로로 178px를
          차지해 위아래로 각 120px밖에 남지 않았다. 10인에서는 그 안에 좌석을 넣으면 배지가
          중앙 블록을 파고들거나(실측 355~2,410px²) 서로 겹쳤다(모바일 2,464px²). 바깥으로
          빼면 원주가 길어져 자리 다툼 자체가 사라진다.

          대신 카드·족보·칩은 언제나 테이블 안쪽을 향한다(SeatView 참고). 바깥을 향하면
          위쪽 좌석의 카드가 화면 상단바를 덮는다.

          위쪽 여백(mt)은 **최상단 좌석의 홀카드가 쇼다운에서 올라갈 자리**다. 카드가 프로필
          박스 위로 통일되어 있어 이 자리가 없으면 상단바를 덮는다. 아래쪽은 히어로 카드도
          배지 위(=테이블 안쪽)로 뻗으므로 배지 높이만큼만 있으면 된다.

          단, 하한(min-h)이 있다. 프로필 박스는 px 고정이라 테이블만 계속 줄이면 배지끼리
          겹친다 — 1366×660에서 테이블이 416px까지 줄자 겹침이 1,448px²까지 올라갔다.
          하한 아래로 짧은 화면에서는 세로 스크롤을 허용한다. 읽을 수 없는 테이블보다 낫다.

          크기는 폭이 아니라 **남은 높이**로 정한다. 폭으로만 잡으면 노트북 가로 화면에서
          테이블만 480px을 먹어 아래 패널이 화면 밖으로 밀렸다(실측 세로 초과 90px~160px).
          aspect-ratio에 높이를 주고 너비를 auto로 두면 비율을 유지한 채 줄어든다.

          세로 화면(모바일·태블릿 세로)에서는 16:10 가로 테이블의 높이가 너무 낮아 좌석 배지와
          커뮤니티 카드가 서로 겹친다. 세로에서는 테이블 자체를 세로로 세우고 좌석 타원도
          가로로 좁게 / 세로로 길게 바꾼다.
        */}
        {/*
          넓은 화면에서는 테이블 오른쪽에 내 Mystery Card를 세운다. 아래로 쌓으면 그만큼
          테이블 높이를 깎아먹는데(실측 78px), 가로 화면은 좌우가 500px 넘게 비어 있었다.
          모양은 선택 화면과 **같은 카드 앞면**을 쓴다 — 고르던 것과 들고 있는 것이 다르게
          생기면 같은 카드인지 이름을 읽어 대조해야 한다.
        */}
        <div className="flex items-center justify-center gap-3">
        <div
          ref={tableRef}
          style={
            {
              "--seat-card-scale": seatCardScale(state.seatCount),
              "--seat-card-scale-portrait": BOARD_PORTRAIT_SCALE,
              "--card-fit": cardFit,
            } as React.CSSProperties
          }
          className="relative mx-auto mb-2 mt-28 aspect-[16/10] w-auto max-w-full rounded-[999px] h-[min(calc((100vw-1.5rem)*0.625),30rem,calc(100dvh-var(--chrome)))] min-h-[24rem] lg:h-[min(calc((100vw-19rem)*0.625),30rem,calc(100dvh-var(--chrome)))] portrait:mb-1 portrait:mt-16 portrait:h-[min(calc((100vw-1.5rem)*1.3333),calc(100dvh-var(--chrome)))] portrait:min-h-[25rem] border-4 border-emerald-900/60 bg-gradient-to-b from-emerald-800/40 to-emerald-950/60 shadow-2xl [--bet-rx:31] [--bet-ry:25] [--seat-rx:45] [--seat-ry:45] portrait:aspect-[3/4] portrait:[--bet-rx:25] portrait:[--bet-ry:31] portrait:[--seat-rx:45] portrait:[--seat-ry:45]">
          <div className="absolute inset-[10%] rounded-[999px] border border-emerald-700/40 bg-emerald-900/30" />

          {/*
            쇼다운 음영(기존 Select Hold'em의 결과 단계 연출과 같은 의도).

            펠트만 살짝 눌러 액션 단계와 결과 단계의 분위기를 나눈다. 좌석·공개 카드·보드는
            DOM 순서상 이 레이어보다 뒤에 오므로 그대로 밝게 남고, 시선이 공개된 정보로 모인다.
            숫자를 못 읽을 만큼 어두워지면 안 되므로 35%로 제한했다.
          */}
          <div
            aria-hidden
            className={[
              "pointer-events-none absolute inset-0 rounded-[999px] bg-zinc-950 transition-opacity duration-500",
              chips.revealCards ? "opacity-35" : "opacity-0",
            ].join(" ")}
          />

          {/* 커뮤니티 카드 + 팟 (진행 정보는 보드 바로 위에) */}
          <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 portrait:top-[48%]">
            <TableInfoStrip state={state} />
            {/*
              세로 화면에서는 좌우 좌석 배지와 겹치지 않도록 보드 전체를 축소한다.
              --card-fit은 360px 미만에서만 1보다 작아지는 공통 계수로, 커뮤니티 카드와
              좌석 홀카드가 **같이** 줄어야 둘의 크기가 어긋나지 않는다.
            */}
            <div className="flex gap-1 [zoom:var(--card-fit)] portrait:[zoom:calc(0.72*var(--card-fit))] sm:gap-1.5">
              {Array.from({ length: 5 }, (_, i) => {
                const c = state.board[i];
                /*
                  메인 팟 승자의 BEST 5에 들어간 카드만 밝히고 나머지는 누른다.
                  클래스는 기존 Select Hold'em과 같은 값을 공유한다(showdownFocusStyles).
                */
                const used = c != null && (showdownFocus?.boardUsedKeys.has(cardKey(c)) ?? false);
                const dimmed = c != null && showdownFocus != null && !used;
                return (
                <div key={i} className={used ? "z-10 scale-[1.04] transition-transform duration-300" : ""}>
                  {c != null ? (
                    // 좁은 화면에서 5장이 항상 한 줄에 들어가는 board 규격을 쓴다.
                    <PlayingCard
                      card={c}
                      size="board"
                      className={[
                        "transition-[opacity,filter] duration-300",
                        used ? `${BOARD_FOCUS_FILTER} ${SHOWDOWN_BOARD_GLOW[showdownFocus!.fxKind]}` : "",
                        dimmed ? BOARD_DIM_CLASS : "",
                      ].join(" ")}
                    />
                  ) : (
                    <div className="h-[3.6rem] w-[2.6rem] rounded-lg border border-dashed border-emerald-700/40 sm:h-[5.38rem] sm:w-[3.85rem]" />
                  )}
                </div>
                );
              })}
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
                missionSuccess={missionSuccessSeats.has(p.seat)}
                focus={showdownFocus}
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

        {/* 넓은 화면 전용 사이드 컬럼 — 좁은 화면에서는 테이블 아래 요약 상자가 대신한다 */}
        <aside className="hidden w-60 shrink-0 lg:block">
          {hero.mission ? (
            <MysteryCardFace
              def={hero.mission.def}
              className="border-2 border-fuchsia-700/50 bg-zinc-950/80"
            />
          ) : null}
          <TrueSightPanel state={state} />
        </aside>
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
          <>
            {/*
              내 Mystery Card와 액션 버튼을 한 상자에 담으면, 베팅하려고 눈을 내릴 때마다
              카드 설명이 같이 걸려 읽는 흐름이 끊긴다. 성격이 다른 정보라 상자를 나눈다.
            */}
            <MysteryCardPanel hero={hero} state={state} />
            <ActionPanel
              state={state}
              legal={legal}
              potMax={potMax}
              raiseTo={raiseTo}
              setRaiseTo={setRaiseTo}
              dispatch={dispatch}
            />
          </>
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
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold text-zinc-100 shadow transition hover:border-zinc-400 hover:bg-zinc-700"
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
      {/*
        좁은 화면에서 이 버튼이 눌리면 "점수표"가 글자 단위로 쪼개져 세로로 쌓였다.
        라벨에는 nowrap을 걸어 통째로 유지하고, 자리가 모자라면 flex-wrap으로 라벨과
        순위 줄이 각각 한 줄씩 — 두 줄까지만 쓰도록 접는다.
      */}
      <summary className="flex cursor-pointer list-none select-none flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-xs shadow transition hover:border-zinc-400 hover:bg-zinc-700 [&::-webkit-details-marker]:hidden">
        <span className="whitespace-nowrap font-semibold text-zinc-100">점수표</span>
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
              <th className="py-1 pr-2 text-right font-medium">생존</th>
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
                {/* 생존 점수는 매치가 끝나야 확정되므로 진행 중에는 계속 0으로 보인다. */}
                <td className="py-1 pr-2 text-right tabular-nums text-emerald-300">
                  {score.survivalPoint > 0 ? fmt(score.survivalPoint) : "—"}
                </td>
                <td className="py-1 text-right font-bold tabular-nums text-amber-300">
                  {fmt(score.totalPoint)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          스택 환산 = 보유 칩 ÷ {state.config.chipPointDivisor} · 생존 = 매치 종료 시 생존 상위 3인 ·
          Total = 네 점수의 합
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
    /*
      w-fit + mx-auto: 이름이 짧은 카드는 한 줄로 딱 맞게, 긴 카드는 max-w-full 안에서
      줄바꿈된다. 예전에는 max-w-[55%] 고정 폭에 우측 정렬이라 상자 왼쪽에 쏠려 보였다.
    */
    <div className="relative mx-auto w-fit max-w-full">
      <button
        type="button"
        onClick={() => setPinned((v) => !v)}
        aria-expanded={pinned}
        className="peer w-full rounded-lg border border-fuchsia-700/50 bg-fuchsia-950/20 px-3 py-1.5 text-center transition hover:border-fuchsia-400 hover:bg-fuchsia-900/30"
      >
        <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-fuchsia-400">
          My Mystery Card
          <span className="rounded-full border border-fuchsia-500/60 px-1 text-[9px] leading-none text-fuchsia-300">?</span>
        </p>
        <p className="text-xs font-semibold text-zinc-100">{def.name}</p>
      </button>

      <div
        className={[
          "absolute bottom-[calc(100%+0.375rem)] left-1/2 z-30 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-fuchsia-700/60 bg-zinc-900/95 p-3 text-left shadow-2xl backdrop-blur",
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
  missionSuccess,
  focus,
  heroFx,
  revealCards,
  chipBelowBadge,
  showChip,
}: {
  player: PlayerState;
  state: MysteryGameState;
  style: React.CSSProperties;
  isHero: boolean;
  missionSuccess: boolean;
  /** 메인 팟 쇼다운 포커스 — 없으면(진행 중·폴드 승리) 아무것도 누르지 않는다 */
  focus: MainPotShowdownFocus | null;
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

  /*
    히어로의 홀카드는 **자기 프로필 박스 위에 상시 고정**한다. 예전에는 화면 하단 패널에만
    있어서, 내 카드를 확인하려면 테이블에서 눈을 떼고 아래로 내려가야 했다. 다른 좌석은
    예전처럼 쇼다운에서만 열린다.

    히어로는 showdownHoleCardsForPlayer가 아니라 실제 손패 전체를 본다 — Four Card로 4장을
    들고 있으면 4장 다 보여야 어느 2장이 쓰일지 판단할 수 있다.
  */
  const ownCards = isHero && !player.folded ? player.holeCards : [];
  const shownCards = revealCards && !player.folded ? revealedHole : ownCards;
  const showCards = shownCards.length > 0;
  // 보드가 깔리기 전(프리플랍)에는 족보가 의미 없다. 쇼다운이거나 플랍 이후에만 적는다.
  const showHandLabel = showCards && state.boardRevealed >= 3;

  /*
    쇼다운 포커스에서 이 좌석의 위치.

    메인 팟 승자가 아닌 좌석은 약하게만 누른다 — 완전히 지우면 사이드 팟 결과를 확인할 수
    없다(§22). 승자는 자기 BEST 5에 쓰인 홀카드만 밝히고 나머지는 누른다.
  */
  const isMainWinner = focus?.winnerSeats.includes(player.seat) ?? false;
  const winnerHoleKeys = focus?.holeUsedBySeat.get(player.seat);
  const seatDimmed = focus != null && !isMainWinner;

  return (
    /*
      좌석의 기준점은 **프로필 박스**다. 예전에는 컬럼 전체를 타원 위에 중앙 정렬했는데,
      그러면 카드가 열릴 때 컬럼이 길어지면서 배지가 아래로 밀려났다. 아래쪽 좌석은 그
      밀림 때문에 안쪽 경계선 밖으로 나가고, 쇼다운마다 배지가 움직여 눈이 따라가기 어려웠다.

      배지를 앵커로 삼고 카드·족보·칩은 absolute로 띄운다. 그러면 배지 위치가 카드 공개 여부와
      무관하게 고정되고, 반경만으로 "박스를 경계선 안에 넣는" 배치를 정확히 맞출 수 있다.
    */
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
      <div
        className={[
          "relative flex flex-col items-center transition-[opacity,filter] duration-300",
          seatDimmed ? SEAT_DIM_CLASS : "",
        ].join(" ")}
      >
        {/*
          히어로의 홀카드는 하단 HeroPanel에 이미 표시되고, 상대 카드는 뒷면이어도 보드 카드와
          자리가 겹치므로 플레이 중에는 좌석 위에 카드를 그리지 않는다. 쇼다운/핸드 종료 시에만
          기존 좌석 위치에 실제 카드를 공개한다.

          배지 위로 떠 있는 영역: (칩) · 카드 · 족보. 레이아웃에 영향을 주지 않으므로
          배지는 제자리를 지킨다.
        */}
        {/*
          카드·족보는 좌석이 어디에 있든 **프로필 박스 위**에 고정한다.

          한때는 테이블 안쪽을 향하게 뒀는데(위쪽 좌석은 아래로), 그러면 같은 정보가 좌석마다
          다른 쪽에 나타나 쇼다운에서 눈이 매번 위아래를 더듬어야 했다. 좌석이 두 테두리 사이로
          들어오면서 위쪽 좌석의 카드도 화면 상단바를 침범하지 않게 되어, 방향을 통일할 수 있다.

          칩만 예전대로 안쪽을 향한다 — 팟으로 빨려 들어가는 연출의 출발점이라 방향에 의미가 있다.
        */}
        <div className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 flex-col items-center gap-1">
          {/* 아래쪽 좌석은 안쪽이 위이므로, 칩이 카드보다 더 안쪽(위)에 온다 */}
          {!chipBelowBadge && chipAmount != null ? <BetChipStack amount={chipAmount} /> : null}
          {showCards ? (
            /*
              배율은 테이블이 내려주는 값을 따른다(가로/세로 각각 별도 사다리, 좌석 수 기준).

              transform: scale이 아니라 zoom을 쓴다. scale은 그려지는 크기만 줄이고 레이아웃
              상자는 원래 크기 그대로 남겨서, 좌우 끝 좌석에서 보이지도 않는 빈 상자가 화면
              밖으로 8px씩 삐져나갔다(실측). zoom은 레이아웃 상자까지 같이 줄인다.
            */
            <div className="flex gap-0.5 [zoom:calc(var(--seat-card-scale)*var(--card-fit))] portrait:[zoom:calc(var(--seat-card-scale-portrait)*var(--card-fit))]">
              {/*
                쇼다운에서는 상대 좌석도 메이드 연출을 받는다. 누가 무엇으로 이겼는지가
                카드 숫자를 읽기 전에 전달되는 것이 이 연출의 목적이다. heroFx는 히어로면
                진행 중 연출, 상대면 공개 시점에 계산된 연출이 들어온다(없으면 NO_MADE_FX).
              */}
              {/*
                포커스가 켜진 동안에는 메이드 연출(heroFx)을 끈다. 승자 BEST 5 강조와
                메이드 글로우가 같은 카드에 겹치면 어느 쪽 신호인지 구분되지 않는다.
              */}
              {focus != null ? (
                <div className="flex gap-1.5">
                  {shownCards.map((c, i) => {
                    const used = winnerHoleKeys?.has(cardKey(c)) ?? false;
                    return (
                      <PlayingCard
                        key={i}
                        card={c}
                        size="board"
                        className={[
                          "transition-[opacity,filter] duration-300",
                          used
                            ? focus.forcedSplit
                              ? NEUTRAL_FOCUS_GLOW
                              : SHOWDOWN_BOARD_GLOW[focus.fxKind]
                            : "",
                          // 승자의 미사용 홀카드만 누른다. 패자는 좌석 전체가 이미 눌려 있다.
                          isMainWinner && !used ? HOLE_DIM_CLASS : "",
                        ].join(" ")}
                      />
                    );
                  })}
                </div>
              ) : (
                <HeroCardsWithMadeFx cards={shownCards} size="board" fx={heroFx} />
              )}
            </div>
          ) : null}
          {/*
            공개된 카드 아래에 족보를 적는다. 카드만 열리면 누가 무엇으로 이겼는지 읽으려고
            숫자와 무늬를 직접 대조해야 하는데, 여러 좌석이 동시에 열리는 쇼다운에서는 그게
            사실상 불가능하다. 좌석 폭을 넘기지 않도록 nowrap으로 두고 세로 화면에서는 줄인다.
          */}
          {showHandLabel ? (
            <span className="whitespace-nowrap rounded bg-black/70 px-1.5 py-px text-[10px] font-bold leading-tight text-amber-200 shadow portrait:text-[8px]">
              {handValueSummaryKorean(
                computeBestHandForPlayer(player, state.board.slice(0, state.boardRevealed)),
              )}
            </span>
          ) : null}
        </div>

        <div
          className={[
          "relative flex min-w-[92px] flex-col items-center rounded-lg border px-2 py-1 text-center shadow portrait:min-w-[54px] portrait:px-1 portrait:py-0.5",
          // 미션 성공은 프로필 박스 테두리만 짧게 달군다. 좌석마다 독립적으로 재생되므로
          // 여러 명이 동시에 성공해도 각자 자기 박스 안에서만 움직인다.
          missionSuccess ? "mystery-mission-success" : "",
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
          {player.allIn ? (
            <span className="text-[10px] text-amber-400 portrait:text-[9px]">All-In</span>
          ) : null}
          {/* 베팅 금액은 프로필 박스가 아니라 테이블 위 칩(BetChipStack)으로 보여준다 */}

          {/*
            "미션 성공" 라벨. absolute라 박스 높이를 밀지 않으므로 레이아웃이 흔들리지 않는다.
            세로 화면에서는 더 작게 — 모바일에서 이 라벨이 이웃 좌석까지 넘어가면 안 된다.
          */}
          {/* 이 핸드의 주인공. 사이드 팟 승자와 헷갈리지 않도록 메인 팟임을 밝힌다 */}
          {isMainWinner ? (
            <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-400 px-1.5 py-px text-[9px] font-black leading-tight text-zinc-950 shadow-lg portrait:text-[8px]">
              {focus!.forcedSplit ? "MAIN SPLIT" : "MAIN POT"}
            </span>
          ) : null}

          {missionSuccess ? (
            <span
              className="mystery-mission-success-label pointer-events-none absolute -top-2 left-1/2 whitespace-nowrap rounded-full bg-amber-400 px-1.5 py-px text-[9px] font-black leading-tight text-zinc-950 shadow-lg portrait:text-[8px]"
              aria-live="polite"
            >
              미션 성공
            </span>
          ) : null}
        </div>

        {/* 위쪽 좌석은 안쪽이 아래이므로 칩을 배지 아래에 단다 */}
        {chipBelowBadge && chipAmount != null ? (
          <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2">
            <BetChipStack amount={chipAmount} />
          </div>
        ) : null}
      </div>
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

/**
 * 내가 들고 있는 Mystery Card와 True Sight 정보.
 *
 * 액션 패널과 상자를 나눈다 — 이쪽은 핸드 내내 거의 바뀌지 않는 "참고 정보"이고,
 * 액션 패널은 내 차례마다 바뀌는 "조작부"라 성격이 다르다. 히어로의 홀카드는 여기 없다.
 * 테이블 위 내 프로필 박스에 상시 고정되어 있다(SeatView 참고).
 */
function MysteryCardPanel({ hero, state }: { hero: PlayerState; state: MysteryGameState }) {
  const trueSight = trueSightRevealedCards(state, HERO_SEAT);
  if (hero.mission == null && trueSight.length === 0) return null;

  // 넓은 화면에서는 테이블 옆 사이드 컬럼이 같은 내용을 카드 앞면 그대로 보여준다.
  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-3 shadow-xl lg:hidden">
      {hero.mission ? <MysteryCardChip mission={hero.mission} /> : null}
      <TrueSightPanel state={state} />
    </div>
  );
}

/** 팟 대비 베팅 크기 프리셋 — 실제 금액은 합법 레인지 안으로 스냅된다 */
const POT_FRACTION_PRESETS = [0.3, 0.5, 1] as const;

/**
 * 베팅 조작부.
 *
 * 테이블이 화면 높이를 거의 다 쓰기 때문에 흐름에 그냥 두면 내 차례마다 스크롤해서 버튼을
 * 찾아야 한다. sticky로 화면 아래에 붙여 언제나 손이 닿는 곳에 둔다.
 *
 * 기본 상태는 폴드 / 체크·콜 / 벳·레이즈 세 칸이다. 슬라이더를 처음부터 펼쳐 두면 체크만
 * 하려는 대부분의 턴에서도 화면 아래쪽이 조작부로 가득 차, 정작 눌러야 할 버튼이 작아진다.
 * 벳·레이즈를 누른 뒤에만 금액 조절 화면으로 바뀐다.
 */
function ActionPanel({
  state,
  legal,
  potMax,
  raiseTo,
  setRaiseTo,
  dispatch,
}: {
  state: MysteryGameState;
  legal: ReturnType<typeof legalActionsForSeat>;
  potMax: number;
  raiseTo: number | null;
  setRaiseTo: (n: number | null) => void;
  dispatch: (a: MysteryGameAction) => void;
}) {
  const isMyTurn = state.toActSeat === HERO_SEAT;
  const range = legal.raiseRange ? snapRaiseRangeToStep(legal.raiseRange) : null;
  const canSize = (legal.canBet || legal.canRaise) && range != null;
  const [sizing, setSizing] = React.useState(false);

  // 내 차례가 아니게 되면 금액 조절 화면을 접는다. 그대로 두면 다음 턴이 시작될 때
  // 지난 턴의 금액이 남은 채로 조작부가 열려 있어 잘못 누르기 쉽다.
  React.useEffect(() => {
    if (!isMyTurn || !canSize) setSizing(false);
  }, [isMyTurn, canSize]);

  if (!isMyTurn) {
    return (
      <div className="sticky bottom-0 z-20 rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-center text-xs text-zinc-500 backdrop-blur">
        {state.toActSeat == null ? "정산 중..." : `Seat ${state.toActSeat} 차례를 기다리는 중...`}
      </div>
    );
  }

  const clamp = (n: number) => (range == null ? n : Math.min(Math.max(n, range.min), range.max));
  const amount = clamp(raiseTo ?? range?.min ?? 0);

  /*
    "팟의 f배"를 레이즈 총액으로 옮긴다. Pot-Limit 최대 레이즈가 곧
    currentLevel + (팟 + 콜 금액)이므로, f=1이 정확히 팟 리밋 상한과 같아진다.
  */
  const potAfterCall = currentTotalPot(state) + legal.callAmount;
  const amountForFraction = (f: number) =>
    range == null ? 0 : snapBetAmountToStep(state.betting.currentLevel + f * potAfterCall, range);

  const commit = () => {
    dispatch(
      legal.canBet
        ? { type: "BET", seat: HERO_SEAT, amount }
        : { type: "RAISE", seat: HERO_SEAT, toAmount: amount },
    );
    setSizing(false);
    setRaiseTo(null);
  };

  if (sizing && range != null) {
    return (
      <div className="sticky bottom-0 z-20 rounded-2xl border border-fuchsia-800/50 bg-zinc-950/90 p-3 shadow-xl backdrop-blur">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            {legal.canBet ? "Bet" : "Raise"} · Pot Limit Max {fmt(potMax)}
          </span>
          <span className="text-lg font-black tabular-nums text-fuchsia-200">{fmt(amount)}</span>
        </div>

        <input
          type="range"
          aria-label={legal.canBet ? "베팅 금액" : "레이즈 금액"}
          min={range.min}
          max={range.max}
          step={range.step}
          value={amount}
          onChange={(e) => setRaiseTo(Number(e.target.value))}
          className="w-full accent-fuchsia-500"
        />

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {POT_FRACTION_PRESETS.map((f) => {
            const preset = amountForFraction(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => setRaiseTo(preset)}
                className="rounded-lg border border-zinc-600 bg-zinc-800 py-2 text-xs font-bold text-zinc-100 tabular-nums hover:bg-zinc-700"
              >
                {Math.round(f * 100)}%
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setRaiseTo(range.max)}
            className="rounded-lg border border-amber-600/60 bg-amber-950/40 py-2 text-xs font-bold text-amber-200 hover:bg-amber-900/40"
          >
            MAX
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSizing(false);
              setRaiseTo(null);
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-800/60 py-2.5 text-sm font-bold text-zinc-300 hover:bg-zinc-700/60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={commit}
            className="rounded-lg border border-fuchsia-500/60 bg-fuchsia-700/40 py-2.5 text-sm font-black text-fuchsia-100 hover:bg-fuchsia-600/40"
          >
            {legal.canBet ? "벳" : "레이즈"} {fmt(amount)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-20 grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-700/70 bg-zinc-950/85 p-1.5 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={() => dispatch({ type: "FOLD", seat: HERO_SEAT })}
        className="rounded-xl border border-zinc-700 bg-zinc-800/70 py-3 text-sm font-black text-zinc-200 hover:bg-zinc-700/70"
      >
        폴드
      </button>

      {legal.canCheck ? (
        <button
          type="button"
          onClick={() => dispatch({ type: "CHECK", seat: HERO_SEAT })}
          className="rounded-xl border border-sky-700/60 bg-sky-950/40 py-3 text-sm font-black text-sky-200 hover:bg-sky-900/40"
        >
          체크
        </button>
      ) : legal.canCall ? (
        <button
          type="button"
          onClick={() => dispatch({ type: "CALL", seat: HERO_SEAT })}
          className="rounded-xl border border-emerald-700/60 bg-emerald-950/40 py-3 text-sm font-black text-emerald-200 hover:bg-emerald-900/40"
        >
          <span className="block leading-tight">콜</span>
          <span className="block text-[11px] font-bold tabular-nums opacity-80">{fmt(legal.callAmount)}</span>
        </button>
      ) : (
        <button type="button" disabled className="rounded-xl border border-zinc-800 py-3 text-sm font-black text-zinc-700">
          체크
        </button>
      )}

      {/*
        벳·레이즈가 불가능한 턴(레이즈 캡 도달, 콜조차 못 채우는 숏스택)에는 올인만 남는다.
        그 자리를 비워 두면 3칸 배치가 무너지므로 같은 칸을 올인이 이어받는다.
      */}
      {canSize ? (
        <button
          type="button"
          onClick={() => {
            setRaiseTo(range!.min);
            setSizing(true);
          }}
          className="rounded-xl border border-fuchsia-600/60 bg-fuchsia-950/40 py-3 text-sm font-black text-fuchsia-200 hover:bg-fuchsia-900/40"
        >
          {legal.canBet ? "벳" : "레이즈"}
        </button>
      ) : legal.canAllIn ? (
        <button
          type="button"
          onClick={() => dispatch({ type: "ALL_IN", seat: HERO_SEAT })}
          className="rounded-xl border border-amber-600/60 bg-amber-950/40 py-3 text-sm font-black text-amber-200 hover:bg-amber-900/40"
        >
          올인
        </button>
      ) : (
        <button type="button" disabled className="rounded-xl border border-zinc-800 py-3 text-sm font-black text-zinc-700">
          벳
        </button>
      )}
    </div>
  );
}

function HandOverPanel({ state, onContinue }: { state: MysteryGameState; onContinue: () => void }) {
  const lastRoundStartIdx = [...state.logs].reverse().findIndex((l) => l.t === "round_start");
  const sliceFrom = lastRoundStartIdx >= 0 ? state.logs.length - 1 - lastRoundStartIdx : 0;
  const thisHandLogs = state.logs.filter((l, i) => i >= sliceFrom);

  const potLogs = thisHandLogs.filter(
    (l) => l.t === "showdown" || l.t === "fold_win" || l.t === "bounty_awarded" || l.t === "player_busted",
  );

  /*
    카드 결과는 **무언가 일어난 좌석만** 싣는다. 예전에는 참가자 전원의 실패까지 한 줄씩
    나열해서, 10인 테이블이면 아무 일도 없는 줄이 아홉 개씩 쌓였다.

    점수가 0인 발동형·강화형(Forced Split, Four Card)도 남긴다 — 그 카드의 보상은 점수가
    아니라 규칙 변경이라, 점수로 거르면 정작 판을 바꾼 카드가 사라진다.
    무효화된 줄도 남긴다. 그게 없으면 Mission Breaker가 왜 점수를 받았는지 읽히지 않는다.
  */
  const cardLogs = thisHandLogs.filter(
    (l) => l.t === "mission_result" && (l.achieved || l.deniedReward > 0),
  );

  const nameOf = (seat: Seat) => state.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;

  return (
    <div className="rounded-2xl border border-amber-700/50 bg-zinc-900/70 p-4 shadow-xl">
      <p className="mb-2 text-sm font-bold text-amber-300">Round {state.round} 결과</p>
      <ul className="mb-3 flex flex-col gap-1 text-xs text-zinc-300">
        {potLogs.map((l, i) => (
          <li key={i}>{describeLog(l)}</li>
        ))}
      </ul>

      {cardLogs.length > 0 ? (
        <div className="mb-3 rounded-xl border border-fuchsia-800/40 bg-fuchsia-950/10 p-2.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-400">
            Mystery Card
          </p>
          <ul className="flex flex-col gap-1">
            {cardLogs.map((l, i) => {
              if (l.t !== "mission_result") return null;
              const def = findMissionDef(l.missionId);
              const nullified = l.deniedReward > 0;
              return (
                <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                  <span className="font-semibold text-zinc-100">{nameOf(l.seat)}</span>
                  {def != null ? (
                    <>
                      <span className="text-[10px] text-zinc-500">
                        [{CARD_CATEGORY_LABEL[cardCategoryFromLegacy(def.category)]}]
                      </span>
                      <span className="font-bold text-fuchsia-200">{def.name}</span>
                    </>
                  ) : null}
                  {/* 지정형(Mission Breaker / Parasite)은 누구를 물었는지가 결과의 절반이다 */}
                  {l.targetSeat != null ? (
                    <span className="text-[11px] text-sky-300">→ {nameOf(l.targetSeat)}</span>
                  ) : null}
                  {nullified ? (
                    <span className="font-bold text-rose-300">무효화 −{fmt(l.deniedReward)}pt</span>
                  ) : l.reward > 0 ? (
                    <span className="font-bold text-amber-300">+{fmt(l.reward)}pt</span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">발동</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
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
        {state.matchEndReason === "last_player_standing" ? "최후의 1인 — 매치 종료" : "게임 종료"}
      </p>
      <p className="mb-4 text-xs text-zinc-400">
        {state.matchEndReason === "last_player_standing"
          ? "한 명을 제외한 전원이 버스트되었습니다. 승자는 Total Point로 가립니다."
          : `${state.config.totalRounds}라운드가 종료되었습니다. 승자는 Total Point로 가립니다.`}
        {state.matchWinners && state.matchWinners.length > 1 ? " (동점 — 무승부)" : ""}
      </p>
      <p className="mb-4 text-[11px] text-zinc-500">
        생존 점수: 끝까지 남은 상위 3명에게 {survivalRewardForRank(1, state.seatCount)} /{" "}
        {survivalRewardForRank(2, state.seatCount)} / {survivalRewardForRank(3, state.seatCount)}점
        (시작 {state.seatCount}인 기준). 버스트한 좌석은 받지 못합니다.
      </p>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 pr-2">Seat</th>
              <th className="py-1 pr-2">Chip Point</th>
              <th className="py-1 pr-2">Mission Point</th>
              <th className="py-1 pr-2">Bounty Point</th>
              <th className="py-1 pr-2">생존</th>
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
                  <td className={`py-1 pr-2 ${isWinner ? "" : "text-emerald-300"}`}>
                    {p.survivalPoint > 0 ? fmt(p.survivalPoint) : "—"}
                  </td>
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
    case "showdown": {
      /*
        팟이 하나뿐인 핸드에서 "메인 팟"이라고 부르면, 있지도 않은 사이드 팟이 어딘가
        있는 것처럼 읽힌다. 실제로 나뉜 핸드에서만 메인/사이드를 구분해 부른다.
        사이드 팟은 "왜 따로 생겼는가"가 핵심이라 자격자 수를 함께 적는다.
      */
      if (l.potCount <= 1) return `팟 ${fmt(l.potAmount)} → ${l.desc}`;
      const label =
        l.potIndex === 0
          ? `메인 팟 ${fmt(l.potAmount)}`
          : `사이드 팟 ${l.potIndex} ${fmt(l.potAmount)} (자격 ${l.eligibleSeats.length}명)`;
      return `${label} → ${l.desc}`;
    }
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
    case "survival_awarded":
      return `Seat ${l.seat} 생존 점수 +${fmt(l.reward)}pt`;
    case "match_over":
      return `매치 종료 (${l.reason}) — 승자: ${l.winners.join(", ")}`;
    default:
      return "";
  }
}
