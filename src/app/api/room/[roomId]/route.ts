import { NextResponse } from "next/server";
import { sanitizeGameStateForSeat } from "@/holdem/sanitizeGameStateForSeat";
import {
  assertValidRoomId,
  parseSeat,
  roomGet,
} from "@/server/roomStore";

type Ctx = { params: Promise<{ roomId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { roomId } = await ctx.params;
  if (!assertValidRoomId(roomId)) {
    return NextResponse.json({ error: "invalid room id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const seat = parseSeat(url.searchParams.get("seat"));
  const token = url.searchParams.get("token");
  if (seat == null || token == null || token.length < 8) {
    return NextResponse.json({ error: "seat and token required" }, { status: 400 });
  }

  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (blob.tokens[seat] !== token) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    state: sanitizeGameStateForSeat(blob.state, seat),
  });
}
