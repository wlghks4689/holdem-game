import type { Card } from "@/holdem/cards";
import { handValueSummaryKorean } from "@/holdem/pokerEval";
import {
  applyAggressiveAction,
  canCall,
  canCheck,
  canOpenBet,
  canRaise,
  facingForSeat,
  initStreetBetting,
  isStreetBettingComplete,
  legalRaiseRange,
  removeFromPending,
} from "./betting";
import { defaultBountyAttributionRule, splitBountyReward } from "./bounty";
import { MYSTERY_HOLDEM_CONFIG, bountyRewardForSeatCount } from "./config";
import { drawCards } from "./deck";
import { createInitialPlayers, isRegularMissionChangeRound, nextButtonSeat, seatsEligibleForNextHand, survivorSeatIfLastStanding } from "./gameRules";
import { drawMissionCandidates } from "./mysteryMissions";
import { preflopScoreForHoleCards } from "./mysteryHandRanking";
import { resolveMissionsForHand, type MissionResolutionInput } from "./missionResolver";
import { shouldReplaceCard } from "./mysteryCard";
import { bbSeatFor, isActionable, isAllInRunoutSituation, isHandDecidedByFold, isInHandContesting, positionLabelForSeat, sbSeatFor } from "./positions";
import { isLegalRaiseTarget } from "./potLimit";
import { buildPots, totalPotAmount, type PotContributor } from "./pots";
import { chipPointFromChips, resolveLastPlayerStandingResult, resolveRoundLimitResult } from "./scoring";
import { awardAllPotsToSingleWinner, awardPots, computeBestHandForPlayer, mergeAwardAmounts, type PotAward } from "./showdown";
import { specialRuleFor } from "./specialRules";
import type {
  BettingState,
  MissionEvalContext,
  MysteryGameAction,
  MysteryGameMessage,
  MysteryGameState,
  MysteryStreet,
  PlayerState,
  Pot,
  Seat,
} from "./types";

export function createInitialMysteryGameState(): MysteryGameState {
  return {
    config: MYSTERY_HOLDEM_CONFIG,
    phase: "lobby",
    round: 0,
    seatCount: 0,
    buttonSeat: 0,
    players: [],
    board: [],
    boardRevealed: 0,
    usedCards: [],
    pots: [],
    betting: emptyBetting(),
    toActSeat: null,
    awaitingHoleSelection: [],
    awaitingMissionSelection: [],
    missionOffers: {},
    awaitingCardTarget: [],
    runout: null,
    logs: [],
    lastActionNote: "",
    matchEnded: false,
    matchEndReason: null,
    matchWinners: null,
  };
}

function emptyBetting(): BettingState {
  return {
    street: "preflop",
    raiseCap: 0,
    raisesUsed: 0,
    currentLevel: 0,
    minRaiseIncrement: 0,
    lastAggressorSeat: null,
    pendingActors: [],
    raiseLockedSeats: [],
  };
}

export function mysteryHoldemReducer(
  state: MysteryGameState,
  action: MysteryGameAction,
  rng: () => number,
): MysteryGameState {
  switch (action.type) {
    case "START_MATCH":
      return startMatch(state, action.seatCount, action.names, rng);
    case "SELECT_HOLE_CARDS":
      return selectHoleCards(state, action.seat, action.keepIndexes, rng);
    case "SELECT_MISSION":
      return selectMission(state, action.seat, action.missionId, rng);
    case "SELECT_CARD_TARGET":
      return selectCardTarget(state, action.seat, action.targetSeat);
    case "CHECK":
      return applyPlayerAction(state, action.seat, "check", rng);
    case "CALL":
      return applyPlayerAction(state, action.seat, "call", rng);
    case "BET":
      return applyPlayerAction(state, action.seat, "bet", rng, action.amount);
    case "RAISE":
      return applyPlayerAction(state, action.seat, "raise", rng, action.toAmount);
    case "ALL_IN":
      return applyPlayerAction(state, action.seat, "allin", rng);
    case "FOLD":
      return applyPlayerAction(state, action.seat, "fold", rng);
    case "START_NEXT_HAND":
      return state.phase === "hand_over" && !state.matchEnded ? startNextHand(state, rng) : state;
    default:
      return state;
  }
}

// ───────────────────────── 매치/핸드 시작 ─────────────────────────

function startMatch(
  state: MysteryGameState,
  seatCount: number,
  names: readonly string[] | undefined,
  rng: () => number,
): MysteryGameState {
  // "lobby"(최초 시작) 또는 "match_over"(종료된 매치에서 새 게임)에서만 시작할 수 있다.
  if (state.phase !== "lobby" && state.phase !== "match_over") return state;
  const clamped = Math.max(
    MYSTERY_HOLDEM_CONFIG.minSeats,
    Math.min(MYSTERY_HOLDEM_CONFIG.maxSeats, Math.trunc(seatCount)),
  );
  const players = createInitialPlayers(clamped, names);
  const next: MysteryGameState = {
    ...createInitialMysteryGameState(),
    seatCount: clamped,
    players,
    buttonSeat: 0,
    round: 0,
    logs: [{ t: "match_start", seatCount: clamped }],
  };
  return startNextHand(next, rng);
}

