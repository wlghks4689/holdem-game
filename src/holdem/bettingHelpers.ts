import {
  CHIPS_PER_BB,
  IA_COST_MIN_BB,
  IA_COST_POT_FRACTION,
  POSTFLOP_MAX_BET_POT_FRACTION,
  PREFLOP_BB_BB_OPTION_MAX_RAISE_TO_BB,
  PREFLOP_BB_MAX_RAISE_TO_BB,
  PREFLOP_BUTTON_MAX_RAISE_TO_BB,
  PREFLOP_MAX_POT_BB,
  SMALLEST_CHIP,
} from "./constants";
import { resolveHandBlinds } from "./blindLevels";
import type { BettingRoundMeta, GameMessage, GameState, PlayerIndex } from "./types";

/**
 * `logs`의 IA 메시지 합(팟에서 제거된 칩).
 * 로그는 tail이 잘릴 수 있어 누적 표시에는 `GameState.iaPotRemovalTotal`을 쓰는 것이 맞다.
 */
export function totalIaChipsRemovedFromLogs(logs: readonly GameMessage[]): number {
  let sum = 0;
  for (const m of logs) {
    if (m.t === "ia") sum += m.cost;
  }
  return sum;
}

export function roundHalfChip(n: number): number {
  return Math.round(n * 2) / 2;
}

export function roundDownToBb(n: number, bbUnit: number = CHIPS_PER_BB): number {
  const u = bbUnit > 1e-9 ? bbUnit : CHIPS_PER_BB;
  return Math.floor(n / u + 1e-9) * u;
}

export function roundUpToBb(n: number, bbUnit: number = CHIPS_PER_BB): number {
  const u = bbUnit > 1e-9 ? bbUnit : CHIPS_PER_BB;
  return Math.ceil(n / u - 1e-9) * u;
}

/** 포스트플랍 상한 등: 팟·스택을 0.5칩 단위로 내림 */
export function roundDownToHalfChip(n: number): number {
  return Math.floor(n / SMALLEST_CHIP + 1e-9) * SMALLEST_CHIP;
}

export function roundUpToHalfChip(n: number): number {
  return Math.ceil(n / SMALLEST_CHIP - 1e-9) * SMALLEST_CHIP;
}

/** 자발 베트/레이즈: 최소 1BB(해당 핸드의 bb), 칩은 0.5 단위 */
export function isVoluntaryBetMultiple(n: number, bbUnit: number): boolean {
  if (bbUnit < 1e-9) return false;
  if (n < bbUnit - 1e-9) return false;
  return Math.abs(roundHalfChip(n) - n) < 1e-6;
}

/**
 * 2인 무승부 시 팟 분배 (앤티 포함 전액, 칩 단위).
 * 0.5bb 단위로만 존재한다고 가정할 때, 홀수 개의 0.5칩이 남으면 BB가 0.5bb 더 가져감.
 */
export function splitPotTwoWayChopChips(
  potChips: number,
  bbPlayer: PlayerIndex,
): { share0: number; share1: number } {
  const total = roundHalfChip(potChips);
  const step = SMALLEST_CHIP;
  const nSteps = Math.round(total / step);
  const lowSteps = Math.floor(nSteps / 2);
  const highSteps = nSteps - lowSteps;
  const lowChips = roundHalfChip(lowSteps * step);
  const highChips = roundHalfChip(highSteps * step);
  const share0 = bbPlayer === 0 ? highChips : lowChips;
  const share1 = bbPlayer === 1 ? highChips : lowChips;
  return { share0, share1 };
}

export function preflopButtonMaxTotal(s: GameState): number {
  return PREFLOP_BUTTON_MAX_RAISE_TO_BB * resolveHandBlinds(s).bb;
}

export function preflopBbMaxTotal(s: GameState): number {
  return PREFLOP_BB_MAX_RAISE_TO_BB * resolveHandBlinds(s).bb;
}

export function preflopBbOptionMaxTotal(s: GameState): number {
  return PREFLOP_BB_BB_OPTION_MAX_RAISE_TO_BB * resolveHandBlinds(s).bb;
}

export function preflopMaxPotChips(s: GameState): number {
  return PREFLOP_MAX_POT_BB * resolveHandBlinds(s).bb;
}

