import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createInitialGameState } from "@/holdem/gameReducer";
import {
  isRoomPersistenceConfigured,
  roomSet,
  type RoomBlob,
} from "@/server/roomStore";

export async function POST() {
  if (!isRoomPersistenceConfigured()) {
    return NextResponse.json(
      {
        error: "온라인 방 저장소가 없습니다.",
        hint: "Vercel에 Redis(Upstash)를 연결했다면 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN(또는 TCP용 UPSTASH_REDIS_URL)이 자동으로 들어옵니다. 수동으로는 KV_REST_API_* 또는 HOLDEM_LIMIT_GAME_REDIS_URL / REDIS_URL을 맞추세요.",
      },
      { status: 503 },
    );
  }

  const roomId = randomBytes(4).toString("hex");
  const token0 = randomBytes(24).toString("hex");
  const blob: RoomBlob = {
    state: createInitialGameState(),
    tokens: [token0, null],
  };
  await roomSet(roomId, blob);

  return NextResponse.json({
    roomId,
    seat: 0 as const,
    token: token0,
  });
}