function startNextHand(state: MysteryGameState, rng: () => number): MysteryGameState {
  if (state.matchEnded) return state;

  const survivor = state.round > 0 ? survivorSeatIfLastStanding(state.players) : null;
  if (survivor != null) return endMatchLastPlayerStanding(state, survivor);
  if (state.round > 0 && state.round >= state.config.totalRounds) return endMatchRoundLimit(state);

  const round = state.round + 1;
  const eligible = seatsEligibleForNextHand(state.players);
  if (eligible.length <= 1) {
    return eligible.length === 1
      ? endMatchLastPlayerStanding(state, eligible[0]!)
      : endMatchRoundLimit(state);
  }

  const buttonSeat =
    state.round === 0 ? eligible[0]! : nextButtonSeat(state.buttonSeat, state.players, state.seatCount);

  let players: PlayerState[] = state.players.map((p) => ({
    ...p,
    inHand: eligible.includes(p.seat),
    folded: false,
    allIn: false,
    holeCards: [],
    pendingDeal: [],
    discarded: [],
    streetContribution: 0,
    handContribution: 0,
    anteContribution: 0,
    // 지정은 한 핸드 동안만 유효하다(§22) — 카드를 유지하더라도 대상은 매 핸드 새로 고른다.
    mission: p.mission == null ? null : { ...p.mission, targetSeat: null },
  }));

  // 3장씩 딜링(§7)
  const dealt = drawCards([], eligible.length * 3, rng);
  const usedCards: Card[] = [...dealt];
  players = players.map((p) => {
    if (!eligible.includes(p.seat)) return p;
    const idx = eligible.indexOf(p.seat);
    return { ...p, pendingDeal: dealt.slice(idx * 3, idx * 3 + 3) };
  });

  // Mission 배정 대상(§9, §10): 정규 교체 라운드 전원, 또는 직전 핸드 성공으로 교체 대기 중인 좌석
  const regularChangeRound = isRegularMissionChangeRound(round, state.config);
  const missionOffers: MysteryGameState["missionOffers"] = {};
  const awaitingMissionSelection: Seat[] = [];
  for (const seat of eligible) {
    const p = players.find((x) => x.seat === seat)!;
    const needsOffer = regularChangeRound || p.mission == null || p.mission.shouldReplace;
    if (needsOffer) {
      missionOffers[seat] = drawMissionCandidates(rng, 3);
      awaitingMissionSelection.push(seat);
    }
  }

  return {
    ...state,
    phase: "hand_setup",
    round,
    buttonSeat,
    players,
    board: [],
    boardRevealed: 0,
    usedCards,
    pots: [],
    betting: emptyBetting(),
    toActSeat: null,
    awaitingHoleSelection: [...eligible],
    awaitingMissionSelection,
    missionOffers,
    // 지정은 플랍에서 한다. 새 핸드가 시작되면 지난 핸드의 지정 상태를 반드시 비운다.
    awaitingCardTarget: [],
    runout: null,
    logs: [...state.logs, { t: "round_start", round, buttonSeat }],
    lastActionNote: "",
  };
}

// ───────────────────────── hand_setup: 카드/Mission 선택 ─────────────────────────

function selectHoleCards(
  state: MysteryGameState,
  seat: Seat,
  keepIndexes: readonly [number, number],
  rng: () => number,
): MysteryGameState {
  if (state.phase !== "hand_setup") return state;
  if (!state.awaitingHoleSelection.includes(seat)) return state;
  const [i, j] = keepIndexes;
  if (i === j || i < 0 || j < 0 || i > 2 || j > 2) return state;

  const player = state.players.find((p) => p.seat === seat);
  if (player == null || player.pendingDeal.length !== 3) return state;

  const keep = [player.pendingDeal[i]!, player.pendingDeal[j]!];
  const discardIdx = [0, 1, 2].find((k) => k !== i && k !== j)!;
  const discard = player.pendingDeal[discardIdx]!;

  const players = state.players.map((p) =>
    p.seat === seat ? { ...p, holeCards: keep, discarded: [...p.discarded, discard], pendingDeal: [] } : p,
  );

  let next: MysteryGameState = {
    ...state,
    players,
    awaitingHoleSelection: state.awaitingHoleSelection.filter((s) => s !== seat),
    logs: [...state.logs, { t: "hole_selected", seat }],
  };

  next = maybeApplyExtraHandDeal(next, seat, rng);
  return maybeFinishHandSetup(next, rng);
}