/** 프리플랍: 블라인드+앤티만 반영된 시작 팟 (프리플랍 액션 전) = SB + BB + 앤티 */
export function preflopDeadPotChips(s: GameState): number {
  const { sb, bb, ante } = resolveHandBlinds(s);
  return roundHalfChip(sb + bb + ante);
}

/**
 * 프리플랍 포스트(postBtn 등) 중 베팅 레벨에 잡히는 분량만 반환.
 * 앤티는 팟에만 쌓이고 `contributed`(콜·레이즈 레벨)에는 넣지 않음.
 */
export function blindContributionFromPreflopPost(
  postChips: number,
  blindNeed: number,
  anteNeed: number,
): number {
  const post = roundHalfChip(postChips);
  const antePart = roundHalfChip(Math.min(post, anteNeed));
  const rest = roundHalfChip(post - antePart);
  return roundHalfChip(Math.min(rest, blindNeed));
}

/**
 * 양측이 같은 T(블라인드+자발 베팅 누적, 앤티 제외)까지 매칭 시
 * 팟 = sb + bb + 앤티총액 + (T - sb) + (T - bb) = 2*T + 앤티총액
 */
export function maxMatchedContributionPreflop(s: GameState): number {
  const cap = preflopMaxPotChips(s);
  const { sb, bb } = resolveHandBlinds(s);
  return roundHalfChip((cap - preflopDeadPotChips(s) + sb + bb) / 2);
}

/**
 * 프리플랍: 현재 스트리트 레벨을 **엄격히 넘는** 가장 작은 유효한 총 기여액.
 */
export function preflopSmallestRaiseTotalAboveLevel(level: number, bbUnit: number): number {
  let t = roundHalfChip(level + SMALLEST_CHIP);
  for (let i = 0; i < 400; i++) {
    if (t > level + 1e-9 && isVoluntaryBetMultiple(t, bbUnit)) {
      return t;
    }
    t = roundHalfChip(t + SMALLEST_CHIP);
  }
  return roundHalfChip(level + bbUnit);
}

export function preflopMinRaiseTarget(level: number, bbUnit: number): number {
  return preflopSmallestRaiseTotalAboveLevel(level, bbUnit);
}

export function preflopMinTotalRaiseForActor(s: GameState): number {
  const bbUnit = resolveHandBlinds(s).bb;
  const level = levelFromContributions(s.betting);
  const p = s.toAct!;
  const cur = s.betting.contributed[p]!;
  const facing = roundHalfChip(level - cur);
  let minT =
    facing > 1e-9
      ? pokerMinRaiseTotalToLevel(level, cur)
      : preflopSmallestRaiseTotalAboveLevel(level, bbUnit);
  if (minT <= level + 1e-9) {
    minT = preflopSmallestRaiseTotalAboveLevel(level, bbUnit);
  }
  while (minT <= cur + 1e-9) {
    minT = preflopSmallestRaiseTotalAboveLevel(minT, bbUnit);
  }
  if (!isVoluntaryBetMultiple(minT, bbUnit)) {
    minT = preflopSmallestRaiseTotalAboveLevel(minT - SMALLEST_CHIP, bbUnit);
  }
  return minT;
}

export function preflopMaxRaiseTargetForActor(s: GameState): number {
  const p = s.toAct!;
  const capT = maxMatchedContributionPreflop(s);
  if (p === s.button && s.preflopStage === "button_acts") {
    return Math.min(preflopButtonMaxTotal(s), capT);
  }
  if (p !== s.button) {
    if (s.preflopStage === "bb_option") {
      return Math.min(preflopBbOptionMaxTotal(s), capT);
    }
    return Math.min(preflopBbMaxTotal(s), capT);
  }
  return capT;
}

export function canActorPreflopRaise(s: GameState): boolean {
  const p = s.toAct;
  if (p == null || s.phase !== "preflop" || s.preflopStage == null) return false;
  if (p === s.button) {
    return s.preflopStage === "button_acts";
  }
  if (s.preflopStage === "bb_option") return s.preflopRaiseCount < 2;
  if (s.preflopStage === "facing_raise") return s.preflopRaiseCount < 2;
  return false;
}

