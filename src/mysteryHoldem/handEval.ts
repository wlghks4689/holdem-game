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
  const holeCombos = combinations(hole, holeUse);
  const boardCombos = combinations(board, boardUse);
  let best: HandValue = { rank: 0, kickers: [] };
  for (const h of holeCombos) {
    for (const b of boardCombos) {
      const v = evaluate5([...h, ...b]);
      if (compareHandValue(v, best) > 0) best = v;
    }
  }
  return best;
}

/** 일반 텍사스 홀덤(홀 2장, 보드와 자유 조합) 최선 5장 — 기존 best5Of7 재사용 */
export function bestHandStandard(hole: readonly Card[], board: readonly Card[]): HandValue {
  return best5Of7([...hole, ...board]);
}
