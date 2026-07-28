"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import { loadRoomNickname } from "@/holdem/holdemPrefs";
import type { HoldemGameMode } from "@/holdem/types";
import {
  saveRoomAuth,
  loadLastActiveRoom,
  clearLastActiveRoom,
  loadRoomAuth,
  type LastActiveRoom,
} from "@/holdem/roomCredentials";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
const ONLINE_GAME_URL =
  process.env.NEXT_PUBLIC_ONLINE_GAME_URL ??
  "https://holdem-game.vercel.app/holdem";

const cardClass =
  "flex flex-col gap-2 rounded-2xl border border-zinc-600/80 bg-zinc-800/60 p-5 shadow-lg transition hover:border-sky-500/50 hover:bg-zinc-800/90 active:scale-[0.99]";

const subCardClass =
  "flex flex-col gap-1.5 rounded-xl border p-4 text-left transition active:scale-[0.98]";

export function HoldemHomeHub() {
  const { t, locale, setLocale } = useHoldemI18n();
  const router = useRouter();
  const [multiOpen, setMultiOpen] = React.useState(false);
  const [creating, setCreating] = React.useState<"private" | "public" | null>(null);
  const [roomGameMode, setRoomGameMode] = React.useState<HoldemGameMode>("classic");
  const [err, setErr] = React.useState<string | null>(null);
  const [lastRoom, setLastRoom] = React.useState<LastActiveRoom | null>(null);

  React.useEffect(() => {
    const info = loadLastActiveRoom();
    if (info && loadRoomAuth(info.roomId)) {
      setLastRoom(info);
    } else if (info) {
      clearLastActiveRoom();
    }
  }, []);

  const onCreateRoom = async (isPublic: boolean) => {
    setCreating(isPublic ? "public" : "private");
    setErr(null);
    try {
      const nick = loadRoomNickname();
      const body = isPublic
        ? { public: true, hostNickname: nick || "Player 1", gameMode: roomGameMode }
        : { gameMode: roomGameMode };
      const r = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        roomId?: string;
        seat?: number;
        token?: string;
      };
      if (!r.ok) {
        setErr(j.hint ?? j.error ?? (locale === "en" ? "Could not create room." : "방을 만들 수 없습니다."));
        setCreating(null);
        return;
      }
      if (j.roomId && typeof j.token === "string" && j.seat === 0) {
        saveRoomAuth(j.roomId, { seat: 0, token: j.token });
        router.push(`/holdem/room/${j.roomId}`);
        return;
      }
      setErr(locale === "en" ? "Unexpected server response." : "서버 응답이 올바르지 않습니다.");
    } catch {
      setErr(locale === "en" ? "Network error." : "네트워크 오류가 났습니다.");
    }
    setCreating(null);
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-lg px-4 py-10 pb-20 sm:max-w-xl md:max-w-2xl lg:max-w-4xl lg:px-8 lg:py-14">
        <header className="mb-10 text-center lg:mb-12">
          <div className="mb-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setLocale("ko")}
              className={[
                "rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition",
                locale === "ko"
                  ? "border-emerald-400/75 bg-emerald-700/45 text-emerald-100"
                  : "border-zinc-600/70 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60",
              ].join(" ")}
              aria-label="Switch to Korean"
            >
              KR
            </button>
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={[
                "rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition",
                locale === "en"
                  ? "border-emerald-400/75 bg-emerald-700/45 text-emerald-100"
                  : "border-zinc-600/70 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60",
              ].join(" ")}
              aria-label="Switch to English"
            >
              EN
            </button>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50 lg:text-3xl">
            {t("home.title")}
          </h1>
          <p className="mt-2 text-sm text-zinc-400 lg:text-base">
            {t("home.subtitle")}
          </p>
        </header>

        {!IS_STATIC && lastRoom ? (
          <div className="mb-4 rounded-2xl border border-emerald-600/50 bg-emerald-950/30 p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  {t("home.activeMatchTitle")}
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-400">
                  {locale === "en" ? "Room" : "방"} {lastRoom.roomId} ·{" "}
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
          {/* ── 멀티플레이 카드 (정적 빌드에서는 숨김) ── */}
          {!IS_STATIC && <div
            className={[
              "rounded-2xl border shadow-lg transition",
              multiOpen
                ? "border-sky-500/60 bg-sky-950/40"
                : "border-sky-600/60 bg-sky-950/30 hover:border-sky-500/50 hover:bg-zinc-800/90",
            ].join(" ")}
          >
            {/* 헤더 토글 */}
            <button
              type="button"
              onClick={() => setMultiOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 p-5 text-left"
            >
              <div className="flex flex-col gap-1">
                <span className="text-lg font-semibold text-sky-100">
                  {t("home.multiplayTitle")}
                </span>
                {!multiOpen && (
                  <span className="text-xs leading-relaxed text-zinc-400">
                    {t("home.multiplayDesc")}
                  </span>
                )}
              </div>
              <span
                className={[
                  "shrink-0 text-sky-400 transition-transform duration-200",
                  multiOpen ? "rotate-180" : "",
                ].join(" ")}
              >
                ▼
              </span>
            </button>

            {/* 서브메뉴 */}
            {multiOpen && (
              <div className="flex flex-col gap-2 px-4 pb-4">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-700 bg-zinc-900/45 p-1.5">
                  {(["classic", "cost"] as HoldemGameMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRoomGameMode(mode)}
                      className={[
                        "rounded-lg px-3 py-2 text-xs font-bold uppercase transition",
                        roomGameMode === mode
                          ? "bg-sky-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                      ].join(" ")}
                    >
                      {mode === "classic" ? "Classic" : "Cost"}
                    </button>
                  ))}
                </div>
                {/* 비공개 방 만들기 */}
                <button
                  type="button"
                  disabled={creating !== null}
                  onClick={() => void onCreateRoom(false)}
                  className={[
                    subCardClass,
                    "border-zinc-600/70 bg-zinc-800/60 hover:border-zinc-500/80 hover:bg-zinc-700/60 disabled:opacity-60",
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold text-zinc-100">
                    {creating === "private" ? t("home.creatingRoom") : t("home.createPrivate")}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {t("home.createPrivateDesc")}
                  </span>
                </button>

                {/* 공개 방 만들기 */}
                <button
                  type="button"
                  disabled={creating !== null}
                  onClick={() => void onCreateRoom(true)}
                  className={[
                    subCardClass,
                    "border-emerald-700/60 bg-emerald-950/30 hover:border-emerald-500/70 hover:bg-emerald-900/30 disabled:opacity-60",
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold text-emerald-100">
                    {creating === "public" ? t("home.creatingRoom") : t("home.createPublic")}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {t("home.createPublicDesc")}
                  </span>
                </button>

                {/* 공개 방 참여 */}
                <Link
                  href="/holdem/rooms"
                  className={[
                    subCardClass,
                    "border-violet-700/60 bg-violet-950/30 hover:border-violet-500/70 hover:bg-violet-900/30",
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold text-violet-100">
                    {t("home.browseRooms")}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {t("home.browseRoomsDesc")}
                  </span>
                </Link>
              </div>
            )}
          </div>}

          {/* itch.io 전용: 웹 전용 멀티플레이 안내 카드 */}
          <div className={cardClass}>
            <span className="text-lg font-semibold text-zinc-100">
              {locale === "en" ? "Practice" : "연습 게임"}
            </span>
            <span className="text-xs leading-relaxed text-zinc-400">
              {locale === "en"
                ? "Play locally with either rule set."
                : "Classic 또는 Cost 규칙으로 로컬 대전을 시작합니다."}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link
                href="/holdem/practice?mode=classic"
                className="rounded-lg border border-zinc-600/70 bg-zinc-900/45 px-3 py-2 text-center text-xs font-bold uppercase text-zinc-200 hover:bg-zinc-700/70"
              >
                Classic
              </Link>
              <Link
                href="/holdem/practice?mode=cost"
                className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-center text-xs font-bold uppercase text-emerald-100 hover:bg-emerald-900/35"
              >
                Cost
              </Link>
            </div>
          </div>

          {IS_STATIC && (
            <a
              href={ONLINE_GAME_URL}
              target="_top"
              rel="noopener noreferrer"
              className="flex flex-col gap-2 rounded-2xl border border-sky-700/60 bg-sky-950/25 p-5 shadow-lg transition hover:border-sky-500/80 hover:bg-sky-950/40"
            >
              <span className="text-lg font-semibold text-sky-100">
                {locale === "en" ? "Multiplayer" : "멀티플레이"}
              </span>
              <span className="text-xs leading-relaxed text-zinc-400">
                {locale === "en"
                  ? "Open the online version to create or join a room."
                  : "온라인 버전으로 이동해 방을 만들거나 참가합니다."}
              </span>
            </a>
          )}

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

          {!IS_STATIC && (
            <Link href="/holdem/feedback" className={cardClass}>
              <span className="text-lg font-semibold text-zinc-100">
                {t("home.feedback")}
              </span>
              <span className="text-xs leading-relaxed text-zinc-400">
                {t("home.feedbackDesc")}
              </span>
            </Link>
          )}
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
