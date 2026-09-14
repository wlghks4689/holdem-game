import type { Card } from "@/holdem/cards";
import { snapBetAmountToStep } from "../betting";
import { currentTotalPot } from "../gameReducer";
import { mysteryPreflopHandScore } from "../mysteryHandRanking";
import { contestingSeats, positionLabelForSeat } from "../positions";
import { legalActionsForSeat } from "../selectors";
import { specialRuleFor } from "../specialRules";
import type { MysteryGameAction, MysteryGameState, PlayerState, Seat } from "../types";
import { estimateEquity, preflopEquityApprox, relativeStrength } from "./handStrength";

/**
 * MysteryHoldem 전용 봇 정책.
 *
 * 기존 홀덤의 AI(preflopAiPolicy / hellSolverPolicy 등)는 헤즈업 전용으로 튜닝돼 있어
 * 그대로 쓰지 않는다. 여기서는 N인 게임에 맞춰 "현재 상대 수 기준 승률 vs 팟 오즈"를
 * 축으로 삼고, 성향(profile)과 보유 Mission으로 임계값을 조정한다.
 */
export interface BotProfile {
  name: string;
  /** 0=타이트, 1=루즈. 콜/오픈 임계값을 낮춘다 */
  looseness: number;
  /** 0=패시브, 1=어그레시브. 베팅·레이즈 빈도와 사이징을 키운다 */
  aggression: number;
}

export const BOT_PROFILES: BotProfile[] = [
  { name: "Rock", looseness: 0.25, aggression: 0.3 },
  { name: "Solid", looseness: 0.45, aggression: 0.5 },
  { name: "Aggro", looseness: 0.5, aggression: 0.85 },
  { name: "Loose", looseness: 0.75, aggression: 0.45 },
  { name: "Maniac", looseness: 0.8, aggression: 0.9 },
];

/** 좌석별로 고정된 성향을 배정해 테이블이 균질해지지 않게 한다 */
export function profileForSeat(seat: Seat): BotProfile {
  return BOT_PROFILES[seat % BOT_PROFILES.length]!;
}

export interface BotOptions {
  profile?: BotProfile;
  /** 몬테카를로 표본 수. 시뮬레이션에서는 낮춰 속도를 확보한다 */
  equitySamples?: number;
}

export function decideBotAction(
  state: MysteryGameState,
  seat: Seat,
  rng: () => number,
  options: BotOptions = {},
): MysteryGameAction {
  const profile = options.profile ?? profileForSeat(seat);
  const legal = legalActionsForSeat(state, seat);
  const player = state.players.find((p) => p.seat === seat);
  if (player == null) return { type: "FOLD", seat };

  const opponentCount = Math.max(1, contestingSeats(state.players).length - 1);
  const equity = estimateHandEquity(state, player, opponentCount, rng, options);
  const missionBias = missionBias_(player, state);

  const pot = currentTotalPot(state);
  const toCall = legal.callAmount;
  // 절대 승률은 상대 수에 따라 상한이 달라지므로, 공격 판단은 "공정 지분 대비 배수"로 한다.
  const strength = relativeStrength(equity, opponentCount);

  // ── 체크 가능한 상황: 베팅할지 말지만 결정한다 ──
  if (legal.canCheck) {
    const betThreshold = 1.35 - profile.aggression * 0.35 - missionBias.aggression;
    const wantsToBet = strength >= betThreshold;
    // 약한 핸드로도 가끔 블러프(어그레시브 성향일수록 자주)
    const bluffs = !wantsToBet && rng() < profile.aggression * 0.1;
    if ((wantsToBet || bluffs) && legal.canBet && legal.raiseRange) {
      const sizing = bluffs ? 0.45 : Math.min(1.0, 0.35 + (strength - 1) * 0.5 + profile.aggression * 0.15);
      return betOrRaiseAction(seat, legal, pot, player, sizing, true);
    }
    return { type: "CHECK", seat };
  }

  // ── 베팅에 직면한 상황: 팟 오즈와 승률을 비교한다 ──
  if (!legal.canCall) return { type: "FOLD", seat };

  const potOdds = toCall / (pot + toCall);
  const callMargin = 0.04 - profile.looseness * 0.05 - missionBias.callMargin;
  const canContinue = equity >= potOdds + callMargin;

  if (!canContinue) {
    // 아주 저렴한 콜은 받아준다(기존 투자 대비 소액)
    const cheap = toCall <= pot * 0.08 && equity > potOdds * 0.7;
    if (!cheap) return { type: "FOLD", seat };
  }

  const raiseThreshold = 1.85 - profile.aggression * 0.45 - missionBias.aggression;
  if (strength >= raiseThreshold && legal.canRaise && legal.raiseRange) {
    const sizing = Math.min(1.1, 0.4 + (strength - 1) * 0.5 + profile.aggression * 0.15);
    return betOrRaiseAction(seat, legal, pot, player, sizing, false);
  }

  return { type: "CALL", seat };
}

