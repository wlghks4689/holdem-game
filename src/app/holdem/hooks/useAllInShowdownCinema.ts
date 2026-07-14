"use client";

import * as React from "react";
import type { GameState } from "@/holdem/types";
import {
  playShowdownDealChirp,
  playShowdownResultChime,
  playShowdownRiverTension,
} from "../showdownCinemaSounds";

export type AllInCinemaPhase =
  | "off"
  | "allin-lock"
  | "showdown-reveal"
  | "showdown-resolve";

// 올인 연출 타이밍 (ms)
// 목표: 핸드가 먼저 쇼다운(양쪽 홀 카드 공개)되고, 남은 보드가 1장씩 천천히 깔린 뒤 결과가 고정된다.
const DELAY_LOCK = 800;               // allin-lock 단계 유지 시간 (ALL-IN 오버레이는 짧게)
const DELAY_BETWEEN_REVEAL = 1050;    // 각 보드 카드 공개 간격(긴장감 유지)
const DELAY_AFTER_LAST_REVEAL = 650;  // 마지막 공개 후 결과까지 정지 시간

function runoutStartRev(state: GameState): number {
  const v = state.runoutUiStartRevealed;
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(5, Math.max(0, Math.round(n)));
}

function buildRunoutTargets(startRev: number): number[] {
  const targets: number[] = [];
  let r = Math.min(5, Math.max(0, startRev));
  while (r < 5) {
    r += 1;
    targets.push(r);
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
  const startRev = runoutStartRev(state);
  // 올인 콜 런아웃에서만 runoutUiStartRevealed가 0~4로 기록된다.
  // (일반 쇼다운은 null 또는 5로 간주되어 시네마 비활성)
  if (state.runoutUiStartRevealed == null || startRev >= 5) {
    return { runKey: null, startRev: 0, targets: [] };
  }
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
    [state],
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

  const skip = React.useCallback(() => {
    skippedRef.current = true;
    clearTimers();
    setVisualRevealed(5);
    setPhase("showdown-resolve");
    setShowHandResult(true);
    playShowdownResultChime();
  }, [clearTimers]);

  React.useLayoutEffect(() => {
    if (runKey == null) {
      setPhase("off");
      setVisualRevealed(0);
      setShowHandResult(true);
      return;
    }
    skippedRef.current = false;
    setPhase("allin-lock");
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

    let t = DELAY_LOCK;
    for (const tgt of targets) {
      sched(() => {
        if (tgt === 5) playShowdownRiverTension();
        setPhase("showdown-reveal");
        setVisualRevealed(tgt);
        playShowdownDealChirp();
      }, t);
      t += DELAY_BETWEEN_REVEAL;
    }

    sched(() => {
      playShowdownResultChime();
      setPhase("showdown-resolve");
      setShowHandResult(true);
    }, t + DELAY_AFTER_LAST_REVEAL);

    return clearTimers;
  }, [runKey, clearTimers]);

  const active = runKey != null;
  const blocking = active && phase !== "showdown-resolve" && phase !== "off";

  const boardStreetLabelKo = React.useMemo(() => {
    if (!active) return null;
    switch (phase) {
      case "allin-lock":
        return "ALL-IN";
      case "showdown-reveal":
        return visualRevealed <= 3 ? "플랍" : visualRevealed === 4 ? "턴" : "리버";
      case "showdown-resolve":
        return "쇼다운";
      default:
        return null;
    }
  }, [active, phase, visualRevealed]);

  const streetPulse: "flop" | "turn" | "river" | null =
    phase === "showdown-reveal" && visualRevealed <= 3
      ? "flop"
      : phase === "showdown-reveal" && visualRevealed === 4
        ? "turn"
        : phase === "showdown-reveal" && visualRevealed === 5
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
