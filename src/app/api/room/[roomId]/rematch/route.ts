import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createInitialGameState, holdemReducer } from "@/holdem/gameReducer";
import { sanitizeGameStateForSeat } from "@/holdem/sanitizeGameStateForSeat";
import type { PlayerIndex } from "@/holdem/types";
import { assertValidRoomId, roomGet, roomSet } from "@/server/roomStore";

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
    body == null ||
    !("seat" in body) ||
    !("token" in body) ||
    !("cmd" in body)
  ) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { seat, token, cmd } = body as {
    seat: unknown;
    token: unknown;
    cmd: unknown;
  };
  if (
    (seat !== 0 && seat !== 1) ||
    typeof token !== "string" ||
    token.length < 8 ||
    (cmd !== "accept" && cmd !== "cancel")
  ) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const mySeat = seat as PlayerIndex;
  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (blob.tokens[mySeat] !== token) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (blob.state.matchWinner == null) {
    return NextResponse.json({ error: "match not ended" }, { status: 400 });
  }

  const accepted = blob.rematchAccepted ?? [false, false];
  accepted[mySeat] = cmd === "accept";
  blob.rematchAccepted = accepted;

  if (accepted[0] && accepted[1]) {
    const reset = createInitialGameState();
    blob.state = holdemReducer(reset, { type: "START_GAME" }, serverRng());
    blob.rematchAccepted = [false, false];
  }

  blob.stateVersion += 1;
  await roomSet(roomId, blob);
  return NextResponse.json({
    state: sanitizeGameStateForSeat(blob.state, mySeat),
    stateVersion: blob.stateVersion,
    rematchAccepted: blob.rematchAccepted,
  });
}