export function preflopHasLegalRaise(s: GameState): boolean {
  if (!canActorPreflopRaise(s)) return false;
  const minT = preflopMinTotalRaiseForActor(s);
  const maxT = preflopMaxRaiseTargetForActor(s);
  return minT <= maxT + 1e-9;
}

export function isLegalPreflopRaiseTarget(s: GameState, targetRaw: number): boolean {
  if (!canActorPreflopRaise(s)) return false;
  if (s.preflopRaiseCount >= 2) return false;
  const bbUnit = resolveHandBlinds(s).bb;
  const p = s.toAct!;
  const target = roundHalfChip(targetRaw);
  const cur = s.betting.contributed[p]!;
  const add = target - cur;
  const level = levelFromContributions(s.betting);
  const minT = preflopMinTotalRaiseForActor(s);
  const maxT = preflopMaxRaiseTargetForActor(s);
  if (add <= 0 || add > s.chips[p]!) return false;
  if (target <= level) return false;
  if (!isVoluntaryBetMultiple(target, bbUnit)) return false;
  return target >= minT && target <= maxT;
}

/** 팟×30% 후 소수 칩은 내림. 그 값과 IA_COST_MIN_BB·현재 BB 치수 중 큰 값 */
export function iaCostFromPot(pot: number, bbUnit: number): number {
  const truncated = Math.floor(pot * IA_COST_POT_FRACTION + 1e-9);
  const minChips = IA_COST_MIN_BB * bbUnit;
  return Math.max(minChips, truncated);
}

export function totalIaDeductedFromPotThisHand(logs: readonly GameMessage[]): number {
  let showdownIdx = -1;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i]!.t === "showdown") {
      showdownIdx = i;
      break;
    }
  }
  if (showdownIdx < 0) return 0;
  let total = 0;
  for (let i = showdownIdx - 1; i >= 0; i--) {
    const m = logs[i]!;
    if (m.t === "round_start" || m.t === "showdown") break;
    if (m.t === "ia") total += m.cost;
  }
  return total;
}

export function postflopMaxBet(pot: number, stack: number): number {
  const rawCap = pot * POSTFLOP_MAX_BET_POT_FRACTION;
  const cap = roundDownToHalfChip(rawCap);
  const stk = roundDownToHalfChip(stack);
  return Math.max(0, Math.min(cap, stk));
}

export function pokerMinRaiseTotalToLevel(
  opponentTotal: number,
  myContribution: number,
): number {
  const inc = roundHalfChip(opponentTotal - myContribution);
  return roundHalfChip(opponentTotal + inc);
}

export function postflopMinRaiseToLevelChips(level: number, facing: number): number {
  return roundHalfChip(level + facing);
}

export function postflopCustomMaxRaiseToLevel(
  currentPot: number,
  callAmount: number,
): number {
  return roundHalfChip(currentPot + callAmount);
}

export function postflopEffectiveMaxRaiseToLevel(
  pot: number,
  facing: number,
  actorContributed: number,
  actorStack: number,
): number {
  const ruleCap = postflopCustomMaxRaiseToLevel(pot, facing);
  const affordable = roundHalfChip(actorContributed + actorStack);
  return roundHalfChip(Math.min(ruleCap, affordable));
}

export function levelFromContributions(b: BettingRoundMeta): number {
  return Math.max(b.contributed[0]!, b.contributed[1]!);
}

export function requiredCallChips(player: PlayerIndex, b: BettingRoundMeta): number {
  const opponentTotal = levelFromContributions(b);
  const mine = b.contributed[player]!;
  return roundHalfChip(opponentTotal - mine);
}

export function facingFor(player: PlayerIndex, b: BettingRoundMeta): number {
  return requiredCallChips(player, b);
}

export function effectiveCallPay(player: PlayerIndex, s: GameState): number {
  const f = requiredCallChips(player, s.betting);
  const stack = s.chips[player]!;
  if (f <= 0 || stack <= 0) return 0;
  return roundHalfChip(Math.min(f, stack));
}

export function bettingMatched(b: BettingRoundMeta): boolean {
  return roundHalfChip(b.contributed[0]!) === roundHalfChip(b.contributed[1]!);
}
