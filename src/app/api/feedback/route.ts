import { NextRequest, NextResponse } from "next/server";
import {
  getAllFeedback,
  saveFeedback,
  getFeedbackCount,
} from "@/server/feedbackStore";

// POST /api/feedback — 피드백 제출
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).message !== "string"
  ) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const { nickname = "", message, rating = null } = body as Record<string, unknown>;

  const msg = (message as string).trim();
  if (msg.length === 0) {
    return NextResponse.json({ error: "message is empty" }, { status: 400 });
  }

  const ratingNum =
    typeof rating === "number" && rating >= 1 && rating <= 5
      ? Math.round(rating)
      : null;

  const entry = saveFeedback(String(nickname), msg, ratingNum);
  return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
}

// GET /api/feedback — 제출된 피드백 조회 (개발자용)
export async function GET(req: NextRequest) {
  const secret = process.env.FEEDBACK_SECRET?.trim();
  const provided = req.nextUrl.searchParams.get("secret") ?? "";

  if (secret && secret !== provided) {
    return NextResponse.json(
      { count: getFeedbackCount(), hint: "provide ?secret=... to read entries" },
      { status: 200 },
    );
  }

  return NextResponse.json({ entries: getAllFeedback() });
}

