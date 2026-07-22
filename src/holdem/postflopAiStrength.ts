import { makeDeck, removeCards, type Card } from "./cards";
import {
  analyzeHellPostflopStrength,
  type HellPostflopSnapshot,
} from "./hellPostflopStrength";
import { best5Of7, compareHandValue } from "./pokerEval";
import {
  buildWeightedOpponentHoles,
  type WeightedHole,
} from "./riverEvAi";
import type { GameState, PlayerIndex } from "./types";

const SAMPLE_COUNT = 320;
const EPS = 1e-12;

export type PostflopAiStrength = HellPostflopSnapshot & {
  equity: number;
  actionTier: number;
  aggressionBonus: number;
  samples: number;
};

function visibleBoard(state: GameState): Card[] {
  const count = Math.min(state.boardRevealed, state.board.length);
  return state.board.slice(0, count);
}

function cardHash(cards: readonly Card[], salt: number): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (const card of cards) {
    hash ^= card.rank * 17 + card.suit.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 1;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function weightedPicker(range: readonly WeightedHole[]): {
  total: number;
  pick: (unit: number) => WeightedHole | null;
} {
  const cumulative: number[] = [];
  let total = 0;
  for (const item of range) {
    total += Math.max(0, item.weight);
    cumulative.push(total);
  }
  return {
    total,
    pick(unit) {
      if (total <= EPS) return null;
      const target = unit * total;
      let lo = 0;
      let hi = cumulative.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cumulative[mid]! < target) lo = mid + 1;
        else hi = mid;
      }
      return range[lo] ?? null;
    },
  };
}

function fallbackOpponentRange(hero: [Card, Card], board: readonly Card[]): WeightedHole[] {
  const deck = removeCards(makeDeck(), [...hero, ...board]);
  const range: WeightedHole[] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      range.push({ hole: [deck[i]!, deck[j]!], weight: 1 });
    }
  }
  return range;
}

function estimateEquity(
  hero: [Card, Card],
  board: readonly Card[],
  range: readonly WeightedHole[],
  seed: number,
): { equity: number; samples: number } {
  const random = seededRandom(seed);
  const picker = weightedPicker(range);
  let score = 0;
  let samples = 0;

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const opponent = picker.pick(random());
    if (!opponent) break;
    const runout = removeCards(makeDeck(), [...hero, ...board, ...opponent.hole]);
    const cardsNeeded = Math.max(0, 5 - board.length);
    for (let i = 0; i < cardsNeeded; i++) {
      const j = i + Math.floor(random() * (runout.length - i));
      [runout[i], runout[j]] = [runout[j]!, runout[i]!];
    }
    const finalBoard = [...board, ...runout.slice(0, cardsNeeded)];
    const heroValue = best5Of7([...hero, ...finalBoard]);
    const opponentValue = best5Of7([...opponent.hole, ...finalBoard]);
    const compared = compareHandValue(heroValue, opponentValue);
    score += compared > 0 ? 1 : compared === 0 ? 0.5 : 0;
    samples++;
  }

  return { equity: samples > 0 ? score / samples : 0.5, samples };
}

function equityTier(equity: number): number {
  if (equity < 0.3) return 1;
  if (equity < 0.44) return 2;
  if (equity < 0.58) return 3;
  if (equity < 0.72) return 4;
  return 5;
}

function contextualMadeTier(
  hero: [Card, Card],
  board: readonly Card[],
  snapshot: HellPostflopSnapshot,
): number {
  const pocketPair = hero[0].rank === hero[1].rank;
  if (pocketPair && !board.some((card) => card.rank === hero[0].rank)) {
    const overcards = board.filter((card) => card.rank > hero[0].rank).length;
    if (overcards >= 2) return Math.min(snapshot.madeTier, 2);
    if (overcards === 1) return Math.min(snapshot.madeTier, 3);
  }

  // A pair that exists only on the board is not a made pair for the AI.
  if (snapshot.madeTier <= 3) {
    const holeMatchesBoard = hero.some((holeCard) =>
      board.some((boardCard) => boardCard.rank === holeCard.rank),
    );
    if (!pocketPair && !holeMatchesBoard) return Math.min(snapshot.madeTier, 2);
  }
  return snapshot.madeTier;
}

export function analyzePostflopAiStrength(
  state: GameState,
  aiSeat: PlayerIndex,
  opponentTemplateRemaining?: Readonly<Record<string, number>>,
): PostflopAiStrength | null {
  const hero = state.holes[aiSeat]?.hole;
  const snapshot = analyzeHellPostflopStrength(state, aiSeat);
  if (!hero || !snapshot) return null;

  const board = visibleBoard(state);
  let range = buildWeightedOpponentHoles(
    state,
    aiSeat,
    null,
    opponentTemplateRemaining,
  );
  if (range.length === 0) range = fallbackOpponentRange(hero, board);
  const seed = cardHash(
    [...hero, ...board],
    state.roundNumber * 131 + Math.round(state.pot * 10),
  );
  const { equity, samples } = estimateEquity(hero, board, range, seed);
  const madeTier = contextualMadeTier(hero, board, snapshot);

  // Strong made hands should protect their equity more aggressively on wet boards.
  // Draws add pressure, but showdown equity remains the primary action signal.
  const madePressure = madeTier >= 4
    ? snapshot.boardWetness * 0.12
    : madeTier >= 3
      ? snapshot.boardWetness * 0.06
      : 0;
  const drawPressure = snapshot.drawWeight * 0.1;
  const aggressionBonus = Math.min(0.18, madePressure + drawPressure);
  let actionTier = equityTier(equity);
  if (snapshot.drawWeight < 0.25) {
    actionTier = Math.min(actionTier, madeTier + 1);
  }
  if (
    hero[0].rank === hero[1].rank &&
    !board.some((card) => card.rank === hero[0].rank) &&
    board.filter((card) => card.rank > hero[0].rank).length >= 2
  ) {
    actionTier = Math.min(actionTier, 2);
  }

  return {
    ...snapshot,
    madeTier,
    equity,
    actionTier,
    aggressionBonus,
    samples,
  };
}
