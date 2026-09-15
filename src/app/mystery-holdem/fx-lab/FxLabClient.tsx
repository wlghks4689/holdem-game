"use client";

import * as React from "react";
import Link from "next/link";
import type { Card } from "@/holdem/cards";
import { PlayingCard } from "@/app/holdem/components/Card";
import { computeBestHandForPlayer } from "@/mysteryHoldem/showdown";
import type { PlayerState, Seat } from "@/mysteryHoldem/types";
import { HeroCardsWithMadeFx, buildMadeFx, useMadeHandFxEnabled } from "../madeFx";

/**
 * 메이드 연출 확인용 화면.
 *
 * 게임에서 연출을 확인하려면 그 족보가 실제로 나올 때까지 판을 돌려야 한다. 스트레이트
 * 플러시처럼 드문 족보는 사실상 확인이 불가능하고, "플랍에서는 플러시였다가 리버에서
 * 스티플로 바뀌는" 전환 과정은 더더욱 재현하기 어렵다.
 *
 * 연출 계산은 madeFx.ts를 그대로 쓴다 — 이 화면이 연출을 따로 구현하면, 여기서 멀쩡해
 * 보여도 게임에서는 다르게 나올 수 있어 확인의 의미가 없어진다.
 */

const C = (rank: number, suit: "s" | "h" | "d" | "c"): Card => ({ rank, suit }) as Card;

interface Scenario {
  id: string;
  label: string;
  note?: string;
  hole: Card[];
  /** 5장 전부. 스트리트는 앞에서부터 3/4/5장으로 잘라 쓴다 */
  board: Card[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "sf-river",
    label: "스트레이트 플러시 (리버 완성)",
    note: "턴까지는 플러시, 리버에서 스티플로 올라간다 — 전환 연출을 보는 시나리오",
    hole: [C(9, "h"), C(10, "h")],
    board: [C(6, "h"), C(7, "h"), C(13, "s"), C(2, "h"), C(8, "h")],
  },
  {
    id: "sf-flop",
    label: "스트레이트 플러시 (플랍 완성)",
    note: "플랍부터 스티플 — 중간 단계 없이 바로 최종 연출이 나오는지 확인",
    hole: [C(9, "h"), C(10, "h")],
    board: [C(6, "h"), C(7, "h"), C(8, "h"), C(13, "s"), C(2, "d")],
  },
  {
    id: "quads",
    label: "포카드",
    hole: [C(9, "h"), C(9, "d")],
    board: [C(9, "s"), C(9, "c"), C(13, "s"), C(2, "d"), C(5, "c")],
  },
  {
    id: "full-house",
    label: "풀하우스 (턴에서 트립스 → 리버에서 풀하우스)",
    hole: [C(9, "h"), C(9, "d")],
    board: [C(9, "s"), C(4, "c"), C(13, "s"), C(2, "d"), C(13, "c")],
  },
  {
    id: "flush",
    label: "플러시",
    hole: [C(14, "h"), C(10, "h")],
    board: [C(6, "h"), C(7, "h"), C(13, "s"), C(2, "h"), C(4, "d")],
  },
  {
    id: "straight",
    label: "스트레이트",
    hole: [C(9, "s"), C(10, "h")],
    board: [C(6, "h"), C(7, "c"), C(8, "d"), C(13, "s"), C(2, "d")],
  },
  {
    id: "trips",
    label: "트립스",
    hole: [C(9, "h"), C(9, "d")],
    board: [C(9, "s"), C(4, "c"), C(13, "s"), C(2, "d"), C(7, "c")],
  },
  {
    id: "two-pair",
    label: "투페어",
    hole: [C(9, "h"), C(13, "d")],
    board: [C(9, "s"), C(13, "c"), C(4, "s"), C(2, "d"), C(7, "c")],
  },
  {
    id: "pair",
    label: "원페어",
    hole: [C(9, "h"), C(3, "d")],
    board: [C(9, "s"), C(12, "c"), C(4, "s"), C(2, "d"), C(7, "c")],
  },
  {
    id: "high-card",
    label: "하이카드 (연출 없음)",
    hole: [C(14, "h"), C(3, "d")],
    board: [C(9, "s"), C(12, "c"), C(4, "s"), C(2, "d"), C(7, "c")],
  },
];

const STREETS = [
  { revealed: 0, label: "프리플랍" },
  { revealed: 3, label: "플랍" },
  { revealed: 4, label: "턴" },
  { revealed: 5, label: "리버" },
] as const;

function fakePlayer(hole: Card[]): PlayerState {
  return {
    seat: 0 as Seat,
    name: "FX Lab",
    chips: 40_000,
    pendingDeal: [],
    discarded: [],
    holeCards: hole,
    inHand: true,
    folded: false,
    allIn: false,
    busted: false,
    streetContribution: 0,
    handContribution: 0,
    anteContribution: 0,
    mission: null,
    missionPoint: 0,
    bountyPoint: 0,
    survivalPoint: 0,
    chipPoint: 0,
    totalPoint: 0,
  };
}

