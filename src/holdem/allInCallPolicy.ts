import { makeDeck, rankToChar, removeCards, type Card } from "./cards";
import { effectiveCallPay } from "./bettingHelpers";
import { resolveHandBlinds } from "./blindLevels";
import { loadMotionDebugEnabled } from "./holdemMotionMode";
import { best5Of7, compareHandValue } from "./pokerEval";
import { allConcreteHolesForTemplate, getHandTemplatesForMode } from "./handPool";
import type { GameState, PlayerIndex } from "./types";

export type AllInCallDifficulty = "easy" | "normal" | "hard" | "hell";

export type AllInCallDecision = {
  facingAllIn: boolean;
  action: "call" | "fold";
  street: "preflop" | "flop" | "turn" | "river";
  hand: string;
  stackBb: number;
  effectiveStackBb: number;
  opponentAllInBb: number;
  callAmount: number;
  callAmountBb: number;
  potOdds: number;
  equity: number;
  requiredEquity: number;
  investedChips: number;
  investedBb: number;
  position: "button" | "big-blind";
  samples: number;
  reason: string;
};

const EPS = 1e-9;
const SAMPLE_COUNT = 720;

function other(p: PlayerIndex): PlayerIndex {
  return p === 0 ? 1 : 0;
}

function knownBoard(state: GameState): Card[] {
  if (state.phase === "preflop") return [];
  const count = state.phase === "flop" ? 3 : state.phase === "turn" ? 4 : 5;
  return state.board.slice(0, Math.min(count, state.boardRevealed, state.board.length));
}

function handLabel(hole: [Card, Card]): string {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  if (a.rank === b.rank) return `${rankToChar(a.rank)}${rankToChar(b.rank)}`;
  return `${rankToChar(a.rank)}${rankToChar(b.rank)}${a.suit === b.suit ? "s" : "o"}`;
}

function hashCards(cards: readonly Card[], salt: number): number {
  let h = (0x811c9dc5 ^ salt) >>> 0;
  for (const c of cards) {
    h ^= c.rank * 17 + c.suit.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

function seededRng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

function preflopShoveWeight(hole: [Card, Card], effectiveStackBb: number): number {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  const pair = a.rank === b.rank;
  const suited = a.suit === b.suit;
  const gap = a.rank - b.rank;

  if (effectiveStackBb >= 40) {
    if (pair) {
      if (a.rank >= 12) return 1;
      if (a.rank === 11) return 0.72;
      if (a.rank === 10) return 0.22;
      if (a.rank === 9) return 0.08;
      return 0.012;
    }
    if (a.rank === 14 && b.rank === 13) return suited ? 0.86 : 0.58;
    if (a.rank === 14 && b.rank === 12) return suited ? 0.30 : 0.13;
    if (suited && a.rank === 13 && b.rank === 12) return 0.13;
    return 0.006;
  }

  if (effectiveStackBb >= 20) {
    if (pair) return a.rank >= 10 ? 1 : a.rank === 9 ? 0.68 : a.rank === 8 ? 0.38 : 0.16;
    if (a.rank === 14 && b.rank >= 11) return suited ? 0.95 : 0.66;
    if (a.rank === 13 && b.rank >= 11) return suited ? 0.55 : 0.24;
    if (suited && a.rank >= 11 && gap <= 2) return 0.30;
    return 0.035;
  }

  if (pair) return 0.58 + Math.max(0, a.rank - 2) * 0.035;
  if (a.rank === 14) return 0.38 + b.rank * 0.035 + (suited ? 0.16 : 0);
  if (a.rank >= 12 && b.rank >= 9) return 0.34 + (suited ? 0.20 : 0);
  if (suited && gap <= 2 && a.rank >= 7) return 0.38;
  return 0.12;
}

function postflopShoveWeight(hole: [Card, Card], board: readonly Card[]): number {
  const value = best5Of7([...hole, ...board]);
  if (value.rank >= 5) return 1;
  if (value.rank === 4) return 0.96;
  if (value.rank === 3) return 0.83;
  if (value.rank === 2) return 0.42;

  const all = [...hole, ...board];
  const suitCount = new Map<string, number>();
  for (const c of all) suitCount.set(c.suit, (suitCount.get(c.suit) ?? 0) + 1);
  const flushDraw = [...suitCount.values()].some((count) => count >= 4);
  const ranks = new Set(all.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  let straightDraw = false;
  for (let low = 1; low <= 10; low++) {
    let present = 0;
    for (let r = low; r < low + 5; r++) if (ranks.has(r)) present++;
    if (present >= 4) straightDraw = true;
  }
  if (flushDraw && straightDraw) return 0.62;
  if (flushDraw || straightDraw) return 0.36;
  return 0.07;
}

type WeightedHole = { hole: [Card, Card]; weight: number; cumulative: number };

function buildOpponentRange(
  hero: [Card, Card],
  board: readonly Card[],
  street: AllInCallDecision["street"],
  effectiveStackBb: number,
  state: GameState,
  opponentTemplateRemaining?: Readonly<Record<string, number>>,
): WeightedHole[] {
  const out: WeightedHole[] = [];
  let cumulative = 0;
  const weightFor = (hole: [Card, Card]): number => street === "preflop"
    ? preflopShoveWeight(hole, effectiveStackBb)
    : postflopShoveWeight(hole, board);

  if (opponentTemplateRemaining) {
    const blocked = new Set([...hero, ...board].map((card) => `${card.rank}:${card.suit}`));
    for (const template of getHandTemplatesForMode(state.gameMode)) {
      const remaining = opponentTemplateRemaining[template.id] ?? 0;
      if (remaining <= 0) continue;
      const holes = allConcreteHolesForTemplate(template).filter((hole) =>
        !blocked.has(`${hole[0].rank}:${hole[0].suit}`) &&
        !blocked.has(`${hole[1].rank}:${hole[1].suit}`),
      );
      if (holes.length === 0) continue;
      for (const hole of holes) {
        const weight = weightFor(hole) * remaining / holes.length;
        if (weight <= 0) continue;
        cumulative += weight;
        out.push({ hole, weight, cumulative });
      }
    }
    return out;
  }

  const deck = removeCards(makeDeck(), [...hero, ...board]);
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const hole: [Card, Card] = [deck[i]!, deck[j]!];
      const weight = weightFor(hole);
      if (weight <= 0) continue;
      cumulative += weight;
      out.push({ hole, weight, cumulative });
    }
  }
  return out;
}

function pickWeighted(range: readonly WeightedHole[], r: number): WeightedHole | null {
  const total = range.at(-1)?.cumulative ?? 0;
  if (total <= EPS) return null;
  const target = r * total;
  let lo = 0;
  let hi = range.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (range[mid]!.cumulative < target) lo = mid + 1;
    else hi = mid;
  }
  return range[lo] ?? null;
}

