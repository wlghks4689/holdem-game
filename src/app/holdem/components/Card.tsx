'use client';

import type { CSSProperties } from "react";
import type { Card as CardModel, Suit } from "@/holdem/cards";
import { rankToChar } from "@/holdem/cards";

const SUIT_SYM: Record<Suit, string> = {
  h: "♥",
  d: "♦",
  s: "♠",
  c: "♣",
};

function suitColorClass(suit: Suit): string {
  return suit === "h" || suit === "d" ? "text-red-600" : "text-zinc-900";
}

function rankDisplay(rank: number): string {
  if (rank === 10) return "10";
  return rankToChar(rank);
}

/** 기존 대비 ~1.3배 축소 (보드·상대 홀 등) */
/** 내 홀 — 보드보다 한 단계 큼 */
const sizeFrames = {
  /** 쇼다운·상대 줄 등 — board보다 낮음 */
  compact: "h-[4.35rem] w-[3.15rem] shrink-0",
  board: "h-[5.38rem] w-[3.85rem] shrink-0",
  hero: "h-[6.15rem] w-[4.62rem] shrink-0",
} as const;

export type CardSize = keyof typeof sizeFrames;

const rankText: Record<CardSize, string> = {
  compact: "text-base font-bold leading-none tracking-tight",
  board: "text-lg font-bold leading-none tracking-tight sm:text-xl",
  hero: "text-xl font-bold leading-none tracking-tight sm:text-2xl",
};

/** "10" 은 카드 폭이 좁아 약간 축소 */
function rankClass(size: CardSize, narrow: boolean): string {
  if (!narrow) return rankText[size];
  if (size === "compact") {
    return "text-sm font-bold leading-none tracking-tight";
  }
  return size === "board"
    ? "text-base font-bold leading-none tracking-tight sm:text-lg"
    : "text-lg font-bold leading-none tracking-tight sm:text-xl";
}

const suitText: Record<CardSize, string> = {
  compact: "text-2xl leading-none",
  board: "text-3xl leading-none sm:text-[2rem]",
  hero: "text-4xl leading-none sm:text-[2.35rem]",
};

export type PlayingCardProps = {
  card: CardModel;
  className?: string;
  size?: CardSize;
  style?: CSSProperties;
};

/** 앞면 — 랭크 1줄 + 무늬 1개만 (중앙) */
export function PlayingCard({
  card,
  className = "",
  size = "board",
  style,
}: PlayingCardProps) {
  const sym = SUIT_SYM[card.suit];
  const r = rankDisplay(card.rank);
  const narrow = r === "10";
  const frame = `relative flex flex-col items-center justify-center gap-0.5 rounded-lg border bg-white shadow-sm ${sizeFrames[size]}`;

  return (
    <div
      className={`${frame} border-zinc-300 px-0.5 sm:px-1 ${className}`}
      style={style}
      aria-label={`${r}${sym}`}
    >
      <span className={`${rankClass(size, narrow)} ${suitColorClass(card.suit)}`}>
        {r}
      </span>
      <span className={`${suitText[size]} ${suitColorClass(card.suit)}`} aria-hidden>
        {sym}
      </span>
    </div>
  );
}

export type CardBackProps = {
  className?: string;
  size?: CardSize;
};

export function CardBack({ className = "", size = "board" }: CardBackProps) {
  const frame = `flex shrink-0 flex-col items-center justify-center rounded-lg border shadow-sm ${sizeFrames[size]}`;
  const innerSym =
    size === "hero"
      ? "text-2xl sm:text-3xl"
      : size === "compact"
        ? "text-lg"
        : "text-xl sm:text-2xl";

  return (
    <div
      className={`${frame} border-zinc-400 bg-gradient-to-br from-slate-700 to-slate-900 ${className}`}
      aria-label="카드 뒷면"
    >
      <span className={`${innerSym} text-slate-300`} aria-hidden>
        ♠
      </span>
    </div>
  );
}
