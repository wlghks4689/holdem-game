import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  assertValidRoomId,
  lobbyRemove,
  roomGet,
  roomSet,
} from "@/server/roomStore";

type Ctx = { params: Promise<{ roomId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { roomId } = await ctx.params;
  if (!assertValidRoomId(roomId)) {
    return NextResponse.json({ error: "invalid room id" }, { status: 400 });
  }

  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (blob.tokens[1] != null) {
    return NextResponse.json(
      { error: "room full" },
      { status: 409 },
    );
  }

  const token1 = randomBytes(24).toString("hex");
  blob.tokens[1] = token1;
  blob.disconnected = [false, false];
  await roomSet(roomId, blob);
  // 게스트 입장 완료 → 공개 방 목록에서 제거
  if (blob.public) await lobbyRemove(roomId);

  return NextResponse.json({
    seat: 1 as const,
    token: token1,
  });
}
