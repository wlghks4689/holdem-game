import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createRoomInitialGameState } from "@/holdem/gameReducer";
import { normalizeGameMode } from "@/holdem/handPool";
import type { HoldemGameMode } from "@/holdem/types";
import {
  isRoomPersistenceConfigured,
  lobbyAdd,
  roomSet,
  type RoomBlob,
} from "@/server/roomStore";

export async function POST(req: Request) {
  if (!isRoomPersistenceConfigured()) {
    return NextResponse.json(
      {
        error: "온라인 방 저장소가 없습니다.",
        hint: "Vercel Redis를 프로젝트에 연결한 뒤 REDIS_URL 또는 STORAGE_URL이 Production 환경에 등록됐는지 확인하고 다시 배포하세요.",
      },
      { status: 503 },
    );
  }

  let isPublic = false;
  let hostNickname = "";
  let gameMode: HoldemGameMode = "classic";
  try {
    const body = (await req.json()) as {
      public?: boolean;
      hostNickname?: string;
      gameMode?: unknown;
    };
    if (body.public === true) isPublic = true;
    if (typeof body.hostNickname === "string") {
      hostNickname = body.hostNickname.trim().slice(0, 24);
    }
    gameMode = normalizeGameMode(body.gameMode);
  } catch {
    // body 없는 기존 호출 허용 (비공개 방)
  }

  const roomId = randomBytes(4).toString("hex");
  const token0 = randomBytes(24).toString("hex");
  const blob: RoomBlob = {
    state: createRoomInitialGameState(gameMode),
    stateVersion: 0,
    tokens: [token0, null],
    rematchAccepted: [false, false],
    disconnected: [false, false],
    ...(isPublic && {
      public: true,
      hostNickname: hostNickname || "Player 1",
      createdAt: Date.now(),
    }),
  };
  try {
    await roomSet(roomId, blob);
    if (isPublic) await lobbyAdd(roomId);
  } catch (error) {
    console.error("[holdem-room-create] persistence failed", error);
    return NextResponse.json(
      {
        error: "온라인 방 저장소 연결에 실패했습니다.",
        hint: "Vercel 프로젝트의 Redis 연결과 REDIS_URL 또는 STORAGE_URL 환경변수를 확인한 뒤 다시 배포하세요.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    roomId,
    seat: 0 as const,
    token: token0,
  });
}