function selectMission(
  state: MysteryGameState,
  seat: Seat,
  missionId: string,
  rng: () => number,
): MysteryGameState {
  if (state.phase !== "hand_setup") return state;
  if (!state.awaitingMissionSelection.includes(seat)) return state;
  const candidates = state.missionOffers[seat];
  if (candidates == null) return state;
  const def = candidates.find((m) => m.id === missionId);
  if (def == null) return state;

  const players = state.players.map((p) =>
    p.seat === seat
      ? {
          ...p,
          mission: {
            def,
            assignedRound: state.round,
            achieved: false,
            shouldReplace: false,
            targetSeat: null,
          },
        }
      : p,
  );
  const missionOffers = { ...state.missionOffers };
  delete missionOffers[seat];

  let next: MysteryGameState = {
    ...state,
    players,
    missionOffers,
    awaitingMissionSelection: state.awaitingMissionSelection.filter((s) => s !== seat),
    logs: [...state.logs, { t: "mission_selected", seat, missionId }],
  };

  next = maybeApplyExtraHandDeal(next, seat, rng);
  return maybeFinishHandSetup(next, rng);
}

// ───────────────────────── 플랍: Mystery Card 대상 지정(§22) ─────────────────────────

/**
 * 지금 그 좌석이 지정할 수 있는 상대 목록.
 * "현재 팟에 참여 중인 상대" = 이번 핸드에 남아 있고 폴드하지 않은 다른 좌석이며, 자기 자신은 제외한다.
 */
export function cardTargetCandidates(state: MysteryGameState, seat: Seat): Seat[] {
  return state.players
    .filter((p) => p.seat !== seat && p.inHand && !p.folded)
    .map((p) => p.seat);
}

function selectCardTarget(state: MysteryGameState, seat: Seat, targetSeat: Seat): MysteryGameState {
  if (!state.awaitingCardTarget.includes(seat)) return state;
  if (!cardTargetCandidates(state, seat).includes(targetSeat)) return state;

  return {
    ...state,
    players: state.players.map((p) =>
      p.seat === seat && p.mission != null ? { ...p, mission: { ...p.mission, targetSeat } } : p,
    ),
    awaitingCardTarget: state.awaitingCardTarget.filter((s) => s !== seat),
  };
}

/**
 * 대기 중인 지정을 자동으로 채운다 — 봇 좌석, 시뮬레이션, 테스트 하네스가 공용으로 쓴다.
 * `seats`를 주면 그 좌석들만 처리한다(사람 플레이어는 UI로 직접 고르므로 제외해야 한다).
 *
 * 선택 전략은 균등 무작위다. 봇은 상대의 Mystery Card를 볼 수 없으므로(그건 True Sight의
 * 영역이다) "누가 미션을 성공할 것 같은가"를 추론할 근거가 없고, 칩 스택 같은 대리 지표로
 * 고르면 정보 우위 없는 편향만 생긴다.
 */
export function pickCardTargetForSeat(
  state: MysteryGameState,
  seat: Seat,
  rng: () => number,
): Seat | null {
  const candidates = cardTargetCandidates(state, seat);
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]!;
}

export function autoAssignPendingCardTargets(
  state: MysteryGameState,
  rng: () => number,
  seats?: readonly Seat[],
): MysteryGameState {
  let s = state;
  for (const seat of [...s.awaitingCardTarget]) {
    if (seats != null && !seats.includes(seat)) continue;
    const target = pickCardTargetForSeat(s, seat, rng);
    if (target == null) continue;
    s = selectCardTarget(s, seat, target);
  }
  return s;
}

/**
 * 플랍이 열린 직후, 지정이 필요한 좌석을 모은다(§22).
 *
 * 올인 런아웃으로 플랍~리버가 한 번에 열리는 핸드에는 "플랍에서의 첫 액션"이라는 시점 자체가
 * 없으므로 지정 기회도 없다. 그 경우 targetSeat은 null로 남고 지정형 카드는 실패한다.
 */
function assignCardTargetsAtFlop(state: MysteryGameState): MysteryGameState {
  const awaiting = state.players
    .filter((p) => p.inHand && !p.folded && p.mission?.def.targetRule === "opponent_in_pot_at_flop")
    // 지정할 상대가 아무도 없으면(있을 수 없지만) 대기시키지 않는다 — 액션이 영영 막힌다.
    .filter((p) => cardTargetCandidates(state, p.seat).length > 0)
    .map((p) => p.seat);
  return awaiting.length === 0 ? state : { ...state, awaitingCardTarget: awaiting };
}

/**
 * Extra Hand Mission(§12) 훅: 기본 2장 선택이 끝나고 해당 specialRule을 가진 Mission이
 * 이미 배정돼 있다면 추가 카드를 즉시 지급한다. 카드 선택/Mission 선택 중 어느 쪽이 먼저
 * 끝나든 동일하게 동작하도록 두 selectX 함수 양쪽에서 호출한다.
 *
 * 구현 결정(§31 미확정 — Extra Hand 세부 UI 순서): "2장 추가 획득 → 최종 4장 보유"를
 * 그대로 적용해 추가 discard 단계 없이 2(선택)+2(추가)=4장으로 확정한다.
 */
