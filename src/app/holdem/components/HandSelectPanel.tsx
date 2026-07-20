"use client";

import * as React from "react";
import { rankToChar, type Suit } from "@/holdem/cards";
import {
  canSelectHandTemplate,
  canUseMysteryHand,
  getHandTemplateForMode,
  getHandTemplatesForMode,
  HAND_COST_STARTING_POINTS,
  iaCategoryLabelEn,
  iaCategoryLabelKo,
  normalizeHandCostRemaining,
  normalizeHandPoolRemaining,
  templateLabel,
} from "@/holdem/handPool";
import { HU_BB_LABEL, HU_DEALER_SB_LABEL } from "@/holdem/headsUpLabels";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type {
  GameState,
  HandPoolTemplate,
  OpponentHandCategory,
  PlayerIndex,
} from "@/holdem/types";
import { MYSTERY_HAND_COST } from "@/holdem/gameModeRules";

const PREVIEW_SUIT_SYMBOL: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

function previewSuitsForTemplate(
  template: HandPoolTemplate,
): readonly [Suit, Suit] {
  return template.kind === "suited" ? ["s", "s"] : ["c", "h"];
}

function HandTemplateCardPreview({
  template,
}: {
  template: HandPoolTemplate;
}) {
  const suits = previewSuitsForTemplate(template);

  return (
    <span
      className="flex items-center justify-center gap-0.5"
      data-hand-preview-kind={template.kind}
      data-hand-preview-suits={suits.join("")}
      aria-hidden
    >
      {template.ranks.map((rank, index) => {
        const suit = suits[index]!;
        const red = suit === "h" || suit === "d";
        return (
          <span
            key={`${rank}-${suit}-${index}`}
            className="flex h-10 w-[1.62rem] -translate-y-0.5 shrink-0 flex-col items-center justify-center rounded-[5px] border border-zinc-300 bg-gradient-to-br from-white to-zinc-100 shadow-[0_2px_5px_rgba(0,0,0,0.4)] ring-1 ring-amber-200/25 lg:h-11 lg:w-[1.7rem]"
            data-hand-preview-card
            data-preview-rank={rankToChar(rank)}
            data-preview-suit={suit}
          >
            <span
              className={[
                "flex h-[14px] w-full items-center justify-center text-center font-mono text-[14px] font-black leading-none tabular-nums lg:h-[15.1px] lg:text-[15.1px]",
                red ? "text-red-600" : "text-zinc-950",
              ].join(" ")}
            >
              {rankToChar(rank)}
            </span>
            <span
              className={[
                "mt-px flex h-[18.6px] w-full items-center justify-center text-center text-[18.6px] leading-none lg:h-[19.85px] lg:text-[19.85px]",
                red ? "text-red-600" : "text-zinc-950",
              ].join(" ")}
            >
              {PREVIEW_SUIT_SYMBOL[suit]}
            </span>
          </span>
        );
      })}
    </span>
  );
}

const CATEGORY_ORDER: OpponentHandCategory[] = [
  "하이파켓",
  "Ax 오프수트",
  "브로드웨이 수딧",
  "미들파켓",
  "로우파켓",
  "커넥터 수딧",
];

const CATEGORY_BLURB: Record<OpponentHandCategory, string> = {
  하이파켓: "프리미엄 페어, 도미네이팅 포스트플랍",
  "Ax 오프수트": "탑 킥 구조, 읽기 쉬운 엔드게임",
  "브로드웨이 수딧": "플랍 히트 시 넛·실드 잠재력",
  미들파켓: "세트 마이닝, 중간 강도 정면 싸움",
  로우파켓: "숨은 세트, 상대 상위 보드에 유리",
  "커넥터 수딧": "드로우 잠재력 높음, 변동성 큼",
};

const CATEGORY_BLURB_EN: Record<OpponentHandCategory, string> = {
  "하이파켓": "Premium pairs, strong postflop pressure",
  "Ax 오프수트": "Top-kicker structure, clear endgame lines",
  "브로드웨이 수딧": "Nut potential on connected boards",
  "미들파켓": "Set mining and medium-strength fights",
  "로우파켓": "Hidden sets with board leverage",
  "커넥터 수딧": "High draw potential, higher variance",
};

function categoryLabelForMode(
  cat: OpponentHandCategory,
  isEn: boolean,
): string {
  return isEn ? iaCategoryLabelEn(cat) : iaCategoryLabelKo(cat);
}

