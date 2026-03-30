/**
 * 브라우저에 방 입장 정보 저장(동일 기기 재접속·호스트 세션).
 * 초대 링크(URL만)만으로는 복구 불가 — 호스트는 방 생성 직후 같은 브라우저를 사용합니다.
 */
import type { PlayerIndex } from "./types";

const key = (roomId: string) => `holdem:room-auth:v1:${roomId}`;
const LAST_ACTIVE_KEY = "holdem:last-active-room:v1";
/** 서버 TTL(72h)과 동일하게 만료 */
const LAST_ACTIVE_TTL_MS = 72 * 60 * 60 * 1000;

export type RoomAuth = { seat: PlayerIndex; token: string };

export function saveRoomAuth(roomId: string, auth: RoomAuth): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(roomId), JSON.stringify(auth));
  } catch {
    /* ignore quota */
  }
}

export function loadRoomAuth(roomId: string): RoomAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(roomId));
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (
      typeof j !== "object" ||
      j === null ||
      !("seat" in j) ||
      !("token" in j) ||
      ((j as { seat: unknown }).seat !== 0 &&
        (j as { seat: unknown }).seat !== 1) ||
      typeof (j as { token: unknown }).token !== "string" ||
      (j as { token: string }).token.length < 16
    ) {
      return null;
    }
    return { seat: j.seat as PlayerIndex, token: (j as { token: string }).token };
  } catch {
    return null;
  }
}

export function clearRoomAuth(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(roomId));
  } catch {
    /* ignore */
  }
}

// ── 마지막으로 접속했던 방 (재접속용) ──────────────────────────────────────

export type LastActiveRoom = {
  roomId: string;
  seat: PlayerIndex;
  savedAt: number;
};

export function saveLastActiveRoom(roomId: string, seat: PlayerIndex): void {
  if (typeof window === "undefined") return;
  try {
    const data: LastActiveRoom = { roomId, seat, savedAt: Date.now() };
    window.localStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function loadLastActiveRoom(): LastActiveRoom | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (
      typeof j !== "object" ||
      j === null ||
      !("roomId" in j) ||
      !("seat" in j) ||
      !("savedAt" in j)
    )
      return null;
    const { roomId, seat, savedAt } = j as {
      roomId: unknown;
      seat: unknown;
      savedAt: unknown;
    };
    if (
      typeof roomId !== "string" ||
      (seat !== 0 && seat !== 1) ||
      typeof savedAt !== "number"
    )
      return null;
    if (Date.now() - savedAt > LAST_ACTIVE_TTL_MS) {
      clearLastActiveRoom();
      return null;
    }
    return { roomId, seat: seat as PlayerIndex, savedAt };
  } catch {
    return null;
  }
}

export function clearLastActiveRoom(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
