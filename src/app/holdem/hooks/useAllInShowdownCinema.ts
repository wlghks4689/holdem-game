"use client";

import * as React from "react";
import type { GameState } from "@/holdem/types";
import {
  ALL_IN_RESULT_HOLD_MS,
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
  // 모션 표현 설정과 화면 크기는 타이머를 재시작하지 않는다.
  const timeline = React.useMemo(
    () => buildAllInCinemaTimeline(startRev),
    [startRev],
  );

  const [phase, setPhase] = React.useState<AllInCinemaPhase>("off");
  const [visualRevealed, setVisualRevealed] = React.useState(0);
  const [activeStreet, setActiveStreet] =
    React.useState<AllInCinemaStreet | null>(null);
  const [showHandResult, setShowHandResult] = React.useState(true);
  const [awardReleased, setAwardReleased] = React.useState(false);
  const [interactionReleased, setInteractionReleased] = React.useState(false);

  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const awardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRunKeyRef = React.useRef<string | null>(null);

  const clearTimers = React.useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  const clearAwardTimer = React.useCallback(() => {
    if (awardTimerRef.current != null) clearTimeout(awardTimerRef.current);
    awardTimerRef.current = null;
  }, []);

  const clearResultTimer = React.useCallback(() => {
    if (resultTimerRef.current != null) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = null;
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
    clearResultTimer();
    resultTimerRef.current = setTimeout(
      () => setInteractionReleased(true),
      ALL_IN_RESULT_HOLD_MS,
    );
  }, [clearAwardTimer, clearResultTimer, clearTimers]);

  React.useLayoutEffect(() => {
    if (runKey == null) {
      startedRunKeyRef.current = null;
      setPhase("off");
      setVisualRevealed(0);
      setActiveStreet(null);
      setShowHandResult(true);
      setAwardReleased(false);
      setInteractionReleased(false);
      clearAwardTimer();
      clearResultTimer();
      return;
    }
    setPhase("allin-lock");
    setVisualRevealed(startRev);
    setActiveStreet(null);
    setShowHandResult(false);
    setAwardReleased(false);
    setInteractionReleased(false);
    clearResultTimer();
    if (startedRunKeyRef.current !== runKey) {
      startedRunKeyRef.current = runKey;
      playAllInImpact();
    }
  }, [clearAwardTimer, clearResultTimer, runKey, startRev]);

  React.useEffect(() => {
    clearTimers();
    if (runKey == null || timeline.length === 0) return;

    for (const event of timeline) {
      const id = setTimeout(() => {
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

  React.useEffect(
    () => () => {
      clearAwardTimer();
      clearResultTimer();
    },
    [clearAwardTimer, clearResultTimer],
  );

  const active = runKey != null;
  const blockingInput = active && phase !== "off" && !interactionReleased;

  const boardStreetLabelKo = React.useMemo(() => {
    if (!active) return null;
    if (phase === "allin-lock") return "SHOWDOWN";
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
  };
}
