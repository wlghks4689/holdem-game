"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PlayerIndex } from "@/holdem/types";
import HoldemPageClient from "./HoldemPageClient";
import { HoldemOnlinePage } from "./HoldemOnlinePage";

const ROOM_ID_RE = /^[a-f0-9]{8}$/;

function OnlineLobbyBanner() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [joinId, setJoinId] = React.useState("");

  const onCreate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/room/create", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        roomId?: string;
        seat?: number;
        token?: string;
      };
      if (!r.ok) {
        setErr(j.hint ?? j.error ?? "방 만들기 실패");
        setBusy(false);
        return;
      }
      if (j.roomId && j.token != null && j.seat === 0) {
        router.push(
          `/holdem?room=${j.roomId}&seat=0&token=${encodeURIComponent(j.token)}`,
        );
        return;
      }
      setErr("응답 형식 오류");
    } catch {
      setErr("네트워크 오류");
    }
    setBusy(false);
  };

  const onJoin = async () => {
    const id = joinId.trim().toLowerCase();
    if (!ROOM_ID_RE.test(id)) {
      setErr("방 코드는 8자리(0-9, a-f)입니다.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/room/${id}/join`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        seat?: number;
      };
      if (!r.ok) {
        setErr(
          j.error === "room full"
            ? "이미 다른 플레이어가 참가했습니다."
            : j.error ?? "참가 실패",
        );
        setBusy(false);
        return;
      }
      if (j.token != null && j.seat === 1) {
        router.push(
          `/holdem?room=${id}&seat=1&token=${encodeURIComponent(j.token)}`,
        );
        return;
      }
      setErr("응답 형식 오류");
    } catch {
      setErr("네트워크 오류");
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-sky-700/45 bg-sky-950/25 px-3 py-3 lg:max-w-6xl lg:px-8">
      <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300/90">
        온라인 같이 하기
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        방을 만든 뒤 코드를 친구에게 알려 주세요. 각자 자기 링크로 들어오면 상대 홀 카드는
        쇼다운 전까지 보이지 않습니다.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCreate()}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          방 만들기 (P0 / 빌런)
        </button>
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:min-w-[12rem]">
          <input
            type="text"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value.replace(/[^a-fA-F0-9]/g, "").slice(0, 8))}
            placeholder="방 코드 8자리"
            className="w-32 rounded border border-zinc-500 bg-zinc-800 px-2 py-2 font-mono text-xs text-zinc-50"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onJoin()}
            className="rounded-lg border border-sky-500/70 bg-sky-900/30 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-800/40 disabled:opacity-50"
          >
            참가 (P1 / 히어로)
          </button>
        </div>
      </div>
      {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
    </div>
  );
}

export default function HoldemClientGate() {
  const searchParams = useSearchParams();
  const room = searchParams.get("room")?.toLowerCase() ?? "";
  const seatRaw = searchParams.get("seat");
  const token = searchParams.get("token") ?? "";

  const online =
    ROOM_ID_RE.test(room) &&
    (seatRaw === "0" || seatRaw === "1") &&
    token.length >= 16;

  if (online) {
    const mySeat = Number(seatRaw) as PlayerIndex;
    return <HoldemOnlinePage roomId={room} mySeat={mySeat} token={token} />;
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pb-2 pt-4 lg:max-w-6xl lg:px-8 lg:pt-6">
        <OnlineLobbyBanner />
      </div>
      <HoldemPageClient />
    </>
  );
}
