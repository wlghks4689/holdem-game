"use client";

import * as React from "react";
import {
  HOLDEM_PREFS_CHANGED_EVENT,
  loadRoomNickname,
  saveRoomNickname,
} from "@/holdem/holdemPrefs";
import { DEFAULT_HOLDEM_DISPLAY_NAMES } from "@/holdem/playerDisplayNames";
import type { Difficulty } from "@/holdem/aiPlayer";
import type { PlayerIndex } from "@/holdem/types";
import { useHoldemSinglePlayer } from "@/holdem/useHoldemSinglePlayer";
import { HoldemPlayUI } from "./HoldemPlayUI";

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

const AI_NAMES: Record<Difficulty, string> = {
  easy: "Rookie",
  normal: "Regular",
  hard: "Pro",
};

interface Props {
  difficulty: Difficulty;
}

export default function HoldemSinglePlayerClient({ difficulty }: Props) {
  const AI_SEAT: PlayerIndex = 1;
  const HUMAN_SEAT: PlayerIndex = 0;

  const {
    state,
    dispatch,
    actionTimerSecondsLeft,
    localPaused,
    toggleLocalPause,
  } = useHoldemSinglePlayer({ difficulty, aiSeat: AI_SEAT });

  const buildNames = React.useCallback(
    (): [string, string] => {
      const nick = loadRoomNickname();
      const hero =
        nick.length > 0 ? nick : DEFAULT_HOLDEM_DISPLAY_NAMES[HUMAN_SEAT]!;
      return [hero, AI_NAMES[difficulty]];
    },
    [difficulty],
  );

  const [playerNames, setPlayerNames] = React.useState<[string, string]>(() => {
    const nick = loadRoomNickname();
    const hero =
      nick.length > 0 ? nick : DEFAULT_HOLDEM_DISPLAY_NAMES[HUMAN_SEAT]!;
    return [hero, AI_NAMES[difficulty]];
  });

  React.useEffect(() => {
    setPlayerNames(buildNames());
  }, [buildNames]);

  React.useEffect(() => {
    const onPrefs = () => setPlayerNames(buildNames());
    window.addEventListener(HOLDEM_PREFS_CHANGED_EVENT, onPrefs);
    return () => window.removeEventListener(HOLDEM_PREFS_CHANGED_EVENT, onPrefs);
  }, [buildNames]);

  const updateName = React.useCallback((p: PlayerIndex, raw: string) => {
    if (p === AI_SEAT) return;
    const t = raw.trim().slice(0, 24);
    const fb = DEFAULT_HOLDEM_DISPLAY_NAMES[HUMAN_SEAT]!;
    const nextHero = t.length > 0 ? t : fb;
    saveRoomNickname(t.length > 0 ? t : "");
    setPlayerNames((prev) => [nextHero, prev[1]!]);
  }, []);

  return (
    <HoldemPlayUI
      state={state}
      dispatch={dispatch}
      actionTimerSecondsLeft={actionTimerSecondsLeft}
      viewer={HUMAN_SEAT}
      setViewer={undefined}
      playerNames={playerNames}
      updateName={updateName}
      mySeat={HUMAN_SEAT}
      playMode="single"
      singleDifficulty={difficulty}
      localPause={{ paused: localPaused, onToggle: toggleLocalPause }}
    />
  );
}
