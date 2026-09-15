import type { Card } from "@/holdem/cards";
import {
  rolesFromBestFive,
  standardShowdownBestFive,
  type ShowdownBestFive,
} from "@/holdem/showdownFocus";
import type { MadeHandFxKind } from "@/holdem/pokerEval";
import { bestHandExactUseDetailed } from "./handEval";
import { specialRuleFor } from "./specialRules";
import type { MysteryGameMessage, PlayerState, Seat } from "./types";

/**
 * 쇼다운 연출의 주인공을 정하는 "표현용 모델"(§11).
 *
 * 멀티웨이에서 사이드 팟 승자까지 전부 강하게 강조하면, 서로 다른 BEST 5가 동시에
 * 번쩍여서 어느 것이 이 핸드의 승부였는지 읽히지 않는다. 보드 강조의 기준은 **메인 팟
 * 승자** 하나로 고정한다. 사이드 팟 결과는 로그와 배지로 따로 전달한다.
 *
 * 승자가 누구인지는 여기서 다시 계산하지 않는다 — awardPots가 정한 결과(로그에 실린 값)를
 * 그대로 받는다. UI가 족보를 다시 비교하면 Forced Split 같은 규칙이 조용히 덮어써진다.
 */

export interface MainPotResult {
  winners: Seat[];
  forcedSplit: boolean;
  amount: number;
  potCount: number;
}

/**
 * 이번 핸드의 메인 팟 결과를 로그에서 읽는다.
 *
 * buildPots는 기여 레이어가 낮은 순서로 팟을 만들므로 potIndex 0이 언제나 메인 팟이다
 * (§10. "금액이 가장 큰 팟"이 메인이라고 추론하면 안 된다 — 사이드 팟이 더 클 수 있다).
 */
export function mainPotResultFromLogs(
  logs: readonly MysteryGameMessage[],
): MainPotResult | null {
  let start = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i]!.t === "round_start") {
      start = i;
      break;
    }
  }
  for (let i = start; i < logs.length; i++) {
    const log = logs[i]!;
    if (log.t !== "showdown" || log.potIndex !== 0) continue;
    return {
      winners: [...log.winners],
      forcedSplit: log.forcedSplit,
      amount: log.potAmount,
      potCount: log.potCount,
    };
  }
  return null;
}

/**
 * 한 플레이어의 BEST 5. Four Card 보유자는 홀 정확히 2장 + 보드 3장 규칙을 따른다.
 *
 * UI 편의를 위해 일반 7장 평가기를 쓰면 규칙에 없는 조합(홀 1장 + 보드 4장 등)이
 * 강조되어, 화면이 규칙과 다른 이야기를 하게 된다.
 */
export function playerShowdownBestFive(
  player: PlayerState,
  board: readonly Card[],
): ShowdownBestFive {
  const rule = specialRuleFor(player.mission?.def.specialRule);
  if (rule != null && player.holeCards.length === rule.finalHoleCardCount) {
    const d = bestHandExactUseDetailed(player.holeCards, board, rule.showdownHoleCardCount, 5 - rule.showdownHoleCardCount);
    return rolesFromBestFive(d.fiveCards, player.holeCards, d.value);
  }
  return standardShowdownBestFive(player.holeCards, board);
}

export interface MainPotShowdownFocus {
  winnerSeats: Seat[];
  forcedSplit: boolean;
  amount: number;
  /** 승자들의 BEST 5 커뮤니티 카드 합집합 */
  boardUsedKeys: Set<string>;
  /** 좌석별 BEST 5 홀카드 — 공동 승자는 각자 자기 조합으로 표시한다 */
  holeUsedBySeat: Map<Seat, Set<string>>;
  /**
   * 보드 글로우에 쓸 족보.
   *
   * Forced Split은 족보가 서로 다른 사람들이 함께 승자가 되므로, 그중 한 명의 족보색으로
   * 보드를 물들이면 "그 사람이 진짜 승자"처럼 읽힌다. 그때는 중립색을 쓴다.
   */
  fxKind: MadeHandFxKind;
}

export function showdownFocusForMainPot(
  main: MainPotResult | null,
  players: readonly PlayerState[],
  board: readonly Card[],
): MainPotShowdownFocus | null {
  if (main == null || main.winners.length === 0) return null;
  // 보드 5장이 다 열리기 전에는 "승부에 쓰인 5장"이 확정되지 않는다.
  if (board.length < 5) return null;

  const boardUsedKeys = new Set<string>();
  const holeUsedBySeat = new Map<Seat, Set<string>>();
  let fxKind: MadeHandFxKind = "none";

  for (const seat of main.winners) {
    const p = players.find((x) => x.seat === seat);
    if (p == null || p.holeCards.length === 0) continue;
    const best = playerShowdownBestFive(p, board);
    holeUsedBySeat.set(seat, best.holeUsedKeys);
    for (const k of best.boardUsedKeys) boardUsedKeys.add(k);
    // 일반 타이는 족보가 같으므로 누구 것을 쓰든 동일하다.
    if (!main.forcedSplit) fxKind = best.fxKind;
  }

  if (holeUsedBySeat.size === 0) return null;
  return {
    winnerSeats: [...main.winners],
    forcedSplit: main.forcedSplit,
    amount: main.amount,
    boardUsedKeys,
    holeUsedBySeat,
    fxKind: main.forcedSplit ? "none" : fxKind,
  };
}
