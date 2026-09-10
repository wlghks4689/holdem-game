'use client';

import * as React from "react";
import { useActionTimer } from "./useActionTimer";
import { createInitialGameState, holdemReducer } from "./gameReducer";
import type { CostGameStructure, GameAction, GameState, HoldemGameMode } from "./types";

export function useHoldemGame(
  gameMode: HoldemGameMode = "classic",
  costStructure: CostGameStructure = "deep",
) {
  const [state, dispatch] = React.useReducer(
    (s: GameState, a: GameAction) => holdemReducer(s, a),
    { gameMode, costStructure },
    ({ gameMode: mode, costStructure: structure }) =>
      createInitialGameState(mode, structure),
  );

  const [localPaused, setLocalPaused] = React.useState(false);

  const actionTimerLeft = useActionTimer({
    state,
    paused: localPaused,
    dispatch,
  });

  const toggleLocalPause = React.useCallback(() => {
    setLocalPaused((v) => !v);
  }, []);

  return {
    state,
    dispatch,
    act: (a: GameAction) => dispatch(a),
    actionTimerSecondsLeft: actionTimerLeft,
    localPaused,
    toggleLocalPause,
  };
}
