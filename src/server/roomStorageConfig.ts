type Environment = Record<string, string | undefined>;

export type RoomStorageConfig =
  | { kind: "redis"; url: string }
  | { kind: "rest"; url: string; token: string }
  | { kind: "memory" };

export class RoomStorageConfigError extends Error {
  constructor() {
    super("Room storage configuration is missing or invalid");
    this.name = "RoomStorageConfigError";
  }
}

function validUrl(value: string | undefined, protocols: string[]): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return protocols.includes(url.protocol) && url.hostname ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Keep URL/token pairs together: mixing credentials from two databases fails authentication. */
export function resolveRoomStorageConfig(env: Environment = process.env): RoomStorageConfig {
  const redisNames = [
    "HOLDEM_LIMIT_GAME_REDIS_URL", "REDIS_URL", "STORAGE_URL", "UPSTASH_REDIS_URL", "KV_URL",
  ];
  const restPairs = [
    ["HOLDEM_LIMIT_GAME_KV_REST_API_URL", "HOLDEM_LIMIT_GAME_KV_REST_API_TOKEN"],
    ["HOLDEM_LIMIT_GAME_REST_API_URL", "HOLDEM_LIMIT_GAME_REST_API_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["STORAGE_REST_API_URL", "STORAGE_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];
  // Preserve the existing TCP backend when configured. Never send an HTTPS REST
  // endpoint (or another provider's STORAGE_URL) to ioredis.
  for (const name of redisNames) {
    const url = validUrl(env[name], ["redis:", "rediss:"]);
    if (url) return { kind: "redis", url };
  }
  for (const [urlName, tokenName] of restPairs) {
    const url = validUrl(env[urlName], ["https:"]);
    const token = env[tokenName]?.trim();
    if (url && token) return { kind: "rest", url, token };
  }
  const hasSettings = [...redisNames, ...restPairs.flat()].some((name) => env[name]?.trim());
  // A broken remote store must never silently become per-instance memory on Vercel.
  if (env.VERCEL === "1" || hasSettings) throw new RoomStorageConfigError();
  return { kind: "memory" };
}

/** Only return fixed diagnostics, never connection URLs, passwords or provider response bodies. */
export function roomStorageFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof RoomStorageConfigError) {
    return { code: "ROOM_STORAGE_CONFIG", hint: "온라인 방 저장소 설정이 올바르지 않습니다. 관리자에게 ROOM_STORAGE_CONFIG 코드를 전달해 주세요." };
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return { code: "ROOM_STORAGE_DNS", hint: "온라인 방 저장소 주소를 찾을 수 없습니다. 관리자에게 ROOM_STORAGE_DNS 코드를 전달해 주세요." };
  }
  if (/WRONGPASS|NOAUTH|unauthorized|invalid.*token|authentication|401/i.test(message)) {
    return { code: "ROOM_STORAGE_AUTH", hint: "온라인 방 저장소 인증에 실패했습니다. 관리자에게 ROOM_STORAGE_AUTH 코드를 전달해 주세요." };
  }
  if (/READONLY|read.only|NOPERM|403/i.test(message)) {
    return { code: "ROOM_STORAGE_PERMISSION", hint: "온라인 방 저장소에 쓰기 권한이 없습니다. 관리자에게 ROOM_STORAGE_PERMISSION 코드를 전달해 주세요." };
  }
  if (/quota|limit exceeded|OOM|429/i.test(message)) {
    return { code: "ROOM_STORAGE_LIMIT", hint: "온라인 방 저장소의 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { code: "ROOM_STORAGE_UNAVAILABLE", hint: "온라인 방 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." };
}
