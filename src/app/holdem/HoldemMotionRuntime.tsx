"use client";

import * as React from "react";
import {
  applyHoldemMotionDocumentAttr,
  computeHoldemMotionMode,
  dispatchHoldemMotionModeChanged,
  HOLDEM_MOTION_MODE_CHANGED,
  loadMotionDebugEnabled,
  saveMotionDebugEnabled,
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
  const [dbg, setDbg] = React.useState(() =>
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    loadMotionDebugEnabled(),
  );

  React.useLayoutEffect(() => {
    const sync = () => {
      const m = computeHoldemMotionMode();
      setMode(m);
      applyHoldemMotionDocumentAttr(m);
      if (process.env.NODE_ENV === "development") {
        setDbg(loadMotionDebugEnabled());
      }
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

  const showDevTools = process.env.NODE_ENV === "development";

  return (
    <MotionCtx.Provider value={mode}>
      {children}
      {showDevTools ? (
        <button
          type="button"
          className={[
            "fixed right-2 top-2 z-[9999] rounded-md border px-2 py-1 font-mono text-[10px] font-semibold shadow-lg transition-colors",
            dbg
              ? "border-amber-500/80 bg-amber-950/95 text-amber-100 hover:bg-amber-900/95"
              : "border-zinc-600 bg-zinc-900/95 text-zinc-300 hover:bg-zinc-800",
          ].join(" ")}
          title="개발 전용: 접근성 reduced-motion과 무관하게 전체 애니메이션 재생. localStorage 저장."
          aria-pressed={dbg}
          onClick={() => {
            const next = !loadMotionDebugEnabled();
            saveMotionDebugEnabled(next);
            setDbg(next);
            dispatchHoldemMotionModeChanged();
          }}
        >
          anim dbg {dbg ? "ON" : "off"}
        </button>
      ) : null}
    </MotionCtx.Provider>
  );
}
