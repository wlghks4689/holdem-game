import type { Card } from "./cards";
import type { GameState, PlayerIndex } from "./types";

/** 가장 최근 폴드 쇼다운에서 폴드한 좌석 */
export function lastFoldFolderFromLogs(
  logs: GameState["logs"],
): PlayerIndex | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const m = logs[i]!;
    if (m.t === "showdown" && m.folder != null) return m.folder;
  }
  return null;
}

export type RabbitHuntInfo =
  | { ok: false }
  | {
      ok: true;
      /** 폴드 직전 공개 장 수 — 3=플랍 직후, 4=턴 직후 */
      revealedAtFold: number;
      remaining: Card[];
      folder: PlayerIndex;
    };

/**
 * 플랍 또는 턴에서 폴드해 남은 보드가 있을 때만 레빗 가능(프리·리버 폴드 제외).
 */
export function rabbitHuntInfo(state: GameState): RabbitHuntInfo {
  if (state.phase !== "hand_over" || state.handEndMode !== "fold") {
    return { ok: false };
  }
  const rev = state.boardRevealed;
  if (rev !== 3 && rev !== 4) return { ok: false };
  if (state.board.length < 5) return { ok: false };
  const folder = lastFoldFolderFromLogs(state.logs);
  if (folder == null) return { ok: false };
  const remaining = state.board.slice(rev, 5);
  if (remaining.length === 0) return { ok: false };
  return { ok: true, revealedAtFold: rev, remaining, folder };
}

/** 뷰어가 레빗 UI를 쓸 수 있는지(폴드 당사자만). */
export function viewerMayUseRabbit(
  viewer: PlayerIndex,
  mySeat: PlayerIndex | undefined,
  folder: PlayerIndex,
): boolean {
  const me = mySeat ?? viewer;
  return me === folder;
}