function maybeApplyExtraHandDeal(state: MysteryGameState, seat: Seat, rng: () => number): MysteryGameState {
  const player = state.players.find((p) => p.seat === seat);
  if (player == null || player.holeCards.length !== 2) return state;
  // 이번 핸드의 카드가 아직 확정되지 않았으면 추가 딜을 하지 않는다.
  //
  // 교체 대기 중인 좌석은 "지난 핸드의 Four Card"를 아직 들고 있다. 그 상태에서 홀카드
  // 선택이 먼저 들어오면 옛 카드를 보고 2장을 더 줘 버리고, 곧이어 다른 카드를 고르면
  // "홀 4장인데 Four Card가 아닌" 플레이어가 된다 — 홀 2장 제한 없이 4장을 자유 조합하는
  // 심각한 우위다(실측 4장 보유 핸드의 28%). 선택이 끝난 뒤 SELECT_MISSION 쪽 호출에서 준다.
  if (state.awaitingMissionSelection.includes(seat)) return state;
  const rule = specialRuleForMission(player);
  if (rule == null || rule.extraDealCount <= 0) return state;

  const extra = drawCards(state.usedCards, rule.extraDealCount, rng);
  const usedCards = [...state.usedCards, ...extra];
  const holeCards = [...player.holeCards, ...extra];
  const players = state.players.map((p) => (p.seat === seat ? { ...p, holeCards } : p));
  return { ...state, players, usedCards };
}

function specialRuleForMission(player: PlayerState) {
  if (player.mission == null) return null;
  return specialRuleFor(player.mission.def.specialRule);
}

function maybeFinishHandSetup(state: MysteryGameState, rng: () => number): MysteryGameState {
  if (state.phase !== "hand_setup") return state;
  if (state.awaitingHoleSelection.length > 0 || state.awaitingMissionSelection.length > 0) return state;
  return beginPreflop(state, rng);
}

// ───────────────────────── 프리플랍 시작(블라인드 포스팅) ─────────────────────────

function beginPreflop(state: MysteryGameState, rng: () => number): MysteryGameState {
  const seatCount = state.seatCount;
  // 버스트로 생긴 빈 좌석을 건너뛴 실제 참여 좌석 기준으로 블라인드를 배정한다.
  const sb = sbSeatFor(state.players, state.buttonSeat, seatCount);
  const bb = bbSeatFor(state.players, state.buttonSeat, seatCount);

  let sbAmount = 0;
  let bbAmount = 0;
  let anteAmount = 0;

  const players = state.players.map((p) => {
    if (!p.inHand) return p;
    if (p.seat === sb) {
      const pay = round2(Math.min(state.config.smallBlind, p.chips));
      sbAmount = pay;
      const chips = round2(p.chips - pay);
      return { ...p, chips, streetContribution: pay, handContribution: pay, allIn: chips <= 1e-9 };
    }
    if (p.seat === bb) {
      const owed = state.config.bigBlind + state.config.bigBlindAnte;
      const pay = round2(Math.min(owed, p.chips));
      const blindPart = round2(Math.min(pay, state.config.bigBlind));
      const antePart = round2(pay - blindPart);
      bbAmount = blindPart;
      anteAmount = antePart;
      const chips = round2(p.chips - pay);
      // 앤티는 handContribution에 넣지 않는다. 넣으면 BB만 기여액이 한 단계 높아져
      // "BB만 자격이 있는 사이드 팟"이 생기고, BB가 자기 앤티를 매 핸드 되돌려받는다.
      return {
        ...p,
        chips,
        streetContribution: blindPart,
        handContribution: blindPart,
        anteContribution: antePart,
        allIn: chips <= 1e-9,
      };
    }
    return p;
  });

  const currentLevel = Math.max(sbAmount, bbAmount);
  const betting = initStreetBetting({
    street: "preflop",
    players,
    buttonSeat: state.buttonSeat,
    seatCount,
    currentLevel,
    minRaiseIncrement: state.config.bigBlind,
  });

  const next: MysteryGameState = {
    ...state,
    phase: "preflop",
    players,
    betting,
    logs: [
      ...state.logs,
      { t: "blinds_posted", sb: sb ?? -1, bb: bb ?? -1, sbAmount, bbAmount, anteAmount },
    ],
  };
  return settleBettingProgress(next, rng);
}

// ───────────────────────── 베팅 액션 ─────────────────────────

type ActionKind = "check" | "call" | "bet" | "raise" | "allin" | "fold";

function isBettingPhase(phase: MysteryStreet): phase is "preflop" | "flop" | "turn" | "river" {
  return phase === "preflop" || phase === "flop" || phase === "turn" || phase === "river";
}

