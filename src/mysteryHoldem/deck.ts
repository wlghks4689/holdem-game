import type { Card } from "@/holdem/cards";
import { makeDeck, removeCards, shuffle } from "@/holdem/cards";

/**
 * 한 핸드 안에서 여러 차례(핸드 셋업 3장씩 → 플랍 3장 → 턴 1장 → 리버 1장) 순차적으로
 * 카드를 뽑아야 하므로, 매번 "지금까지 이미 사용된 카드"를 제외한 나머지에서
 * 새로 셔플해 필요한 장수만 꺼낸다. 기존 `dealAfterHoles`와 동일한 기법이다.
 */
export function drawCards(usedCards: readonly Card[], count: number, rng: () => number): Card[] {
  const remaining = shuffle(removeCards(makeDeck(), [...usedCards]), rng);
  return remaining.slice(0, count);
}
