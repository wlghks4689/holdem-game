"use client";

import * as React from "react";
import type { PlayerIndex } from "@/holdem/types";

function rankLabel(r: number): string {
  if (r === 14) return "A";
  if (r === 13) return "K";
  if (r === 12) return "Q";
  if (r === 11) return "J";
  if (r === 10) return "T";
  return String(r);
}

const SUIT = ["♠", "♥"] as const;
const SUIT_COLOR = ["text-zinc-800", "text-rose-600"] as const;

const AUTO_CLOSE_MS = 5200;

export type HighCardDrawOverlayProps = {
  draw: { ranks: [number, number]; winnerSeat: PlayerIndex };
  playerNames: [string, string];
  mySeat: PlayerIndex;
  onClose: () => void;
};

/**
 * intro  → deal(뒷면 동시 딜) → flip(앞면 동시 오픈)
 * → result(승자 GLOW / 패자 흑백) → done
 */
type AnimPhase = "intro" | "deal" | "flip" | "result" | "done";

export function HighCardDrawOverlay({
  draw,
  playerNames,
  mySeat,
  onClose,
}: HighCardDrawOverlayProps) {
  const [animPhase, setAnimPhase] = React.useState<AnimPhase>("intro");
  const timerRefs = React.useRef<number[]>([]);
  const drawKey = `${draw.ranks[0]}-${draw.ranks[1]}-${draw.winnerSeat}`;
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const clearAll = React.useCallback(() => {
    timerRefs.current.forEach((id) => window.clearTimeout(id));
    timerRefs.current = [];
  }, []);

  const sched = React.useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timerRefs.current.push(id);
  }, []);

  React.useEffect(() => {
    clearAll();
    setAnimPhase("intro");
    sched(() => setAnimPhase("deal"),   700);   // 뒷면 동시 딜
    sched(() => setAnimPhase("flip"),   1650);  // 앞면 동시 오픈
    sched(() => setAnimPhase("result"), 2500);  // GLOW / 흑백
    sched(() => { setAnimPhase("done"); onCloseRef.current(); }, AUTO_CLOSE_MS);
    return clearAll;
  }, [drawKey, sched, clearAll]);

  const skip = React.useCallback(() => {
    clearAll();
    setAnimPhase("done");
    onCloseRef.current();
  }, [clearAll]);

  if (animPhase === "done") return null;

  const { ranks, winnerSeat } = draw;
  const winnerName = playerNames[winnerSeat];
  const oppSeat: PlayerIndex = mySeat === 0 ? 1 : 0;
  const myRank = rankLabel(ranks[mySeat]);
  const oppRank = rankLabel(ranks[oppSeat]);

  const isDeal   = animPhase !== "intro";
  const isFlipped = animPhase === "flip" || animPhase === "result";
  const isResult  = animPhase === "result";

  const renderCard = (seat: PlayerIndex) => {
    const isWinner = winnerSeat === seat;
    const isMe     = seat === mySeat;

    let cardStyle: React.CSSProperties = {};
    let borderBg = "";

    if (!isDeal) {
      cardStyle = { opacity: 0 };
      borderBg  = "border-zinc-700/40 bg-transparent";
    } else if (!isFlipped) {
      // 뒷면 — 위에서 내려오는 딜 애니메이션
      cardStyle = { animation: "holdem-hcd-deal-in 0.45s cubic-bezier(0.22,1,0.36,1) both" };
      borderBg  = "border-zinc-600 bg-zinc-800";
    } else if (isResult && isWinner) {
      // 승자 — amber GLOW
      cardStyle = { animation: "holdem-hcd-winner-glow 0.6s ease-out forwards" };
      borderBg  = "border-amber-400 bg-zinc-50";
    } else if (isResult && !isWinner) {
      // 패자 — 흑백 + 어둡게
      cardStyle = { filter: "grayscale(1) brightness(0.5)" };
      borderBg  = "border-zinc-400 bg-zinc-50";
    } else {
      // flip 직후 — 앞면 회전 공개
      cardStyle = { animation: "holdem-hcd-card-flip 0.42s cubic-bezier(0.22,1,0.36,1) both" };
      borderBg  = "border-zinc-400 bg-zinc-50";
    }

    return (
      <div className="flex flex-col items-center gap-2">
        <span
          className={[
            "text-xs font-semibold",
            isMe ? "text-sky-300" : "text-zinc-300",
          ].join(" ")}
        >
          {playerNames[seat]}
          {isMe ? " (나)" : ""}
        </span>

        <div
          className={`relative flex h-28 w-20 items-center justify-center rounded-xl border-2 ${borderBg}`}
          style={cardStyle}
        >
          {isFlipped ? (
            <div className="flex flex-col items-center">
              <span
                className={[
                  "font-extrabold text-4xl leading-none",
                  isResult && isWinner ? "text-amber-600" : "text-zinc-800",
                ].join(" ")}
              >
                {rankLabel(ranks[seat])}
              </span>
              <span className={["text-xl leading-none", SUIT_COLOR[seat]].join(" ")}>
                {SUIT[seat]}
              </span>
            </div>
          ) : isDeal ? (
            /* 뒷면 패턴 */
            <div className="grid grid-cols-3 gap-0.5 opacity-30">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              ))}
            </div>
          ) : null}
        </div>

        {isFlipped && (
          <span
            className={[
              "text-[11px] font-mono font-semibold",
              isResult && isWinner ? "text-amber-300" : "text-zinc-500",
            ].join(" ")}
          >
            {rankLabel(ranks[seat])}
            {ranks[0] === ranks[1] ? " (동점)" : ""}
          </span>
        )}
      </div>
    );
  };

  return (
    <button
      type="button"
      aria-label="클릭하여 건너뛰기"
      onClick={skip}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-zinc-950/85 backdrop-blur-sm"
      style={{ animation: "holdem-hcd-backdrop-in 0.3s ease-out both" }}
    >
      {/* 제목 */}
      <div
        className="text-center"
        style={{ animation: "holdem-hcd-title-in 0.45s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400/80">
          Game Start
        </p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-50">
          하이카드 드로우
        </p>
        <p className="mt-0.5 text-sm text-zinc-400">
          더 높은 카드를 받은 플레이어가 버튼(SB)로 시작합니다
        </p>
      </div>

      {/* 두 카드 */}
      <div className="flex items-end gap-10 sm:gap-16">
        {renderCard(0)}
        <span className="mb-14 text-xl font-bold text-zinc-600">VS</span>
        {renderCard(1)}
      </div>

      {/* 결과 배너 */}
      {isResult && (
        <div
          className="rounded-2xl border border-amber-500/50 bg-amber-950/60 px-6 py-3 text-center"
          style={{ animation: "holdem-hcd-result-in 0.4s cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <p className="text-lg font-extrabold text-amber-200">
            {winnerName}
            {winnerSeat === mySeat ? " (나)" : ""}
          </p>
          <p className="mt-0.5 text-sm text-amber-300/80">
            버튼 (SB) 획득 — 프리플랍 먼저 액션
          </p>
          <p className="mt-1 text-xs text-amber-100/90">
            상대 {oppRank} vs 나 {myRank} →{" "}
            {winnerSeat === mySeat ? "나 선플레이어" : "상대 선플레이어"}
          </p>
        </div>
      )}

      <p className="text-[11px] text-zinc-600">탭하여 건너뛰기</p>
    </button>
  );
}