function applyPlayerAction(
  state: MysteryGameState,
  seat: Seat,
  kind: ActionKind,
  rng: () => number,
  amount?: number,
): MysteryGameState {
  if (!isBettingPhase(state.phase)) return state;
  if (state.toActSeat !== seat) return state;
  // 대상 지정이 남아 있으면 그 좌석은 아직 액션할 수 없다(§22).
  if (state.awaitingCardTarget.includes(seat)) return state;
  const player = state.players.find((p) => p.seat === seat);
  if (player == null || !isActionable(player)) return state;

  const potBeforeAction = currentTotalPot(state);

  switch (kind) {
    case "check": {
      if (!canCheck(seat, state.betting, state.players)) return state;
      const betting = removeFromPending(state.betting, seat);
      return settleBettingProgress(
        { ...state, betting, logs: [...state.logs, actionLog(state, seat, "check")] },
        rng,
      );
    }
    case "call": {
      if (!canCall(seat, state.betting, state.players)) return state;
      const facing = facingForSeat(seat, state.betting, state.players);
      const pay = round2(Math.min(facing, player.chips));
      const players = payChips(state.players, seat, pay);
      const betting = removeFromPending(state.betting, seat);
      const label = pay + 1e-9 < facing ? "all_in_call" : "call";
      return settleBettingProgress(
        { ...state, players, betting, logs: [...state.logs, actionLog(state, seat, label, pay)] },
        rng,
      );
    }
    case "bet": {
      if (!canOpenBet(state.betting) || amount == null) return state;
      const range = legalRaiseRange(seat, state.betting, state.players, potBeforeAction);
      if (!isLegalRaiseTarget(amount, range)) return state;
      return applyAggressive(state, seat, amount, true, rng);
    }
    case "raise": {
      if (!canRaise(state.betting, seat) || amount == null) return state;
      const range = legalRaiseRange(seat, state.betting, state.players, potBeforeAction);
      if (!isLegalRaiseTarget(amount, range)) return state;
      return applyAggressive(state, seat, amount, false, rng);
    }
    case "allin": {
      const target = round2(player.streetContribution + player.chips);
      if (target <= state.betting.currentLevel + 1e-9) {
        // 콜조차 스택으로 못 채우는 올인 콜. 레이즈가 아니므로 Pot Limit과 무관하게 항상 합법이다.
        const players = payChips(state.players, seat, player.chips);
        const betting = removeFromPending(state.betting, seat);
        return settleBettingProgress(
          { ...state, players, betting, logs: [...state.logs, actionLog(state, seat, "all_in_call", player.chips)] },
          rng,
        );
      }
      const isOpening = canOpenBet(state.betting);
      if (!isOpening && !canRaise(state.betting, seat)) return state; // Raise Cap 도달 또는 재레이즈 잠김(§14)
      // 올인은 별도 액션이 아니라 "스택 전액을 건 레이즈"다. Pot Limit 게임이므로 스택이
      // 상한보다 깊으면 올인 자체가 불법이고, 상한까지만 레이즈할 수 있다. bet/raise와
      // 똑같은 범위 검증을 거쳐야 팟 오버 올인이 새어 나가지 않는다.
      const range = legalRaiseRange(seat, state.betting, state.players, potBeforeAction);
      if (!isLegalRaiseTarget(target, range)) return state;
      return applyAggressive(state, seat, target, isOpening, rng);
    }
    case "fold": {
      const players = state.players.map((p) => (p.seat === seat ? { ...p, folded: true } : p));
      const betting = removeFromPending(state.betting, seat);
      return settleBettingProgress(
        { ...state, players, betting, logs: [...state.logs, actionLog(state, seat, "fold")] },
        rng,
      );
    }
    default:
      return state;
  }
}

function applyAggressive(
  state: MysteryGameState,
  seat: Seat,
  target: number,
  isOpeningBet: boolean,
  rng: () => number,
): MysteryGameState {
  const player = state.players.find((p) => p.seat === seat)!;
  const add = round2(target - player.streetContribution);
  if (add <= 1e-9 || add > player.chips + 1e-6) return state;
  const players = payChips(state.players, seat, add);
  const betting = applyAggressiveAction({
    betting: state.betting,
    seat,
    newLevel: target,
    players,
    seatCount: state.seatCount,
    isOpeningBet,
  });
  const label = isOpeningBet ? "bet" : "raise";
  return settleBettingProgress(
    { ...state, players, betting, logs: [...state.logs, actionLog(state, seat, label, add)] },
    rng,
  );
}

function payChips(players: readonly PlayerState[], seat: Seat, amount: number): PlayerState[] {
  return players.map((p) => {
    if (p.seat !== seat) return p;
    const chips = round2(p.chips - amount);
    return {
      ...p,
      chips,
      streetContribution: round2(p.streetContribution + amount),
      handContribution: round2(p.handContribution + amount),
      allIn: chips <= 1e-9 && !p.folded,
    };
  });
}

function actionLog(state: MysteryGameState, seat: Seat, action: string, amount?: number): MysteryGameMessage {
  return { t: "action", seat, action, amount, street: state.phase };
}

/** 현재 테이블에 올라온 총 팟(모든 스트리트 기여 합산, 이번 스트리트 진행분 포함) */
export function currentTotalPot(state: MysteryGameState): number {
  // 앤티도 팟의 일부다(팟 리밋 계산에 포함되어야 한다). 계층만 만들지 않을 뿐이다.
  return round2(state.players.reduce((sum, p) => sum + p.handContribution + p.anteContribution, 0));
}

