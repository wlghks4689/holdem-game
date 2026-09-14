import {
  autoAssignPendingCardTargets,
  createInitialMysteryGameState,
  mysteryHoldemReducer,
} from "../src/mysteryHoldem/gameReducer";
import type {
  MissionEvalContext,
  MysteryGameAction,
  MysteryGameState,
  MysteryMissionDef,
  PlayerMissionState,
} from "../src/mysteryHoldem/types";

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

/**
 * 테스트용 dispatch.
 *
 * 플랍에서 지정형 카드(Mission Breaker / Parasite) 보유자는 대상을 고르기 전까지 액션이
 * 막힌다(§22). 실게임에서는 UI와 봇이 그 선택을 채우므로, 대상 지정 자체가 주제가 아닌
 * 테스트들이 무한 루프에 빠지지 않도록 여기서 자동으로 채운다. 지정 로직을 검증하는
 * 테스트는 mysteryHoldemReducer를 직접 호출해 이 자동 처리를 우회한다.
 */
export function dispatch(
  state: MysteryGameState,
  action: MysteryGameAction,
  rng: () => number,
): MysteryGameState {
  const next = mysteryHoldemReducer(state, action, rng);
  return next.awaitingCardTarget.length > 0 ? autoAssignPendingCardTargets(next, rng) : next;
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

/**
 * 테스트용 MissionEvalContext 팩토리.
 *
 * 컨텍스트에 필드가 하나 추가될 때마다 모든 테스트 파일의 리터럴을 고치지 않도록,
 * "아무 일도 없었던 핸드"를 기본값으로 두고 관심 있는 필드만 덮어쓰게 한다.
 */
export function makeMissionCtx(overrides: Partial<MissionEvalContext> = {}): MissionEvalContext {
  return {
    seat: 0,
    round: 1,
    buttonSeat: 0,
    position: "BTN",
    board: [],
    boardRevealed: 5,
    initialSeatCount: 4,
    folded: false,
    wentToShowdown: true,
    wonAnyPot: false,
    wonPotAmount: 0,
    wonPots: [],
    bestHandValue: null,
    bountyShare: 0,
    showdownOpponents: [],
    opponentBestHandValues: {},
    myPreflopScore: 0,
    opponentPreflopScores: {},
    opponentsAchievedThisHand: [],
    opponentMissionAchievers: [],
    targetSeat: null,
    potRuleTriggered: false,
    extraHandActive: false,
    ...overrides,
  };
}

/** 테스트용 PlayerMissionState 팩토리 */
export function missionStateOf(
  def: MysteryMissionDef,
  assignedRound = 1,
  targetSeat: number | null = null,
): PlayerMissionState {
  return { def, assignedRound, achieved: false, shouldReplace: false, targetSeat };
}
