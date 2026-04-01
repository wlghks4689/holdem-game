import {
  HELL_AI_EXTRA_STARTING_CHIPS,
  HELL_UNLOCK_HARD_MATCH_WINS,
  STARTING_CHIPS,
} from "./constants";
import type { Difficulty } from "./aiPlayer";
import type { PlayerIndex } from "./types";

const STORAGE_HARD_WINS = "holdem_sp_hard_match_wins";

function readInt(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = window.localStorage.getItem(key);
    if (v == null) return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeInt(key: string, n: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(Math.max(0, Math.floor(n))));
  } catch {
    /* ignore */
  }
}

/** Hard 난이도 매치를 승리한 누적 횟수 (로컬) */
export function getHardModeMatchWins(): number {
  return readInt(STORAGE_HARD_WINS);
}

/**
 * 로컬에서 Hell 잠금 해제 (배포본과 동일 조건을 쓰려면 `next start` + env 미설정)
 * - `next dev`: 항상 해제
 * - 그 외: `.env.local`에 NEXT_PUBLIC_HOLDEM_DEV_UNLOCK_HELL=1 (또는 true)
 */
function isHellUnlockedForLocalDev(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  const v = process.env.NEXT_PUBLIC_HOLDEM_DEV_UNLOCK_HELL;
  return v === "1" || v === "true";
}

export function isHellModeUnlocked(): boolean {
  if (isHellUnlockedForLocalDev()) return true;
  return getHardModeMatchWins() >= HELL_UNLOCK_HARD_MATCH_WINS;
}

/** 싱글플레이에서 Hard로 매치 승리 시 1회 증가 */
export function recordHardModeMatchWin(): void {
  const next = getHardModeMatchWins() + 1;
  writeInt(STORAGE_HARD_WINS, next);
  try {
    window.dispatchEvent(new Event("holdem-sp-progress-changed"));
  } catch {
    /* ignore */
  }
}

/** Hell: 플레이어는 기본 스택, AI만 +100칩 */
export function singlePlayerInitialChips(
  difficulty: Difficulty,
  aiSeat: PlayerIndex,
): [number, number] {
  if (difficulty !== "hell") {
    return [STARTING_CHIPS, STARTING_CHIPS];
  }
  const extra = HELL_AI_EXTRA_STARTING_CHIPS;
  if (aiSeat === 1) {
    return [STARTING_CHIPS, STARTING_CHIPS + extra];
  }
  return [STARTING_CHIPS + extra, STARTING_CHIPS];
}
