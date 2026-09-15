import { MYSTERY_HOLDEM_CONFIG } from "./config";
import type { PlayerState, Seat } from "./types";

/** Chip Point = 보유 Chips / chipPointDivisor(§19-1) */
export function chipPointFromChips(chips: number, divisor = MYSTERY_HOLDEM_CONFIG.chipPointDivisor): number {
  return chips / divisor;
}

export interface PlayerScoreBreakdown {
  seat: Seat;
  chipPoint: number;
  missionPoint: number;
  bountyPoint: number;
  /** 매치 종료 시 생존 상위 3인에게만 붙는 보너스. 진행 중에는 항상 0이다. */
  survivalPoint: number;
  totalPoint: number;
}

/** Total Point = Chip Point + Mission Point + Bounty Point + Survival Point */
export function scoreBreakdownFor(p: PlayerState): PlayerScoreBreakdown {
  const chipPoint = chipPointFromChips(p.chips);
  const totalPoint = chipPoint + p.missionPoint + p.bountyPoint + p.survivalPoint;
  return {
    seat: p.seat,
    chipPoint,
    missionPoint: p.missionPoint,
    bountyPoint: p.bountyPoint,
    survivalPoint: p.survivalPoint,
    totalPoint,
  };
}

/**
 * 생존 점수 지급액(등수별). 시작 인원이 많을수록 크다.
 *
 * 10명 중 끝까지 남는 것과 3명 중 남는 것은 난도가 다르다. 확률로 보면 상위 3위 안에 들
 * 확률이 3/n이므로, 기대값을 테이블 크기와 무관하게 비슷하게 유지하려면 지급액이 인원에
 * 비례해야 한다. 10단위로 정리해 점수표에서 읽기 쉽게 한다.
 */
export function survivalRewardForRank(
  rank: 1 | 2 | 3,
  initialSeatCount: number,
  config = MYSTERY_HOLDEM_CONFIG,
): number {
  const perSeat = config.survivalRewardPerSeat;
  const base = rank === 1 ? perSeat.first : rank === 2 ? perSeat.second : perSeat.third;
  return Math.round((base * initialSeatCount) / 10) * 10;
}

/**
 * 매치 종료 시점의 생존 점수를 좌석별로 계산한다.
 *
 * "생존" 점수이므로 버스트한 플레이어는 받지 못한다. 살아남은 사람들끼리 Total Point(생존
 * 점수 제외) 순으로 줄을 세워 위에서 3명까지 지급한다. 그래서 1위가 전원을 버스트시켜
 * 끝난 매치에서는 생존자가 자기 하나뿐이라 2·3위 몫이 자연히 사라진다.
 */
export function survivalPointsBySeat(
  players: readonly PlayerState[],
  initialSeatCount: number,
  config = MYSTERY_HOLDEM_CONFIG,
): Map<Seat, number> {
  const ranked = players
    .filter((p) => !p.busted)
    .map((p) => ({ seat: p.seat, base: chipPointFromChips(p.chips) + p.missionPoint + p.bountyPoint }))
    .sort((a, b) => b.base - a.base);

  const out = new Map<Seat, number>();
  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    out.set(ranked[i]!.seat, survivalRewardForRank((i + 1) as 1 | 2 | 3, initialSeatCount, config));
  }
  return out;
}

export function scoreBreakdownForAll(players: readonly PlayerState[]): PlayerScoreBreakdown[] {
  return players.map(scoreBreakdownFor);
}

export interface MatchResult {
  reason: "round_limit" | "last_player_standing";
  winners: Seat[];
  scores: PlayerScoreBreakdown[];
  /** round_limit 종료이면서 최고점 동률이면 true(무승부, §22) */
  isDraw: boolean;
}

/**
 * 매치 승자 판정.
 *
 * 최후 1인이 남아 끝나든 15라운드를 다 채우든, 승자는 언제나 **Total Point 최고점**이다.
 * 예전에는 최후 1인이 점수와 무관하게 즉시 승리했는데, 그러면 Mystery Card와 Bounty로
 * 쌓은 점수가 "칩을 다 먹으면 어차피 무의미"해져 게임의 절반이 장식이 된다.
 *
 * 다만 최후 1인은 테이블의 칩을 전부 들고 있어 Chip Point가 압도적이므로, 실제로는 대개
 * 그대로 1위가 된다 — 바뀌는 것은 "자동 승리"가 아니라 "점수로 이긴다"는 점이다.
 *
 * 동률이면 추가 타이브레이커 없이 무승부다(§22).
 */
function resolveByTotalPoint(
  players: readonly PlayerState[],
  reason: MatchResult["reason"],
): MatchResult {
  const scores = scoreBreakdownForAll(players);
  const maxTotal = Math.max(...scores.map((s) => s.totalPoint));
  const winners = scores
    .filter((s) => Math.abs(s.totalPoint - maxTotal) < 1e-9)
    .map((s) => s.seat);
  return { reason, winners, scores, isDraw: winners.length > 1 };
}

/** 15라운드 정상 종료 */
export function resolveRoundLimitResult(players: readonly PlayerState[]): MatchResult {
  return resolveByTotalPoint(players, "round_limit");
}

/** 최후 1인이 남아 종료 — 자동 승리가 아니라 점수 비교로 승자를 가린다 */
export function resolveLastPlayerStandingResult(players: readonly PlayerState[]): MatchResult {
  return resolveByTotalPoint(players, "last_player_standing");
}
