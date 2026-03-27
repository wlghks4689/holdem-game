import { kv } from "@vercel/kv";
import type { GameState, PlayerIndex } from "@/holdem/types";

export type RoomBlob = {
  state: GameState;
  /** P0 방장 토큰, P1 참가 후 발급 */
  tokens: [string, string | null];
};

const key = (roomId: string) => `holdem:room:${roomId}`;

const devMem = new Map<string, string>();

function useKv(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.length && process.env.KV_REST_API_TOKEN?.length,
  );
}

/** 프로덕션(Vercel)에서 영구 저장소 필요 */
export function isRoomPersistenceConfigured(): boolean {
  if (process.env.VERCEL === "1") return useKv();
  return true;
}

export async function roomGet(roomId: string): Promise<RoomBlob | null> {
  let raw: string | null = null;
  if (useKv()) {
    raw = (await kv.get(key(roomId))) as string | null;
  } else {
    raw = devMem.get(key(roomId)) ?? null;
  }
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as RoomBlob;
  } catch {
    return null;
  }
}

export async function roomSet(roomId: string, blob: RoomBlob): Promise<void> {
  const raw = JSON.stringify(blob);
  if (useKv()) {
    await kv.set(key(roomId), raw, { ex: 60 * 60 * 72 });
  } else {
    devMem.set(key(roomId), raw);
  }
}

export function assertValidRoomId(roomId: string): roomId is string {
  return typeof roomId === "string" && /^[a-f0-9]{8}$/.test(roomId);
}

export function parseSeat(s: string | null): PlayerIndex | null {
  if (s === "0") return 0;
  if (s === "1") return 1;
  return null;
}
