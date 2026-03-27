export const HOLDEM_DISPLAY_NAMES_STORAGE_KEY = "holdem-display-names-v1";

/** P0 = 빌런, P1 = 히어로 (기본값) */
export const DEFAULT_HOLDEM_DISPLAY_NAMES: [string, string] = ["빌런", "히어로"];

function normalize(raw: string, fallback: string): string {
  const t = raw.trim();
  return t.length > 0 ? t.slice(0, 24) : fallback;
}

export function loadHoldemDisplayNames(): [string, string] {
  if (typeof window === "undefined") {
    return [...DEFAULT_HOLDEM_DISPLAY_NAMES] as [string, string];
  }
  try {
    const raw = window.localStorage.getItem(HOLDEM_DISPLAY_NAMES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_HOLDEM_DISPLAY_NAMES] as [string, string];
    const j = JSON.parse(raw) as unknown;
    if (
      Array.isArray(j) &&
      j.length === 2 &&
      typeof j[0] === "string" &&
      typeof j[1] === "string"
    ) {
      return [
        normalize(j[0], DEFAULT_HOLDEM_DISPLAY_NAMES[0]!),
        normalize(j[1], DEFAULT_HOLDEM_DISPLAY_NAMES[1]!),
      ];
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_HOLDEM_DISPLAY_NAMES] as [string, string];
}

export function saveHoldemDisplayNames(names: [string, string]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HOLDEM_DISPLAY_NAMES_STORAGE_KEY,
      JSON.stringify(names),
    );
  } catch {
    /* ignore */
  }
}