function estimateEquity(
  hero: [Card, Card],
  board: readonly Card[],
  range: readonly WeightedHole[],
  seed: number,
): { equity: number; samples: number } {
  const random = seededRng(seed);
  let score = 0;
  let samples = 0;
  for (let n = 0; n < SAMPLE_COUNT; n++) {
    const picked = pickWeighted(range, random());
    if (!picked) break;
    const runout = removeCards(makeDeck(), [...hero, ...board, ...picked.hole]);
    const needed = 5 - board.length;
    for (let i = 0; i < needed; i++) {
      const j = i + Math.floor(random() * (runout.length - i));
      [runout[i], runout[j]] = [runout[j]!, runout[i]!];
    }
    const fullBoard = [...board, ...runout.slice(0, needed)];
    const heroValue = best5Of7([...hero, ...fullBoard]);
    const opponentValue = best5Of7([...picked.hole, ...fullBoard]);
    const compared = compareHandValue(heroValue, opponentValue);
    score += compared > 0 ? 1 : compared === 0 ? 0.5 : 0;
    samples++;
  }
  return { equity: samples > 0 ? score / samples : 0, samples };
}

export function isFacingOpponentAllIn(state: GameState, aiSeat: PlayerIndex): boolean {
  const opponent = other(aiSeat);
  // The reducer only sets `isAllIn` after the call starts the runout. While the
  // decision is pending, the reliable signal is the shover's empty stack plus
  // a positive legal call amount.
  return state.chips[opponent]! <= EPS && effectiveCallPay(aiSeat, state) > EPS;
}

