import type { Card } from "./cards";
import { rankToChar } from "./cards";

/** 높을수록 강함. 비교는 [...kickers] 사전순 */
export type HandValue = {
  rank: number;
  kickers: number[];
};

const RANK_HIGH_CARD = 1;
const RANK_PAIR = 2;
const RANK_TWO_PAIR = 3;
const RANK_TRIPS = 4;
const RANK_STRAIGHT = 5;
const RANK_FLUSH = 6;
const RANK_FULL_HOUSE = 7;
const RANK_QUADS = 8;
const RANK_STRAIGHT_FLUSH = 9;

function sortRanksDesc(ranks: number[]): number[] {
  return [...ranks].sort((a, b) => b - a);
}

function evaluate5(cards: Card[]): HandValue {
  if (cards.length !== 5) {
    return { rank: 0, kickers: [] };
  }
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const rankCounts = new Map<number, number>();
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  const counts = [...rankCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  /** 애 휠 스트레이트 (A-2-3-4-5 = 5-high) */
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  const isWheel = uniq.includes(14) && uniq.includes(5) && uniq.includes(4) && uniq.includes(3) && uniq.includes(2);
  if (isWheel) {
    straightHigh = 5;
  } else {
    for (let i = 0; i <= uniq.length - 5; i++) {
      const slice = uniq.slice(i, i + 5);
      if (slice.length === 5 && slice[0]! - slice[4]! === 4) {
        straightHigh = slice[0]!;
        break;
      }
    }
  }

  const isStraight = straightHigh > 0;

  if (isStraight && isFlush) {
    return { rank: RANK_STRAIGHT_FLUSH, kickers: [straightHigh] };
  }
  if (counts[0]![1] === 4) {
    const quad = counts[0]![0];
    const kicker = counts[1]![0];
    return { rank: RANK_QUADS, kickers: [quad, kicker] };
  }
  if (counts[0]![1] === 3 && counts[1]![1] === 2) {
    return { rank: RANK_FULL_HOUSE, kickers: [counts[0]![0], counts[1]![0]] };
  }
  if (isFlush) {
    return { rank: RANK_FLUSH, kickers: sortRanksDesc(ranks) };
  }
  if (isStraight) {
    return { rank: RANK_STRAIGHT, kickers: [straightHigh] };
  }
  if (counts[0]![1] === 3) {
    const trip = counts[0]![0];
    const kickers = sortRanksDesc(ranks.filter((r) => r !== trip));
    return { rank: RANK_TRIPS, kickers: [trip, ...kickers.slice(0, 2)] };
  }
  if (counts[0]![1] === 2 && counts[1]![1] === 2) {
    const p1 = Math.max(counts[0]![0], counts[1]![0]);
    const p2 = Math.min(counts[0]![0], counts[1]![0]);
    const k = ranks.find((r) => r !== p1 && r !== p2)!;
    return { rank: RANK_TWO_PAIR, kickers: [p1, p2, k] };
  }
  if (counts[0]![1] === 2) {
    const p = counts[0]![0];
    const kickers = sortRanksDesc(ranks.filter((r) => r !== p));
    return { rank: RANK_PAIR, kickers: [p, ...kickers.slice(0, 3)] };
  }
  return { rank: RANK_HIGH_CARD, kickers: sortRanksDesc(ranks) };
}

function combinations5<T>(arr: T[], start: number, acc: T[], out: T[][]): void {
  if (acc.length === 5) {
    out.push([...acc]);
    return;
  }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]!);
    combinations5(arr, i + 1, acc, out);
    acc.pop();
  }
}

const SUIT_ORDER: Record<Card["suit"], number> = { s: 4, h: 3, d: 2, c: 1 };

function sortFiveLexDesc(a: Card[], b: Card[]): number {
  const sa = [...a].sort(
    (x, y) => y.rank - x.rank || SUIT_ORDER[y.suit] - SUIT_ORDER[x.suit],
  );
  const sb = [...b].sort(
    (x, y) => y.rank - x.rank || SUIT_ORDER[y.suit] - SUIT_ORDER[x.suit],
  );
  for (let i = 0; i < 5; i++) {
    const dr = sa[i]!.rank - sb[i]!.rank;
    if (dr !== 0) return dr;
    const ds = SUIT_ORDER[sa[i]!.suit] - SUIT_ORDER[sb[i]!.suit];
    if (ds !== 0) return ds;
  }
  return 0;
}

function bestFiveFrom7Internal(cards: Card[]): { value: HandValue; five: Card[] } {
  const outs: Card[][] = [];
  combinations5(cards, 0, [], outs);
  let best: HandValue = { rank: 0, kickers: [] };
  let bestFive: Card[] = [];
  for (const five of outs) {
    const v = evaluate5(five);
    const cmp = compareHandValue(v, best);
    if (cmp > 0) {
      best = v;
      bestFive = five;
    } else if (cmp === 0) {
      if (bestFive.length === 0 || sortFiveLexDesc(five, bestFive) > 0) {
        bestFive = five;
      }
    }
  }
  return { value: best, five: bestFive };
}

