"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveRoomAuth,
  loadLastActiveRoom,
  clearLastActiveRoom,
  loadRoomAuth,
  type LastActiveRoom,
} from "@/holdem/roomCredentials";

const cardClass =
  "flex flex-col gap-2 rounded-2xl border border-zinc-600/80 bg-zinc-800/60 p-5 shadow-lg transition hover:border-sky-500/50 hover:bg-zinc-800/90 active:scale-[0.99]";

export function HoldemHomeHub() {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [lastRoom, setLastRoom] = React.useState<LastActiveRoom | null>(null);

  React.useEffect(() => {
    const info = loadLastActiveRoom();
    if (info && loadRoomAuth(info.roomId)) {
      setLastRoom(info);
    } else if (info) {
      // 방 인증 토큰이 없으면 마지막 방 기록도 지운다
      clearLastActiveRoom();
    }
  }, []);

  const onCreateRoom = async () => {
    setCreating(true);
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
        setErr(j.hint ?? j.error ?? "방을 만들 수 없습니다.");
        setCreating(false);
        return;
      }
      if (j.roomId && typeof j.token === "string" && j.seat === 0) {
        saveRoomAuth(j.roomId, { seat: 0, token: j.token });
        router.push(`/holdem/room/${j.roomId}`);
        return;
      }
      setErr("서버 응답이 올바르지 않습니다.");
    } catch {
      setErr("네트워크 오류가 났습니다.");
    }
    setCreating(false);
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-lg px-4 py-10 pb-20 sm:max-w-xl md:max-w-2xl lg:max-w-4xl lg:px-8 lg:py-14">
        <header className="mb-10 text-center lg:mb-12">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50 lg:text-3xl">
            핸드 풀 홀덤
          </h1>
          <p className="mt-2 text-sm text-zinc-400 lg:text-base">
            헤즈업 · 핸드 셀렉 · 리미트 홀덤
          </p>
        </header>

        {lastRoom ? (
          <div className="mb-4 rounded-2xl border border-emerald-600/50 bg-emerald-950/30 p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  진행 중인 게임이 있습니다
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-400">
                  방 {lastRoom.roomId} · {lastRoom.seat === 0 ? "호스트" : "게스트"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearLastActiveRoom();
                    setLastRoom(null);
                  }}
                  className="rounded-lg border border-zinc-600/70 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  무시
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/holdem/room/${lastRoom.roomId}`)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  돌아가기
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={creating}
            onClick={() => void onCreateRoom()}
            className={[
              cardClass,
              "text-left disabled:opacity-60",
              "border-sky-600/60 bg-sky-950/30",
            ].join(" ")}
          >
            <span className="text-lg font-semibold text-sky-100">
              멀티플레이 — 방 만들기
            </span>
            <span className="text-xs leading-relaxed text-zinc-400">
              상대에게 링크만 보내면 됩니다. 방 코드는 필요 없어요.
            </span>
            {creating ? (
              <span className="text-xs text-sky-300">방 준비 중…</span>
            ) : null}
          </button>

          <Link href="/holdem/guide" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">게임 설명</span>
            <span className="text-xs leading-relaxed text-zinc-400">
              처음 하는 분도 30초면 이해할 수 있는 플레이 흐름 안내입니다.
            </span>
          </Link>

          <Link href="/holdem/single" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">싱글플레이</span>
            <span className="text-xs leading-relaxed text-zinc-400">
              AI 상대와 1:1 · Easy / Normal / Hard 난이도 선택.
            </span>
          </Link>

          <Link href="/holdem/settings" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">환경 설정</span>
            <span className="text-xs leading-relaxed text-zinc-400">
              표시 이름, 사운드 등 기본 옵션.
            </span>
          </Link>

          <Link href="/holdem/feedback" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">피드백</span>
            <span className="text-xs leading-relaxed text-zinc-400">
              버그 제보, 개선 아이디어, 게임 평가를 남겨 주세요.
            </span>
          </Link>
        </div>

        {err ? (
          <p
            className="mt-6 rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-center text-sm text-rose-200"
            role="alert"
          >
            {err}
          </p>
        ) : null}
      </div>
    </div>
  );
}
