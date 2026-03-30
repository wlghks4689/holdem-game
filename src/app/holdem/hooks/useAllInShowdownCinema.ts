"use client";

import * as React from "react";
import { ALL_IN_RUNOUT_LAST_NOTE } from "@/holdem/constants";
import type { GameState } from "@/holdem/types";
import {
  playShowdownDealChirp,
  playShowdownResultChime,
  playShowdownRiverTension,
} from "../showdownCinemaSounds";

export type AllInCinemaPhase =
  | "off"
  | "intro"
  | "flop"
  | "turn"
  | "river"
  | "result";

const DELAY_INTRO = 580;
const DELAY_AFTER_FLOP = 720;
const DELAY_AFTER_TURN = 720;
const DELAY_AFTER_RIVER = 640;
const DELAY_BEFORE_RESULT = 680;

function runoutStartRev(state: GameState): number {
  const v = state.runoutUiStartRevealed;
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(5, Math.max(0, Math.round(n)));
}

function buildRunoutTargets(startRev: number): number[] {
  const targets: number[] = [];
  let r = Math.min(5, Math.max(0, startRev));
  while (r < 5) {
    if (r < 3) {
      targets.push(3);
      r = 3;
    } else if (r < 4) {
      targets.push(4);
      r = 4;
    } else {
      targets.push(5);
      r = 5;
    }
  }
  return targets;
}

type CinemaMeta = {
  runKey: string | null;
  startRev: number;
  targets: number[];
};

function computeCinemaMeta(state: GameState): CinemaMeta {
  if (state.phase !== "showdown" || state.handEndMode !== "showdown") {
    return { runKey: null, startRev: 0, targets: [] };
  }
  if (state.lastActionNote !== ALL_IN_RUNOUT_LAST_NOTE) {
    return { runKey: null, startRev: 0, targets: [] };
  }
  const startRev = runoutStartRev(state);
  const targets = buildRunoutTargets(startRev);
  if (targets.length === 0) {
    return { runKey: null, startRev, targets: [] };
  }
  const i = state.logs.findLastIndex((l) => l.t === "showdown");
  const runKey = i >= 0 ? `allin-runout-${i}-${targets.join("-")}` : null;
  return { runKey, startRev, targets };
}

export function useAllInShowdownCinema(state: GameState) {
  const meta = React.useMemo(
    () => computeCinemaMeta(state),
    [
      state.phase,
      state.handEndMode,
      state.lastActionNote,
      state.logs,
      state.runoutUiStartRevealed,
    ],
  );
  const { runKey, startRev, targets } = meta;

  const [phase, setPhase] = React.useState<AllInCinemaPhase>("off");
  const [visualRevealed, setVisualRevealed] = React.useState(0);
  const [showHandResult, setShowHandResult] = React.useState(true);

  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const skippedRef = React.useRef(false);

  const clearTimers = React.useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  const targetsKey = targets.join(",");

  const skip = React.useCallback(() => {
    skippedRef.current = true;
    clearTimers();
    setVisualRevealed(5);
    setPhase("result");
    setShowHandResult(true);
    playShowdownResultChime();
  }, [clearTimers]);

  React.useLayoutEffect(() => {
    if (runKey == null) {
      setPhase("off");
      setShowHandResult(true);
      return;
    }
    skippedRef.current = false;
    setPhase("intro");
    setVisualRevealed(startRev);
    setShowHandResult(false);
  }, [runKey, startRev]);

  React.useEffect(() => {
    if (runKey == null) {
      clearTimers();
      return;
    }
    if (targets.length === 0) {
      clearTimers();
      return;
    }

    clearTimers();
    const sched = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!skippedRef.current) fn();
      }, ms);
      timersRef.current.push(id);
    };

    let t = DELAY_INTRO;
    for (const tgt of targets) {
      sched(() => {
        if (tgt === 5) playShowdownRiverTension();
        setPhase(tgt <= 3 ? "flop" : tgt === 4 ? "turn" : "river");
        setVisualRevealed(tgt);
        playShowdownDealChirp();
      }, t);
      t +=
        tgt === 5
          ? DELAY_AFTER_RIVER
          : tgt === 4
            ? DELAY_AFTER_TURN
            : DELAY_AFTER_FLOP;
    }

    sched(() => {
      playShowdownResultChime();
      setPhase("result");
      setShowHandResult(true);
    }, t + DELAY_BEFORE_RESULT);

    return clearTimers;
  }, [runKey, targetsKey, clearTimers]);

  const active = runKey != null;
  const blocking = active && phase !== "result" && phase !== "off";

  const boardStreetLabelKo = React.useMemo(() => {
    if (!active) return null;
    switch (phase) {
      case "intro":
        return "올인 쇼다운";
      case "flop":
        return "플랍";
      case "turn":
        return "턴";
      case "river":
        return "리버";
      case "result":
        return "쇼다운";
      default:
        return null;
    }
  }, [active, phase]);

  const streetPulse: "flop" | "turn" | "river" | null =
    phase === "flop"
      ? "flop"
      : phase === "turn"
        ? "turn"
        : phase === "river"
          ? "river"
          : null;

  return {
    active,
    phase,
    blockingInput: blocking,
    visualRevealed: active ? visualRevealed : null,
    showHandResult: active ? showHandResult : true,
    boardStreetLabelKo,
    streetPulse,
    skip,
  };
}