// ───────────────────────── 진행 오케스트레이션 ─────────────────────────

function settleBettingProgress(state: MysteryGameState, rng: () => number): MysteryGameState {
  if (isHandDecidedByFold(state.players)) {
    return settleHandByFold(state);
  }
  if (isStreetBettingComplete(state.betting)) {
    if (isAllInRunoutSituation(state.players)) {
      return runOutRemainingStreets(state, rng);
    }
    return advanceToNextStreetOrShowdown(state, rng);
  }
  return { ...state, toActSeat: state.betting.pendingActors[0]! };
}

function advanceToNextStreetOrShowdown(state: MysteryGameState, rng: () => number): MysteryGameState {
  if (state.phase === "river") {
    return resolveShowdown(state);
  }
  const dealt = dealNextCommunityStep(state, rng);
  const players = resetStreetContributions(dealt.players);
  const street = dealt.phase as "flop" | "turn" | "river";
  const betting = initStreetBetting({
    street,
    players,
    buttonSeat: dealt.buttonSeat,
    seatCount: dealt.seatCount,
    currentLevel: 0,
    minRaiseIncrement: dealt.config.bigBlind,
  });
  let next: MysteryGameState = { ...dealt, players, betting };
  // 지정은 플랍에서 한 번뿐이다. 베팅을 진행시키기 전에 대기 목록을 세워야
  // "첫 액션 전에 고른다"는 규칙이 실제로 강제된다(§22).
  if (street === "flop") next = assignCardTargetsAtFlop(next);
  return settleBettingProgress(next, rng);
}

function runOutRemainingStreets(state: MysteryGameState, rng: () => number): MysteryGameState {
  const startedAtStreet = state.phase;
  let s = state;
  while (s.boardRevealed < 5) {
    s = dealNextCommunityStep(s, rng);
  }
  s = { ...s, players: resetStreetContributions(s.players), runout: { active: true, startedAtStreet } };
  return resolveShowdown(s);
}

function dealNextCommunityStep(state: MysteryGameState, rng: () => number): MysteryGameState {
  let count = 0;
  let phase: MysteryStreet = state.phase;
  if (state.boardRevealed === 0) {
    count = 3;
    phase = "flop";
  } else if (state.boardRevealed === 3) {
    count = 1;
    phase = "turn";
  } else if (state.boardRevealed === 4) {
    count = 1;
    phase = "river";
  } else {
    return state;
  }
  const cards = drawCards(state.usedCards, count, rng);
  const board = [...state.board, ...cards];
  const usedCards = [...state.usedCards, ...cards];
  const pot = currentTotalPot(state);
  return {
    ...state,
    phase,
    board,
    boardRevealed: state.boardRevealed + count,
    usedCards,
    logs: [...state.logs, { t: "street_cards", street: phase, cards, pot }],
  };
}

function resetStreetContributions(players: readonly PlayerState[]): PlayerState[] {
  return players.map((p) => ({ ...p, streetContribution: 0 }));
}

/** 이번 핸드에 걷힌 Big Blind Ante 총액 — 계층 없이 메인 팟에 얹히는 데드머니 */
function totalAnteChips(players: readonly PlayerState[]): number {
  return round2(players.reduce((sum, p) => sum + p.anteContribution, 0));
}

// ───────────────────────── 핸드 정산(쇼다운/폴드 승리) ─────────────────────────

function settleHandByFold(state: MysteryGameState): MysteryGameState {
  const winnerSeat = state.players.find((p) => isInHandContesting(p))!.seat;
  const contributors: PotContributor[] = state.players
    .filter((p) => p.inHand)
    .map((p) => ({ seat: p.seat, amount: p.handContribution, folded: p.folded }));
  const pots = buildPots(contributors, totalAnteChips(state.players));
  const awards = awardAllPotsToSingleWinner(pots, winnerSeat);
  const amounts = mergeAwardAmounts(awards);
  return finishHandSettlement(state, pots, awards, amounts, false);
}

function resolveShowdown(state: MysteryGameState): MysteryGameState {
  const contributors: PotContributor[] = state.players
    .filter((p) => p.inHand)
    .map((p) => ({ seat: p.seat, amount: p.handContribution, folded: p.folded }));
  const pots = buildPots(contributors, totalAnteChips(state.players));
  const awards = awardPots(pots, state.players, state.board, state.buttonSeat, state.seatCount);
  const amounts = mergeAwardAmounts(awards);
  return finishHandSettlement({ ...state, phase: "showdown" }, pots, awards, amounts, true);
}

