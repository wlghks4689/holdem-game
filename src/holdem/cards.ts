export type Suit = "s" | "h" | "d" | "c";

export type Card = { rank: number; suit: Suit };

export const SUITS: Suit[] = ["c", "d", "h", "s"];

export const RANK_NAMES = "23456789TJQKA";

export function rankToChar(r: number): string {
  if (r < 2 || r > 14) return "?";
  return RANK_NAMES[r - 2] ?? "?";
}

export function cardLabel(c: Card): string {
  return `${rankToChar(c.rank)}${c.suit === "s" ? "♠" : c.suit === "h" ? "♥" : c.suit === "d" ? "♦" : "♣"}`;
}

export function makeDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s });
  }
  return d;
}

export function removeCards(deck: Card[], remove: Card[]): Card[] {
  const key = (c: Card) => `${c.rank}:${c.suit}`;
  const rm = new Set(remove.map(key));
  return deck.filter((c) => !rm.has(key(c)));
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
