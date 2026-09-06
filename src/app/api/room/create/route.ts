import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createRoomInitialGameState } from "@/holdem/gameReducer";
import { normalizeGameMode } from "@/holdem/handPool";
import type { HoldemGameMode } from "@/holdem/types";
import {
  lobbyAdd,
  roomSet,
  type RoomBlob,
} from "@/server/roomStore";
import { roomStorageFailure } from "@/server/roomStorageConfig";

export async function POST(req: Request) {
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
    const failure = roomStorageFailure(error);
    console.error("[holdem-room-create]", failure.code);
    return NextResponse.json(
      {
        error: "온라인 방 저장소 연결에 실패했습니다.",
        ...failure,
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
