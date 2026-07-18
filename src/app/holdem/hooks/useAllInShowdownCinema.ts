"use client";

import * as React from "react";
import type { GameState } from "@/holdem/types";
import {
  buildAllInCinemaTimeline,
  type AllInCinemaStreet,
} from "../allInCinemaTimeline";
import { useHoldemMotionMode } from "../HoldemMotionRuntime";
import {
  playAllInImpact,
  playShowdownResultChime,
  playShowdownStreetWindup,
} from "../showdownCinemaSounds";

export type AllInCinemaPhase =
  | "off"
  | "allin-lock"
  | "street-windup"
  | "showdown-reveal"
  | "showdown-hold"
  | "showdown-resolve";

function runoutStartRev(state: GameState): number {
  const value = state.runoutUiStartRevealed;
  const normalized =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(5, Math.max(0, Math.round(normalized)));
}
type CinemaMeta = {
  runKey: string | null;
  startRev: number;
};

function computeCinemaMeta(state: GameState): CinemaMeta {
  if (state.phase !== "showdown" || state.handEndMode !== "showdown") {
    return { runKey: null, startRev: 0 };
  }
  const startRev = runoutStartRev(state);
  if (state.runoutUiStartRevealed == null) {
    return { runKey: null, startRev };
  }
  const showdownIndex = state.logs.findLastIndex((log) => log.t === "showdown");
  return {
    runKey:
      showdownIndex >= 0
        ? `allin-runout-${showdownIndex}-${startRev}`
        : null,
    startRev,
  };
}

export function useAllInShowdownCinema(state: GameState) {
  const motionMode = useHoldemMotionMode();
  const subtleMotion = motionMode === "subtle";
  const meta = React.useMemo(() => computeCinemaMeta(state), [state]);
  const { runKey, startRev } = meta;
  const timeline = React.useMemo(
    () => buildAllInCinemaTimeline(startRev, subtleMotion),
    [startRev, subtleMotion],
  );

  const [phase, setPhase] = React.useState<AllInCinemaPhase>("off");
  const [visualRevealed, setVisualRevealed] = React.useState(0);
  const [activeStreet, setActiveStreet] =
    React.useState<AllInCinemaStreet | null>(null);
  const [showHandResult, setShowHandResult] = React.useState(true);
  const [awardReleased, setAwardReleased] = React.useState(false);

  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const awardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const skippedRef = React.useRef(false);
  const startedRunKeyRef = React.useRef<string | null>(null);

  const clearTimers = React.useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  const clearAwardTimer = React.useCallback(() => {
    if (awardTimerRef.current != null) clearTimeout(awardTimerRef.current);
    awardTimerRef.current = null;
  }, []);

  const resolveCinema = React.useCallback(() => {
    clearTimers();
    setVisualRevealed(5);
    setActiveStreet(null);
    setPhase("showdown-resolve");
    setShowHandResult(true);
    playShowdownResultChime();
    clearAwardTimer();
    awardTimerRef.current = setTimeout(() => setAwardReleased(true), 850);
  }, [clearAwardTimer, clearTimers]);

  const skip = React.useCallback(() => {
    skippedRef.current = true;
    resolveCinema();
  }, [resolveCinema]);

  React.useLayoutEffect(() => {
    if (runKey == null) {
      startedRunKeyRef.current = null;
      setPhase("off");
      setVisualRevealed(0);
      setActiveStreet(null);
      setShowHandResult(true);
      setAwardReleased(false);
      clearAwardTimer();
      return;
    }
    skippedRef.current = false;
    setPhase("allin-lock");
    setVisualRevealed(startRev);
    setActiveStreet(null);
    setShowHandResult(false);
    setAwardReleased(false);
    if (startedRunKeyRef.current !== runKey) {
      startedRunKeyRef.current = runKey;
      playAllInImpact();
    }
  }, [clearAwardTimer, runKey, startRev]);

  React.useEffect(() => {
    clearTimers();
    if (runKey == null || timeline.length === 0) return;

    for (const event of timeline) {
      const id = setTimeout(() => {
        if (skippedRef.current) return;
        switch (event.kind) {
          case "windup":
            setActiveStreet(event.street);
            setPhase("street-windup");
            playShowdownStreetWindup(event.street);
            break;
          case "reveal":
            setActiveStreet(event.street);
            setPhase("showdown-reveal");
            setVisualRevealed(event.targetRevealed);
            break;
          case "hold":
            setActiveStreet(event.street);
            setPhase("showdown-hold");
            break;
          case "resolve":
            resolveCinema();
            break;
        }
      }, event.atMs);
      timersRef.current.push(id);
    }

    return clearTimers;
  }, [runKey, timeline, clearTimers, resolveCinema]);

  React.useEffect(() => clearAwardTimer, [clearAwardTimer]);

  const active = runKey != null;
  const blockingInput =
    active && phase !== "showdown-resolve" && phase !== "off";

  const boardStreetLabelKo = React.useMemo(() => {
    if (!active) return null;
    if (phase === "allin-lock") return "ALL-IN";
    if (phase === "showdown-resolve") return "쇼다운";
    if (activeStreet === "flop") return "플랍";
    if (activeStreet === "turn") return "턴";
    if (activeStreet === "river") return "리버";
    return "RUNOUT";
  }, [active, activeStreet, phase]);

  return {
    active,
    activeStreet,
    phase,
    blockingInput,
    visualRevealed: active ? visualRevealed : null,
    showHandResult: active ? showHandResult : true,
    holdAwardedChips: active && !awardReleased,
    boardStreetLabelKo,
    streetPulse:
      phase === "street-windup" ||
      phase === "showdown-reveal" ||
      phase === "showdown-hold"
        ? activeStreet
        : null,
    subtleMotion,
    skip,
  };
}
