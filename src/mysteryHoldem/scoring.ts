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
  totalPoint: number;
}

/** Total Point = Chip Point + Mission Point + Bounty Point (§19, §20) */
export function scoreBreakdownFor(p: PlayerState): PlayerScoreBreakdown {
  const chipPoint = chipPointFromChips(p.chips);
  const totalPoint = chipPoint + p.missionPoint + p.bountyPoint;
  return { seat: p.seat, chipPoint, missionPoint: p.missionPoint, bountyPoint: p.bountyPoint, totalPoint };
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

/** §21-A: 15라운드 정상 종료 — Total Point 최댓값 동률이면 무승부(§22, 추가 타이브레이커 없음) */
export function resolveRoundLimitResult(players: readonly PlayerState[]): MatchResult {
  const scores = scoreBreakdownForAll(players);
  const maxTotal = Math.max(...scores.map((s) => s.totalPoint));
  const winners = scores
    .filter((s) => Math.abs(s.totalPoint - maxTotal) < 1e-9)
    .map((s) => s.seat);
  return {
    reason: "round_limit",
    winners,
    scores,
    isDraw: winners.length > 1,
  };
}

/** §21-B: Last Player Standing — 점수 비교 없이 즉시 승리(무승부 개념 없음) */
export function resolveLastPlayerStandingResult(
  players: readonly PlayerState[],
  survivorSeat: Seat,
): MatchResult {
  const scores = scoreBreakdownForAll(players);
  return {
    reason: "last_player_standing",
    winners: [survivorSeat],
    scores,
    isDraw: false,
  };
}
