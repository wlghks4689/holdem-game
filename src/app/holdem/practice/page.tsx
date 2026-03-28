import Link from "next/link";
import HoldemPageClient from "../HoldemPageClient";

export default function HoldemPracticePage() {
  return (
    <div className="min-h-dvh bg-zinc-900">
      <div className="mx-auto max-w-3xl px-4 pb-2 pt-4 lg:max-w-6xl lg:px-8 lg:pt-6">
        <Link
          href="/holdem"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          ← 홈으로
        </Link>
      </div>
      <HoldemPageClient />
    </div>
  );
}
