import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  assertValidRoomId,
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
  await roomSet(roomId, blob);

  return NextResponse.json({
    seat: 1 as const,
    token: token1,
  });
}
