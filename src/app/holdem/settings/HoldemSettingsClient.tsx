"use client";

import * as React from "react";
import Link from "next/link";
import {
  DEFAULT_HOLDEM_DISPLAY_NAMES,
  loadHoldemDisplayNames,
  saveHoldemDisplayNames,
} from "@/holdem/playerDisplayNames";

export function HoldemSettingsClient() {
  const [n0, setN0] = React.useState(() => loadHoldemDisplayNames()[0]!);
  const [n1, setN1] = React.useState(() => loadHoldemDisplayNames()[1]!);
  const [soundOn, setSoundOn] = React.useState(false);

  React.useEffect(() => {
    try {
      const s = window.localStorage.getItem("holdem-sound-enabled-v1");
      setSoundOn(s === "1");
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    saveHoldemDisplayNames([n0, n1]);
  }, [n0, n1]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        "holdem-sound-enabled-v1",
        soundOn ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-lg px-4 py-10 pb-16 lg:max-w-xl lg:py-14">
        <Link
          href="/holdem"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          ← 홈으로
        </Link>
        <h1 className="mt-6 text-2xl font-bold">환경 설정</h1>
        <p className="mt-2 text-sm text-zinc-400">
          표시 이름은 이 브라우저에만 저장됩니다. 온라인에서도 각자의 기기에서
          보이는 이름을 씁니다.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-zinc-700/80 bg-zinc-800/40 p-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-zinc-400">
              첫 번째 플레이어 표시 이름
            </span>
            <input
              value={n0}
              onChange={(e) => setN0(e.target.value.slice(0, 24))}
              maxLength={24}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-zinc-50"
              placeholder={DEFAULT_HOLDEM_DISPLAY_NAMES[0]!}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-zinc-400">
              두 번째 플레이어 표시 이름
            </span>
            <input
              value={n1}
              onChange={(e) => setN1(e.target.value.slice(0, 24))}
              maxLength={24}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-zinc-50"
              placeholder={DEFAULT_HOLDEM_DISPLAY_NAMES[1]!}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-3 border-t border-zinc-700/60 pt-4 text-sm">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-500"
            />
            <span>
              사운드 효과
              <span className="ml-2 text-xs text-zinc-500">
                (준비 중 — 옵션만 저장됩니다)
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
