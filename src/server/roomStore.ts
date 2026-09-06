import { createClient } from "@vercel/kv";
import Redis from "ioredis";
import { resolveRoomStorageConfig, roomStorageFailure } from "./roomStorageConfig";
import { roomLifetime, ROOM_IDLE_TTL_SEC, ROOM_LOBBY_TTL_SEC } from "./roomLifetime";
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
  /** Temporary room deadline; reads never extend it. */
  expiresAt?: number;
  cleanupDeadline?: number;
};

export type PublicRoomMeta = {
  roomId: string;
  hostNickname: string;
  createdAt: number;
};

const key = (roomId: string) => `holdem:room:${roomId}`;

// globalThis에 붙여 Next.js 핫 리로드(모듈 재평가) 시에도 유지
const devMemGlobal = globalThis as unknown as {
  __holdemDevMem?: Map<string, string>;
  __holdemDevLobby?: Set<string>;
  __holdemDevExpiry?: Map<string, number>;
  __holdemDevSweep?: ReturnType<typeof setInterval>;
};
if (!devMemGlobal.__holdemDevMem) {
  devMemGlobal.__holdemDevMem = new Map<string, string>();
}
if (!devMemGlobal.__holdemDevLobby) {
  devMemGlobal.__holdemDevLobby = new Set<string>();
}
const devMem = devMemGlobal.__holdemDevMem;
const devExpiry = devMemGlobal.__holdemDevExpiry ??= new Map<string, number>();
if (!devMemGlobal.__holdemDevSweep) {
  devMemGlobal.__holdemDevSweep = setInterval(() => {
    for (const [roomId, expiresAt] of devExpiry) {
      if (expiresAt <= Date.now()) {
        devMem.delete(key(roomId));
        devExpiry.delete(roomId);
        devMemGlobal.__holdemDevLobby?.delete(roomId);
      }
    }
  }, 30_000);
  devMemGlobal.__holdemDevSweep.unref();
}

function redisUrl(): string | undefined {
  const config = resolveRoomStorageConfig();
  return config.kind === "redis" ? config.url : undefined;
}

function hasRedisConfig(): boolean {
  return Boolean(redisUrl());
}

function kvRestUrl(): string | undefined {
  const config = resolveRoomStorageConfig();
  return config.kind === "rest" ? config.url : undefined;
}

function kvRestToken(): string | undefined {
  const config = resolveRoomStorageConfig();
  return config.kind === "rest" ? config.token : undefined;
}

function hasKvConfig(): boolean {
  return Boolean(kvRestUrl() && kvRestToken());
}

const redisGlobal = globalThis as unknown as {
  __holdemRedis?: Redis;
  __holdemKv?: ReturnType<typeof createClient>;
  __holdemRedisUrl?: string;
  __holdemKvConfig?: string;
};

function getKvClient(): ReturnType<typeof createClient> {
  const url = kvRestUrl();
  const token = kvRestToken();
  if (!url || !token) {
    throw new Error("KV REST URL/token not configured");
  }
  const configKey = JSON.stringify([url, token, "raw-v1"]);
  if (!redisGlobal.__holdemKv || redisGlobal.__holdemKvConfig !== configKey) {
    redisGlobal.__holdemKv = createClient({
      url,
      token,
      // roomGet owns JSON decoding. Also preserves numeric-looking hex room IDs in ZRANGE.
      automaticDeserialization: false,
      cache: "no-store",
      retry: { retries: 1 },
      signal: () => AbortSignal.timeout(5_000),
    });
    redisGlobal.__holdemKvConfig = configKey;
  }
  return redisGlobal.__holdemKv;
}

function getRedis(): Redis {
  const url = redisUrl();
  if (!url) {
    throw new Error("Redis URL not configured");
  }
  if (!redisGlobal.__holdemRedis || redisGlobal.__holdemRedisUrl !== url || redisGlobal.__holdemRedis.status === "end") {
    redisGlobal.__holdemRedis?.disconnect();
    redisGlobal.__holdemRedis = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
      commandTimeout: 8_000,
      retryStrategy: (attempt) => attempt <= 2 ? attempt * 200 : null,
      lazyConnect: false,
    });
    redisGlobal.__holdemRedisUrl = url;
    redisGlobal.__holdemRedis.on("error", (error) => {
      console.error("[holdem-redis]", roomStorageFailure(error).code);
    });
  }
  return redisGlobal.__holdemRedis;
}

/** 프로덕션(Vercel)에서 영구 저장소: Redis URL 또는 Vercel KV */
export function isRoomPersistenceConfigured(): boolean {
  try {
    resolveRoomStorageConfig();
    return true;
  } catch {
    return false;
  }
}

