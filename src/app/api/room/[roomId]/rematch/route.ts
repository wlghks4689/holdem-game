import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { holdemReducer } from "@/holdem/gameReducer";
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
    body === null ||
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

  if ((seat !== 0 && seat !== 1) || typeof token !== "string" || token.length < 8) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (cmd !== "accept" && cmd !== "cancel") {
    return NextResponse.json({ error: "bad cmd" }, { status: 400 });
  }

  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  const s = seat as PlayerIndex;
  if (blob.tokens[s] !== token) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!blob.state.matchEnded || blob.tokens[1] == null || blob.disconnected?.some(Boolean)) {
    return NextResponse.json({ error: "rematch unavailable" }, { status: 409 });
  }

  blob.rematchAccepted = blob.rematchAccepted ?? [false, false];
  blob.rematchAccepted[s] = cmd === "accept";

  const bothAccepted = blob.rematchAccepted[0] && blob.rematchAccepted[1];

  if (bothAccepted) {
    // RESET_MATCH preserves the room game mode; legacy rooms fall back to classic.
    const rng = serverRng();
    const newState = holdemReducer(blob.state, { type: "RESET_MATCH" }, rng);
    blob.state = newState;
    blob.stateVersion = (blob.stateVersion ?? 0) + 1;
    blob.rematchAccepted = [false, false];
  }

  await roomSet(roomId, blob);

  return NextResponse.json({
    state: sanitizeGameStateForSeat(blob.state, s),
    stateVersion: blob.stateVersion ?? 0,
    rematchAccepted: blob.rematchAccepted,
  });
}
