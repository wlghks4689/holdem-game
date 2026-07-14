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
        hint: "Vercel에 Redis(Upstash)를 연결했다면 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN(또는 TCP용 UPSTASH_REDIS_URL)이 자동으로 들어옵니다. 수동으로는 KV_REST_API_* 또는 HOLDEM_LIMIT_GAME_REDIS_URL / REDIS_URL을 맞추세요.",
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
  await roomSet(roomId, blob);
  if (isPublic) await lobbyAdd(roomId);

  return NextResponse.json({
    roomId,
    seat: 0 as const,
    token: token0,
  });
}
