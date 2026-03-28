import { NextResponse } from "next/server";
import { sanitizeGameStateForSeat } from "@/holdem/sanitizeGameStateForSeat";
import {
  normalizeRoomPause,
  type RoomPauseState,
} from "@/holdem/roomPause";
import {
  assertValidRoomId,
  roomGet,
  roomSet,
} from "@/server/roomStore";
import type { PlayerIndex } from "@/holdem/types";

type Ctx = { params: Promise<{ roomId: string }> };

type PauseCmd =
  | "request"
  | "cancel_request"
  | "accept"
  | "reject"
  | "resume";

function norm(blob: { pause?: RoomPauseState | undefined }): RoomPauseState {
  return normalizeRoomPause(blob.pause);
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

  const validCmd =
    cmd === "request" ||
    cmd === "cancel_request" ||
    cmd === "accept" ||
    cmd === "reject" ||
    cmd === "resume";

  if (
    (seat !== 0 && seat !== 1) ||
    typeof token !== "string" ||
    token.length < 8 ||
    !validCmd
  ) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const typedSeat = seat as PlayerIndex;
  const typedCmd = cmd as PauseCmd;

  const blob = await roomGet(roomId);
  if (!blob) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (blob.tokens[typedSeat] !== token) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const p = norm(blob);

  switch (typedCmd) {
    case "request": {
      if (p.kind === "paused") {
        return NextResponse.json(
          { error: "already paused — use resume" },
          { status: 400 },
        );
      }
      if (p.kind === "pending") {
        return NextResponse.json(
          { error: "pause already pending" },
          { status: 400 },
        );
      }
      blob.pause = { kind: "pending", from: typedSeat };
      break;
    }
    case "cancel_request": {
      if (p.kind !== "pending" || p.from !== typedSeat) {
        return NextResponse.json({ error: "no pending request from you" }, { status: 400 });
      }
      blob.pause = { kind: "running" };
      break;
    }
    case "accept": {
      if (p.kind !== "pending" || p.from === typedSeat) {
        return NextResponse.json({ error: "cannot accept" }, { status: 400 });
      }
      blob.pause = { kind: "paused" };
      break;
    }
    case "reject": {
      if (p.kind !== "pending" || p.from === typedSeat) {
        return NextResponse.json({ error: "cannot reject" }, { status: 400 });
      }
      blob.pause = { kind: "running" };
      break;
    }
    case "resume": {
      if (p.kind !== "paused") {
        return NextResponse.json({ error: "not paused" }, { status: 400 });
      }
      blob.pause = { kind: "running" };
      break;
    }
    default:
      return NextResponse.json({ error: "bad cmd" }, { status: 400 });
  }

  await roomSet(roomId, blob);

  return NextResponse.json({
    pause: normalizeRoomPause(blob.pause),
    state: sanitizeGameStateForSeat(blob.state, typedSeat),
  });
}
