import { createInitialMysteryGameState, mysteryHoldemReducer } from "../src/mysteryHoldem/gameReducer";
import type { MysteryGameAction, MysteryGameState } from "../src/mysteryHoldem/types";

/** 결정적 시드 PRNG(mulberry32) — 풀 게임 스모크 테스트용 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dispatch(
  state: MysteryGameState,
  action: MysteryGameAction,
  rng: () => number,
): MysteryGameState {
  return mysteryHoldemReducer(state, action, rng);
}

export function startMatch(seatCount: number, rng: () => number, names?: string[]): MysteryGameState {
  const initial = createInitialMysteryGameState();
  return dispatch(initial, { type: "START_MATCH", seatCount, names }, rng);
}

/** hand_setup: 대기 좌석 전원에 대해 카드 0,1 유지(2 버림) + 첫 Mission 후보 선택 */
export function autoCompleteHandSetup(state: MysteryGameState, rng: () => number): MysteryGameState {
  let s = state;
  let guard = 0;
  while (
    s.phase === "hand_setup" &&
    (s.awaitingHoleSelection.length > 0 || s.awaitingMissionSelection.length > 0)
  ) {
    if (guard++ > 200) throw new Error("hand_setup did not converge");
    for (const seat of [...s.awaitingHoleSelection]) {
      s = dispatch(s, { type: "SELECT_HOLE_CARDS", seat, keepIndexes: [0, 1] }, rng);
    }
    for (const seat of [...s.awaitingMissionSelection]) {
      const candidates = s.missionOffers[seat];
      if (candidates && candidates.length > 0) {
        s = dispatch(s, { type: "SELECT_MISSION", seat, missionId: candidates[0]!.id }, rng);
      }
    }
  }
  return s;
}

/** 베팅 스트리트: toAct에게 체크 가능하면 체크, 아니면 콜만 반복(항상 쇼다운까지 진행) */
export function autoCheckCallToShowdown(state: MysteryGameState, rng: () => number): MysteryGameState {
  let s = state;
  let guard = 0;
  const bettingStreets = new Set(["preflop", "flop", "turn", "river"]);
  while (bettingStreets.has(s.phase) && s.toActSeat != null) {
    if (guard++ > 1000) throw new Error("betting did not converge");
    const seat = s.toActSeat;
    const player = s.players.find((p) => p.seat === seat)!;
    const facing = s.betting.currentLevel - player.streetContribution;
    s = facing > 1e-9 ? dispatch(s, { type: "CALL", seat }, rng) : dispatch(s, { type: "CHECK", seat }, rng);
  }
  return s;
}

export function playHandToEnd(state: MysteryGameState, rng: () => number): MysteryGameState {
  const afterSetup = autoCompleteHandSetup(state, rng);
  return autoCheckCallToShowdown(afterSetup, rng);
}

export function totalChipsInPlay(state: MysteryGameState): number {
  return state.players.reduce((sum, p) => sum + p.chips, 0);
}