/** 7장 중 최선 5장 값 */
export function best5Of7(cards: Card[]): HandValue {
  return bestFiveFrom7Internal(cards).value;
}

/** 승부에 사용된 실제 5장 (동률 후보는 렉시코그래픽으로 고정) */
export function bestFiveCardsFromSeven(cards: Card[]): Card[] {
  return bestFiveFrom7Internal(cards).five;
}

export function compareHandValue(a: HandValue, b: HandValue): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    const d = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function handValueLabel(v: HandValue): string {
  const names: Record<number, string> = {
    [RANK_HIGH_CARD]: "하이카드",
    [RANK_PAIR]: "원페어",
    [RANK_TWO_PAIR]: "투페어",
    [RANK_TRIPS]: "트립스",
    [RANK_STRAIGHT]: "스트레이트",
    [RANK_FLUSH]: "플러시",
    [RANK_FULL_HOUSE]: "풀하우스",
    [RANK_QUADS]: "포카드",
    [RANK_STRAIGHT_FLUSH]: "스트레이트 플러시",
  };
  return names[v.rank] ?? "알 수 없음";
}

/** 쇼다운·UI용 — 핵심 랭크·첫 키커만 (예: 원페어 A (키커 Q)) */
export function handValueSummaryKorean(v: HandValue): string {
  const k = v.kickers;
  switch (v.rank) {
    case RANK_HIGH_CARD:
      return k.length >= 2
        ? `하이카드 ${rankToChar(k[0]!)} (키커 ${rankToChar(k[1]!)})`
        : `하이카드 ${rankToChar(k[0]!)}`;
    case RANK_PAIR:
      return k.length >= 2
        ? `원페어 ${rankToChar(k[0]!)} (키커 ${rankToChar(k[1]!)})`
        : `원페어 ${rankToChar(k[0]!)}`;
    case RANK_TWO_PAIR:
      return `투페어 ${rankToChar(k[0]!)} & ${rankToChar(k[1]!)} (키커 ${rankToChar(
        k[2]!,
      )})`;
    case RANK_TRIPS:
      return k.length >= 2
        ? `트립스 ${rankToChar(k[0]!)} (키커 ${rankToChar(k[1]!)})`
        : `트립스 ${rankToChar(k[0]!)}`;
    case RANK_STRAIGHT:
      return `스트레이트 (탑 ${rankToChar(k[0]!)})`;
    case RANK_FLUSH:
      return `플러시 (탑 ${rankToChar(k[0]!)})`;
    case RANK_FULL_HOUSE:
      return `풀하우스 ${rankToChar(k[0]!)} · ${rankToChar(k[1]!)}`;
    case RANK_QUADS:
      return k.length >= 2
        ? `포카드 ${rankToChar(k[0]!)} (키커 ${rankToChar(k[1]!)})`
        : `포카드 ${rankToChar(k[0]!)}`;
    case RANK_STRAIGHT_FLUSH:
      return `스트레이트 플러시 (탑 ${rankToChar(k[0]!)})`;
    default:
      return handValueLabel(v);
  }
}

/** 쇼다운 요약 한 줄 — 숫자·Kicker 중심 (예: 투페어 (9,8) · Kicker Q) */
export function handValueShowdownConciseKorean(v: HandValue): string {
  const k = v.kickers;
  const rc = (r: number) => rankToChar(r);
  switch (v.rank) {
    case RANK_HIGH_CARD:
      return k.length >= 2
        ? `하이 (${rc(k[0]!)}) · Kicker ${rc(k[1]!)}`
        : `하이 (${rc(k[0]!)})`;
    case RANK_PAIR:
      return k.length >= 2
        ? `원페어 (${rc(k[0]!)}) · Kicker ${rc(k[1]!)}`
        : `원페어 (${rc(k[0]!)})`;
    case RANK_TWO_PAIR:
      return `투페어 (${rc(k[0]!)},${rc(k[1]!)}) · Kicker ${rc(k[2]!)}`;
    case RANK_TRIPS:
      return k.length >= 2
        ? `트립스 (${rc(k[0]!)}) · Kicker ${rc(k[1]!)}`
        : `트립스 (${rc(k[0]!)})`;
    case RANK_STRAIGHT:
      return `스트레이트 (${rc(k[0]!)})`;
    case RANK_STRAIGHT_FLUSH:
      return `SF (${rc(k[0]!)})`;
    case RANK_FLUSH:
      return `플러시 · 탑 ${rc(k[0]!)}`;
    case RANK_FULL_HOUSE:
      return `풀 하우스 (${rc(k[0]!)}/${rc(k[1]!)})`;
    case RANK_QUADS:
      return k.length >= 2
        ? `포카드 (${rc(k[0]!)}) · Kicker ${rc(k[1]!)}`
        : `포카드 (${rc(k[0]!)})`;
    default:
      return handValueSummaryKorean(v);
  }
}

