"use client";

import * as React from "react";
import { iaCategoryHandListText } from "@/holdem/handPool";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { GameState, OpponentHandCategory, PlayerIndex } from "@/holdem/types";

export type IaBannerProps = {
  state: GameState;
  viewer: PlayerIndex;
  playerNames: [string, string];
};

function IaRevealBlock({
  buyer,
  category,
  viewer,
  pl,
  isEn,
}: {
  buyer: PlayerIndex;
  category: OpponentHandCategory;
  viewer: PlayerIndex;
  pl: (p: PlayerIndex) => string;
  isEn: boolean;
}) {
  const categoryLabelEn: Record<OpponentHandCategory, string> = {
    "하이파켓": "High Pairs",
    "Ax 오프수트": "Ax Offsuit",
    "브로드웨이 수딧": "Broadway Suited",
    "미들파켓": "Middle Pairs",
    "로우파켓": "Low Pairs",
    "커넥터 수딧": "Suited Connectors",
  };
  const categoryText = isEn ? categoryLabelEn[category] : category;
  const imBuyer = viewer === buyer;
  if (imBuyer) {
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

  const iaKey = React.useMemo(() => {
    const idx = state.logs.findLastIndex((m) => m.t === "ia");
    if (idx < 0) return "ia-banner";
    const m = state.logs[idx]!;
    if (m.t !== "ia") return "ia-banner";
    return `ia-banner-${idx}-${m.player}-${m.cost}`;
  }, [state.logs]);

  if (r0 == null && r1 == null) return null;

  const iUsedIa = (r0 != null && viewer === 0) || (r1 != null && viewer === 1);
  const opponentUsedIa =
    (r0 != null && viewer === 1) || (r1 != null && viewer === 0);

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
        {r0 != null ? (
          <IaRevealBlock
            buyer={0}
            category={r0}
            viewer={viewer}
            pl={pl}
            isEn={isEn}
          />
        ) : null}
        {r1 != null ? (
          <IaRevealBlock
            buyer={1}
            category={r1}
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
