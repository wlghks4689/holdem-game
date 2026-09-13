/**
 * Pot-Limit Betting Engine의 순수 계산 함수 모음.
 * UI와 reducer 양쪽에서 동일한 함수를 호출해 계산 중복을 없앤다(§16).
 */

export interface PotLimitMaxRaiseParams {
  /** 이번 액션 전 테이블 팟(현재 스트리트에 이미 들어간 기여금 포함, 액터의 콜 전) */
  potBeforeAction: number;
  /** 이번 스트리트 현재 베팅 레벨(활성 플레이어 중 최대 기여액) */
  currentLevel: number;
  /** 액터가 이번 스트리트에 이미 기여한 금액 */
  actorContributedThisStreet: number;
}

/**
 * Pot-Limit 최대 레이즈"총액"(레이즈 후 액터의 스트리트 기여 총액)을 계산한다.
 *
 * 일반적인 Pot-Limit 규칙: 콜 금액까지 포함해 "콜 이후의 팟"을 구하고,
 * 그 금액만큼을 최대 레이즈 폭으로 허용한다.
 *   callAmount = max(0, currentLevel - actorContributedThisStreet)
 *   potAfterCall = potBeforeAction + callAmount
 *   maxRaiseToLevel = currentLevel + potAfterCall
 *
 * 스택 한도(올인)는 이 함수의 책임이 아니다 — 호출부에서 별도로 min(스택, 결과)로 클램프한다.
 */
export function calculatePotLimitMaxRaise(params: PotLimitMaxRaiseParams): number {
  const callAmount = Math.max(0, params.currentLevel - params.actorContributedThisStreet);
  const potAfterCall = params.potBeforeAction + callAmount;
  return params.currentLevel + potAfterCall;
}

/** 액터가 콜하는 데 필요한 금액 */
export function callAmountFor(currentLevel: number, actorContributedThisStreet: number): number {
  return Math.max(0, currentLevel - actorContributedThisStreet);
}

/**
 * 최소 레이즈 총액. 표준 규칙: 직전 유효 베팅/레이즈 증가폭(minRaiseIncrement)을
 * 최소한 그대로 충족해야 한다 — Raise Cap을 소모하기 위한 지나치게 작은 레이즈 방지(§15).
 */
export function calculateMinRaiseToLevel(
  currentLevel: number,
  minRaiseIncrement: number,
): number {
  return currentLevel + Math.max(minRaiseIncrement, 0);
}

/**
 * 스택 한도까지 클램프한 실제 레이즈 가능 범위. 액터의 남은 스택이 min-raise에도
 * 못 미치면 { min: allInTotal, max: allInTotal } 형태의 단일 지점(올인)을 반환한다.
 * 레이즈 자체가 불가능하면(스택이 콜도 못 채우는 등) null.
 */
export function raiseRangeForActor(params: {
  potBeforeAction: number;
  currentLevel: number;
  actorContributedThisStreet: number;
  actorStack: number;
  minRaiseIncrement: number;
}): { min: number; max: number } | null {
  const { potBeforeAction, currentLevel, actorContributedThisStreet, actorStack, minRaiseIncrement } =
    params;
  const allInTotal = actorContributedThisStreet + actorStack;
  // 콜조차 스택으로 못 채우면 레이즈 불가(콜만 가능한 올인 상황)
  if (allInTotal <= currentLevel + 1e-9) return null;

  const potLimitMax = calculatePotLimitMaxRaise({
    potBeforeAction,
    currentLevel,
    actorContributedThisStreet,
  });
  const max = Math.min(potLimitMax, allInTotal);
  const standardMin = calculateMinRaiseToLevel(currentLevel, minRaiseIncrement);

  if (standardMin <= max + 1e-9) {
    return { min: Math.min(standardMin, max), max };
  }
  // 표준 최소 레이즈에 못 미치는 숏스택 올인 레이즈 한 점만 허용
  return { min: max, max };
}

export function isLegalRaiseTarget(
  target: number,
  range: { min: number; max: number } | null,
): boolean {
  if (range == null) return false;
  return target >= range.min - 1e-9 && target <= range.max + 1e-9;
}
