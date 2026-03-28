"use client";

import * as React from "react";
import {
  ALL_HAND_TEMPLATES,
  findTemplate,
  normalizeHandPoolRemaining,
  templateLabel,
} from "@/holdem/handPool";
import { HU_BB_LABEL, HU_DEALER_SB_LABEL } from "@/holdem/headsUpLabels";
import type {
  GameState,
  HandPoolTemplate,
  OpponentHandCategory,
  PlayerIndex,
} from "@/holdem/types";

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

function kindLabelKo(t: HandPoolTemplate): string {
  if (t.kind === "pair") return "페어";
  if (t.kind === "suited") return "수딧";
  return "오프수트";
}

function groupTemplatesByCategory(): Map<OpponentHandCategory, HandPoolTemplate[]> {
  const m = new Map<OpponentHandCategory, HandPoolTemplate[]>();
  for (const c of CATEGORY_ORDER) m.set(c, []);
  for (const t of ALL_HAND_TEMPLATES) {
    m.get(t.iaCategory)!.push(t);
  }
  return m;
}

const TEMPLATES_BY_CATEGORY = groupTemplatesByCategory();

export type HandSelectPanelProps = {
  state: GameState;
  playerNames: [string, string];
  /** 온라인 방: 내 좌석만 선택 UI 표시 */
  mySeat?: PlayerIndex;
  onSelect: (player: PlayerIndex, templateId: string) => void;
};

type ColumnProps = {
  state: GameState;
  player: PlayerIndex;
  titleName: string;
  /** 좁은 뷰·2열 레이아웃용 밀도 높은 그리드 */
  compact: boolean;
  onSelect: (player: PlayerIndex, templateId: string) => void;
};

