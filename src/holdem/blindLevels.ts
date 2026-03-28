import type { HandBlinds } from "./types";

/** 구조적 블라인드(칩 단위 — 기존 CHIPS_PER_BB=1 스케일과 동일한 숫자 체계) */
export type BlindLevelSpec = {
  smallBlind: number;
  bigBlind: number;
  ante: number;
};

/**
 * 매치 라운드(1–30) → SB/BB/Ante. 30R 초과는 마지막 티어 유지(정합용).
 */
export function getBlindLevel(round: number): BlindLevelSpec {
  const r = Math.floor(round);
  const clamped = r < 1 ? 1 : r;
  if (clamped <= 10) return { smallBlind: 0.5, bigBlind: 1, ante: 1 };
  if (clamped <= 20) return { smallBlind: 1, bigBlind: 2, ante: 2 };
  if (clamped <= 27) return { smallBlind: 2, bigBlind: 4, ante: 4 };
  return { smallBlind: 3, bigBlind: 6, ante: 6 };
}

export function handBlindsFromRound(round: number): HandBlinds {
  const L = getBlindLevel(round);
  return { sb: L.smallBlind, bb: L.bigBlind, ante: L.ante };
}

/** 저장본·구버전 대비: 핸드에 고정값이 없으면 현재 라운드 스케줄로 보정 */
export function resolveHandBlinds(s: {
  roundNumber: number;
       handBlinds?: HandBlinds | null;
}): HandBlinds {
  const h = s.handBlinds;
  if (
    h &&
    typeof h.sb === "number" &&
    typeof h.bb === "number" &&
    typeof h.ante === "number" &&
    !Number.isNaN(h.bb) &&
    h.bb > 1e-9
  ) {
    return h;
  }
  return handBlindsFromRound(s.roundNumber);
}

/** 디버그·헤더: R{n} · SB/BB/Ante */
export function debugBlindLine(round: number, h: HandBlinds): string {
  return `R${round} · SB ${fmtBlindNum(h.sb)} / BB ${fmtBlindNum(h.bb)} / Ante ${fmtBlindNum(
    h.ante,
  )}`;
}

export function fmtBlindNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatBlindTriple(L: BlindLevelSpec): string {
  return `${fmtBlindNum(L.smallBlind)} / ${fmtBlindNum(L.bigBlind)} / Ante ${fmtBlindNum(
    L.ante,
  )}`;
}

/** 10→11, 20→21, 27→28 전환 시 블라인드 티어 상승 */
export function isBlindTierUpTransition(prevRound: number, nextRound: number): boolean {
  return (
    (prevRound === 10 && nextRound === 11) ||
    (prevRound === 20 && nextRound === 21) ||
    (prevRound === 27 && nextRound === 28)
  );
}

/** 다음 상향 티어가 시작되는 라운드(없으면 null) */
export function nextBlindTierStartRound(currentRound: number): number | null {
  if (currentRound < 11) return 11;
  if (currentRound < 21) return 21;
  if (currentRound < 28) return 28;
  return null;
}
