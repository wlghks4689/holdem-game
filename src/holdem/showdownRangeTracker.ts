import { getHandTemplatesForMode } from "./handPool";
import type { GameState, HoldemGameMode, PlayerIndex } from "./types";

export type ObservedTemplateCounts = Record<string, number>;

/** Match-local knowledge built only from hands actually exposed at showdown. */
export class ShowdownRangeTracker {
  private observed: ObservedTemplateCounts = {};
  private observedRounds = new Set<number>();

  reset(): void {
    this.observed = {};
    this.observedRounds.clear();
  }

  observeShowdown(state: GameState, opponentSeat: PlayerIndex): boolean {
    if (state.phase !== "showdown" || state.handEndMode !== "showdown") return false;
    if (this.observedRounds.has(state.roundNumber)) return false;
    this.observedRounds.add(state.roundNumber);

    const templateId = state.holes[opponentSeat]?.templateId;
    if (!templateId) return false;
    const template = getHandTemplatesForMode(state.gameMode).find((item) => item.id === templateId);
    if (!template) return false;
    this.observed[templateId] = (this.observed[templateId] ?? 0) + 1;
    return true;
  }

  remainingTemplateCounts(gameMode: HoldemGameMode): Record<string, number> {
    const remaining: Record<string, number> = {};
    for (const template of getHandTemplatesForMode(gameMode)) {
      remaining[template.id] = Math.max(
        0,
        template.maxUses - (this.observed[template.id] ?? 0),
      );
    }
    return remaining;
  }

  observedTemplateCounts(): ObservedTemplateCounts {
    return { ...this.observed };
  }
}