function estimateHandEquity(
  state: MysteryGameState,
  player: PlayerState,
  opponentCount: number,
  rng: () => number,
  options: BotOptions,
): number {
  const board = state.board.slice(0, state.boardRevealed);
  if (board.length === 0) {
    return preflopEquityApprox(player.holeCards, opponentCount);
  }
  const rule = specialRuleFor(player.mission?.def.specialRule);
  const holeUse =
    rule != null && player.holeCards.length === rule.finalHoleCardCount ? 2 : undefined;
  return estimateEquity({
    hole: player.holeCards,
    board,
    opponentCount,
    holeUse,
    samples: options.equitySamples ?? 160,
    rng,
  });
}

/**
 * 보유 Mission에 따른 성향 보정. MysteryHoldem에서 봇이 "그냥 포커 봇"이 아니라
 * 비공개 목표를 가진 플레이어처럼 보이게 하는 부분이다.
 */
function missionBias_(player: PlayerState, state: MysteryGameState): {
  aggression: number;
  callMargin: number;
} {
  const def = player.mission?.def;
  if (def == null) return { aggression: 0, callMargin: 0 };

  // Maker / High-End 계열: 쇼다운까지 가야 달성 가능 → 조금 더 끈질기게 따라간다
  if (def.id.startsWith("maker_")) {
    return { aggression: 0, callMargin: 0.03 };
  }
  // Blind Defender: 블라인드 포지션에 있는 핸드에서만 공격성을 올린다
  if (def.id === "blind_defender") {
    const label = positionLabelForSeat(player.seat, state.players, state.buttonSeat, state.seatCount);
    const targeted = label === "SB" || label === "BB";
    return targeted ? { aggression: 0.08, callMargin: 0.02 } : { aggression: 0, callMargin: 0 };
  }
  // Underdog: 약한 핸드로 쇼다운 승리를 노리므로 콜 의향을 소폭 높인다
  if (def.id === "underdog") {
    return { aggression: 0, callMargin: 0.025 };
  }
  // A High Like a Boss: 메이드 없이 이겨야 하므로 블러프 쪽으로 기운다
  if (def.id === "high_card_boss") {
    return { aggression: 0.06, callMargin: 0 };
  }
  return { aggression: 0, callMargin: 0 };
}

function betOrRaiseAction(
  seat: Seat,
  legal: ReturnType<typeof legalActionsForSeat>,
  pot: number,
  player: PlayerState,
  potFraction: number,
  isOpeningBet: boolean,
): MysteryGameAction {
  const range = legal.raiseRange!;
  const desired = isOpeningBet
    ? player.streetContribution + pot * potFraction
    : legal.callAmount + player.streetContribution + pot * potFraction;
  // 사람 슬라이더와 같은 베팅 단위(100)로 맞춘다. 구간을 벗어나지 않는 것이 최우선이며
  // (엔진이 거부하면 봇이 같은 액션을 무한 반복한다) 단위는 그 다음이다.
  const target = snapBetAmountToStep(desired, range);
  return isOpeningBet
    ? { type: "BET", seat, amount: target }
    : { type: "RAISE", seat, toAmount: target };
}

/** 3장 중 2장 선택: MysteryHoldem 전용 프리플랍 랭킹이 가장 높은 조합을 고른다 */
export function pickHoleKeepIndexes(dealt: readonly Card[]): [number, number] {
  if (dealt.length < 3) return [0, 1];
  const combos: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  let best: [number, number] = [0, 1];
  let bestScore = -Infinity;
  for (const [a, b] of combos) {
    const score = mysteryPreflopHandScore([dealt[a]!, dealt[b]!]);
    if (score > bestScore) {
      bestScore = score;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Mission 후보 선택. 지금은 성향에 따라 살짝 다른 선호만 준다
 * (어그레시브 봇은 Position 계열, 그 외에는 무작위) — 정교한 EV 기반 선택은 추후 과제.
 */
export function pickMissionId(
  candidates: readonly { id: string; category: string }[],
  seat: Seat,
  rng: () => number,
): string {
  if (candidates.length === 0) return "";
  const profile = profileForSeat(seat);
  // 공격적인 봇은 팟을 이겨야 달성되는 카드를 선호한다.
  if (profile.aggression > 0.7) {
    const winOriented = candidates.find((c) => c.id === "blind_defender" || c.id === "high_card_boss");
    if (winOriented) return winOriented.id;
  }
  const idx = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[idx]!.id;
}

// 지정형 카드의 대상 선택은 gameReducer의 autoAssignPendingCardTargets가 담당한다.
// 봇·시뮬레이션·테스트 하네스가 모두 같은 함수를 쓰도록 한곳에 두었다.
