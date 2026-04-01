"use client";

import * as React from "react";
import Link from "next/link";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

type SubmitState = "idle" | "submitting" | "done" | "error";

const STARS = [1, 2, 3, 4, 5] as const;

const STAR_LABELS: Record<number, string> = {
  1: "별로예요",
  2: "아쉬워요",
  3: "괜찮아요",
  4: "좋아요",
  5: "최고예요",
};

export default function FeedbackClient() {
  if (IS_STATIC) {
    return (
      <div className="flex flex-col items-center gap-5 py-12 text-center">
        <div className="text-4xl">🌐</div>
        <p className="text-sm font-semibold text-zinc-300">
          Feedback is available on the web version only.
        </p>
        <p className="text-xs text-zinc-500">
          Visit the browser version to leave feedback.
        </p>
        <Link
          href="/holdem"
          className="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Home
        </Link>
      </div>
    );
  }

  const [nickname, setNickname] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [rating, setRating] = React.useState<number | null>(null);
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);
  const [submitState, setSubmitState] = React.useState<SubmitState>("idle");
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const msgLen = message.trim().length;
  const canSubmit = msgLen > 0 && submitState !== "submitting";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitState("submitting");
    setErrMsg(null);

    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, message: message.trim(), rating }),
      });
      if (r.ok) {
        setSubmitState("done");
      } else {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setErrMsg(j.error ?? "오류가 발생했습니다.");
        setSubmitState("error");
      }
    } catch {
      setErrMsg("네트워크 오류가 발생했습니다.");
      setSubmitState("error");
    }
  };

  if (submitState === "done") {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        <div className="text-5xl">🙏</div>
        <h2 className="text-xl font-bold text-zinc-100">소중한 의견 감사합니다</h2>
        <p className="text-sm text-zinc-400">
          피드백이 게임 개선에 큰 도움이 됩니다.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setNickname("");
              setRating(null);
              setSubmitState("idle");
            }}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700/60"
          >
            추가 의견 보내기
          </button>
          <Link
            href="/holdem"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  const displayRating = hoverRating ?? rating;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      {/* 별점 */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-zinc-300">
          게임 평가 <span className="text-xs font-normal text-zinc-500">(선택)</span>
        </label>
        <div className="flex items-center gap-1.5">
          {STARS.map((s) => (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setHoverRating(s)}
              onMouseLeave={() => setHoverRating(null)}
              onClick={() => setRating((prev) => (prev === s ? null : s))}
              className="text-2xl transition-transform hover:scale-110 active:scale-95"
              aria-label={STAR_LABELS[s]}
            >
              {displayRating != null && s <= displayRating ? "⭐" : "☆"}
            </button>
          ))}
          {displayRating != null ? (
            <span className="ml-2 text-xs text-zinc-400">
              {STAR_LABELS[displayRating]}
            </span>
          ) : null}
        </div>
      </div>

      {/* 닉네임 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300">
          닉네임 <span className="text-xs font-normal text-zinc-500">(선택 · 최대 40자)</span>
        </label>
        <input
          type="text"
          maxLength={40}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="익명"
          className="w-full rounded-lg border border-zinc-600/80 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
        />
      </div>

      {/* 내용 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300">
          의견 <span className="text-xs font-normal text-zinc-500">(필수)</span>
        </label>
        <textarea
          required
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="버그, 건의사항, 개선 아이디어 등 무엇이든 적어 주세요."
          className="w-full resize-y rounded-lg border border-zinc-600/80 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
        />
        <p className="mt-1 text-right text-[11px] text-zinc-500">
          {msgLen} / 2000
        </p>
      </div>

      {/* 에러 */}
      {errMsg ? (
        <p className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
          {errMsg}
        </p>
      ) : null}

      {/* 제출 */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-sky-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitState === "submitting" ? "전송 중…" : "의견 보내기"}
      </button>
    </form>
  );
}