export function FxLabClient() {
  const enabled = useMadeHandFxEnabled();
  const [scenarioId, setScenarioId] = React.useState(SCENARIOS[0]!.id);
  const [revealed, setRevealed] = React.useState(5);
  const [round, setRound] = React.useState(1);
  const [running, setRunning] = React.useState(false);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const player = React.useMemo(() => fakePlayer(scenario.hole), [scenario]);
  const board = scenario.board.slice(0, revealed);

  /*
    게임과 같은 keyPrefix를 쓴다. replayKey가 `${prefix}-${kind}`라서, 족보 종류가 바뀔 때만
    연출이 다시 재생된다 — 이 화면의 목적이 바로 그 재생 시점을 눈으로 확인하는 것이다.
  */
  const fx = buildMadeFx(enabled, player, board, `mystery-made-fx-${round}`);
  const value = board.length >= 3 ? computeBestHandForPlayer(player, board) : null;

  // 스트리트 자동 진행 — 플랍부터 리버까지 1.2초 간격으로 넘긴다.
  React.useEffect(() => {
    if (!running) return;
    if (revealed >= 5) {
      setRunning(false);
      return;
    }
    const next = revealed < 3 ? 3 : revealed + 1;
    const timer = setTimeout(() => setRevealed(next), 1200);
    return () => clearTimeout(timer);
  }, [running, revealed]);

  const startRunout = () => {
    setRound((r) => r + 1); // 연출 키를 새로 뽑아 처음부터 다시 재생시킨다
    setRevealed(0);
    setRunning(true);
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 text-zinc-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/mystery-holdem"
            className="rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-700"
          >
            ← MysteryHoldem
          </Link>
          <p className="text-xs text-zinc-500">
            메이드 연출: {enabled ? "켜짐" : "꺼짐 (설정에서 켜세요)"}
          </p>
        </div>

        <div>
          <h1 className="text-xl font-black tracking-tight">메이드 연출 테스트</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            게임과 같은 계산(madeFx.tsx)을 씁니다. 스트리트를 넘기면 족보가 바뀌는 시점에
            연출이 다시 재생되는지 확인할 수 있습니다.
          </p>
        </div>

        {/* 시나리오 */}
        <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">시나리오</p>
          <div className="flex flex-wrap gap-1.5">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScenarioId(s.id);
                  setRound((r) => r + 1);
                }}
                aria-pressed={s.id === scenarioId}
                className={[
                  "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                  s.id === scenarioId
                    ? "border-fuchsia-500 bg-fuchsia-900/40 text-fuchsia-100"
                    : "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60",
                ].join(" ")}
              >
                {s.label}
              </button>
            ))}
          </div>
          {scenario.note != null ? (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">{scenario.note}</p>
          ) : null}
        </div>

        {/* 스트리트 */}
        <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">스트리트</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {STREETS.map((st) => (
              <button
                key={st.revealed}
                type="button"
                onClick={() => {
                  setRunning(false);
                  setRevealed(st.revealed);
                }}
                aria-pressed={st.revealed === revealed}
                className={[
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  st.revealed === revealed
                    ? "border-sky-500 bg-sky-900/40 text-sky-100"
                    : "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60",
                ].join(" ")}
              >
                {st.label}
              </button>
            ))}
            <button
              type="button"
              onClick={startRunout}
              className="ml-auto rounded-lg border border-amber-600/60 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/40"
            >
              {running ? "진행 중..." : "런아웃 재생"}
            </button>
            <button
              type="button"
              onClick={() => setRound((r) => r + 1)}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
            >
              연출 다시 재생
            </button>
          </div>
        </div>

        {/* 보드 */}
        <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-400">보드</p>
          <div className="flex gap-1.5">
            {scenario.board.map((c, i) => (
              <div key={i} className={i < revealed ? "" : "opacity-20 grayscale"}>
                <PlayingCard card={c} size="board" />
              </div>
            ))}
          </div>
        </div>

        {/* 연출 대상 카드 */}
        <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-6">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            내 홀카드 + 연출
          </p>
          <div className="flex min-h-[9rem] items-center justify-center">
            <HeroCardsWithMadeFx cards={scenario.hole} size="board" fx={fx} />
          </div>
        </div>

        {/* 계산값 — 눈으로 본 것과 실제 값이 다를 수 있으므로 같이 적는다 */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
          <p>
            <span className="text-zinc-600">족보 </span>
            {value != null ? `rank=${value.rank} ${fx.label || "(연출 없음)"}` : "(보드 부족)"}
          </p>
          <p>
            <span className="text-zinc-600">tier </span>
            {fx.tier}
            <span className="text-zinc-600"> · kind </span>
            {fx.kind}
            <span className="text-zinc-600"> · burst </span>
            {String(fx.showBurst)}
          </p>
          <p>
            <span className="text-zinc-600">replayKey </span>
            {fx.replayKey}
          </p>
        </div>
      </div>
    </div>
  );
}
