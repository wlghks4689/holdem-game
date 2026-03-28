"use client";

import * as React from "react";
import {
  DEFAULT_HOLDEM_DISPLAY_NAMES,
  loadHoldemDisplayNames,
  saveHoldemDisplayNames,
} from "@/holdem/playerDisplayNames";
import type { PlayerIndex } from "@/holdem/types";
import { useHoldemGame } from "@/holdem/useHoldemGame";
import { HoldemPlayUI } from "./HoldemPlayUI";

export default function HoldemPageClient() {
  const {
    state,
    dispatch,
    actionTimerSecondsLeft,
    localPaused,
    toggleLocalPause,
  } = useHoldemGame();
  const [viewer, setViewer] = React.useState<PlayerIndex>(1);
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
      const next: [string, string] =
        p === 0 ? [nextName, prev[1]!] : [prev[0]!, nextName];
      saveHoldemDisplayNames(next);
      return next;
    });
  }, []);

  return (
    <HoldemPlayUI
      state={state}
      dispatch={dispatch}
      actionTimerSecondsLeft={actionTimerSecondsLeft}
      viewer={viewer}
      setViewer={setViewer}
      playerNames={playerNames}
      updateName={updateName}
      playMode="local"
      localPause={{ paused: localPaused, onToggle: toggleLocalPause }}
    />
  );
}
