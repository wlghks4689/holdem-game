"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
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
  const { t } = useHoldemI18n();
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
            {t("home.title")}
          </h1>
          <p className="mt-2 text-sm text-zinc-400 lg:text-base">
            {t("home.subtitle")}
          </p>
        </header>

        {lastRoom ? (
          <div className="mb-4 rounded-2xl border border-emerald-600/50 bg-emerald-950/30 p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  {t("home.activeMatchTitle")}
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-400">
                  방 {lastRoom.roomId} ·{" "}
                  {lastRoom.seat === 0
                    ? t("home.activeMatchSeatHost")
                    : t("home.activeMatchSeatGuest")}
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
                  {t("home.dismiss")}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/holdem/room/${lastRoom.roomId}`)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {t("home.rejoin")}
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
              {t("home.multiplayTitle")}
            </span>
            <span className="text-xs leading-relaxed text-zinc-400">
              {t("home.multiplayDesc")}
            </span>
            {creating ? (
              <span className="text-xs text-sky-300">
                {t("home.creatingRoom")}
              </span>
            ) : null}
          </button>

          <Link href="/holdem/guide" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">
              {t("home.guide")}
            </span>
            <span className="text-xs leading-relaxed text-zinc-400">
              {t("home.guideDesc")}
            </span>
          </Link>

          <Link href="/holdem/single" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">
              {t("home.singleTitle")}
            </span>
            <span className="text-xs leading-relaxed text-zinc-400">
              {t("home.singleDesc")}
            </span>
          </Link>

          <Link href="/holdem/settings" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">
              {t("home.settings")}
            </span>
            <span className="text-xs leading-relaxed text-zinc-400">
              {t("home.settingsDesc")}
            </span>
          </Link>

          <Link href="/holdem/feedback" className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">
              {t("home.feedback")}
            </span>
            <span className="text-xs leading-relaxed text-zinc-400">
              {t("home.feedbackDesc")}
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
