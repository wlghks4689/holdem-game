import type { Pot, Seat } from "./types";

export interface PotContributor {
  seat: Seat;
  /** 이번 핸드 전체 기여 칩(스트리트 합산) */
  amount: number;
  folded: boolean;
}

/**
 * 플레이어별 핸드 기여액을 기준으로 Main Pot / Side Pot들을 만든다(§24).
 *
 * 표준 레이어링 알고리즘: 기여액을 오름차순으로 "층"을 나누고, 각 층에는
 * 그 층까지 기여한 모든 플레이어(폴드 포함)의 몫이 들어가되, 폴드한 플레이어는
 * eligibleSeats에서 제외된다. 인접한 두 층의 eligibleSeats가 동일하면 하나로 합친다.
 */
export function buildPots(contributors: readonly PotContributor[], deadChips = 0): Pot[] {
  const remaining = contributors
    .filter((c) => c.amount > 1e-9)
    .map((c) => ({ ...c }));

  const layers: Pot[] = [];
  while (remaining.some((c) => c.amount > 1e-9)) {
    const layerContributors = remaining.filter((c) => c.amount > 1e-9);
    const min = Math.min(...layerContributors.map((c) => c.amount));
    const amount = round2(min * layerContributors.length);
    const eligibleSeats = layerContributors.filter((c) => !c.folded).map((c) => c.seat);
    layers.push({ amount, eligibleSeats });
    for (const c of layerContributors) c.amount = round2(c.amount - min);
  }

  const merged = mergeAdjacentSameEligibility(layers);

  // Big Blind Ante 같은 데드머니는 특정 좌석의 몫이 아니므로 계층을 만들지 않고
  // 메인 팟에 그대로 얹는다. 계층으로 만들면 그 돈을 낸 좌석만 자격을 갖게 된다.
  if (deadChips > 1e-9) {
    if (merged.length > 0) {
      merged[0]!.amount = round2(merged[0]!.amount + deadChips);
    } else {
      // 아무도 베팅하지 않은(있을 수 없지만) 상황 — 앤티만 남는다.
      merged.push({ amount: round2(deadChips), eligibleSeats: [] });
    }
  }

  return merged;
}

function mergeAdjacentSameEligibility(pots: Pot[]): Pot[] {
  const merged: Pot[] = [];
  for (const pot of pots) {
    const prev = merged[merged.length - 1];
    if (prev && sameSeats(prev.eligibleSeats, pot.eligibleSeats)) {
      prev.amount = round2(prev.amount + pot.amount);
    } else {
      merged.push({ amount: pot.amount, eligibleSeats: [...pot.eligibleSeats] });
    }
  }
  return merged;
}

function sameSeats(a: readonly Seat[], b: readonly Seat[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function totalPotAmount(pots: readonly Pot[]): number {
  return round2(pots.reduce((sum, p) => sum + p.amount, 0));
}
