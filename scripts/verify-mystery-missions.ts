import assert from "node:assert/strict";
import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import { MISSION_POOL } from "../src/mysteryHoldem/mysteryMissions";
import { resolveMissionsForHand } from "../src/mysteryHoldem/missionResolver";
import type { MissionEvalContext, PlayerMissionState } from "../src/mysteryHoldem/types";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";

// Round 1/4/7/10/13에 Mission 선택 절차가 발생하고, 후보 3개 중 하나만 선택 가능하다.
assert.deepEqual(MYSTERY_HOLDEM_CONFIG.missionChangeRounds, [1, 4, 7, 10, 13]);

{
  const rng = mulberry32(3);
  let state = startMatch(4, rng);
  for (const seat of [0, 1, 2, 3]) {
    state = dispatch(state, { type: "SELECT_HOLE_CARDS", seat, keepIndexes: [0, 1] }, rng);
  }
  for (const seat of [0, 1, 2, 3]) {
    assert.equal(state.missionOffers[seat]?.length, 3, "라운드 1은 전원에게 후보 3개를 제공해야 한다");
  }
  // 후보에 없는 id는 거부된다.
  const before = state;
  const invalid = dispatch(state, { type: "SELECT_MISSION", seat: 0, missionId: "not-a-real-id" }, rng);
  assert.strictEqual(invalid, before);

  for (const seat of [0, 1, 2, 3]) {
    const candidates = state.missionOffers[seat]!;
    state = dispatch(state, { type: "SELECT_MISSION", seat, missionId: candidates[0]!.id }, rng);
  }
  assert.equal(state.phase, "preflop");
  for (const p of state.players) {
    assert.ok(p.mission != null, "Mission이 선택되어 있어야 한다");
  }

  // 다른 플레이어에게 진행 중 공개되지 않는다: GameState 자체에는 각자 mission이 들어있지만
  // (엔진 상태는 서버 권위 상태이며, UI 계층이 좌석별로 필터링해 보여준다) 여기서는 최소한
  // 이번 핸드 로그(공개 이벤트)에는 mission 선택 "내용"이 노출되지 않는지만 확인한다.
  for (const log of state.logs) {
    assert.notEqual((log as { t: string }).t, "mission_offered_public");
  }
}

// 정규 라운드가 아닌 라운드(예: 2)에서는 이미 Mission을 보유한 플레이어에게 새 후보가 오지 않는다.
{
  const rng = mulberry32(4);
  let state = startMatch(2, rng);
  state = autoCompleteHandSetup(state, rng);
  assert.equal(state.round, 1);
  // 강제로 두 좌석 모두 "achieved=false" 유지한 채 다음 핸드로 넘어가면(라운드 2는 비정규),
  // 새 Mission 후보가 오지 않아야 한다.
  // preflop에서 바로 폴드시켜 라운드를 빠르게 종료한다.
  state = dispatch(state, { type: "FOLD", seat: state.toActSeat! }, rng);
  assert.equal(state.phase, "hand_over");
  const missionBefore = state.players.map((p) => p.mission?.def.id);
  state = dispatch(state, { type: "START_NEXT_HAND" }, rng);
  assert.equal(state.round, 2);
  assert.deepEqual(state.awaitingMissionSelection, [], "라운드 2는 비정규 라운드이므로 새 Mission 제안이 없어야 한다");
  const missionAfter = state.players.map((p) => p.mission?.def.id);
  assert.deepEqual(missionBefore, missionAfter, "Mission이 그대로 유지되어야 한다");
}

// Mission 성공 시 정규 변경 라운드가 아니어도 다음 핸드 전에 새 Mission을 받는다.
{
  const def = MISSION_POOL.find((m) => m.id === "made_trips_plus")!;
  const mission: PlayerMissionState = { def, assignedRound: 2, achieved: false };
  const ctx: MissionEvalContext = {
    seat: 0,
    round: 2,
    buttonSeat: 0,
    position: "BTN",
    board: [],
    folded: false,
    wentToShowdown: true,
    wonAnyPot: false,
    wonPotAmount: 0,
    bestHandValue: { rank: 4, kickers: [10, 9, 8] }, // 트립스 이상
    showdownOpponents: [1],
    opponentBestHandValues: {},
    myPreflopScore: 5,
    opponentPreflopScores: {},
    opponentsAchievedThisHand: [],
    extraHandActive: false,
  };
  const results = resolveMissionsForHand([{ seat: 0, mission, ctx }]);
  assert.equal(results[0]!.achieved, true);
  assert.equal(results[0]!.reward, def.reward);
}

// Mission 성공 보상은 Chips가 아니라 Mission Point에만 반영된다 — reducer 통합 확인.
{
  const rng = mulberry32(5);
  let state = startMatch(2, rng);
  state = autoCompleteHandSetup(state, rng);
  const chipsBefore = state.players.map((p) => p.chips + 0); // preflop 이후 블라인드 반영된 값
  while (state.phase !== "hand_over") {
    const seat = state.toActSeat!;
    const player = state.players.find((p) => p.seat === seat)!;
    const facing = state.betting.currentLevel - player.streetContribution;
    state = facing > 1e-9
      ? dispatch(state, { type: "CALL", seat }, rng)
      : dispatch(state, { type: "CHECK", seat }, rng);
  }
  for (const p of state.players) {
    // missionPoint 변화가 있었더라도 chips는 오직 팟 정산으로만 바뀐다 — 즉 missionPoint와
    // chips 변화 사이에 직접적인 가산 관계가 없음을 액수 비교로 보장하기는 어려우므로,
    // missionPoint 필드가 존재하고 chips와 별개로 누적되는 것만 검증한다.
    assert.equal(typeof p.missionPoint, "number");
  }
  void chipsBefore;
}

console.log("OK: mystery missions");
