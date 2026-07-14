"use client";

import * as React from "react";
import type { Difficulty } from "@/holdem/aiPlayer";
import { HELL_UNLOCK_HARD_MATCH_WINS } from "@/holdem/constants";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import type { HoldemGameMode } from "@/holdem/types";
import {
  getHardModeMatchWins,
  isHellModeUnlocked,
} from "@/holdem/singlePlayerProgress";
import HoldemSinglePlayerClient from "../HoldemSinglePlayerClient";

type DifficultyMeta = {
  id: Difficulty;
  label: string;
  descKo: string;
  descEn: string;
  color: string;
};

const DIFFICULTIES: DifficultyMeta[] = [
  {
    id: "easy",
    label: "Easy",
    descKo: "랜덤 기반 · 입문자 추천",
    descEn: "Random-based · recommended for beginners",
    color: "border-emerald-500/60 hover:border-emerald-400 text-emerald-300",
  },
  {
    id: "normal",
    label: "Normal",
    descKo: "기본 전략 · 균형 잡힌 AI",
    descEn: "Basic strategy · balanced AI",
    color: "border-amber-500/60 hover:border-amber-400 text-amber-300",
  },
  {
    id: "hard",
    label: "Hard",
    descKo: "GTO 기반 · 성향 시스템 적용",
    descEn: "GTO-based · personality system enabled",
    color: "border-rose-500/60 hover:border-rose-400 text-rose-300",
  },
];

export default function SinglePlayerEntry() {
  const { locale, t } = useHoldemI18n();
  const isEn = locale === "en";
  const [difficulty, setDifficulty] = React.useState<Difficulty | null>(null);
  const [gameMode, setGameMode] = React.useState<HoldemGameMode>("classic");
  const [hardWins, setHardWins] = React.useState(0);

  React.useEffect(() => {
    setHardWins(getHardModeMatchWins());
    const fn = () => setHardWins(getHardModeMatchWins());
    window.addEventListener("holdem-sp-progress-changed", fn);
    return () => window.removeEventListener("holdem-sp-progress-changed", fn);
  }, []);

  const hellUnlocked = isHellModeUnlocked();

  if (difficulty) {
    return <HoldemSinglePlayerClient difficulty={difficulty} gameMode={gameMode} />;
  }

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4">
      {/* 타이틀 */}
      <div className="mb-10 text-center">
        <h1 className="mb-2 text-3xl font-black tracking-tight text-zinc-100">
          {isEn ? "Single-player" : "싱글플레이"}
        </h1>
        <p className="text-sm text-zinc-400">
          {isEn
            ? "30-round Hand Select Hold'em vs AI"
            : "AI 상대와 30라운드 핸드폴 홀덤"}
        </p>
      </div>

      {/* 난이도 선택 */}
      <div className="w-full max-w-sm space-y-3">
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-zinc-700 bg-zinc-900/50 p-1.5">
          {(["classic", "cost"] as HoldemGameMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGameMode(mode)}
              className={[
                "rounded-lg px-3 py-2 text-xs font-bold uppercase transition",
                gameMode === mode
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
              ].join(" ")}
            >
              {mode === "classic" ? "Classic" : "Cost"}
            </button>
          ))}
        </div>
        {DIFFICULTIES.map(({ id, label, descKo, descEn, color }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDifficulty(id)}
            className={`w-full rounded-xl border-2 bg-zinc-800/60 px-6 py-4 text-left transition-all duration-150 active:scale-[0.98] ${color}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-bold">{label}</span>
              <span className="text-[11px] text-zinc-500">
                {isEn ? "▶ Start" : "▶ 시작"}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              {isEn ? descEn : descKo}
            </p>
          </button>
        ))}

        {/* Hell — Hard 매치 승리 10회 잠금 해제 */}
        <div
          className={[
            "w-full rounded-xl border-2 px-6 py-4 text-left transition-all duration-150",
            hellUnlocked
              ? "border-fuchsia-500/65 bg-zinc-800/60 text-fuchsia-200 hover:border-fuchsia-400"
              : "cursor-not-allowed border-zinc-600/45 bg-zinc-900/35 text-zinc-500",
          ].join(" ")}
        >
          <button
            type="button"
            disabled={!hellUnlocked}
            onClick={() => hellUnlocked && setDifficulty("hell")}
            className={[
              "w-full text-left",
              hellUnlocked
                ? "active:scale-[0.98]"
                : "cursor-not-allowed opacity-90",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-bold">{t("single.hellTitle")}</span>
              {hellUnlocked ? (
                <span className="text-[11px] text-fuchsia-400/90">
                  {isEn ? "▶ Start" : "▶ 시작"}
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {isEn ? "Locked" : "잠금"}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              {t("single.hellDesc")}
            </p>
          </button>
          {!hellUnlocked ? (
            <p className="mt-2 border-t border-zinc-700/50 pt-2 text-[11px] leading-relaxed text-zinc-500">
              {t("single.hellLockedHint")}
              <span className="mt-1 block font-mono text-fuchsia-300/80">
                {isEn ? "Hard wins: " : "Hard 승리: "}
                {Math.min(hardWins, HELL_UNLOCK_HARD_MATCH_WINS)}/
                {HELL_UNLOCK_HARD_MATCH_WINS}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* AI 소개 */}
      <div className="mt-10 max-w-sm rounded-lg bg-zinc-800/40 px-5 py-4 text-[12px] text-zinc-400">
        <p className="mb-1.5 font-semibold text-zinc-300">
          {isEn ? "AI Personality System" : "AI 성향 시스템"}
        </p>
        <ul className="space-y-1">
          {isEn ? (
            <>
              <li>• Aggressive / Passive / Tight / Loose — applied randomly</li>
              <li>• Personality shifts slightly based on chip difference</li>
              <li>• Includes bluffing and IA usage</li>
            </>
          ) : (
            <>
              <li>• Aggressive / Passive / Tight / Loose 중 랜덤 적용</li>
              <li>• 칩 차이에 따라 성향이 일부 변화</li>
              <li>• 블러프 · IA 사용 포함</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
