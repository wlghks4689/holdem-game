"use client";

import * as React from "react";
import type { Card } from "@/holdem/cards";
import {
  MADE_FX_CARD_GLOW,
  MADE_TURN_PANEL,
} from "../components/HoleCards";
import { PlayingCard } from "../components/Card";

type FxTier = 1 | 2 | 3 | 4 | 5;
type PreviewId =
  | "straight"
  | "flush"
  | "full-house"
  | "quads"
  | "straight-flush"
  | "royal-flush";
type PreviewVariant = "quads-coral" | "straight-flush-rainbow" | "royal-flush";

type PreviewHand = {
  id: PreviewId;
  tier: FxTier;
  nameKo: string;
  nameEn: string;
  tone: string;
  variant?: PreviewVariant;
  hole: [Card, Card];
  board: [Card, Card, Card];
};

const PREVIEW_HANDS: PreviewHand[] = [
  {
    id: "straight",
    tier: 1,
    nameKo: "스트레이트",
    nameEn: "Straight",
    tone: "앰버 · 금색",
    hole: [
      { rank: 9, suit: "h" },
      { rank: 8, suit: "d" },
    ],
    board: [
      { rank: 10, suit: "s" },
      { rank: 11, suit: "c" },
      { rank: 12, suit: "s" },
    ],
  },
  {
    id: "flush",
    tier: 2,
    nameKo: "플러시",
    nameEn: "Flush",
    tone: "스카이 블루",
    hole: [
      { rank: 14, suit: "h" },
      { rank: 7, suit: "h" },
    ],
    board: [
      { rank: 2, suit: "h" },
      { rank: 9, suit: "h" },
      { rank: 13, suit: "h" },
    ],
  },
  {
    id: "full-house",
    tier: 3,
    nameKo: "풀하우스",
    nameEn: "Full House",
    tone: "바이올렛 · 앰버",
    hole: [
      { rank: 14, suit: "s" },
      { rank: 14, suit: "d" },
    ],
    board: [
      { rank: 14, suit: "c" },
      { rank: 13, suit: "s" },
      { rank: 13, suit: "d" },
    ],
  },
  {
    id: "quads",
    tier: 4,
    nameKo: "포카드",
    nameEn: "Four of a Kind",
    tone: "코랄 · 크림슨",
    variant: "quads-coral",
    hole: [
      { rank: 14, suit: "s" },
      { rank: 14, suit: "d" },
    ],
    board: [
      { rank: 14, suit: "c" },
      { rank: 14, suit: "h" },
      { rank: 7, suit: "d" },
    ],
  },
  {
    id: "straight-flush",
    tier: 5,
    nameKo: "스트레이트 플러시",
    nameEn: "Straight Flush",
    tone: "레인보우 프리즘",
    variant: "straight-flush-rainbow",
    hole: [
      { rank: 9, suit: "c" },
      { rank: 8, suit: "c" },
    ],
    board: [
      { rank: 7, suit: "c" },
      { rank: 6, suit: "c" },
      { rank: 5, suit: "c" },
    ],
  },
  {
    id: "royal-flush",
    tier: 5,
    nameKo: "로열 플러시",
    nameEn: "Royal Flush",
    tone: "화이트 · 플래티넘 골드",
    variant: "royal-flush",
    hole: [
      { rank: 14, suit: "s" },
      { rank: 13, suit: "s" },
    ],
    board: [
      { rank: 12, suit: "s" },
      { rank: 11, suit: "s" },
      { rank: 10, suit: "s" },
    ],
  },
];

const PREVIEW_IMPACT_CLASS: Partial<Record<FxTier, string>> = {
  1: "holdem-preview-impact-t1",
  2: "holdem-preview-impact-t2",
  3: "holdem-preview-impact-t3",
};

const PREVIEW_CYCLE_AURA_CLASS: Partial<Record<PreviewId, string>> = {
  straight: "holdem-preview-cycle-aura-straight",
  flush: "holdem-preview-cycle-aura-flush",
  "full-house": "holdem-preview-cycle-aura-full-house",
  quads: "holdem-preview-cycle-aura-quads",
};

