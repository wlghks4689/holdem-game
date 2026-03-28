"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveRoomAuth } from "@/holdem/roomCredentials";

const ROOM_ID_RE = /^[a-f0-9]{8}$/;

const cardClass =
  "flex flex-col gap-2 rounded-2xl border border-zinc-600/80 bg-zinc-800/60 p-5 shadow-lg transition hover:border-sky-500/50 hover:bg-zinc-800/90 active:scale-[0.99]";

export function HoldemHomeHub() {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [devId, setDevId] = React.useState("");

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
              규칙, 포지션, IA 등 짧게 정리한 안내입니다.
            </span>
          </Link>

          <Link href="/holdem/practice" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">연습 게임</span>
            <span className="text-xs leading-relaxed text-zinc-400">
              이 기기에서만 돌아가는 연습(로컬 2인 시점 전환).
            </span>
          </Link>

          <Link href="/holdem/settings" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">환경 설정</span>
            <span className="text-xs leading-relaxed text-zinc-400">
              표시 이름, 사운드 등 기본 옵션.
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

        <details className="mt-12 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-zinc-600">
          <summary className="cursor-pointer select-none text-xs">고급 · 개발</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2 pb-2">
            <label className="flex flex-col gap-0.5 text-[10px]">
              방 ID (8자 hex)
              <input
                value={devId}
                onChange={(e) =>
                  setDevId(
                    e.target.value.replace(/[^a-fA-F0-9]/g, "").slice(0, 8),
                  )
                }
                className="w-36 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-200"
                placeholder="abcd123"
              />
            </label>
            <button
              type="button"
              disabled={!ROOM_ID_RE.test(devId.toLowerCase())}
              onClick={() =>
                router.push(`/holdem/room/${devId.trim().toLowerCase()}`)
              }
              className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
            >
              해당 방으로 이동
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
