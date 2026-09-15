import * as React from "react";
import { CARD_CATEGORY_ART } from "./cardCategoryArt";
import { cardCategoryFromLegacy } from "@/mysteryHoldem/mysteryCard";
import type { MysteryMissionDef } from "@/mysteryHoldem/types";

/**
 * Mystery Card 선택 팝업.
 *
 * 카드 선택은 한 매치에서 다섯 번밖에 없는 중요한 분기인데, 기존 UI는 다른 패널 사이에
 * 끼인 작은 버튼 목록이라 "지나가는 선택"처럼 보였다. 화면 중앙에 세워 3장을 나란히
 * 비교하게 하고, 고른 뒤 한 번 더 확정하게 해서 결정의 무게를 살린다.
 *
 * 닫기 수단은 일부러 두지 않았다. 카드를 고르지 않으면 핸드가 진행되지 않으므로
 * 팝업 바깥 클릭이나 ESC로 빠져나갈 수 있으면 게임이 멈춘 것처럼 보인다.
 */

/**
 * 카드 하단에 붙는 보상/효과 문구.
 *
 * 점수가 없는 카드에 "+0 Mission Point"를 띄우면 쓸모없는 카드로 보인다. 그런 카드의
 * 보상은 점수가 아니라 효과 자체이므로, 점수형과 효과형의 표기 자체를 다르게 한다.
 */
export function cardRewardLabel(def: MysteryMissionDef): { kind: "score" | "effect"; text: string } {
  if (def.bountyMultiplier != null) {
    return { kind: "score", text: `Bounty Point ×${def.bountyMultiplier}` };
  }
  if (def.id === "maker_high_end") {
    return { kind: "score", text: "풀하우스 350 / 포카드 600 / SF 1,000" };
  }
  if (def.id === "blind_defender") return { kind: "score", text: "시작 인원 × 10 Mission Point" };
  // Parasite는 대상의 점수를 복제하므로 고정값이 없다 — 0점 카드로 보이면 안 된다.
  if (def.id === "parasite") return { kind: "score", text: "상대 미션 점수 + 150" };
  if (def.reward > 0) return { kind: "score", text: `+${def.reward} Mission Point` };

  // 점수가 없는 카드는 "교체 시점"이 아니라 "무엇을 하는 카드인가"를 적는다. 교체 규칙만
  // 적으면 비교 화면에서 카드끼리 구분이 되지 않고, 고를 이유도 읽히지 않는다.
  const EFFECT_TEXT: Record<string, string> = {
    forced_split: "리버 쇼다운 시 팟 강제 스플릿",
    four_card: "홀카드 4장 · 쇼다운에 2장 사용",
  };
  return { kind: "effect", text: EFFECT_TEXT[def.id] ?? "규칙 변경 효과" };
}

/**
 * Mystery Card 한 장의 앞면.
 *
 * 선택 화면(MysteryCardOption)과 **게임 중 내가 들고 있는 카드** 양쪽에서 같은 모양을 쓴다.
 * 고르던 것과 들고 있는 것이 다르게 생기면 같은 카드인지 매번 이름을 읽어 확인해야 한다.
 * 그래서 버튼(상호작용)에서 앞면(표현)만 떼어냈다.
 */
