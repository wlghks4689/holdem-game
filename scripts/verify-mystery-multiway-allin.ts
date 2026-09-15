import assert from "node:assert/strict";
import { dispatch, mulberry32, startMatch, totalChipsInPlay } from "./mysteryTestHelpers";
import { legalActionsForSeat } from "../src/mysteryHoldem/selectors";
import type { MysteryGameState, Seat } from "../src/mysteryHoldem/types";

/**
 * 멀티웨이 올인의 칩 보존(§30).
 *
 * 사이드 팟 생성·스플릿·매칭되지 않은 초과분 반환을 거치면서 칩이 생기거나 사라지면 안 된다.
 * 특히 초과분 반환은 이번에 추가한 경로라, 팟에서 뺀 만큼 정확히 주인에게 돌아가는지
 * 실제 게임을 돌려 확인한다.
 */

function autoSetup(state: MysteryGameState, rng: () => number): MysteryGameState {
  let s = state;
  let guard = 0;
  while (s.phase === "hand_setup") {
    if (guard++ > 200) throw new Error("setup did not converge");
    const holeSeat = s.awaitingHoleSelection[0];
    if (holeSeat != null) {
      s = dispatch(s, { type: "SELECT_HOLE_CARDS", seat: holeSeat, keepIndexes: [0, 1] }, rng);
      continue;
    }
    const missionSeat = s.awaitingMissionSelection[0];
    if (missionSeat != null) {
      const offer = s.missionOffers[missionSeat]?.[0];
      if (offer == null) throw new Error("no mission offer");
      s = dispatch(s, { type: "SELECT_MISSION", seat: missionSeat, missionId: offer.id }, rng);
      continue;
    }
    break;
  }
  return s;
}

/**
 * 팟 리밋 최대치로 계속 올려 스택 차이를 벌리고, 올인이 합법이 되는 순간 올인시킨다.
 *
 * 곧바로 전원 올인을 시도하면 대부분 거부된다 — Pot-Limit 상한을 넘는 올인은 불법이라
 * 초반 스택(40,000)으로는 성립하지 않는다. 최대 레이즈를 반복해야 팟이 빠르게 커져
 * 실제 게임에서 나오는 멀티웨이 올인 상황에 도달한다.
 */
function pushAllIn(
  state: MysteryGameState,
  rng: () => number,
): { state: MysteryGameState; allInHappened: boolean } {
  let s = state;
  let guard = 0;
  let allInHappened = false;
  const streets = new Set(["preflop", "flop", "turn", "river"]);
  while (streets.has(s.phase) && s.toActSeat != null) {
    if (guard++ > 600) throw new Error("betting did not converge");
    const seat: Seat = s.toActSeat;
    const legal = legalActionsForSeat(s, seat);
    if (legal.canAllIn) {
      s = dispatch(s, { type: "ALL_IN", seat }, rng);
      allInHappened = true;
    } else if (legal.raiseRange != null && (legal.canBet || legal.canRaise)) {
      const to = legal.raiseRange.max;
      s = dispatch(s, legal.canBet ? { type: "BET", seat, amount: to } : { type: "RAISE", seat, toAmount: to }, rng);
    } else if (legal.canCall) s = dispatch(s, { type: "CALL", seat }, rng);
    else if (legal.canCheck) s = dispatch(s, { type: "CHECK", seat }, rng);
    else s = dispatch(s, { type: "FOLD", seat }, rng);
  }
  return { state: s, allInHappened };
}

let checkedAllIn = 0;
let checkedSidePots = 0;

for (let seed = 1; seed <= 40; seed++) {
  const rng = mulberry32(seed);
  // 스택을 흩뜨리기 위해 몇 핸드 돌린 뒤 전원 올인을 시킨다.
  let state = startMatch(6, rng);
  const startingTotal = totalChipsInPlay(state);

  for (let hand = 0; hand < 4; hand++) {
    if (state.phase === "match_over" || state.matchEnded) break;
    state = autoSetup(state, rng);
    const pushed = pushAllIn(state, rng);
    state = pushed.state;
    if (pushed.allInHappened) checkedAllIn++;

    assert.equal(
      totalChipsInPlay(state),
      startingTotal,
      `seed ${seed} hand ${hand}: 칩 총량이 보존되지 않았다`,
    );

    // 1인만 자격이 있는 팟은 만들어지면 안 된다 — 매칭되지 않은 초과분이기 때문이다.
    for (const pot of state.pots) {
      assert.ok(
        pot.eligibleSeats.length !== 1 || state.pots.length === 1,
        `seed ${seed} hand ${hand}: 1인 자격 사이드 팟이 생겼다 (${JSON.stringify(state.pots)})`,
      );
    }
    if (state.pots.length > 1) checkedSidePots++;

    if (state.phase === "hand_over") state = dispatch(state, { type: "START_NEXT_HAND" }, rng);
  }
}

assert.ok(checkedAllIn > 0, "올인이 한 번도 발생하지 않아 검증이 무의미하다");
assert.ok(checkedSidePots > 0, "사이드 팟이 한 번도 생기지 않아 검증이 무의미하다");

console.log(
  `OK: multi-way all-in 칩 보존 (올인 핸드 ${checkedAllIn}회 / 사이드 팟 발생 ${checkedSidePots}회)`,
);
