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
        hint: "Vercel 프로젝트에 Redis(Upstash) 스토리지를 연결하고 KV_REST_API_URL / KV_REST_API_TOKEN 환경 변수가 설정되는지 확인하세요.",
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
