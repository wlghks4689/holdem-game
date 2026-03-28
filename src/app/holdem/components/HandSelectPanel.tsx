"use client";

import * as React from "react";
import {
  ALL_HAND_TEMPLATES,
  findTemplate,
  normalizeHandPoolRemaining,
  templateLabel,
} from "@/holdem/handPool";
import { HU_BB_LABEL, HU_DEALER_SB_LABEL } from "@/holdem/headsUpLabels";
import type { GameState, HandPoolTemplate, OpponentHandCategory, PlayerIndex } from "@/holdem/types";

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

export function HandSelectPanel({
  state,
  playerNames,
  mySeat,
  onSelect,
}: HandSelectPanelProps) {
  const phase = state.handSelectPhase;
  const [pick, setPick] = React.useState<string | null>(null);

  const tpl = pick ? findTemplate(pick) : null;
  const categoryForPick = tpl?.iaCategory ?? null;

  React.useEffect(() => {
    setPick(null);
  }, [phase, state.roundNumber]);

  const canConfirm = tpl != null;

  /** hand_select 종료 후에도 hooks 개수 유지 — "done"일 때는 풀 조회용 인덱스만 안전한 기본값 */
  const selectingPlayer: PlayerIndex =
    phase === "button"
      ? state.button
      : phase === "bb"
        ? state.button === 0
          ? 1
          : 0
        : 0;

  const poolForActor = React.useMemo(() => {
    const pools = normalizeHandPoolRemaining(state.handPoolRemaining as unknown);
    return pools[selectingPlayer] ?? {};
  }, [state.handPoolRemaining, selectingPlayer]);

  const player: PlayerIndex = selectingPlayer;

  const submit = () => {
    if (!tpl || !canConfirm) return;
    onSelect(player, tpl.id);
  };

  const onHandClick = (id: string) => {
    const left = poolForActor[id] ?? 0;
    if (left <= 0) return;
    setPick(id);
  };

  if (phase !== "done" && mySeat !== undefined && selectingPlayer !== mySeat) {
    return (
      <div className="rounded-xl border border-violet-600/35 bg-violet-950/20 p-4 text-center text-sm text-violet-100/90">
        상대가 핸드 풀에서 핸드를 고르는 중입니다.
      </div>
    );
  }

  return phase === "done" ? null : (
    <div className="rounded-xl border border-violet-600/45 bg-violet-900/22 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <h3 className="mb-3 text-sm font-semibold text-violet-50">
        {playerNames[player]} 핸드 선택{" "}
        <span className="font-normal text-violet-200/95">
          ({phase === "button" ? HU_DEALER_SB_LABEL : HU_BB_LABEL})
        </span>
      </h3>

      <div className="lg:grid lg:grid-cols-2 lg:gap-3">
        {CATEGORY_ORDER.map((cat) => {
          const hands = TEMPLATES_BY_CATEGORY.get(cat) ?? [];
          return (
            <section
              key={cat}
              className="mb-3 rounded-lg border border-zinc-600/75 bg-zinc-800/50 p-2.5 last:mb-0 lg:mb-0"
            >
              <div className="mb-2 border-b border-zinc-600/70 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-100">
                  {cat}
                </h4>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                  {CATEGORY_BLURB[cat]}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                      className={[
                        "group relative flex min-h-[3.25rem] flex-col items-center justify-center rounded-lg border px-1.5 py-2 text-center transition-all",
                        dead
                          ? "cursor-not-allowed border-zinc-700/80 bg-zinc-800/35 opacity-50 grayscale"
                          : sel
                            ? "border-violet-400 bg-gradient-to-b from-violet-800/55 to-violet-900/65 shadow-[0_0_16px_rgba(167,139,250,0.35)] ring-1 ring-violet-400/60"
                            : "border-zinc-500/90 bg-zinc-700/55 hover:border-violet-500/55 hover:bg-zinc-600/65",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "font-mono text-sm font-bold tracking-tight",
                          dead ? "text-zinc-500" : sel ? "text-violet-50" : "text-zinc-50",
                        ].join(" ")}
                      >
                        {templateLabel(t)}
                      </span>
                      <span
                        className={[
                          "mt-0.5 text-[10px] font-medium",
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

      <div className="mt-4 space-y-3 rounded-lg border border-zinc-600/85 bg-zinc-800/60 p-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            현재 선택
          </div>
          {tpl ? (
            <div className="mt-1.5 space-y-0.5 text-sm">
              <p className="text-zinc-50">
                <span className="text-zinc-400">핸드 · </span>
                <span className="font-mono font-semibold text-amber-100">
                  {templateLabel(tpl)}
                </span>
                <span className="text-zinc-400"> ({kindLabelKo(tpl)})</span>
              </p>
              <p className="text-xs text-zinc-300">
                <span className="text-zinc-500">카테고리 · </span>
                {categoryForPick}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-zinc-400">위에서 핸드를 고르세요.</p>
          )}
        </div>

        <p className="rounded-md border border-zinc-600/80 bg-zinc-700/45 px-2.5 py-2 text-[11px] leading-snug text-zinc-300">
          페어·수딧·오프 모두 문양 없이 선택합니다. 상대와 같은 핸드여도 52장에 겹치지 않게 문양이
          균등 무작위로 배정됩니다.
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={!canConfirm}
          className={[
            "w-full rounded-lg py-2.5 text-sm font-semibold transition-colors",
            canConfirm
              ? "bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700"
              : "cursor-not-allowed bg-zinc-700 text-zinc-400",
          ].join(" ")}
        >
          이 핸드로 확정
        </button>
      </div>
    </div>
  );
}
