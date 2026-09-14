import type { Card } from "@/holdem/cards";
import { best5Of7, compareHandValue, evaluate5, type HandValue } from "@/holdem/pokerEval";

function combinations<T>(arr: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const acc: T[] = [];
  function go(start: number) {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]!);
      go(i + 1);
      acc.pop();
    }
  }
  go(0);
  return out;
}

/**
 * 정확히 holeUse장의 홀카드 + boardUse장의 보드카드만 사용하는 최선 5장 조합 평가(오마하 방식).
 * Extra Hand Mission(§12) 등 홀카드 사용 매수를 강제하는 specialRule에서 사용한다.
 */
export function bestHandExactUse(
  hole: readonly Card[],
  board: readonly Card[],
  holeUse: number,
  boardUse: number,
): HandValue {
  return bestHandExactUseDetailed(hole, board, holeUse, boardUse).value;
}

/**
 * bestHandExactUse와 같은 계산이지만 "실제로 사용한 홀카드"까지 돌려준다.
 *
 * 쇼다운 UI에서 홀 4장을 전부 보여주면 4장을 다 쓴 것처럼 보이므로(실제로는 정확히 2장만
 * 쓴다) 사용한 카드만 공개하는 데 쓴다.
 */
export function bestHandExactUseDetailed(
  hole: readonly Card[],
  board: readonly Card[],
  holeUse: number,
  boardUse: number,
): { value: HandValue; holeUsed: Card[] } {
  const holeCombos = combinations(hole, holeUse);
  const boardCombos = combinations(board, boardUse);
  let best: HandValue = { rank: 0, kickers: [] };
  let bestHole: Card[] = [];
  for (const h of holeCombos) {
    for (const b of boardCombos) {
      const v = evaluate5([...h, ...b]);
      if (compareHandValue(v, best) > 0) {
        best = v;
        bestHole = h;
      }
    }
  }
  return { value: best, holeUsed: bestHole };
}

/** 일반 텍사스 홀덤(홀 2장, 보드와 자유 조합) 최선 5장 — 기존 best5Of7 재사용 */
export function bestHandStandard(hole: readonly Card[], board: readonly Card[]): HandValue {
  return best5Of7([...hole, ...board]);
}
