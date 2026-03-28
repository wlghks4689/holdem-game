import { NextResponse } from "next/server";
import { assertValidRoomId, roomGet } from "@/server/roomStore";

type Ctx = { params: Promise<{ roomId: string }> };

/** 비인증 공개 정보 — 초대 링크로 입장 가능 여부만 판단 */
export async function GET(_req: Request, ctx: Ctx) {
  const { roomId } = await ctx.params;
  if (!assertValidRoomId(roomId)) {
    return NextResponse.json({ error: "invalid room id" }, { status: 400 });
  }

  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({
      exists: false,
      canJoinAsGuest: false,
      isFull: false,
    });
  }

  const t0 = blob.tokens[0];
  const t1 = blob.tokens[1];

  return NextResponse.json({
    exists: true,
    canJoinAsGuest: t0 != null && t1 == null,
    isFull: t1 != null,
  });
}
