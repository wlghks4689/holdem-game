export const HOLDEM_ROOM_NICKNAME_KEY = "holdem-room-nickname-v1";
export const HOLDEM_MADE_HAND_FX_KEY = "holdem-made-hand-fx-v1";
export const HOLDEM_UI_LOCALE_KEY = "holdem-ui-locale-v1";

export type HoldemUiLocale = "ko" | "en";

const MAX_NICK = 24;

export function normalizeRoomNickname(raw: string): string {
  return raw.trim().slice(0, MAX_NICK);
}

export function loadRoomNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    const v = window.localStorage.getItem(HOLDEM_ROOM_NICKNAME_KEY);
    return typeof v === "string" ? normalizeRoomNickname(v) : "";
  } catch {
    return "";
  }
}

export function saveRoomNickname(raw: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HOLDEM_ROOM_NICKNAME_KEY,
      normalizeRoomNickname(raw),
    );
    dispatchPrefsChanged();
  } catch {
    /* ignore */
  }
}

export function loadMadeHandFxEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(HOLDEM_MADE_HAND_FX_KEY);
    if (v == null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function saveMadeHandFxEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HOLDEM_MADE_HAND_FX_KEY,
      enabled ? "1" : "0",
    );
    dispatchPrefsChanged();
  } catch {
    /* ignore */
  }
}

export function loadHoldemUiLocale(): HoldemUiLocale {
  if (typeof window === "undefined") return "ko";
  try {
    const v = window.localStorage.getItem(HOLDEM_UI_LOCALE_KEY);
    return v === "en" ? "en" : "ko";
  } catch {
    return "ko";
  }
}

export function saveHoldemUiLocale(locale: HoldemUiLocale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HOLDEM_UI_LOCALE_KEY, locale);
    window.dispatchEvent(new Event("holdem-locale-changed"));
    dispatchPrefsChanged();
  } catch {
    /* ignore */
  }
}

export const HOLDEM_PREFS_CHANGED_EVENT = "holdem-prefs-changed";

function dispatchPrefsChanged(): void {
  try {
    window.dispatchEvent(new Event(HOLDEM_PREFS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
