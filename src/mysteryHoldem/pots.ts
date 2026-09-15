import type { Pot, Seat } from "./types";

export interface PotContributor {
  seat: Seat;
  /** 이번 핸드 전체 기여 칩(스트리트 합산) */
  amount: number;
  folded: boolean;
}

export interface UncalledRefund {
  seat: Seat;
  amount: number;
}

/**
 * 아무도 매칭하지 않은 초과 베팅을 팟 구성 **전에** 떼어낸다(§24).
 *
 * 최고 기여자가 두 번째 기여자보다 많이 넣었다면, 그 차액은 겨룰 상대가 없는 돈이다.
 * 그대로 두면 "자기 혼자만 참가 자격이 있는 사이드 팟"이 생겨, UI에 있지도 않은 승부가
 * 하나 더 있는 것처럼 보인다(실측: 5,000/8,000 올인 상대로 15,000을 넣으면 7,000짜리
 * 1인 사이드 팟이 생겼다).
 *
 * 폴드한 플레이어가 넣은 돈도 "이미 매칭된 돈"으로 친다 — 팟에 남아야 하기 때문이다.
 * 최고액이 동률이면 서로가 서로를 매칭한 것이므로 반환할 초과분이 없다.
 */
export function withdrawUncalledExcess(contributors: readonly PotContributor[]): {
  contributors: PotContributor[];
  refunds: UncalledRefund[];
} {
  const live = contributors.filter((c) => c.amount > 1e-9);
  if (live.length < 2) {
    // 기여자가 하나뿐이면 매칭한 상대가 아예 없다 — 전액이 초과분이다.
    const only = live[0];
    if (only == null) return { contributors: contributors.map((c) => ({ ...c })), refunds: [] };
    return {
      contributors: contributors.map((c) => (c.seat === only.seat ? { ...c, amount: 0 } : { ...c })),
      refunds: [{ seat: only.seat, amount: round2(only.amount) }],
    };
  }

  const sorted = [...live].sort((a, b) => b.amount - a.amount);
  const top = sorted[0]!;
  const second = sorted[1]!;
  const excess = round2(top.amount - second.amount);
  if (excess <= 1e-9) return { contributors: contributors.map((c) => ({ ...c })), refunds: [] };

  return {
    contributors: contributors.map((c) =>
      c.seat === top.seat ? { ...c, amount: round2(c.amount - excess) } : { ...c },
    ),
    refunds: [{ seat: top.seat, amount: excess }],
  };
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
