"use client";

import * as React from "react";
import Link from "next/link";
import {
  clearRoomAuth,
  loadRoomAuth,
  saveRoomAuth,
} from "@/holdem/roomCredentials";
import type { PlayerIndex } from "@/holdem/types";
import { HoldemOnlinePage } from "./HoldemOnlinePage";

const ROOM_ID_RE = /^[a-f0-9]{8}$/;

type StatusJson = {
  exists?: boolean;
  canJoinAsGuest?: boolean;
  isFull?: boolean;
};

export function HoldemRoomClient({ roomId }: { roomId: string }) {
  const id = roomId.toLowerCase();
  const [phase, setPhase] = React.useState<
    "boot" | "play" | "error" | "full" | "gone"
  >("boot");
  const [message, setMessage] = React.useState<string | null>(null);
  const [session, setSession] = React.useState<{
    seat: PlayerIndex;
    token: string;
  } | null>(null);

  React.useEffect(() => {
    if (!ROOM_ID_RE.test(id)) {
      setMessage("올바르지 않은 방 주소입니다.");
      setPhase("gone");
      return;
    }

    let cancelled = false;

    const trySavedThenGuest = async () => {
      const saved = loadRoomAuth(id);
      if (saved) {
        const r = await fetch(
          `/api/room/${id}?seat=${saved.seat}&token=${encodeURIComponent(saved.token)}`,
        );
        if (cancelled) return;
        if (r.ok) {
          setSession(saved);
          setPhase("play");
          return;
        }
        clearRoomAuth(id);
      }

      const stRes = await fetch(`/api/room/${id}/status`);
      const st = (await stRes.json().catch(() => ({}))) as StatusJson;

      if (cancelled) return;

      if (!stRes.ok) {
        setMessage("방 정보를 불러오지 못했습니다.");
        setPhase("error");
        return;
      }

      if (!st.exists) {
        setMessage("이 방은 없거나 만료되었습니다.");
        setPhase("gone");
        return;
      }

      if (st.isFull) {
        setPhase("full");
        return;
      }

      if (!st.canJoinAsGuest) {
        setMessage("지금은 이 방에 참가할 수 없습니다.");
        setPhase("error");
        return;
      }

      const jr = await fetch(`/api/room/${id}/join`, { method: "POST" });
      const jj = (await jr.json().catch(() => ({}))) as {
        error?: string;
        seat?: number;
        token?: string;
      };

      if (cancelled) return;

      if (jr.status === 409 || jj.error === "room full") {
        setPhase("full");
        return;
      }

      if (!jr.ok || jj.token == null || jj.seat !== 1) {
        setMessage(jj.error ?? "참가에 실패했습니다.");
        setPhase("error");
        return;
      }

      const auth = { seat: 1 as PlayerIndex, token: jj.token };
      saveRoomAuth(id, auth);
      setSession(auth);
      setPhase("play");
    };

    void trySavedThenGuest();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (phase === "play" && session) {
    return (
      <HoldemOnlinePage roomId={id} mySeat={session.seat} token={session.token} />
    );
  }

  if (phase === "full") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-900 px-4 text-center text-zinc-100">
        <p className="text-lg font-semibold">이 방은 이미 두 명이 있습니다</p>
        <p className="max-w-sm text-sm text-zinc-400">
          초대 링크로는 한 명만 더 들어올 수 있어요. 새 게임을 만들려면 홈에서
          &quot;방 만들기&quot;를 눌러 주세요.
        </p>
        <Link
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          href="/holdem"
        >
          홈으로
        </Link>
      </div>
    );
  }

  if (phase === "gone" || phase === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-900 px-4 text-center text-zinc-100">
        <p className="text-lg font-semibold">
          {phase === "gone" ? "방을 찾을 수 없습니다" : "문제가 발생했습니다"}
        </p>
        {message ? (
          <p className="max-w-sm text-sm text-zinc-400">{message}</p>
        ) : null}
        <Link
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          href="/holdem"
        >
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-900 text-zinc-400">
      방에 연결하는 중…
    </div>
  );
}
