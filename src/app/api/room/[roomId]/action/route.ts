import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { holdemReducer } from "@/holdem/gameReducer";
import { normalizeRoomPause } from "@/holdem/roomPause";
import { sanitizeGameStateForSeat } from "@/holdem/sanitizeGameStateForSeat";
import { canSeatSendAction } from "@/server/roomActionAuth";
import type { GameAction, PlayerIndex } from "@/holdem/types";
import {
  assertValidRoomId,
  roomGet,
  roomSet,
} from "@/server/roomStore";

type Ctx = { params: Promise<{ roomId: string }> };

function serverRng(): () => number {
  return () => randomBytes(4).readUInt32BE(0) / 0xffffffff;
}

export async function POST(req: Request, ctx: Ctx) {
  const { roomId } = await ctx.params;
  if (!assertValidRoomId(roomId)) {
    return NextResponse.json({ error: "invalid room id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("action" in body) ||
    !("seat" in body) ||
    !("token" in body) ||
    !("stateVersion" in body)
  ) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const { seat, token, action, stateVersion } = body as {
    seat: unknown;
    token: unknown;
    action: unknown;
    stateVersion: unknown;
  };

  if (
    (seat !== 0 && seat !== 1) ||
    typeof token !== "string" ||
    token.length < 8 ||
    typeof action !== "object" ||
    action === null ||
    !("type" in action) ||
    typeof stateVersion !== "number" ||
    !Number.isFinite(stateVersion) ||
    stateVersion < 0
  ) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const typedAction = action as GameAction;
  const typedSeat = seat as PlayerIndex;

  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (blob.tokens[typedSeat] !== token) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (normalizeRoomPause(blob.pause).kind === "paused") {
    return NextResponse.json({ error: "game paused" }, { status: 403 });
  }

  // START_GAME은 게스트(토큰 1)가 입장한 뒤에만 허용
  if (typedAction.type === "START_GAME" && blob.tokens[1] == null) {
    return NextResponse.json({ error: "상대방이 아직 입장하지 않았습니다" }, { status: 403 });
  }

  if (!canSeatSendAction(blob.state, typedAction, typedSeat)) {
    return NextResponse.json({ error: "not your action" }, { status: 403 });
  }
  if (blob.stateVersion !== stateVersion) {
    return NextResponse.json(
      {
        error: "state version conflict",
        state: sanitizeGameStateForSeat(blob.state, typedSeat),
        stateVersion: blob.stateVersion,
        pause: normalizeRoomPause(blob.pause),
      },
      { status: 409 },
    );
  }

  const before = blob.state;
  const after = holdemReducer(before, typedAction, serverRng());
  if (after === before) {
    return NextResponse.json({ error: "illegal action" }, { status: 400 });
  }

  blob.state = after;
  blob.stateVersion += 1;
  await roomSet(roomId, blob);

  return NextResponse.json({
    state: sanitizeGameStateForSeat(after, typedSeat),
    stateVersion: blob.stateVersion,
    pause: normalizeRoomPause(blob.pause),
  });
}
