import {
  BET_RAISE_UNIT,
  CHIPS_PER_BB,
  IA_COST_POT_FRACTION,
  POSTFLOP_MAX_BET_POT_FRACTION,
  PREFLOP_BB_BB_OPTION_MAX_RAISE_TO_BB,
  PREFLOP_BB_MAX_RAISE_TO_BB,
  PREFLOP_BUTTON_MAX_RAISE_TO_BB,
  PREFLOP_ANTE_BB,
  PREFLOP_MAX_POT_BB,
  SMALLEST_CHIP,
} from "./constants";
import type { BettingRoundMeta, GameMessage, GameState, PlayerIndex } from "./types";

/** `logs`에 기록된 IA 사용분 합(매치 시작부터 누적) — 팟에서 제거된 칩 */
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

export function roundDownToBb(n: number): number {
  return Math.floor(n / BET_RAISE_UNIT + 1e-9) * BET_RAISE_UNIT;
}

export function roundUpToBb(n: number): number {
  return Math.ceil(n / BET_RAISE_UNIT - 1e-9) * BET_RAISE_UNIT;
}

/** 포스트플랍 상한 등: 팟·스택을 0.5칩 단위로 내림 */
export function roundDownToHalfChip(n: number): number {
  return Math.floor(n / SMALLEST_CHIP + 1e-9) * SMALLEST_CHIP;
}

export function roundUpToHalfChip(n: number): number {
  return Math.ceil(n / SMALLEST_CHIP - 1e-9) * SMALLEST_CHIP;
}

/** 자발 베트/레이즈: 최소 1BB, 칩은 0.5 단위 */
export function isVoluntaryBetMultiple(n: number): boolean {
  if (n < BET_RAISE_UNIT) return false;
  return Math.abs(roundHalfChip(n) - n) < 1e-6;
}

export function sbAmount(): number {
  return CHIPS_PER_BB / 2;
}