export function MysteryCardFace({
  def,
  selected = false,
  className = "",
}: {
  def: MysteryMissionDef;
  selected?: boolean;
  className?: string;
}) {
  const art = CARD_CATEGORY_ART[cardCategoryFromLegacy(def.category)];
  const reward = cardRewardLabel(def);

  return (
    <div className={["flex flex-col overflow-hidden rounded-2xl text-left", className].join(" ")}>
      {/* (1) 상단 아트 — 글을 읽기 전에 분류가 보이는 자리 */}
      <div
        className={`relative flex h-24 items-center justify-center bg-gradient-to-b sm:h-28 ${art.artBackground}`}
      >
        <art.Art className={`h-12 w-12 sm:h-14 sm:w-14 ${art.accentText}`} />
        <span
          className={`absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${art.badge}`}
        >
          {art.label}
        </span>
        {selected ? (
          <span
            className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-black text-zinc-900"
            aria-hidden
          >
            ✓
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
        {/* (2) 이름 — 카드의 핵심 식별 요소 */}
        <h3 className="text-base font-black leading-tight tracking-wide text-zinc-50 sm:text-lg">
          {def.name}
        </h3>

        {/* (3) 요약 설명 — 세부 규칙은 툴팁으로 민다 */}
        <p className="flex-1 text-[13px] leading-relaxed text-zinc-300">
          {def.shortDescription ?? def.description}
        </p>

        {/* 세부 규칙: 첫 화면을 어지럽히지 않도록 접어 둔다 */}
        {def.shortDescription != null && def.description !== def.shortDescription ? (
          <span
            className="relative w-fit cursor-help text-[11px] text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-zinc-300"
            tabIndex={0}
          >
            자세히
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 hidden w-60 rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-[11px] leading-relaxed text-zinc-200 shadow-xl [&:where(:hover)]:block"
            >
              {def.description}
            </span>
          </span>
        ) : null}

        {/* (4) 보상/효과 — 카드 비교의 핵심이라 별도 섹션으로 분리한다 */}
        <div className={`-mx-3.5 -mb-3.5 border-t px-3.5 py-2.5 sm:-mx-4 sm:-mb-4 sm:px-4 ${art.divider}`}>
          {reward.kind === "score" ? (
            <p className={`text-[13px] font-bold ${art.accentText}`}>{reward.text}</p>
          ) : (
            <p className="text-[13px] font-semibold text-zinc-400">
              <span className="text-zinc-500">효과 · </span>
              {reward.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MysteryCardOption({
  def,
  selected,
  onSelect,
}: {
  def: MysteryMissionDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const art = CARD_CATEGORY_ART[cardCategoryFromLegacy(def.category)];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "group flex w-full rounded-2xl border-2 bg-zinc-950/80",
        "transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        selected
          ? `${art.activeRing} -translate-y-1`
          : `${art.idleBorder} hover:-translate-y-0.5 hover:bg-zinc-900/80`,
      ].join(" ")}
    >
      <MysteryCardFace def={def} selected={selected} className="flex-1" />
    </button>
  );
}

export function MysteryCardPicker({
  offers,
  onConfirm,
}: {
  offers: readonly MysteryMissionDef[];
  onConfirm: (missionId: string) => void;
}) {
  const [picked, setPicked] = React.useState<string | null>(null);

  // 후보가 새로 내려오면(다음 변경 라운드) 선택 상태를 비운다.
  const offerKey = offers.map((o) => o.id).join("|");
  React.useEffect(() => setPicked(null), [offerKey]);

  const pickedDef = offers.find((o) => o.id === picked) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Mystery Card 선택"
    >
      <div className="my-auto w-full max-w-4xl">
        <div className="mb-4 text-center sm:mb-5">
          <h2 className="text-lg font-black tracking-wide text-zinc-50 sm:text-2xl">
            Mystery Card 선택
          </h2>
          <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
            이번 라운드에 사용할 비공개 Mystery Card 1장을 선택하세요.
          </p>
        </div>

        {/*
          모바일은 1열 세로 스택이다. 3열을 억지로 우겨넣으면 설명 글자가 읽을 수 없게 작아지고,
          캐러셀은 "3장을 한눈에 비교한다"는 이 화면의 목적과 정면으로 어긋난다.
          세로로 쌓으면 스크롤은 생기지만 카드 하나하나는 온전히 읽힌다.
        */}
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {offers.map((def) => (
            <MysteryCardOption
              key={def.id}
              def={def}
              selected={picked === def.id}
              onSelect={() => setPicked(def.id)}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-col items-center gap-2 sm:mt-5">
          <button
            type="button"
            disabled={picked == null}
            onClick={() => picked != null && onConfirm(picked)}
            className="w-full max-w-xs rounded-xl bg-fuchsia-600 px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 disabled:shadow-none"
          >
            선택 확정
          </button>
          <p className="h-4 text-[11px] text-zinc-500">
            {pickedDef == null ? "카드를 한 장 선택하세요" : `${pickedDef.name} 선택됨`}
          </p>
        </div>
      </div>
    </div>
  );
}
