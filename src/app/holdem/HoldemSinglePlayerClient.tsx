"use client";

import * as React from "react";
import {
  DEFAULT_HOLDEM_DISPLAY_NAMES,
  loadHoldemDisplayNames,
  saveHoldemDisplayNames,
} from "@/holdem/playerDisplayNames";
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
  easy:   "AI (Easy)",
  normal: "AI",
  hard:   "AI (Hard)",
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

  // 플레이어 이름: 좌석 0 = 사용자, 좌석 1 = AI
  const [playerNames, setPlayerNames] = React.useState<[string, string]>([
    DEFAULT_HOLDEM_DISPLAY_NAMES[0]!,
    AI_NAMES[difficulty],
  ]);

  React.useEffect(() => {
    const saved = loadHoldemDisplayNames();
    setPlayerNames([saved[HUMAN_SEAT], AI_NAMES[difficulty]]);
  }, [difficulty]);

  const updateName = React.useCallback(
    (p: PlayerIndex, raw: string) => {
      // AI 이름은 변경 불가
      if (p === AI_SEAT) return;
      setPlayerNames((prev) => {
        const fb = DEFAULT_HOLDEM_DISPLAY_NAMES[0]!;
        const t = raw.trim();
        const next: [string, string] = [
          t.length > 0 ? t.slice(0, 24) : fb,
          prev[1]!,
        ];
        saveHoldemDisplayNames([next[0], DEFAULT_HOLDEM_DISPLAY_NAMES[1]!]);
        return next;
      });
    },
    [],
  );

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
