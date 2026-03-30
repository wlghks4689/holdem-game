"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerIndex } from "@/holdem/types";

export type UseTurnPulseOptions = {
  /** 링 펄스를 유지할 시간(ms). subtle 모션에서 짧게 */
  holdMs?: number;
};

/** `toAct`가 바뀔 때마다 잠시 true (턴 변경 링 애니메이션용) */
export function useTurnPulse(
  toAct: PlayerIndex | null,
  options?: UseTurnPulseOptions,
): boolean {
  const holdMs = options?.holdMs ?? 320;
  const prev = useRef<PlayerIndex | null | "init">("init");
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (prev.current === "init") {
      prev.current = toAct;
      return;
    }
    if (toAct !== prev.current && toAct != null) {
      prev.current = toAct;
      const t0 = window.requestAnimationFrame(() => {
        setPulse(true);
      });
      const t1 = window.setTimeout(() => setPulse(false), holdMs);
      return () => {
        window.cancelAnimationFrame(t0);
        window.clearTimeout(t1);
      };
    }
    prev.current = toAct;
  }, [toAct, holdMs]);

  return pulse;
}
