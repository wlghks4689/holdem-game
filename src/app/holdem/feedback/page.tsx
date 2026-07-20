import FeedbackClient from "./FeedbackClient";
import { BackHomeLink } from "../components/BackHomeLink";

export default function FeedbackPage() {
  return (
    <div className="min-h-dvh bg-zinc-900 text-zinc-50">
      <div className="mx-auto max-w-lg px-4 py-10 pb-20">
        <BackHomeLink />

        <div className="mt-6 mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
            피드백
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            게임을 플레이하며 느낀 점을 자유롭게 남겨 주세요.
            <br />
            모든 의견이 게임 개선에 직접 반영됩니다.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-800/40 p-6">
          <FeedbackClient />
        </div>
      </div>
    </div>
  );
}