export async function roomGet(roomId: string): Promise<RoomBlob | null> {
  let raw: string | null = null;
  if (hasRedisConfig()) {
    raw = await getRedis().get(key(roomId));
  } else if (hasKvConfig()) {
    raw = (await getKvClient().get(key(roomId))) as string | null;
  } else {
    raw = devMem.get(key(roomId)) ?? null;
  }
  if (raw == null) return null;
  let parsed: RoomBlob;
  try {
    parsed = JSON.parse(raw) as RoomBlob;
  } catch {
    return null;
  }
  if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
    await roomDelete(roomId);
    return null;
  }
  // Bound legacy rooms as soon as they are encountered after the upgrade.
  if (parsed.expiresAt == null) {
    await roomSet(roomId, parsed);
    if (parsed.expiresAt! <= Date.now()) return null;
  }
  return {
    ...parsed,
    stateVersion: Number.isFinite(parsed.stateVersion) ? parsed.stateVersion! : 0,
    rematchAccepted:
      Array.isArray(parsed.rematchAccepted) && parsed.rematchAccepted.length === 2
        ? [Boolean(parsed.rematchAccepted[0]), Boolean(parsed.rematchAccepted[1])]
        : [false, false],
    disconnected:
      Array.isArray(parsed.disconnected) && parsed.disconnected.length === 2
        ? [Boolean(parsed.disconnected[0]), Boolean(parsed.disconnected[1])]
        : [false, false],
  };
}

export async function roomSet(roomId: string, blob: RoomBlob): Promise<void> {
  const now = Date.now();
  Object.assign(blob, roomLifetime(blob, now));
  const ttl = Math.ceil((blob.expiresAt! - now) / 1000);
  if (ttl <= 0) {
    await roomDelete(roomId);
    return;
  }
  const raw = JSON.stringify(blob);
  if (hasRedisConfig()) {
    await getRedis().set(key(roomId), raw, "EX", ttl);
  } else if (hasKvConfig()) {
    await getKvClient().set(key(roomId), raw, { ex: ttl });
  } else {
    devMem.set(key(roomId), raw);
    devExpiry.set(roomId, blob.expiresAt!);
  }
}

export async function roomDelete(roomId: string): Promise<void> {
  if (hasRedisConfig()) await getRedis().del(key(roomId));
  else if (hasKvConfig()) await getKvClient().del(key(roomId));
  else {
    devMem.delete(key(roomId));
    devExpiry.delete(roomId);
  }
  await lobbyRemove(roomId);
}

export function assertValidRoomId(roomId: string): roomId is string {
  return typeof roomId === "string" && /^[a-f0-9]{8}$/.test(roomId);
}

export function parseSeat(s: string | null): PlayerIndex | null {
  if (s === "0") return 0;
  if (s === "1") return 1;
  return null;
}

// New key avoids mixing the legacy Set with the expiring sorted-set index.
const LOBBY_KEY = "holdem:lobby:temporary:v1";

/** 공개 방 인덱스에 roomId 추가 */
export async function lobbyAdd(roomId: string): Promise<void> {
  const now = Date.now();
  const expiresAt = now + ROOM_LOBBY_TTL_SEC * 1000;
  if (hasRedisConfig()) {
    await getRedis().zremrangebyscore(LOBBY_KEY, "-inf", now);
    await getRedis().zadd(LOBBY_KEY, expiresAt, roomId);
    await getRedis().expire(LOBBY_KEY, ROOM_IDLE_TTL_SEC);
  } else if (hasKvConfig()) {
    await getKvClient().zremrangebyscore(LOBBY_KEY, "-inf", now);
    await getKvClient().zadd(LOBBY_KEY, { score: expiresAt, member: roomId });
    await getKvClient().expire(LOBBY_KEY, ROOM_IDLE_TTL_SEC);
  } else {
    devMemGlobal.__holdemDevLobby!.add(roomId);
  }
}

/** 공개 방 인덱스에서 roomId 제거 */
export async function lobbyRemove(roomId: string): Promise<void> {
  if (hasRedisConfig()) {
    await getRedis().zrem(LOBBY_KEY, roomId);
  } else if (hasKvConfig()) {
    await getKvClient().zrem(LOBBY_KEY, roomId);
  } else {
    devMemGlobal.__holdemDevLobby!.delete(roomId);
  }
}

/** 현재 대기 중인 공개 방 목록 반환 (게스트 미입장 + 호스트 연결 중 기준) */
export async function lobbyList(): Promise<PublicRoomMeta[]> {
  let ids: string[];
  if (hasRedisConfig()) {
    await getRedis().zremrangebyscore(LOBBY_KEY, "-inf", Date.now());
    ids = await getRedis().zrange(LOBBY_KEY, 0, -1);
  } else if (hasKvConfig()) {
    await getKvClient().zremrangebyscore(LOBBY_KEY, "-inf", Date.now());
    ids = await getKvClient().zrange<string[]>(LOBBY_KEY, 0, -1);
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
