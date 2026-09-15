import { resolveCardRewardsForHand, type CardResolutionEntry, type CardResolutionInput } from "./cardResolution";

/**
 * 한 핸드 종료 시점의 Mission(=Mystery Card) 일괄 판정.
 *
 * 실제 판정 순서와 결정론 보장은 cardResolution.ts로 옮겼다. 이 모듈은 gameReducer가
 * 쓰던 이름을 유지하기 위한 얇은 어댑터로 남겨, Mystery Card 리팩터링이 진행되는 동안
 * 호출부를 건드리지 않게 한다.
 */

export type MissionResolutionEntry = CardResolutionEntry;
export type MissionResolutionInput = CardResolutionInput;

export function resolveMissionsForHand(
  entries: readonly MissionResolutionInput[],
): MissionResolutionEntry[] {
  return resolveCardRewardsForHand(entries);
}
