import type { Card } from "@/holdem/cards";
import type { HoldemUiLocale } from "@/holdem/holdemPrefs";
import {
  best5Of7,
  compareHandValue,
  currentCompactHandLabel,
  handValueShowdownConciseForLocale,
  type HandValue,
} from "@/holdem/pokerEval";
import type { PlayerIndex } from "@/holdem/types";

export type ShowdownResultPresentation = {
  values: [HandValue, HandValue];
  labels: [string, string];
  comparison: number;
  split: boolean;
  winner: PlayerIndex | null;
};

export function buildShowdownResultPresentation(
  holes: [[Card, Card], [Card, Card]],
  board: Card[],
  locale: HoldemUiLocale,
): ShowdownResultPresentation {
  const values: [HandValue, HandValue] = [
    best5Of7([...holes[0], ...board]),
    best5Of7([...holes[1], ...board]),
  ];
  const comparison = compareHandValue(values[0], values[1]);
  return {
    values,
    labels: [
      handValueShowdownConciseForLocale(values[0], locale),
      handValueShowdownConciseForLocale(values[1], locale),
    ],
    comparison,
    split: comparison === 0,
    winner: comparison > 0 ? 0 : comparison < 0 ? 1 : null,
  };
}

/** 플랍부터 현재 공개 보드 기준 양쪽 족보를 반환한다. */
export function currentShowdownHandLabels(
  holes: [[Card, Card], [Card, Card]],
  board: Card[],
  boardRevealed: number,
  locale: HoldemUiLocale,
): [string | null, string | null] {
  if (boardRevealed < 3) return [null, null];
  if (boardRevealed >= 5) {
    return [
      handValueShowdownConciseForLocale(
        best5Of7([...holes[0], ...board.slice(0, boardRevealed)]),
        locale,
      ),
      handValueShowdownConciseForLocale(
        best5Of7([...holes[1], ...board.slice(0, boardRevealed)]),
        locale,
      ),
    ];
  }
  return [
    currentCompactHandLabel(holes[0], board, boardRevealed, locale),
    currentCompactHandLabel(holes[1], board, boardRevealed, locale),
  ];
}
