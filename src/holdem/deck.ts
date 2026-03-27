import type { Card } from "./cards";
import { makeDeck, removeCards, shuffle } from "./cards";

export function dealAfterHoles(
  hole0: [Card, Card],
  hole1: [Card, Card],
  rng: () => number,
): Card[] {
  const deck = shuffle(removeCards(makeDeck(), [...hole0, ...hole1]), rng);
  return deck.slice(0, 5);
}
