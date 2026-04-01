/**
 * Hell 포스트플랍: 보드·실제 메이드 핸드·드로우·텍스처를 반영한 효과 티어(1~5).
 */
import type { Card } from "./cards";
import { best5Of7, type HandValue } from "./pokerEval";
import type { GameState, PlayerIndex } from "./types";

const RANK_HIGH = 1;
const RANK_PAIR = 2;
const RANK_TWO_PAIR = 3;
const RANK_TRIPS = 4;
const RANK_STRAIGHT = 5;
const RANK_FLUSH = 6;
const RANK_FULL = 7;
const RANK_QUADS = 8;
const RANK_STRFL = 9;

export type HellPostflopSnapshot = {
  /** 1..5 — 템플릿 티어와 동일 스케일 */
  madeTier: number;
  /** 0..1 드로우 가중(플랍/턴만有意義) */
  drawWeight: number;
  /** 0 dry .. 1 wet */
  boardWetness: number;
};

function visibleBoard(state: GameState): Card[] {
  const n = Math.min(state.boardRevealed, state.board.length);
  return state.board.slice(0, n);
}

function handValueToMadeTier(v: HandValue): number {
  const k = v.kickers;
  switch (v.rank) {
    case RANK_STRFL:
    case RANK_QUADS:
      return 5;
    case RANK_FULL:
    case RANK_FLUSH:
    case RANK_STRAIGHT:
      return 5;
    case RANK_TRIPS:
      return k[0] != null && k[0] >= 10 ? 5 : 4;
    case RANK_TWO_PAIR:
      return 4;
    case RANK_PAIR:
      return k[0] != null && k[0] >= 11 ? 4 : k[0] != null && k[0] >= 9 ? 3 : 2;
    case RANK_HIGH:
    default: {
      const hi = k[0] ?? 0;
      if (hi >= 13) return 2;
      if (hi >= 11) return 2;
      return 1;
    }
  }
}

function countSuitHistogram(cards: Card[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) {
    m.set(c.suit, (m.get(c.suit) ?? 0) + 1);
  }
  return m;
}

/** 4장 이상 같은 수트 = 플러시 드로우 가능 구간 */
function hasFourFlushDraw(hole: [Card, Card], board: Card[]): boolean {
  const all = [...hole, ...board];
  for (const n of countSuitHistogram(all).values()) {
    if (n >= 4) return true;
  }
  return false;
}

/** 보드에 페어 이상 */
function boardPaired(board: Card[]): boolean {
  const r = new Map<number, number>();
  for (const c of board) {
    r.set(c.rank, (r.get(c.rank) ?? 0) + 1);
  }
  for (const n of r.values()) {
    if (n >= 2) return true;
  }
  return false;
}

/** 정렬 랭크 간 최대 인접 갭이 2 이하이면 커넥티드 */
function boardConnectivityWetness(board: Card[]): number {
  if (board.length < 3) return 0;
  const u = [...new Set(board.map((c) => c.rank))].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < u.length; i++) {
    maxGap = Math.max(maxGap, u[i]! - u[i - 1]!);
  }
  if (maxGap <= 4) return 0.35;
  if (maxGap <= 6) return 0.2;
  return 0.08;
}

function monotoneWetness(board: Card[]): number {
  const hist = countSuitHistogram(board);
  let m = 0;
  for (const n of hist.values()) m = Math.max(m, n);
  if (m >= 3) return 0.45;
  if (m === 2) return 0.15;
  return 0;
}

export function analyzeHellBoardTexture(board: Card[]): number {
  if (board.length < 3) return 0;
  return Math.min(
    1,
    monotoneWetness(board) +
      boardConnectivityWetness(board) +
      (boardPaired(board) ? 0.12 : 0),
  );
}

/**
 * 오픈엔드 스트레이트 드로우(간이): 홀+보드 5장 이상에서 연속 4랭크 찾기
 */
function hasOpenEndedStraightDraw(hole: [Card, Card], board: Card[]): boolean {
  const ranks = [...new Set([hole[0]!.rank, hole[1]!.rank, ...board.map((c) => c.rank)])].sort(
    (a, b) => a - b,
  );
  for (let i = 0; i <= ranks.length - 4; i++) {
    const a = ranks[i]!;
    if (ranks[i + 1] === a + 1 && ranks[i + 2] === a + 2 && ranks[i + 3] === a + 3) {
      return true;
    }
  }
  /* A-2-3-4 휠 일부 */
  if (ranks.includes(14) && ranks.includes(2) && ranks.includes(3) && ranks.includes(4)) {
    return true;
  }
  return false;
}

export function analyzeHellPostflopStrength(
  state: GameState,
  seat: PlayerIndex,
): HellPostflopSnapshot | null {
  if (
    state.phase !== "flop" &&
    state.phase !== "turn" &&
    state.phase !== "river"
  ) {
    return null;
  }
  const sel = state.holes[seat];
  if (!sel) return null;
  const board = visibleBoard(state);
  if (board.length < 3) return null;

  const hv = best5Of7([...sel.hole, ...board]);
  let madeTier = handValueToMadeTier(hv);

  const boardWetness = analyzeHellBoardTexture(board);

  let drawWeight = 0;
  if (state.phase === "flop" || state.phase === "turn") {
    if (hasFourFlushDraw(sel.hole, board)) drawWeight += 0.38;
    if (hasOpenEndedStraightDraw(sel.hole, board)) drawWeight += 0.28;
    drawWeight = Math.min(1, drawWeight);
    /* 드로우 + 텍스처: 티어 소폭 상승(최대 +2) */
    const lift = Math.min(
      2,
      Math.round(drawWeight * 1.6 + boardWetness * 0.8),
    );
    madeTier = Math.min(5, madeTier + lift);
  }

  return { madeTier, drawWeight, boardWetness };
}

/**
 * 템플릿 티어와 보드 분석을 혼합해 포스트플랍 의사결정용 티어(1~5).
 */
export function hellBlendPostflopTier(
  templateTier: number,
  snap: HellPostflopSnapshot | null,
): number {
  if (snap == null) return Math.max(1, Math.min(5, templateTier));
  const t = templateTier;
  const b = snap.madeTier;
  const w = snap.boardWetness;
  /* madeTier에 드로우 보정이 이미 들어가 있음 — 템플릿과 혼합만 */
  const blended =
    0.34 * t +
    0.66 * b +
    snap.drawWeight * 0.1 * (1 + w * 0.45);
  return Math.max(1, Math.min(5, Math.round(blended)));
}