/** handValueSummaryKorean과 동일 (기존 import 호환) */
export function handValueDetailKorean(v: HandValue): string {
  return handValueSummaryKorean(v);
}

/** winner vs loser 기준 한 줄 비교 (무승부면 null) */
export function showdownComparisonLineKorean(
  winner: HandValue,
  loser: HandValue,
): string | null {
  const cmp = compareHandValue(winner, loser);
  if (cmp === 0) {
    return "세부 카드까지 동일해 무승부(팟 분배)입니다.";
  }
  if (cmp < 0) return null;

  if (winner.rank !== loser.rank) {
    return `${handValueLabel(winner)}이(가) ${handValueLabel(loser)}보다 상위 족보입니다.`;
  }

  const name = handValueLabel(winner);
  const wk = winner.kickers;
  const lk = loser.kickers;

  for (let i = 0; i < Math.max(wk.length, lk.length); i++) {
    const wr = wk[i] ?? 0;
    const lr = lk[i] ?? 0;
    if (wr === lr) continue;
    const wc = rankToChar(wr);
    const lc = rankToChar(lr);

    switch (winner.rank) {
      case RANK_PAIR:
        if (i === 0) return `페어 랭크 ${wc}(이)가 ${lc}보다 높아 승리`;
        if (i === 1) {
          return `같은 원페어(${rankToChar(wk[0]!)})이지만 키커 ${wc}에서 승리`;
        }
        return `같은 원페어·동일 키커 ${i}단계에서 ${wc}가 ${lc}보다 높아 승리`;
      case RANK_TWO_PAIR:
        if (i === 0) return `높은 페어 ${wc}이(가) ${lc}보다 높아 승리`;
        if (i === 1) return `윗 페어 동일, 아래 페어 ${wc}에서 승리`;
        if (i === 2) return `투페어 구성 동일, 키커 ${wc}에서 승리`;
        break;
      case RANK_TRIPS:
        if (i === 0) return `트립스 ${wc}이(가) ${lc}보다 높아 승리`;
        return `같은 트립스이지만 키커 ${wc}에서 승리`;
      case RANK_STRAIGHT:
      case RANK_STRAIGHT_FLUSH:
        return `같은 족보, 스트레이트 최상단 ${wc}이(가) ${lc}보다 높아 승리`;
      case RANK_FLUSH:
        return `플러시 동일 구성군, ${i + 1}번째 높은 카드 ${wc}이(가) ${lc}보다 높아 승리`;
      case RANK_FULL_HOUSE:
        if (i === 0) return `풀하우스 트립 ${wc}이(가) ${lc}보다 높아 승리`;
        if (i === 1) return `트립 동일, 풀 페어 ${wc}에서 승리`;
        break;
      case RANK_QUADS:
        if (i === 0) return `포카드 ${wc}이(가) ${lc}보다 높아 승리`;
        if (i === 1) return `같은 포카드, 키커 ${wc}에서 승리`;
        break;
      case RANK_HIGH_CARD:
        return `${i + 1}번째 하이카드 ${wc}이(가) ${lc}보다 높아 승리`;
      default:
        break;
    }
    return `${name} — ${i + 1}번째 결정 랭크 ${wc}이(가) ${lc}보다 높아 승리`;
  }
  return `${name}에서 키커 비교로 승리`;
}

/** 홀 2장만 — 프리플랍 표시용 */
function bestHandFromHole2(hole: [Card, Card]): HandValue {
  const [a, b] = hole;
  if (a.rank === b.rank) {
    return { rank: RANK_PAIR, kickers: [a.rank] };
  }
  return { rank: RANK_HIGH_CARD, kickers: sortRanksDesc([a.rank, b.rank]) };
}

/** 보드 일부 + 홀로 현재 만들 수 있는 최선 족보 라벨 (UI용) */
export function currentMadeHandLabel(
  hole: [Card, Card],
  board: Card[],
  boardRevealed: number,
): string {
  const used = board.slice(0, boardRevealed);
  const all = [...hole, ...used];
  if (all.length < 2) return "";
  if (used.length === 0) {
    return handValueLabel(bestHandFromHole2(hole));
  }
  return handValueLabel(best5Of7(all));
}

/** showdown: 승자 인덱스들 (동률이면 둘 다) */
export function showdownWinners(
  holes: [[Card, Card], [Card, Card]],
  board: Card[],
): { winners: (0 | 1)[]; p0: HandValue; p1: HandValue } {
  const p0v = best5Of7([...holes[0]!, ...board]);
  const p1v = best5Of7([...holes[1]!, ...board]);
  const c = compareHandValue(p0v, p1v);
  if (c > 0) return { winners: [0], p0: p0v, p1: p1v };
  if (c < 0) return { winners: [1], p0: p0v, p1: p1v };
  return { winners: [0, 1], p0: p0v, p1: p1v };
}
