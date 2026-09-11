import type { MadeHandFxKind } from "@/holdem/pokerEval";
import type { PlayerIndex } from "@/holdem/types";

/**
 * 같은 라운드에서 같은 족보가 유지되는 동안에는 DOM을 재마운트하지 않는다.
 * 족보 종류가 바뀌는 실제 업그레이드만 새 키를 받아 메이드 연출을 다시 재생한다.
 */
export function madeHandFxReplayKey(
  roundNumber: number,
  player: PlayerIndex,
  kind: MadeHandFxKind,
): string {
  return `made-fx-${roundNumber}-${kind}-p${player}`;
}

export function shouldPlayMadeHandBurst({
  madeFxTier,
  showdownReveal,
  showdownResultGlow,
  showdownRunoutFx,
}: {
  madeFxTier: number;
  showdownReveal: boolean;
  showdownResultGlow: boolean;
  showdownRunoutFx: boolean;
}): boolean {
  if (madeFxTier <= 0 || showdownResultGlow) return false;
  return !showdownReveal || showdownRunoutFx;
}
