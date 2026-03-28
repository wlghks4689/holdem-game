import { createClient } from "@vercel/kv";
import Redis from "ioredis";
import type { RoomPauseState } from "@/holdem/roomPause";
import type { GameState, PlayerIndex } from "@/holdem/types";

export type RoomBlob = {
  state: GameState;
  /** P0 방장 토큰, P1 참가 후 발급 */
  tokens: [string, string | null];
  /** 멀티플레이 퍼즈(구버전 방은 없을 수 있음) */
  pause?: RoomPauseState;
};

const key = (roomId: string) => `holdem:room:${roomId}`;

const ROOM_TTL_SEC = 60 * 60 * 72;

const devMem = new Map<string, string>();

function redisUrl(): string | undefined {
  const u =
    process.env.HOLDEM_LIMIT_GAME_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    process.env.UPSTASH_REDIS_URL?.trim();
  return u && u.length > 0 ? u : undefined;
}

function useRedis(): boolean {
  return Boolean(redisUrl());
}

function kvRestUrl(): string | undefined {
  const u =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  return u && u.length > 0 ? u : undefined;
}

function kvRestToken(): string | undefined {
  const t =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return t && t.length > 0 ? t : undefined;
}

function useKv(): boolean {
  return Boolean(kvRestUrl() && kvRestToken());
}

const redisGlobal = globalThis as unknown as {
  __holdemRedis?: Redis;
  __holdemKv?: ReturnType<typeof createClient>;
};

function getKvClient(): ReturnType<typeof createClient> {
  const url = kvRestUrl();
  const token = kvRestToken();
  if (!url || !token) {
    throw new Error("KV REST URL/token not configured");
  }
  if (!redisGlobal.__holdemKv) {
    redisGlobal.__holdemKv = createClient({ url, token });
  }
  return redisGlobal.__holdemKv;
}

function getRedis(): Redis {
  const url = redisUrl();
  if (!url) {
    throw new Error("Redis URL not configured");
  }
  if (!redisGlobal.__holdemRedis) {
    redisGlobal.__holdemRedis = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 10_000,
      lazyConnect: false,
    });
  }
  return redisGlobal.__holdemRedis;
}

/** 프로덕션(Vercel)에서 영구 저장소: Redis URL 또는 Vercel KV */
export function isRoomPersistenceConfigured(): boolean {
  if (process.env.VERCEL === "1") {
    return useRedis() || useKv();
  }
  return true;
}

export async function roomGet(roomId: string): Promise<RoomBlob | null> {
  let raw: string | null = null;
  if (useRedis()) {
    raw = await getRedis().get(key(roomId));
  } else if (useKv()) {
    raw = (await getKvClient().get(key(roomId))) as string | null;
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
  if (useRedis()) {
    await getRedis().set(key(roomId), raw, "EX", ROOM_TTL_SEC);
  } else if (useKv()) {
    await getKvClient().set(key(roomId), raw, { ex: ROOM_TTL_SEC });
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