function categoryBlurbForMode(
  cat: OpponentHandCategory,
  isEn: boolean,
  isCostMode: boolean,
): string {
  if (cat === CATEGORY_ORDER[1] && isCostMode) {
    return isEn
      ? "A-suited and A-off combinations"
      : "A 수딧과 A 오프수트 조합";
  }
  return isEn ? CATEGORY_BLURB_EN[cat] : CATEGORY_BLURB[cat];
}

function kindLabelKo(t: HandPoolTemplate): string {
  if (t.kind === "pair") return "페어";
  if (t.kind === "suited") return "수딧";
  return "오프수트";
}

function templateUiCategory(t: HandPoolTemplate): OpponentHandCategory {
  if (t.id.startsWith("hi_")) return CATEGORY_ORDER[0]!;
  if (t.id.startsWith("axo_") || t.id.startsWith("axs_")) return CATEGORY_ORDER[1]!;
  if (t.id.startsWith("bw_")) return CATEGORY_ORDER[2]!;
  if (t.id.startsWith("mid_")) return CATEGORY_ORDER[3]!;
  if (t.id.startsWith("low_")) return CATEGORY_ORDER[4]!;
  return CATEGORY_ORDER[5]!;
}

function groupTemplateListByCategory(
  templates: readonly HandPoolTemplate[],
): Map<OpponentHandCategory, HandPoolTemplate[]> {
  const m = new Map<OpponentHandCategory, HandPoolTemplate[]>();
  for (const c of CATEGORY_ORDER) m.set(c, []);
  for (const t of templates) {
    m.get(templateUiCategory(t))!.push(t);
  }
  return m;
}

export type HandSelectPanelProps = {
  state: GameState;
  playerNames: [string, string];
  /** 온라인 방: 내 좌석만 선택 UI 표시 */
  mySeat?: PlayerIndex;
  onSelect: (player: PlayerIndex, templateId: string) => void;
  onMystery: (player: PlayerIndex) => void;
};

type ColumnProps = {
  state: GameState;
  player: PlayerIndex;
  titleName: string;
  /** 좁은 뷰·2열 레이아웃용 밀도 높은 그리드 */
  compact: boolean;
  /** 한 좌석만 표시할 때 넓은 데스크톱 그리드를 사용 */
  wideLayout: boolean;
  onSelect: (player: PlayerIndex, templateId: string) => void;
  onMystery: (player: PlayerIndex) => void;
};

