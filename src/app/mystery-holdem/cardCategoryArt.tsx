import * as React from "react";
import { CARD_CATEGORY_LABEL } from "@/mysteryHoldem/mysteryCard";
import type { MysteryCardCategory } from "@/mysteryHoldem/mysteryCard";

/**
 * Mystery Card 카테고리별 시각 자산(§9).
 *
 * 카테고리 구분을 텍스트에만 맡기면 3장을 나란히 놓고 비교할 때 눈에 들어오지 않는다.
 * 아이콘 · 포인트 컬러 · 상단 프레임 분위기를 한 곳에서 묶어 카드가 무엇인지 글을 읽기
 * 전에 알아볼 수 있게 한다.
 *
 * 아직 실제 일러스트 자산이 없어 인라인 SVG를 placeholder로 쓴다. 나중에 이미지로 바꿀 때
 * `Art` 한 곳만 교체하면 되도록, 색·라벨과 그림을 같은 레코드에 담아 두었다.
 */

export interface CardCategoryArt {
  label: string;
  /** 카테고리를 한마디로 설명하는 부제 — 처음 보는 사람이 분류를 이해하는 단서 */
  tagline: string;
  /** 포인트 텍스트 색 */
  accentText: string;
  /** 선택되지 않은 카드의 테두리 */
  idleBorder: string;
  /** 선택된 카드의 테두리 + 발광 */
  activeRing: string;
  /** 상단 아트 영역 배경 그라디언트 */
  artBackground: string;
  /** 카테고리 라벨 칩 */
  badge: string;
  /** 하단 보상 영역 구분선 */
  divider: string;
  Art: React.ComponentType<{ className?: string }>;
}

/** 미션형 — 목표·계약·표식 */
function MissionArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <circle cx="32" cy="32" r="21" stroke="currentColor" strokeWidth="2.5" opacity="0.45" />
      <circle cx="32" cy="32" r="13" stroke="currentColor" strokeWidth="2.5" opacity="0.7" />
      <circle cx="32" cy="32" r="4.5" fill="currentColor" />
      <path d="M32 3v10M32 51v10M3 32h10M51 32h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** 강화형 — 증폭·정보 */
function EnhancementArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <path
        d="M35 4 16 36h13l-4 24 22-34H33z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <path d="M8 16h8M8 48h8M48 16h8M48 48h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** 발동형 — 개입·규칙 변화 */
function TriggerArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <path
        d="M32 6 54 18v14c0 13-9 21-22 26-13-5-22-13-22-26V18z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M20 20l24 24M44 20 20 44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const CARD_CATEGORY_ART: Record<MysteryCardCategory, CardCategoryArt> = {
  mission: {
    label: CARD_CATEGORY_LABEL.mission,
    tagline: "조건을 달성해 점수를 얻습니다",
    accentText: "text-amber-300",
    idleBorder: "border-amber-900/50 hover:border-amber-600/70",
    activeRing: "border-amber-400 shadow-[0_0_28px_-4px_rgba(251,191,36,0.55)]",
    artBackground: "from-amber-500/20 via-amber-900/10 to-transparent",
    badge: "bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/40",
    divider: "border-amber-900/40",
    Art: MissionArt,
  },
  enhancement: {
    label: CARD_CATEGORY_LABEL.enhancement,
    tagline: "규칙이나 정보 자체가 강해집니다",
    accentText: "text-cyan-300",
    idleBorder: "border-cyan-900/50 hover:border-cyan-600/70",
    activeRing: "border-cyan-400 shadow-[0_0_28px_-4px_rgba(34,211,238,0.55)]",
    artBackground: "from-cyan-500/20 via-cyan-900/10 to-transparent",
    badge: "bg-cyan-500/15 text-cyan-200 ring-1 ring-inset ring-cyan-400/40",
    divider: "border-cyan-900/40",
    Art: EnhancementArt,
  },
  trigger: {
    label: CARD_CATEGORY_LABEL.trigger,
    tagline: "상대나 팟 판정에 직접 개입합니다",
    accentText: "text-violet-300",
    idleBorder: "border-violet-900/50 hover:border-violet-600/70",
    activeRing: "border-violet-400 shadow-[0_0_28px_-4px_rgba(167,139,250,0.55)]",
    artBackground: "from-violet-500/20 via-violet-900/10 to-transparent",
    badge: "bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-400/40",
    divider: "border-violet-900/40",
    Art: TriggerArt,
  },
};