export function bbAmount(): number {
  return CHIPS_PER_BB;
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

/** 프리플랍: 버튼이 올릴 수 있는 최대 총 기여액 (SB 포함 누적) */
export function preflopButtonMaxTotal(): number {
  return PREFLOP_BUTTON_MAX_RAISE_TO_BB * CHIPS_PER_BB;
}

/** 프리플랍: BB 측이 올릴 수 있는 이론상 최대 총 기여 (팟 캡과 별도 — 최종은 cap과 교차) */
export function preflopBbMaxTotal(): number {
  return PREFLOP_BB_MAX_RAISE_TO_BB * CHIPS_PER_BB;
}

/** BB 옵션(버튼 림프 후)·체크 구간에서 BB 최대 총 기여 */
export function preflopBbOptionMaxTotal(): number {
  return PREFLOP_BB_BB_OPTION_MAX_RAISE_TO_BB * CHIPS_PER_BB;
}

export function preflopMaxPotChips(): number {
  return PREFLOP_MAX_POT_BB * CHIPS_PER_BB;
}

/** 프리플랍 앤티 총액 (칩). BB 포스트에 포함 — 버튼 측 별도 앤티 없음 */
export function preflopAnteTotalChips(): number {
  return PREFLOP_ANTE_BB * CHIPS_PER_BB;
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

/** 블라인드+앤티만 반영된 시작 팟 (프리플랍 액션 전) = SB + BB + 앤티 */
export function preflopDeadPotChips(): number {
  return roundHalfChip(sbAmount() + bbAmount() + preflopAnteTotalChips());
}

/**
 * 양측이 같은 T(블라인드+자발 베팅 누적, 앤티 제외)까지 매칭 시
 * 팟 = sb + bb + 앤티총액 + (T - sb) + (T - bb) = 2*T + 앤티총액
 */
export function maxMatchedContributionPreflop(): number {
  const cap = preflopMaxPotChips();
  return roundHalfChip((cap - preflopDeadPotChips() + sbAmount() + bbAmount()) / 2);
}

/**
 * 프리플랍: 현재 스트리트 레벨을 **엄격히 넘는** 가장 작은 유효한 총 기여액.
 * (0.5칩 단위로 올리며 `isVoluntaryBetMultiple`을 만족하는 첫 값)
 */
export function preflopSmallestRaiseTotalAboveLevel(level: number): number {
  let t = roundHalfChip(level + SMALLEST_CHIP);
  for (let i = 0; i < 400; i++) {
    if (t > level + 1e-9 && isVoluntaryBetMultiple(t)) {
      return t;
    }
    t = roundHalfChip(t + SMALLEST_CHIP);
  }
  return roundHalfChip(level + BET_RAISE_UNIT);
}

export function preflopMinRaiseTarget(level: number): number {
  return preflopSmallestRaiseTotalAboveLevel(level);
}

/**
 * 이번 액터의 최소 **총 기여** (toLevelChips).
 * 페이싱이 있으면 {@link pokerMinRaiseTotalToLevel}, 아니면 스트리트 첫 레이즈 규칙(칩 단위).
 */
export function preflopMinTotalRaiseForActor(s: GameState): number {
  const level = levelFromContributions(s.betting);
  const p = s.toAct!;
  const cur = s.betting.contributed[p]!;
  const facing = roundHalfChip(level - cur);
  let minT =
    facing > 1e-9
      ? pokerMinRaiseTotalToLevel(level, cur)
      : preflopSmallestRaiseTotalAboveLevel(level);
  if (minT <= level + 1e-9) {
    minT = preflopSmallestRaiseTotalAboveLevel(level);
  }
  while (minT <= cur + 1e-9) {
    minT = preflopSmallestRaiseTotalAboveLevel(minT);
  }
  if (!isVoluntaryBetMultiple(minT)) {
    minT = preflopSmallestRaiseTotalAboveLevel(minT - SMALLEST_CHIP);
  }
  return minT;
}

/** 현재 턴 플레이어 기준 프리플랍 레이즈 시 목표 총 기여 상한 */
export function preflopMaxRaiseTargetForActor(s: GameState): number {
  const p = s.toAct!;
  const capT = maxMatchedContributionPreflop();
  if (p === s.button && s.preflopStage === "button_acts") {
    return Math.min(preflopButtonMaxTotal(), capT);
  }
  if (p !== s.button) {
    if (s.preflopStage === "bb_option") {
      return Math.min(preflopBbOptionMaxTotal(), capT);
    }
    return Math.min(preflopBbMaxTotal(), capT);
  }
  return capT;
}

/** 버튼은 첫 액션에서만 레이즈 가능, BB는 bb_option 또는 facing_raise(리레이즈 1회 한도) */
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

/** UI·검증 공용: 해당 총 기여로 PREFLOP_RAISE가 가능한지 */
export function isLegalPreflopRaiseTarget(s: GameState, targetRaw: number): boolean {
  if (!canActorPreflopRaise(s)) return false;
  if (s.preflopRaiseCount >= 2) return false;
  const p = s.toAct!;
  const target = roundHalfChip(targetRaw);
  const cur = s.betting.contributed[p]!;
  const add = target - cur;
  const level = levelFromContributions(s.betting);
  const minT = preflopMinTotalRaiseForActor(s);
  const maxT = preflopMaxRaiseTargetForActor(s);
  if (add <= 0 || add > s.chips[p]!) return false;
  if (target <= level) return false;
  if (!isVoluntaryBetMultiple(target)) return false;
  return target >= minT && target <= maxT;
}

/** 팟×비율 후 소수 칩은 내림(절사). 최소 1BB. */
export function iaCostFromPot(pot: number): number {
  const truncated = Math.floor(pot * IA_COST_POT_FRACTION + 1e-9);
  return Math.max(BET_RAISE_UNIT, truncated);
}

/** 이번 핸드의 `showdown` 직전까지 로그에서, 팟에서 빠져 나간 IA 비용 합 */
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

/**
 * 표준 미니멈 레이즈 총 기여.
 * `opponentTotal + (opponentTotal - myContribution)` (= 상대가 올린 증가분만큼 한 번 더 올림).
 */
export function pokerMinRaiseTotalToLevel(
  opponentTotal: number,
  myContribution: number,
): number {
  const inc = roundHalfChip(opponentTotal - myContribution);
  return roundHalfChip(opponentTotal + inc);
}

/**
 * 포스트플랍: 스트리트 최고 기여 L(상대 총액), 이번에 맞춰야 할 추가 콜 F일 때
 * 최소 레이즈 총액 = L + F (= L + (L − 내 기여)).
 */
export function postflopMinRaiseToLevelChips(level: number, facing: number): number {
  return roundHalfChip(level + facing);
}

/**
 * 커스텀 룰: 페이싱 레이즈 시 최대 **총** 기여(to-level) 상한.
 * `currentPot + callAmount` — 이번에 맞출 추가 콜(`facing`)만큼을 현재 팟에 더한 수준까지.
 */
export function postflopCustomMaxRaiseToLevel(
  currentPot: number,
  callAmount: number,
): number {
  return roundHalfChip(currentPot + callAmount);
}

/**
 * 처리 상한: 룰 상한과 실제로 낼 수 있는 총액(기여+스택) 중 작은 값.
 * (칩이 부족하면 올인만큼만 레이즈)
 */
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

/**
 * 이번 스트리트에서 콜에 필요한 **추가** 칩.
 * 공식: max(상대 총 기여) − 내 총 기여 (= 레이즈 한도와 무관한 순수 맞춤액)
 */
export function requiredCallChips(player: PlayerIndex, b: BettingRoundMeta): number {
  const opponentTotal = levelFromContributions(b);
  const mine = b.contributed[player]!;
  return roundHalfChip(opponentTotal - mine);
}

/** {@link requiredCallChips} 와 동일 */
export function facingFor(player: PlayerIndex, b: BettingRoundMeta): number {
  return requiredCallChips(player, b);
}

/** 콜에 실제로 지불하는 칩 (올인 시 스택 전부, facing이 더 크면 facing만큼이 아닌 스택만) */
export function effectiveCallPay(player: PlayerIndex, s: GameState): number {
  const f = requiredCallChips(player, s.betting);
  const stack = s.chips[player]!;
  if (f <= 0 || stack <= 0) return 0;
  return roundHalfChip(Math.min(f, stack));
}

export function bettingMatched(b: BettingRoundMeta): boolean {
  return roundHalfChip(b.contributed[0]!) === roundHalfChip(b.contributed[1]!);
}
