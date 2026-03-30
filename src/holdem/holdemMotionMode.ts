export const HOLDEM_MOTION_DEBUG_STORAGE_KEY = "holdem-motion-debug-v1";

/** 문서 `data-holdem-motion` 과 동일 — debug-full 은 개발+토글 시에만 */
export type HoldemMotionMode = "normal" | "subtle" | "debug-full";

export const HOLDEM_MOTION_MODE_CHANGED = "holdem-motion-mode-changed";

export function loadMotionDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HOLDEM_MOTION_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMotionDebugEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HOLDEM_MOTION_DEBUG_STORAGE_KEY,
      on ? "1" : "0",
    );
  } catch {
    /* ignore */
  }
}

export function computeHoldemMotionMode(): HoldemMotionMode {
  if (typeof window === "undefined") return "normal";
  const isDev = process.env.NODE_ENV === "development";
  if (isDev && loadMotionDebugEnabled()) return "debug-full";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "subtle";
  }
  return "normal";
}

export function applyHoldemMotionDocumentAttr(mode: HoldemMotionMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-holdem-motion", mode);
}

export function dispatchHoldemMotionModeChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOLDEM_MOTION_MODE_CHANGED));
}