export function FxPreviewClient() {
  const [selectedId, setSelectedId] =
    React.useState<PreviewId>("straight-flush");
  const [replayKey, setReplayKey] = React.useState(0);
  const hand = PREVIEW_HANDS.find((item) => item.id === selectedId)!;
  const { tier } = hand;

  const selectHand = (nextId: PreviewId) => {
    setSelectedId(nextId);
    setReplayKey((value) => value + 1);
  };

  const variantClass = hand.variant
    ? `holdem-preview-${hand.variant}`
    : "";
  const impactClass = !hand.variant ? PREVIEW_IMPACT_CLASS[tier] ?? "" : "";
  const panelClass = hand.variant
    ? `${variantClass}-panel`
    : MADE_TURN_PANEL[tier];
  const cardClass = hand.variant
    ? `${variantClass}-card`
    : MADE_FX_CARD_GLOW[tier];
  const labelClass = hand.variant
    ? `${variantClass}-label`
    : `holdem-made-hand-label-t${tier}`;
  const cycleAuraClass = PREVIEW_CYCLE_AURA_CLASS[hand.id] ?? "";
  const royalPanelClass =
    hand.id === "royal-flush"
      ? "holdem-preview-royal-panel-celebration"
      : "";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#173c32_0%,#17191e_42%,#090a0d_100%)] px-4 py-8 text-zinc-100 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              Development Preview
            </p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              메이드 핸드 연출 미리보기
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              실제 홀 카드 화면과 동일한 CSS 연출입니다. 족보를 선택한 뒤 Replay를
              누르면 처음부터 다시 재생됩니다.
            </p>
          </div>
          <a
            href="/holdem"
            className="rounded-lg border border-zinc-600 bg-zinc-900/70 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-emerald-500/60 hover:text-emerald-200"
          >
            ← 홀덤 홈
          </a>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PREVIEW_HANDS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selectedId === item.id}
              onClick={() => selectHand(item.id)}
              className={[
                "rounded-xl border px-3 py-3 text-left transition",
                selectedId === item.id
                  ? "border-yellow-300/70 bg-yellow-950/35 shadow-[0_0_22px_rgba(253,224,71,0.18)]"
                  : "border-zinc-700 bg-zinc-900/55 hover:border-zinc-500 hover:bg-zinc-800/70",
              ].join(" ")}
            >
              <span className="block text-xs font-bold text-zinc-100">
                {item.nameKo}
              </span>
              <span className="mt-1 block text-[10px] text-zinc-500">
                Tier {item.tier} · {item.tone}
              </span>
            </button>
          ))}
        </div>

        <section
          key={`${selectedId}-${replayKey}`}
          className={[
            "rounded-2xl border p-5 transition sm:p-8",
            panelClass,
          ].join(" ")}
        >
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
            <div className="text-center lg:text-right">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
                Board
              </p>
              <div className="mt-3 flex justify-center gap-2 lg:justify-end">
                {hand.board.map((card, index) => (
                  <PlayingCard key={index} card={card} size="compact" />
                ))}
              </div>
            </div>

            <div className="hidden h-36 w-px bg-zinc-600/60 lg:block" />

            <div
              className={[
                "relative rounded-xl px-4 py-4 text-center lg:text-left",
                royalPanelClass,
              ].join(" ")}
            >
              {hand.id === "royal-flush" ? (
                <div
                  className="holdem-preview-royal-panel-flash"
                  aria-hidden
                />
              ) : null}
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
                Hole Cards
              </p>
              <div
                className={[
                  "holdem-made-fx",
                  `holdem-made-fx-t${tier}`,
                  variantClass ? `${variantClass}-fx` : "",
                  impactClass ? `${impactClass}-fx` : "",
                  "mt-3 inline-block overflow-visible",
                ].join(" ")}
              >
                {cycleAuraClass ? (
                  <span
                    className={`holdem-preview-cycle-aura ${cycleAuraClass}`}
                    aria-hidden
                  />
                ) : null}
                <div className="holdem-made-fx-stack flex gap-3">
                  {hand.hole.map((card, index) => (
                    <div
                      key={index}
                      className="holdem-made-fx-card"
                      style={{ animationDelay: `${index * 0.08}s` }}
                    >
                      <PlayingCard
                        card={card}
                        size="hero"
                        className={cardClass}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5">
                <span
                  className={`holdem-made-hand-label ${labelClass} inline-block text-2xl font-black tracking-tight`}
                >
                  {hand.nameEn}
                </span>
                <p className="mt-1 text-xs text-zinc-400">
                  {hand.nameKo} · {hand.tone}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setReplayKey((value) => value + 1)}
            className="rounded-xl border border-yellow-300/75 bg-yellow-700/35 px-6 py-3 text-sm font-black text-yellow-50 shadow-[0_0_20px_rgba(253,224,71,0.16)] transition hover:bg-yellow-600/40 active:scale-[0.98]"
          >
            Replay animation
          </button>
          <span className="text-xs text-zinc-500">
            현재 선택: {hand.nameKo} / {hand.nameEn}
          </span>
        </div>
      </div>
    </main>
  );
}
