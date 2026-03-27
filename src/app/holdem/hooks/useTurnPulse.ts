"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerIndex } from "@/holdem/types";

/** `toAct`가 바뀔 때마다 ~320ms 동안 true (턴 변경 링 애니메이션용) */
export function useTurnPulse(toAct: PlayerIndex | null): boolean {
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
      const t1 = window.setTimeout(() => setPulse(false), 320);
      return () => {
        window.cancelAnimationFrame(t0);
        window.clearTimeout(t1);
      };
    }
    prev.current = toAct;
  }, [toAct]);

  return pulse;
}
