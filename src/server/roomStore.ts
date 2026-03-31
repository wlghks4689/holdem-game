import { createClient } from "@vercel/kv";
import Redis from "ioredis";
import type { RoomPauseState } from "@/holdem/roomPause";
import type { GameState, PlayerIndex } from "@/holdem/types";

export type RoomBlob = {
  state: GameState;
  /** optimistic concurrency version (etag surrogate) */
  stateVersion: number;
  /** P0 방장 토큰, P1 참가 후 발급 */
  tokens: [string, string | null];
  /** 멀티플레이 퍼즈(구버전 방은 없을 수 있음) */
  pause?: RoomPauseState;
  /** 매치 종료 후 재경기 수락 상태 */
  rematchAccepted?: [boolean, boolean];
  /** 좌석별 이탈 상태(홈으로 이동 등) */
  disconnected?: [boolean, boolean];
  /** 공개 방 여부 */
  public?: boolean;
  /** 공개 방 목록에 표시할 호스트 닉네임 */
  hostNickname?: string;
  /** 방 생성 시각(ms) */
  createdAt?: number;
};

export type PublicRoomMeta = {
  roomId: string;
  hostNickname: string;
  createdAt: number;
};

const key = (roomId: string) => `holdem:room:${roomId}`;

const ROOM_TTL_SEC = 60 * 60 * 72;

// globalThis에 붙여 Next.js 핫 리로드(모듈 재평가) 시에도 유지
const devMemGlobal = globalThis as unknown as {
  __holdemDevMem?: Map<string, string>;
  __holdemDevLobby?: Set<string>;
};
if (!devMemGlobal.__holdemDevMem) {
  devMemGlobal.__holdemDevMem = new Map<string, string>();
}
if (!devMemGlobal.__holdemDevLobby) {
  devMemGlobal.__holdemDevLobby = new Set<string>();
}
const devMem = devMemGlobal.__holdemDevMem;

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
    const parsed = JSON.parse(raw) as RoomBlob & { stateVersion?: number };
    return {
      ...parsed,
      stateVersion: Number.isFinite(parsed.stateVersion) ? parsed.stateVersion! : 0,
      rematchAccepted:
        Array.isArray(parsed.rematchAccepted) &&
        parsed.rematchAccepted.length === 2
          ? [Boolean(parsed.rematchAccepted[0]), Boolean(parsed.rematchAccepted[1])]
          : [false, false],
      disconnected:
        Array.isArray(parsed.disconnected) &&
        parsed.disconnected.length === 2
          ? [Boolean(parsed.disconnected[0]), Boolean(parsed.disconnected[1])]
          : [false, false],
    };
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

const LOBBY_KEY = "holdem:lobby";

/** 공개 방 인덱스에 roomId 추가 */
export async function lobbyAdd(roomId: string): Promise<void> {
  if (useRedis()) {
    await getRedis().sadd(LOBBY_KEY, roomId);
  } else if (useKv()) {
    await (getKvClient() as unknown as { sadd: (key: string, ...members: string[]) => Promise<unknown> }).sadd(LOBBY_KEY, roomId);
  } else {
    devMemGlobal.__holdemDevLobby!.add(roomId);
  }
}

/** 공개 방 인덱스에서 roomId 제거 */
export async function lobbyRemove(roomId: string): Promise<void> {
  if (useRedis()) {
    await getRedis().srem(LOBBY_KEY, roomId);
  } else if (useKv()) {
    await (getKvClient() as unknown as { srem: (key: string, ...members: string[]) => Promise<unknown> }).srem(LOBBY_KEY, roomId);
  } else {
    devMemGlobal.__holdemDevLobby!.delete(roomId);
  }
}

/** 현재 대기 중인 공개 방 목록 반환 (게스트 미입장 + 호스트 연결 중 기준) */
export async function lobbyList(): Promise<PublicRoomMeta[]> {
  let ids: string[];
  if (useRedis()) {
    ids = await getRedis().smembers(LOBBY_KEY);
  } else if (useKv()) {
    ids = (await (getKvClient() as unknown as { smembers: (key: string) => Promise<string[]> }).smembers(LOBBY_KEY)) ?? [];
  } else {
    ids = Array.from(devMemGlobal.__holdemDevLobby ?? []);
  }

  if (ids.length === 0) return [];

  const results = await Promise.all(
    ids.map(async (roomId): Promise<PublicRoomMeta | null> => {
      const blob = await roomGet(roomId);
      if (
        !blob ||
        !blob.public ||
        blob.tokens[1] != null ||
        blob.disconnected?.[0] === true
      ) {
        // 유효하지 않은 스테일 항목 정리
        await lobbyRemove(roomId);
        return null;
      }
      return {
        roomId,
        hostNickname: blob.hostNickname ?? "Player 1",
        createdAt: blob.createdAt ?? 0,
      };
    }),
  );

  return results
    .filter((r): r is PublicRoomMeta => r !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 20);
}