export function evaluateAllInCall(
  state: GameState,
  aiSeat: PlayerIndex,
  difficulty: AllInCallDifficulty,
  opponentTemplateRemaining?: Readonly<Record<string, number>>,
): AllInCallDecision | null {
  if (!isFacingOpponentAllIn(state, aiSeat)) return null;
  const hero = state.holes[aiSeat]?.hole;
  if (!hero) return null;
  if (!(state.phase === "preflop" || state.phase === "flop" || state.phase === "turn" || state.phase === "river")) {
    return null;
  }

  const opponent = other(aiSeat);
  const bb = resolveHandBlinds(state).bb;
  if (bb <= EPS) return null;
  const callAmount = effectiveCallPay(aiSeat, state);
  const potOdds = callAmount / Math.max(EPS, state.pot + callAmount);
  const investedChips = state.betting.contributed[aiSeat]!;
  const heroStreetStack = state.chips[aiSeat]! + investedChips;
  const opponentStreetStack = state.chips[opponent]! + state.betting.contributed[opponent]!;
  const effectiveStackBb = Math.min(heroStreetStack, opponentStreetStack) / bb;
  const board = knownBoard(state);
  const range = buildOpponentRange(
    hero,
    board,
    state.phase,
    effectiveStackBb,
    state,
    opponentTemplateRemaining,
  );
  const seed = hashCards([...hero, ...board], Math.round(state.pot * 100) + state.roundNumber * 31);
  const { equity, samples } = estimateEquity(hero, board, range, seed);

  const difficultyMargin: Record<AllInCallDifficulty, number> = {
    easy: 0.075,
    normal: 0.055,
    hard: 0.035,
    hell: 0.02,
  };
  const depthMargin = state.phase !== "preflop"
    ? 0.015
    : effectiveStackBb >= 40
      ? 0.045
      : effectiveStackBb >= 20
        ? 0.025
        : 0.005;
  const villainIsButton = opponent === state.button;
  const positionMargin = villainIsButton ? -0.008 : 0.008;
  const investedRatio = investedChips / Math.max(EPS, heroStreetStack);
  const investedAdjustment = Math.min(0.012, investedRatio * 0.02);
  const requiredEquity = Math.min(
    0.72,
    Math.max(0.05, potOdds + difficultyMargin[difficulty] + depthMargin + positionMargin - investedAdjustment),
  );
  const action = equity + EPS >= requiredEquity ? "call" : "fold";
  const reason = action === "call"
    ? `equity ${(equity * 100).toFixed(1)}% >= threshold ${(requiredEquity * 100).toFixed(1)}%`
    : `equity ${(equity * 100).toFixed(1)}% < threshold ${(requiredEquity * 100).toFixed(1)}%`;

  return {
    facingAllIn: true,
    action,
    street: state.phase,
    hand: state.holes[aiSeat]?.templateId ?? handLabel(hero),
    stackBb: state.chips[aiSeat]! / bb,
    effectiveStackBb,
    opponentAllInBb: state.betting.contributed[opponent]! / bb,
    callAmount,
    callAmountBb: callAmount / bb,
    potOdds,
    equity,
    requiredEquity,
    investedChips,
    investedBb: investedChips / bb,
    position: aiSeat === state.button ? "button" : "big-blind",
    samples,
    reason,
  };
}

export function actionForAllInCallDecision(
  decision: AllInCallDecision,
): { type: "PREFLOP_CALL" | "POSTFLOP_CALL" | "FOLD" } {
  if (decision.action === "fold") return { type: "FOLD" };
  return decision.street === "preflop"
    ? { type: "PREFLOP_CALL" }
    : { type: "POSTFLOP_CALL" };
}

export function debugAllInCallDecision(decision: AllInCallDecision): void {
  if (
    typeof window === "undefined" ||
    process.env.NODE_ENV !== "development" ||
    !loadMotionDebugEnabled()
  ) return;
  console.debug("[Holdem AI all-in call]", {
    hand: decision.hand,
    street: decision.street,
    stackBb: Number(decision.stackBb.toFixed(1)),
    effectiveStackBb: Number(decision.effectiveStackBb.toFixed(1)),
    opponentAllInBb: Number(decision.opponentAllInBb.toFixed(1)),
    callAmountBb: Number(decision.callAmountBb.toFixed(1)),
    investedBb: Number(decision.investedBb.toFixed(1)),
    position: decision.position,
    potOdds: `${(decision.potOdds * 100).toFixed(1)}%`,
    equity: `${(decision.equity * 100).toFixed(1)}%`,
    requiredEquity: `${(decision.requiredEquity * 100).toFixed(1)}%`,
    action: decision.action.toUpperCase(),
    reason: decision.reason,
    samples: decision.samples,
  });
}
