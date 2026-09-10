"use client";

import * as React from "react";
import {
  applyHoldemMotionDocumentAttr,
  computeHoldemMotionMode,
  HOLDEM_MOTION_MODE_CHANGED,
  type HoldemMotionMode,
} from "@/holdem/holdemMotionMode";

const MotionCtx = React.createContext<HoldemMotionMode>("normal");

export function useHoldemMotionMode(): HoldemMotionMode {
  return React.useContext(MotionCtx);
}

export function HoldemMotionRuntime({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = React.useState<HoldemMotionMode>(() =>
    typeof window !== "undefined" ? computeHoldemMotionMode() : "normal",
  );
  React.useLayoutEffect(() => {
    const sync = () => {
      const m = computeHoldemMotionMode();
      setMode(m);
      applyHoldemMotionDocumentAttr(m);
    };
    sync();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(HOLDEM_MOTION_MODE_CHANGED, sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(HOLDEM_MOTION_MODE_CHANGED, sync);
    };
  }, []);

  return (
    <MotionCtx.Provider value={mode}>
      {children}
    </MotionCtx.Provider>
  );
}
