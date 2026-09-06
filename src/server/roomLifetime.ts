import type { RoomBlob } from "./roomStore";

export const ROOM_LOBBY_TTL_SEC = 10 * 60;
export const ROOM_IDLE_TTL_SEC = 30 * 60;
export const ROOM_FINISHED_TTL_SEC = 5 * 60;
export const ROOM_LEFT_TTL_SEC = 60;

/** Deadlines for terminal rooms are fixed, even if rematch/leave is requested again. */
export function roomLifetime(blob: RoomBlob, now = Date.now()) {
  const gone = blob.disconnected ?? [false, false];
  if (gone[0] && (gone[1] || blob.tokens[1] == null)) {
    return { expiresAt: now, cleanupDeadline: now };
  }
  const terminalSeconds = gone.some(Boolean)
    ? ROOM_LEFT_TTL_SEC
    : blob.state.matchEnded ? ROOM_FINISHED_TTL_SEC : null;
  if (terminalSeconds != null) {
    const deadline = Math.min(blob.cleanupDeadline ?? Infinity, now + terminalSeconds * 1000);
    return { expiresAt: deadline, cleanupDeadline: deadline };
  }
  return {
    expiresAt: now + (blob.state.phase === "lobby" ? ROOM_LOBBY_TTL_SEC : ROOM_IDLE_TTL_SEC) * 1000,
    cleanupDeadline: undefined,
  };
}
