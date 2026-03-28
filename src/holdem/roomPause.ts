import type { PlayerIndex } from "./types";

export type RoomPauseState =
  | { kind: "running" }
  | { kind: "pending"; from: PlayerIndex }
  | { kind: "paused" };

export function normalizeRoomPause(raw: unknown): RoomPauseState {
  if (raw && typeof raw === "object" && "kind" in raw) {
    const k = (raw as { kind: unknown }).kind;
    if (k === "paused") return { kind: "paused" };
    if (k === "pending" && "from" in raw) {
      const f = (raw as { from: unknown }).from;
      if (f === 0 || f === 1) return { kind: "pending", from: f };
    }
    if (k === "running") return { kind: "running" };
  }
  return { kind: "running" };
}
