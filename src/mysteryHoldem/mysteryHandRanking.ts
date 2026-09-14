import type { Card } from "@/holdem/cards";

/**
 * MysteryHoldem 전용 프리플랍 핸드 랭킹(§12 Underdog).
 *
 * 기존 AI용 Hand Tier(hellPoolComposition.ts 등 헤즈업 AI 전용 자료)는 재사용하지 않고
 * 완전히 독립된 산식을 사용한다. 아래는 Chen Formula를 단순화한 근사치이며,
 * 정확한 Ranking Table은 별도 기획으로 확정 전이므로 잠정값이다(§31).
 *
 * 숫자가 높을수록 프리플랍 기준 강한 핸드.
 */
export function mysteryPreflopHandScore(hole: readonly [Card, Card]): number {
  const [a, b] = hole;
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  const suited = a.suit === b.suit;
  const pair = a.rank === b.rank;

  let score = chenBaseScore(hi);

  if (pair) {
    score = Math.max(score * 2, 5);
  }
  if (suited) score += 2;

  if (!pair) {
    const gap = hi - lo - 1;
    if (gap === 0) score += 1;
    else if (gap === 1) score += 0.5;
    else if (gap === 2) score -= 1;
    else if (gap >= 3) score -= 2;
    if (gap <= 1 && hi <= 12) score += 1;
  }

  return Math.round(score * 10) / 10;
}

function chenBaseScore(highRank: number): number {
  if (highRank === 14) return 10;
  if (highRank === 13) return 8;
  if (highRank === 12) return 7;
  if (highRank === 11) return 6;
  return highRank / 2;
}

// isUnderdogVersus는 제거했다. 예전 Underdog Mission은 "나보다 강한 상대가 한 명이라도
// 있으면 성공"이었지만, 새 Underdog 카드는 "그 팟 참가자 중 (공동) 최하위"를 요구한다(§13).
// 그 판정은 상대 한 명과의 1:1 비교로 표현되지 않으므로 카드 정의 쪽에서 직접 계산한다.

/**
 * 홀카드가 2장을 초과하는 경우(Extra Hand Mission 등)에는 가능한 2장 조합 중
 * 최고 점수를 대표값으로 사용한다. 2장이면 그대로 계산한다.
 */
export function preflopScoreForHoleCards(cards: readonly Card[]): number {
  if (cards.length <= 2) {
    return mysteryPreflopHandScore([cards[0]!, cards[1] ?? cards[0]!]);
  }
  let best = -Infinity;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const score = mysteryPreflopHandScore([cards[i]!, cards[j]!]);
      if (score > best) best = score;
    }
  }
  return best;
}