function finishHandSettlement(
  state: MysteryGameState,
  pots: Pot[],
  awards: readonly PotAward[],
  amounts: Map<Seat, number>,
  wasShowdown: boolean,
): MysteryGameState {
  let players = state.players.map((p) => {
    if (!p.inHand) return p;
    const won = amounts.get(p.seat) ?? 0;
    return won > 1e-9 ? { ...p, chips: round2(p.chips + won) } : p;
  });

  const logs: MysteryGameMessage[] = [...state.logs];
  if (!wasShowdown) {
    const winnerSeat = [...amounts.keys()][0]!;
    logs.push({ t: "fold_win", winner: winnerSeat, pot: totalPotAmount(pots) });
  } else {
    awards.forEach((a, idx) => {
      if (a.winners.length === 0) return;
      const desc = a.winners
        .map((seat) => {
          const hv = computeBestHandForPlayer(players.find((p) => p.seat === seat)!, state.board);
          return `#${seat} ${handValueSummaryKorean(hv)}`;
        })
        .join(" / ");
      logs.push({ t: "showdown", potIndex: idx, potAmount: a.pot.amount, winners: a.winners, desc });
    });
  }

  // ── Bust / Bounty 귀속 선계산(§20 Phase 2·4) ──
  // Bounty Hunter가 "내게 Bounty가 귀속되었는가"를 조건으로 삼으므로, 실제 지급보다 먼저
  // 귀속만 계산해 Mission 판정 컨텍스트에 넣어야 한다. 지급은 판정이 끝난 뒤에 한다.
  const justBusted = players.filter((p) => p.inHand && !p.busted && p.chips <= 1e-9).map((p) => p.seat);
  const baseBountyBySeat = new Map<Seat, number>();
  const bountyEvents: { bustedSeat: Seat; shares: [Seat, number][] }[] = [];
  for (const bustedSeat of justBusted) {
    const winners = defaultBountyAttributionRule({ bustedSeat, awards });
    const shares = [
      ...splitBountyReward(bountyRewardForSeatCount(state.seatCount, state.config), winners),
    ];
    bountyEvents.push({ bustedSeat, shares });
    for (const [seat, share] of shares) {
      baseBountyBySeat.set(seat, round2((baseBountyBySeat.get(seat) ?? 0) + share));
    }
  }

  // ── Mystery Card 판정(§20 Phase 3) ──
  const contestingSeats = wasShowdown ? players.filter((p) => p.inHand && !p.folded).map((p) => p.seat) : [];
  const handSeats = players.filter((p) => p.inHand).map((p) => p.seat);

  const preflopScoreBySeat = new Map<Seat, number>();
  const bestHandBySeat = new Map<Seat, ReturnType<typeof computeBestHandForPlayer>>();
  for (const seat of handSeats) {
    const p = players.find((x) => x.seat === seat)!;
    preflopScoreBySeat.set(seat, preflopScoreForHoleCards(p.holeCards));
  }
  // 폴드 승리로 끝난 핸드에서도 남은 플레이어의 족보는 필요하다 — A High Like a Boss가
  // "그 시점까지 열린 보드 + 내 홀카드" 기준으로 하이카드 승리를 인정하기 때문이다(§15).
  const evaluableSeats = wasShowdown
    ? contestingSeats
    : state.boardRevealed >= 3
      ? players.filter((p) => p.inHand && !p.folded).map((p) => p.seat)
      : [];
  for (const seat of evaluableSeats) {
    bestHandBySeat.set(
      seat,
      computeBestHandForPlayer(players.find((p) => p.seat === seat)!, state.board.slice(0, state.boardRevealed)),
    );
  }

  const missionInputs: MissionResolutionInput[] = [];
  for (const seat of handSeats) {
    const p = players.find((x) => x.seat === seat)!;
    if (p.mission == null) continue;
    const wonPotAmount = amounts.get(seat) ?? 0;
    const ctx: MissionEvalContext = {
      seat,
      round: state.round,
      buttonSeat: state.buttonSeat,
      position: positionLabelForSeat(seat, players, state.buttonSeat, state.seatCount),
      board: state.board,
      boardRevealed: state.boardRevealed,
      // 좌석 배열 길이는 버스트해도 줄지 않으므로 그대로 "시작 인원"이다.
      initialSeatCount: state.seatCount,
      folded: p.folded,
      wentToShowdown: contestingSeats.includes(seat),
      wonAnyPot: wonPotAmount > 1e-9,
      wonPotAmount,
      wonPots: awards
        .filter((a) => a.winners.includes(seat))
        .map((a) => ({ amount: a.pot.amount, showdownSeats: [...a.pot.eligibleSeats] })),
      bestHandValue: bestHandBySeat.get(seat) ?? null,
      bountyShare: baseBountyBySeat.get(seat) ?? 0,
      showdownOpponents: contestingSeats.filter((s) => s !== seat),
      opponentBestHandValues: Object.fromEntries(
        [...bestHandBySeat.entries()].filter(([s]) => s !== seat),
      ) as MissionEvalContext["opponentBestHandValues"],
      myPreflopScore: preflopScoreBySeat.get(seat) ?? 0,
      opponentPreflopScores: Object.fromEntries(
        [...preflopScoreBySeat.entries()].filter(([s]) => s !== seat),
      ) as MissionEvalContext["opponentPreflopScores"],
      // 아래 두 값은 cardResolution이 티어별로 다시 채운다(§21) — 여기서는 빈 값이 기본이다.
      opponentsAchievedThisHand: [],
      opponentMissionAchievers: [],
      targetSeat: p.mission.targetSeat,
      extraHandActive: p.mission.def.specialRule === "extra_hand_four_card",
    };
    missionInputs.push({ seat, mission: p.mission, ctx });
  }

  const missionResults = resolveMissionsForHand(missionInputs);
  for (let idx = 0; idx < missionResults.length; idx++) {
    const r = missionResults[idx]!;
    const input = missionInputs[idx]!;
    const missionId = input.mission.def.id;
    // 카드별 교체 조건(§3). 정규 변경 라운드는 다음 핸드 시작 시점에 따로 보므로 여기서는 false.
    const shouldReplace = shouldReplaceCard({
      rule: input.mission.def.replacementRule ?? "on_success",
      outcome: {
        achieved: r.achieved,
        wonAnyPot: input.ctx.wonAnyPot,
        // 발동형의 "실제로 결과를 바꿨는가"는 해당 카드들이 구현될 때 별도 신호로 바뀐다.
        // 현재 레거시 발동형은 조건 달성 = 효과 발동이라 achieved를 그대로 쓴다.
        triggered: r.achieved,
      },
      isRegularChangeRound: false,
    });
    players = players.map((p) => {
      if (p.seat !== r.seat || p.mission == null) return p;
      return {
        ...p,
        missionPoint: round2(p.missionPoint + r.reward),
        mission: { ...p.mission, achieved: r.achieved, shouldReplace },
      };
    });
    logs.push({
      t: "mission_result",
      seat: r.seat,
      missionId,
      achieved: r.achieved,
      reward: r.reward,
      deniedReward: r.deniedReward,
      // 핸드가 끝났으므로 지정 대상을 공개한다(§22).
      ...(input.mission.targetSeat != null ? { targetSeat: input.mission.targetSeat } : {}),
    });
  }

  // ── Bust 확정 + Bounty 지급(§20 Phase 4) ──
  // 귀속은 위에서 이미 계산했다. 여기서는 Bounty Hunter 배수를 얹어 실제로 지급한다.
  // "기존 Bounty + 3배"가 아니라 최종 Bounty Reward 자체가 ×3이다(§16).
  const bountyMultiplierBySeat = new Map<Seat, number>();
  for (const r of missionResults) {
    const def = players.find((p) => p.seat === r.seat)?.mission?.def;
    if (r.achieved && def?.bountyMultiplier != null) {
      bountyMultiplierBySeat.set(r.seat, def.bountyMultiplier);
    }
  }
  for (const { bustedSeat, shares } of bountyEvents) {
    players = players.map((p) => (p.seat === bustedSeat ? { ...p, busted: true } : p));
    for (const [seat, share] of shares) {
      const reward = round2(share * (bountyMultiplierBySeat.get(seat) ?? 1));
      players = players.map((p) => (p.seat === seat ? { ...p, bountyPoint: round2(p.bountyPoint + reward) } : p));
      logs.push({ t: "bounty_awarded", seat, bustedSeat, reward });
    }
    logs.push({ t: "player_busted", seat: bustedSeat });
  }

  // 표시용 chipPoint/totalPoint 캐시 갱신(§6) — 최종 판정은 scoring.ts가 별도로 계산
  players = players.map((p) => {
    const chipPoint = chipPointFromChips(p.chips, state.config.chipPointDivisor);
    return { ...p, chipPoint, totalPoint: round2(chipPoint + p.missionPoint + p.bountyPoint) };
  });

  let next: MysteryGameState = {
    ...state,
    phase: "hand_over",
    players,
    pots,
    toActSeat: null,
    logs,
  };

  // ── 게임 종료 조건(§21) ──
  const survivor = survivorSeatIfLastStanding(players);
  if (survivor != null) {
    next = endMatchLastPlayerStanding(next, survivor);
  } else if (state.round >= state.config.totalRounds) {
    next = endMatchRoundLimit(next);
  }

  return next;
}

function endMatchLastPlayerStanding(state: MysteryGameState, survivorSeat: Seat): MysteryGameState {
  const result = resolveLastPlayerStandingResult(state.players, survivorSeat);
  return {
    ...state,
    phase: "match_over",
    matchEnded: true,
    matchEndReason: "last_player_standing",
    matchWinners: result.winners,
    logs: [...state.logs, { t: "match_over", reason: "last_player_standing", winners: result.winners }],
  };
}

function endMatchRoundLimit(state: MysteryGameState): MysteryGameState {
  const result = resolveRoundLimitResult(state.players);
  return {
    ...state,
    phase: "match_over",
    matchEnded: true,
    matchEndReason: "round_limit",
    matchWinners: result.winners,
    logs: [...state.logs, { t: "match_over", reason: "round_limit", winners: result.winners }],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