function HandPickerColumn({
  state,
  player,
  titleName,
  compact,
  wideLayout,
  onSelect,
  onMystery,
}: ColumnProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const phase = state.handSelectPhase;
  const isCostMode = state.gameMode === "cost";
  const templatesForMode = React.useMemo(
    () => getHandTemplatesForMode(state.gameMode),
    [state.gameMode],
  );
  const templatesByCategory = React.useMemo(
    () => groupTemplateListByCategory(templatesForMode),
    [templatesForMode],
  );
  const [pick, setPick] = React.useState<string | null>(null);

  const pending = state.handPickPending[player];

  React.useEffect(() => {
    setPick(null);
  }, [phase, state.roundNumber, player]);

  const tpl = pick ? getHandTemplateForMode(state.gameMode, pick) : null;
  const categoryForPick = tpl ? templateUiCategory(tpl) : null;

  const poolForActor = React.useMemo(() => {
    const pools = normalizeHandPoolRemaining(state.handPoolRemaining as unknown, state.gameMode);
    return pools[player] ?? {};
  }, [state.handPoolRemaining, state.gameMode, player]);
  const costForActor = React.useMemo(() => {
    const costs = normalizeHandCostRemaining(state.handCostRemaining as unknown, state.gameMode);
    return costs[player] ?? 0;
  }, [state.handCostRemaining, state.gameMode, player]);
  const canConfirm = tpl != null && canSelectHandTemplate(state, player, tpl);
  const costPercent = Math.max(
    0,
    Math.min(100, (costForActor / HAND_COST_STARTING_POINTS) * 100),
  );
  const selectedAfterCost = tpl ? Math.max(0, costForActor - tpl.cost) : null;
  const confirmLabel =
    isCostMode && tpl
      ? isEn
        ? `Confirm ${templateLabel(tpl)} (${tpl.cost} COST)`
        : `${templateLabel(tpl)} 선택 확정 (${tpl.cost} COST)`
      : isEn
        ? "Lock this hand"
        : "이 핸드로 확정";

  const posLabel =
    state.button === player
      ? isEn
        ? "BTN · SB"
        : HU_DEALER_SB_LABEL
      : HU_BB_LABEL;

  const submit = () => {
    if (!tpl || !canConfirm) return;
    onSelect(player, tpl.id);
  };

  const onHandClick = (id: string) => {
    const t = getHandTemplateForMode(state.gameMode, id);
    if (t == null || !canSelectHandTemplate(state, player, t)) return;
    setPick(id);
  };

  const catGridClass = compact
    ? wideLayout
      ? "grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]"
      : "grid grid-cols-1 items-start gap-2 md:grid-cols-2"
    : "grid grid-cols-2 gap-2 lg:grid-cols-3";
  const handGridClass = "flex min-w-0 flex-wrap content-start gap-1.5";
  const btnMinH = compact ? "min-h-[4.25rem] lg:min-h-[4.65rem]" : "min-h-[4.5rem]";
  const hasAvailableHand = templatesForMode.some((t) =>
    canSelectHandTemplate(state, player, t),
  );
  const mysteryAvailable = canUseMysteryHand(state, player);

  return (
    <div
      className={[
        "rounded-xl border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[box-shadow,border-color,background-color] duration-300 lg:p-3",
        pending != null
          ? "border-emerald-500/45 bg-emerald-950/25 shadow-[0_0_24px_rgba(52,211,153,0.12)]"
          : "border-amber-500/40 bg-amber-950/15 shadow-[0_0_22px_rgba(251,191,36,0.12)] ring-1 ring-amber-400/25",
      ].join(" ")}
    >
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs font-semibold text-zinc-50 sm:text-sm">
        <span>{titleName}</span>
        <span className="font-normal text-violet-200/90">({posLabel})</span>
      </h3>
      {isCostMode ? (
        <div className="mb-2 rounded-lg border border-amber-400/35 bg-amber-950/25 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(251,191,36,0.12)]">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-50">
            <span>{isEn ? "Hand Cost" : "남은 코스트"}</span>
            <span className="font-mono">{costForActor} / {HAND_COST_STARTING_POINTS}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-amber-500/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-[width] duration-300"
              style={{ width: `${costPercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-amber-100/75">
            {isEn
              ? "Cost mode: every hand can be selected once per match."
              : "Cost 모드에서는 모든 핸드를 매치당 1회만 선택할 수 있습니다."}
          </p>
        </div>
      ) : null}
      {isCostMode ? (
        <button
          type="button"
          disabled={!mysteryAvailable || pending != null}
          onClick={() => onMystery(player)}
          className={[
            "mb-2 w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold",
            mysteryAvailable && pending == null
              ? "border-fuchsia-400/55 bg-fuchsia-950/35 text-fuchsia-100 hover:bg-fuchsia-900/45"
              : "cursor-not-allowed border-zinc-700 bg-zinc-900/45 text-zinc-500",
          ].join(" ")}
        >
          <span className="flex items-center justify-between gap-2">
            <span>Mystery Hand · {MYSTERY_HAND_COST} COST · {isEn ? "once per match" : "경기당 1회"}</span>
            <span>{state.mysteryHandUsed[player] ? (isEn ? "Used" : "사용 완료") : !mysteryAvailable ? (isEn ? "Not enough Cost" : "Cost 부족") : ""}</span>
          </span>
        </button>
      ) : null}
      {isCostMode && !hasAvailableHand && !mysteryAvailable ? (
        <div className="mb-2 rounded-md border border-red-500/35 bg-red-950/25 px-2 py-1 text-[10px] font-semibold text-red-100">
          {costForActor === 0
            ? (isEn ? "Cost is depleted. A Random Hand is assigned automatically." : "Cost를 모두 소진하여 Random Hand가 자동 지급됩니다.")
            : (isEn ? "No selectable hand remains. A Random Hand is assigned automatically." : "선택 가능한 핸드가 없어 Random Hand가 자동 지급됩니다.")}
        </div>
      ) : null}

      <div className={catGridClass}>
        {CATEGORY_ORDER.map((cat) => {
          const hands = templatesByCategory.get(cat) ?? [];
          return (
            <section
              key={cat}
              title={categoryBlurbForMode(cat, isEn, isCostMode)}
              className={[
                "min-w-0 rounded-md border border-zinc-600/70 bg-zinc-800/55",
                compact ? "p-1.5" : "p-2",
              ].join(" ")}
            >
              <div
                className={[
                  "border-b border-zinc-600/55",
                  compact ? "mb-1 pb-1" : "mb-2 pb-2",
                ].join(" ")}
              >
                <h4 className="text-[10px] font-bold uppercase tracking-wide text-zinc-100">
                  {categoryLabelForMode(cat, isEn)}
                </h4>
                {!compact ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                    {categoryBlurbForMode(cat, isEn, isCostMode)}
                  </p>
                ) : null}
              </div>
              <div className={handGridClass}>
                {hands.map((t) => {
                  const left = poolForActor[t.id] ?? 0;
                  const sel = pick === t.id;
                  const usedUp = left <= 0;
                  const tooExpensive = isCostMode && costForActor < t.cost;
                  const dead = usedUp || tooExpensive;
                  const disabledReason = usedUp
                    ? isEn
                      ? "used"
                      : "사용 완료"
                    : tooExpensive
                      ? isEn
                        ? "not enough cost"
                        : "코스트 부족"
                      : null;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={dead}
                      onClick={() => onHandClick(t.id)}
                      title={
                        isCostMode
                          ? `${templateLabel(t)} · ${t.cost} COST${
                              disabledReason ? ` · ${disabledReason}` : ""
                            }`
                          : isEn
                            ? `${templateLabel(t)} · remaining ×${left}`
                            : `${templateLabel(t)} · 잔여 ×${left}`
                      }
                      aria-label={
                        isCostMode
                          ? `${templateLabel(t)} cost ${t.cost}, remaining ${left}${
                              disabledReason ? `, ${disabledReason}` : ""
                            }`
                          : `${templateLabel(t)} remaining ${left}${
                              disabledReason ? `, ${disabledReason}` : ""
                            }`
                      }
                      className={[
                        "group relative flex w-[3.75rem] flex-none flex-col items-center justify-center rounded-md border px-0.5 py-1 text-center transition-all",
                        btnMinH,
                        dead && isCostMode
                          ? usedUp
                            ? "cursor-not-allowed border-zinc-600/70 bg-zinc-800/45 opacity-80"
                            : "cursor-not-allowed border-zinc-700/80 bg-zinc-800/35 opacity-75"
                          : dead
                            ? "cursor-not-allowed border-zinc-700/80 bg-zinc-800/35 opacity-50 grayscale"
                          : sel
                            ? "border-violet-400 bg-gradient-to-b from-violet-800/55 to-violet-900/65 shadow-[0_0_14px_rgba(167,139,250,0.4)] ring-1 ring-violet-400/55"
                            : "border-zinc-500/90 bg-zinc-700/55 hover:border-violet-500/55 hover:bg-zinc-600/65",
                      ].join(" ")}
                    >
                      <HandTemplateCardPreview template={t} />
                      <span className="sr-only">{templateLabel(t)}</span>
                      {isCostMode ? (
                        <span
                          className={[
                            "mt-1.5 inline-flex h-3 items-center justify-center font-bold leading-none",
                            compact ? "text-[11px]" : "text-xs",
                            dead
                              ? "text-zinc-400"
                              : sel
                                ? "text-amber-100"
                                : "text-amber-200/90",
                          ].join(" ")}
                        >
                          {t.cost} COST
                        </span>
                      ) : null}
                      <span
                        className={[
                          isCostMode ? "hidden" : "",
                          "mt-1.5 font-medium leading-none",
                          compact ? "text-[10.35px]" : "text-[11.5px]",
                          dead ? "text-zinc-500" : "text-zinc-400",
                        ].join(" ")}
                      >
                        ×{left}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div
        className={[
          "mt-2 rounded-lg border border-zinc-600/80 bg-zinc-800/55",
          wideLayout ? "space-y-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:items-center lg:gap-4 lg:space-y-0" : "space-y-2",
          compact ? "p-2" : "p-2.5",
        ].join(" ")}
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {isEn ? "Current Pick" : "현재 선택"}
          </div>
          {tpl ? (
            <div className="mt-1 flex min-w-0 items-start gap-2 text-xs">
              <HandTemplateCardPreview template={tpl} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-zinc-50">
                  <span className="text-zinc-400">{isEn ? "Hand · " : "핸드 · "}</span>
                  <span className="font-mono font-semibold text-amber-100">
                    {templateLabel(tpl)}
                  </span>
                  <span className="text-zinc-400">
                    {" "}
                    (
                    {isEn
                      ? tpl.kind === "pair"
                        ? "pair"
                        : tpl.kind === "suited"
                          ? "suited"
                          : "offsuit"
                      : kindLabelKo(tpl)}
                    )
                  </span>
                </p>
                <p className="text-[11px] text-zinc-300">
                  <span className="text-zinc-500">{isEn ? "Category · " : "카테고리 · "}</span>
                  {categoryForPick != null
                    ? categoryLabelForMode(categoryForPick, isEn)
                    : null}
                </p>
                {isCostMode ? (
                  <div className="mt-1 grid min-w-0 gap-1 rounded-md border border-amber-400/25 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-50">
                    <p className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="min-w-0 text-amber-200/75">{isEn ? "Selected hand" : "선택 핸드"}</span>
                      <span className="font-mono font-bold">{templateLabel(tpl)}</span>
                    </p>
                    <p className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="min-w-0 text-amber-200/75">{isEn ? "Cost" : "소모 코스트"}</span>
                      <span className="font-mono font-bold">{tpl.cost}</span>
                    </p>
                    <p className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="min-w-0 text-amber-200/75">{isEn ? "After pick" : "선택 후 남은 코스트"}</span>
                      <span className="font-mono font-bold">{selectedAfterCost}</span>
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-zinc-400">
              {isEn ? "Choose a hand above." : "위에서 핸드를 고르세요."}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canConfirm}
          className={[
            "min-h-10 w-full rounded-lg px-2 py-2 text-xs font-semibold leading-tight break-words transition-colors sm:text-sm",
            canConfirm
              ? "bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700"
              : "cursor-not-allowed bg-zinc-700 text-zinc-400",
          ].join(" ")}
        >
          {confirmLabel}
        </button>
        {pending != null ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            {isEn
              ? "Until your opponent finishes, you can still choose another hand and lock again."
              : "확정 후에도 상대가 끝나기 전까지는 다른 핸드로 골라 다시 확정할 수 있어요."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function HandSelectPanel({
  state,
  playerNames,
  mySeat,
  onSelect,
  onMystery,
}: HandSelectPanelProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const phase = state.handSelectPhase;
  if (phase === "done") return null;

  const compact = true;

  if (mySeat !== undefined) {
    return (
      <div className="rounded-xl border border-violet-600/45 bg-violet-900/18 p-2 sm:p-3 lg:p-4">
        <HandPickerColumn
          state={state}
          player={mySeat}
          titleName={playerNames[mySeat]!}
          compact={compact}
          wideLayout
          onSelect={onSelect}
          onMystery={onMystery}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-600/45 bg-violet-900/22 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-3">
      <h3 className="mb-2 text-sm font-semibold text-violet-50">
        {isEn ? "Hand Select" : "핸드 선택"}{" "}
        <span className="font-normal text-violet-200/90">
          {isEn ? "— pick simultaneously, then lock individually" : "— 둘 다 동시에 고른 뒤 각자 확정"}
        </span>
      </h3>
      <p className="mb-3 text-[11px] leading-snug text-zinc-400">
        {isEn
          ? "No turn wait needed. If one side locks first, play continues as soon as the other side locks."
          : "차례를 기다리지 않아도 됩니다. 한쪽만 먼저 확정하면 다른 쪽 확정 시 바로 이어집니다."}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <HandPickerColumn
          state={state}
          player={0}
          titleName={playerNames[0]!}
          compact={compact}
          wideLayout={false}
          onSelect={onSelect}
          onMystery={onMystery}
        />
        <HandPickerColumn
          state={state}
          player={1}
          titleName={playerNames[1]!}
          compact={compact}
          wideLayout={false}
          onSelect={onSelect}
          onMystery={onMystery}
        />
      </div>
      <p className="mt-3 rounded-md border border-zinc-600/70 bg-zinc-800/45 px-2.5 py-2 text-[10px] leading-snug text-zinc-400">
        {isEn
          ? "Card suits are a visual preview: suited hands use ♠♠, while pairs and offsuit hands use ♣♥. Actual suits are assigned separately to avoid deck collisions."
          : "카드 문양은 미리보기입니다. 수딧은 ♠♠, 페어·오프수딧은 ♣♥로 표시되며 실제 문양은 카드 충돌을 피하도록 별도로 배정됩니다."}
      </p>
    </div>
  );
}

