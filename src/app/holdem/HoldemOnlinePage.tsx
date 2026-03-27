"use client";

import * as React from "react";
import {
  DEFAULT_HOLDEM_DISPLAY_NAMES,
  loadHoldemDisplayNames,
} from "@/holdem/playerDisplayNames";
import type { PlayerIndex } from "@/holdem/types";
import { useHoldemOnlineGame } from "@/holdem/useHoldemOnlineGame";
import { HoldemPlayUI } from "./HoldemPlayUI";

export function HoldemOnlinePage(props: {
  roomId: string;
  mySeat: PlayerIndex;
  token: string;
}) {
  const { roomId, mySeat, token } = props;
  const { state, dispatch, actionTimerSecondsLeft, loadError } =
    useHoldemOnlineGame({ roomId, mySeat, token });

  const [playerNames, setPlayerNames] = React.useState<[string, string]>([
    DEFAULT_HOLDEM_DISPLAY_NAMES[0]!,
    DEFAULT_HOLDEM_DISPLAY_NAMES[1]!,
  ]);

  React.useEffect(() => {
    setPlayerNames(loadHoldemDisplayNames());
  }, []);

  const updateName = React.useCallback((p: PlayerIndex, raw: string) => {
    setPlayerNames((prev) => {
      const fb =
        p === 0
          ? DEFAULT_HOLDEM_DISPLAY_NAMES[0]!
          : DEFAULT_HOLDEM_DISPLAY_NAMES[1]!;
      const t = raw.trim();
      const nextName = t.length > 0 ? t.slice(0, 24) : fb;
      return p === 0 ? [nextName, prev[1]!] : [prev[0]!, nextName];
    });
  }, []);

  if (loadError && state == null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-900 px-4 text-center text-zinc-100">
        <p className="text-lg font-semibold">방에 연결할 수 없습니다</p>
        <p className="max-w-md text-sm text-zinc-400">{loadError}</p>
        <a
          className="mt-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          href="/holdem"
        >
          홀덤 화면으로
        </a>
      </div>
    );
  }

  if (state == null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-900 text-zinc-400">
        방 상태 불러오는 중…
      </div>
    );
  }

  return (
    <>
      {loadError ? (
        <div className="border-b border-amber-600/50 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-100">
          {loadError}{" "}
          <span className="text-amber-200/80">(동기화를 다시 시도합니다)</span>
        </div>
      ) : null}
      <HoldemPlayUI
        state={state}
        dispatch={dispatch}
        actionTimerSecondsLeft={actionTimerSecondsLeft}
        viewer={mySeat}
        playerNames={playerNames}
        updateName={updateName}
        mySeat={mySeat}
        playMode="online"
        onlineMeta={{ roomId }}
      />
    </>
  );
}
