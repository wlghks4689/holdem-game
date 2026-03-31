import { NextResponse } from "next/server";
import { assertValidRoomId, lobbyRemove, roomGet, roomSet } from "@/server/roomStore";
import type { PlayerIndex } from "@/holdem/types";

type Ctx = { params: Promise<{ roomId: string }> };

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
    !("token" in body)
  ) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const { seat, token } = body as { seat: unknown; token: unknown };
  if ((seat !== 0 && seat !== 1) || typeof token !== "string" || token.length < 8) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  const s = seat as PlayerIndex;
  if (blob.tokens[s] !== token) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  blob.disconnected = blob.disconnected ?? [false, false];
  blob.disconnected[s] = true;
  if (blob.rematchAccepted) {
    blob.rematchAccepted[s] = false;
  }
  await roomSet(roomId, blob);
  // 호스트가 나갔고 게스트가 아직 없는 공개 방이라면 목록에서 제거
  if (s === 0 && blob.public && blob.tokens[1] == null) {
    await lobbyRemove(roomId);
  }
  return NextResponse.json({ ok: true });
}
