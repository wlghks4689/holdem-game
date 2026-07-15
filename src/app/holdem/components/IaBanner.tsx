"use client";

import * as React from "react";
import {
  iaCategoryHandListText,
  iaCategoryLabelEn,
  iaCategoryLabelKo,
} from "@/holdem/handPool";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { GameState, HandAcquisitionType, OpponentHandCategory, PlayerIndex } from "@/holdem/types";

export type IaBannerProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
};

function IaRevealBlock({
  buyer,
  category,
  acquisitionType,
  viewer,
  pl,
  isEn,
}: {
  buyer: PlayerIndex;
  category: OpponentHandCategory | null;
  acquisitionType: HandAcquisitionType | null;
  viewer: PlayerIndex;
  pl: (p: PlayerIndex) => string;
  isEn: boolean;
}) {
  const imBuyer = viewer === buyer;
  if (imBuyer) {
    if (acquisitionType === "mystery" || acquisitionType === "forced-random") {
      return (
        <div className="rounded-md px-1 -mx-1 ring-1 ring-indigo-400/30">
          <p className="text-sm font-semibold text-indigo-50">
            {acquisitionType === "mystery"
              ? (isEn ? "Opponent has a Mystery Hand." : "상대는 Mystery Hand입니다.")
              : (isEn ? "Opponent received a Random Hand. No category is provided." : "상대는 Random Hand를 지급받았습니다. 카테고리가 제공되지 않습니다.")}
          </p>
        </div>
      );
    }
    if (category == null) return null;
    const categoryText = isEn ? iaCategoryLabelEn(category) : iaCategoryLabelKo(category);
    return (
      <div
        className={[
          "space-y-1 rounded-md px-1 -mx-1 ring-1 ring-indigo-400/30",
        ].join(" ")}
      >
        <p className="text-sm font-semibold text-indigo-50">
          {isEn ? "Opponent category: " : "상대 카테고리: "}
          <span className="text-white">{categoryText}</span>
          <span className="ml-1 text-[11px] font-normal text-indigo-300/90">
            {isEn ? "(used by me)" : "(내가 사용)"}
          </span>
        </p>
        <p className="break-words font-mono text-[11px] leading-relaxed text-indigo-100/90">
          {iaCategoryHandListText(category)}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1 rounded-md border border-indigo-500/30 bg-indigo-950/30 px-2 py-2">
      <p className="text-sm font-semibold text-indigo-50">
        {isEn
          ? `${pl(buyer)} used IA.`
          : `${pl(buyer)}님이 IA를 사용하였습니다.`}
      </p>
      <p className="text-[11px] leading-snug text-indigo-200/80">
        {isEn
          ? "Only category range is revealed to the opponent. Face cards remain hidden."
          : "상대방이 카테고리 범위만 알 수 있습니다. 액면 카드는 비공개입니다."}
      </p>
    </div>
  );
}

/** IA를 쓴 좌석은 결과(범주·풀), 상대 좌석에는 알림 문구만 표시 */
export function IaBanner({ state, viewer, playerNames }: IaBannerProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const pl = (p: PlayerIndex) => playerNames[p] ?? `플레이어 ${p + 1}`;
  const r0 = state.iaReveal[0];
  const r1 = state.iaReveal[1];
  const t0 = state.iaRevealType[0];
  const t1 = state.iaRevealType[1];

  const iaKey = React.useMemo(() => {
    const idx = state.logs.findLastIndex((m) => m.t === "ia");
    if (idx < 0) return "ia-banner";
    const m = state.logs[idx]!;
    if (m.t !== "ia") return "ia-banner";
    return `ia-banner-${idx}-${m.player}-${m.cost}`;
  }, [state.logs]);

  if (!state.iaUsed[0] && !state.iaUsed[1]) return null;

  const iUsedIa = state.iaUsed[viewer];
  const opponentUsedIa =
    state.iaUsed[viewer === 0 ? 1 : 0];

  let heading: string;
  if (iUsedIa && opponentUsedIa) {
    heading = "IA";
  } else if (iUsedIa) {
    heading = isEn ? "IA used · info acquired" : "IA 사용 · 정보 획득";
  } else {
    heading = isEn ? "Opponent IA" : "상대 IA";
  }

  return (
    <div
      key={iaKey}
      className={[
        "relative overflow-hidden rounded-xl border px-4 py-3",
        "border-indigo-400/55 bg-indigo-900/40 shadow-[0_0_20px_rgba(129,140,248,0.22)]",
      ].join(" ")}
      style={{ animation: "holdem-ia-banner-in 0.36s ease-out both" }}
    >
      <div className="relative z-[1] space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/90">
          {heading}
        </p>
        {state.iaUsed[0] ? (
          <IaRevealBlock
            buyer={0}
            category={r0}
            acquisitionType={t0}
            viewer={viewer}
            pl={pl}
            isEn={isEn}
          />
        ) : null}
        {state.iaUsed[1] ? (
          <IaRevealBlock
            buyer={1}
            category={r1}
            acquisitionType={t1}
            viewer={viewer}
            pl={pl}
            isEn={isEn}
          />
        ) : null}
        {iUsedIa ? (
          <p className="text-[11px] text-indigo-200/75">
            {isEn
              ? "Face cards remain hidden. Use this for decision support."
              : "액면 카드는 비공개입니다. 결정에만 참고하세요."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