function HandPickerColumn({
  state,
  player,
  titleName,
  compact,
  onSelect,
}: ColumnProps) {
  const phase = state.handSelectPhase;
  const [pick, setPick] = React.useState<string | null>(null);

  const pending = state.handPickPending[player];

  React.useEffect(() => {
    setPick(null);
  }, [phase, state.roundNumber, player]);

  const tpl = pick ? findTemplate(pick) : null;
  const categoryForPick = tpl?.iaCategory ?? null;
  const canConfirm = tpl != null;

  const poolForActor = React.useMemo(() => {
    const pools = normalizeHandPoolRemaining(state.handPoolRemaining as unknown);
    return pools[player] ?? {};
  }, [state.handPoolRemaining, player]);

  const posLabel =
    state.button === player ? HU_DEALER_SB_LABEL : HU_BB_LABEL;

  const submit = () => {
    if (!tpl || !canConfirm) return;
    onSelect(player, tpl.id);
  };

  const onHandClick = (id: string) => {
    const left = poolForActor[id] ?? 0;
    if (left <= 0) return;
    setPick(id);
  };

  const catGridClass = compact
    ? "grid grid-cols-2 gap-1.5"
    : "grid grid-cols-2 gap-2 lg:grid-cols-3";
  const handGridClass = compact
    ? "grid grid-cols-4 gap-1"
    : "grid grid-cols-3 gap-1.5 sm:grid-cols-4";
  const btnMinH = compact ? "min-h-[2.35rem]" : "min-h-[3.25rem]";
  const monoSize = compact ? "text-xs" : "text-sm";

  return (
    <div
      className={[
        "rounded-xl border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[box-shadow,border-color,background-color] duration-300",
        pending != null
          ? "border-emerald-500/45 bg-emerald-950/25 shadow-[0_0_24px_rgba(52,211,153,0.12)]"
          : "border-amber-500/40 bg-amber-950/15 shadow-[0_0_22px_rgba(251,191,36,0.12)] ring-1 ring-amber-400/25",
      ].join(" ")}
    >
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs font-semibold text-zinc-50 sm:text-sm">
        <span>{titleName}</span>
        <span className="font-normal text-violet-200/90">({posLabel})</span>
        {pending != null ? (
          <span className="ml-auto rounded-full bg-emerald-600/35 px-2 py-px text-[10px] font-bold text-emerald-100">
            확정됨
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-amber-600/30 px-2 py-px text-[10px] font-bold text-amber-100">
            선택 중
          </span>
        )}
      </h3>

      <div className={catGridClass}>
        {CATEGORY_ORDER.map((cat) => {
          const hands = TEMPLATES_BY_CATEGORY.get(cat) ?? [];
          return (
            <section
              key={cat}
              title={CATEGORY_BLURB[cat]}
              className={[
                "rounded-md border border-zinc-600/70 bg-zinc-800/55",
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
                  {cat}
                </h4>
                {!compact ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                    {CATEGORY_BLURB[cat]}
                  </p>
                ) : null}
              </div>
              <div className={handGridClass}>
                {hands.map((t) => {
                  const left = poolForActor[t.id] ?? 0;
                  const sel = pick === t.id;
                  const dead = left <= 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={dead}
                      onClick={() => onHandClick(t.id)}
                      title={`${templateLabel(t)} · 잔여 ×${left}`}
                      className={[
                        "group relative flex flex-col items-center justify-center rounded-md border px-0.5 py-1 text-center transition-all",
                        btnMinH,
                        dead
                          ? "cursor-not-allowed border-zinc-700/80 bg-zinc-800/35 opacity-50 grayscale"
                          : sel
                            ? "border-violet-400 bg-gradient-to-b from-violet-800/55 to-violet-900/65 shadow-[0_0_14px_rgba(167,139,250,0.4)] ring-1 ring-violet-400/55"
                            : "border-zinc-500/90 bg-zinc-700/55 hover:border-violet-500/55 hover:bg-zinc-600/65",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "font-mono font-bold leading-none tracking-tight",
                          monoSize,
                          dead ? "text-zinc-500" : sel ? "text-violet-50" : "text-zinc-50",
                        ].join(" ")}
                      >
                        {templateLabel(t)}
                      </span>
                      <span
                        className={[
                          "mt-0.5 font-medium leading-none",
                          compact ? "text-[9px]" : "text-[10px]",
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
          "mt-2 space-y-2 rounded-lg border border-zinc-600/80 bg-zinc-800/55",
          compact ? "p-2" : "p-2.5",
        ].join(" ")}
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            현재 선택
          </div>
          {tpl ? (
            <div className="mt-1 space-y-0.5 text-xs">
              <p className="text-zinc-50">
                <span className="text-zinc-400">핸드 · </span>
                <span className="font-mono font-semibold text-amber-100">
                  {templateLabel(tpl)}
                </span>
                <span className="text-zinc-400"> ({kindLabelKo(tpl)})</span>
              </p>
              <p className="text-[11px] text-zinc-300">
                <span className="text-zinc-500">카테고리 · </span>
                {categoryForPick}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-zinc-400">위에서 핸드를 고르세요.</p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canConfirm}
          className={[
            "w-full rounded-lg py-2 text-xs font-semibold transition-colors sm:text-sm",
            canConfirm
              ? "bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700"
              : "cursor-not-allowed bg-zinc-700 text-zinc-400",
          ].join(" ")}
        >
          이 핸드로 확정
        </button>
        {pending != null ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            확정 후에도 상대가 끝나기 전까지는 다른 핸드로 골라 다시 확정할 수
            있어요.
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
}: HandSelectPanelProps) {
  const phase = state.handSelectPhase;
  if (phase === "done") return null;

  const compact = true;

  if (mySeat !== undefined) {
    return (
      <div className="rounded-xl border border-violet-600/45 bg-violet-900/18 p-2 sm:p-3">
        <p className="mb-2 text-[11px] leading-snug text-violet-100/85">
          링크로 같이 하는 상대와 <strong className="text-violet-50">동시에</strong>{" "}
          고르고, 각자 이 화면에서 확정하세요.
        </p>
        <HandPickerColumn
          state={state}
          player={mySeat}
          titleName={playerNames[mySeat]!}
          compact={compact}
          onSelect={onSelect}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-600/45 bg-violet-900/22 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-3">
      <h3 className="mb-2 text-sm font-semibold text-violet-50">
        핸드 선택{" "}
        <span className="font-normal text-violet-200/90">
          — 둘 다 동시에 고른 뒤 각자 확정
        </span>
      </h3>
      <p className="mb-3 text-[11px] leading-snug text-zinc-400">
        차례를 기다리지 않아도 됩니다. 한쪽만 먼저 확정하면 다른 쪽 확정 시
        바로 이어집니다.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <HandPickerColumn
          state={state}
          player={0}
          titleName={playerNames[0]!}
          compact={compact}
          onSelect={onSelect}
        />
        <HandPickerColumn
          state={state}
          player={1}
          titleName={playerNames[1]!}
          compact={compact}
          onSelect={onSelect}
        />
      </div>
      <p className="mt-3 rounded-md border border-zinc-600/70 bg-zinc-800/45 px-2.5 py-2 text-[10px] leading-snug text-zinc-400">
        페어·수딧·오프는 문양 없이 고릅니다. 같은 핸드여도 52장에 겹치지 않게
        문양이 무작위로 배정됩니다.
      </p>
    </div>
  );
}
