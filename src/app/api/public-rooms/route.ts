import { NextResponse } from "next/server";
import { lobbyList } from "@/server/roomStore";

export async function GET() {
  const rooms = await lobbyList();
  return NextResponse.json({ rooms });
}
