"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import { saveRoomAuth } from "@/holdem/roomCredentials";
import type { PublicRoomMeta } from "@/server/roomStore";

function timeAgo(ms: number, locale: string): string {
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return locale === "en" ? `${sec}s ago` : `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return locale === "en" ? `${min}m ago` : `${min}분 전`;
  const hr = Math.floor(min / 60);
  return locale === "en" ? `${hr}h ago` : `${hr}시간 전`;
}

export function PublicRoomsClient() {
  const { t, locale } = useHoldemI18n();
  const router = useRouter();
  const [rooms, setRooms] = React.useState<PublicRoomMeta[] | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [joiningId, setJoiningId] = React.useState<string | null>(null);
  const [joinErr, setJoinErr] = React.useState<string | null>(null);
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const fetchRooms = React.useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await fetch("/api/public-rooms");
      if (!r.ok) throw new Error("fetch failed");
      const j = (await r.json()) as { rooms: PublicRoomMeta[] };
      setRooms(j.rooms);
    } catch {
      setLoadErr(locale === "en" ? "Could not load room list." : "방 목록을 불러올 수 없습니다.");
    }
  }, [locale]);

  // 최초 로드 + 5초 자동 새로고침
  React.useEffect(() => {
    void fetchRooms();
    const iv = window.setInterval(() => {
      void fetchRooms();
      forceUpdate(); // timeAgo 갱신
    }, 5000);
    return () => window.clearInterval(iv);
  }, [fetchRooms]);

  const onJoin = async (roomId: string) => {
    setJoiningId(roomId);
    setJoinErr(null);
    try {
      const r = await fetch(`/api/room/${roomId}/join`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        seat?: number;
        token?: string;
      };
      if (!r.ok) {
        setJoinErr(
          j.error === "room full"
            ? (locale === "en" ? "Room is already full." : "이미 가득 찬 방입니다.")
            : t("rooms.joinError"),
        );
        // 목록 갱신
        void fetchRooms();
        setJoiningId(null);
        return;
      }
      if (j.seat === 1 && typeof j.token === "string") {
        saveRoomAuth(roomId, { seat: 1, token: j.token });
        router.push(`/holdem/room/${roomId}`);
        return;
      }
      setJoinErr(t("rooms.joinError"));
    } catch {
      setJoinErr(locale === "en" ? "Network error." : "네트워크 오류가 났습니다.");
    }
    setJoiningId(null);
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-lg px-4 py-8 pb-20 sm:max-w-xl md:max-w-2xl">
        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/holdem"
            className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
          >
            {t("rooms.back")}
          </Link>
          <h1 className="text-lg font-bold text-zinc-50">{t("rooms.title")}</h1>
          <button
            type="button"
            onClick={() => void fetchRooms()}
            className="rounded-lg border border-zinc-600/70 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700/70"
          >
            {t("rooms.refresh")}
          </button>
        </div>

        {/* 에러 배너 */}
        {loadErr ? (
          <p className="mb-4 rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-center text-sm text-rose-200">
            {loadErr}
          </p>
        ) : null}
        {joinErr ? (
          <p className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-center text-sm text-amber-200">
            {joinErr}
          </p>
        ) : null}

        {/* 로딩 */}
        {rooms === null && !loadErr ? (
          <p className="py-16 text-center text-sm text-zinc-500">
            {locale === "en" ? "Loading…" : "불러오는 중…"}
          </p>
        ) : rooms !== null && rooms.length === 0 ? (
          /* 빈 상태 */
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-4xl">🃏</span>
            <p className="text-sm text-zinc-400">{t("rooms.empty")}</p>
            <p className="text-xs text-zinc-600">
              {locale === "en"
                ? "Create a public room from the home screen and wait for someone to join."
                : "홈에서 공개 방을 만들고 상대를 기다려 보세요."}
            </p>
          </div>
        ) : (
          /* 방 목록 */
          <ul className="flex flex-col gap-3">
            {(rooms ?? []).map((room) => (
              <li
                key={room.roomId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-700/60 bg-zinc-800/50 px-4 py-3.5 shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                      style={{ boxShadow: "0 0 6px rgba(52,211,153,0.7)" }}
                    />
                    <span className="truncate text-sm font-semibold text-zinc-100">
                      {room.hostNickname}
                    </span>
                    <span className="rounded bg-zinc-700/80 px-1.5 py-px text-[9px] text-zinc-400">
                      {t("rooms.waiting")}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-4 text-[11px] text-zinc-500">
                    {timeAgo(room.createdAt, locale)}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={joiningId !== null}
                  onClick={() => void onJoin(room.roomId)}
                  className={[
                    "shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition active:scale-[0.97]",
                    joiningId === room.roomId
                      ? "cursor-wait bg-zinc-700 text-zinc-400"
                      : "bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50",
                  ].join(" ")}
                >
                  {joiningId === room.roomId ? t("rooms.joiningRoom") : t("rooms.join")}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 자동 새로고침 안내 */}
        {rooms !== null && (
          <p className="mt-6 text-center text-[10px] text-zinc-600">
            {locale === "en" ? "Auto-refreshes every 5 seconds." : "5초마다 자동으로 새로고침 됩니다."}
          </p>
        )}
      </div>
    </div>
  );
}
