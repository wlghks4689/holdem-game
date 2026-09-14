import assert from "node:assert/strict";
import { MYSTERY_HOLDEM_CONFIG, bountyRewardForSeatCount } from "../src/mysteryHoldem/config";
import { autoCompleteHandSetup, dispatch, mulberry32, totalChipsInPlay } from "./mysteryTestHelpers";
import { createInitialMysteryGameState, mysteryHoldemReducer } from "../src/mysteryHoldem/gameReducer";
import { potLimitMaxRaiseDisplay } from "../src/mysteryHoldem/selectors";
import type { MysteryGameState } from "../src/mysteryHoldem/types";

/**
 * 3인 테이블에서 한 명(C)은 프리플랍에 폴드시켜 매치가 끝나지 않게(Last Player Standing 회피)
 * 두고, 남은 두 명(A vs B)을 올인 대결시킨다. 진 쪽은 버스트되어야 한다.
 * (동률 시드는 버스트가 발생하지 않으므로 실제로 버스트가 난 첫 시드를 사용한다.)
 */
let found: MysteryGameState | null = null;
for (let seed = 1; seed <= 100 && found == null; seed++) {
  const rng = mulberry32(seed);
  let state = mysteryHoldemReducer(createInitialMysteryGameState(), { type: "START_MATCH", seatCount: 3 }, rng);
  state = autoCompleteHandSetup(state, rng);
  if (state.phase !== "preflop") continue;

  const seatC = state.toActSeat!;
  state = dispatch(state, { type: "FOLD", seat: seatC }, rng);
  if (state.phase !== "preflop" || state.toActSeat == null) continue;

  const seatA = state.toActSeat;
  // Pot Limit 게임이라 스택이 팟 상한보다 깊으면 올인 자체가 불법이다. 이 테스트의 주제는
  // 버스트·바운티이지 베팅 상한이 아니므로, A의 스택을 상한에 딱 맞춰 줄여 합법 올인 한 방에
  // 스택 전부가 걸리게 만든다.
  const potMax = potLimitMaxRaiseDisplay(state, seatA);
  const aStreet = state.players.find((p) => p.seat === seatA)!.streetContribution;
  state = {
    ...state,
    players: state.players.map((p) => (p.seat === seatA ? { ...p, chips: potMax - aStreet } : p)),
  };
  // 스택을 조정한 뒤, 이미 팟에 들어간 몫까지 합쳐 "판 위의 칩 총량"을 기준으로 삼는다.
  const chipsBefore =
    totalChipsInPlay(state) + state.players.reduce((sum, p) => sum + p.handContribution, 0);

  state = dispatch(state, { type: "ALL_IN", seat: seatA }, rng);
  if (state.toActSeat != null) {
    state = dispatch(state, { type: "CALL", seat: state.toActSeat }, rng);
  }
  if (state.phase !== "hand_over") continue;

  assert.equal(totalChipsInPlay(state), chipsBefore, "칩 총량은 핸드 정산 후에도 보존되어야 한다(레이크 없음)");
  const busted = state.players.filter((p) => p.busted);
  if (busted.length === 1) found = state;
}

assert.ok(found != null, "여러 시드 중 최소 한 번은 명확한 승/패(버스트)가 나와야 한다");
const state = found!;
const bustedSeat = state.players.find((p) => p.busted)!;
// 버스트를 유발한 승자는 올인 대결의 상대(가장 많은 칩을 가져간 좌석) — 방관자로 폴드한
// 세 번째 좌석(C)은 칩은 그대로지만 Bounty와는 무관하므로 최댓값 기준으로 구분한다.
let survivorSeat = state.players.find((p) => !p.busted)!;
for (const p of state.players) {
  if (!p.busted && p.chips > survivorSeat.chips) survivorSeat = p;
}

assert.equal(bustedSeat.chips, 0);
assert.equal(state.matchEnded, false, "3인 중 1인만 버스트했다면 아직 Last Player Standing이 아니다");

const bustLog = state.logs.find((l) => l.t === "player_busted" && l.seat === bustedSeat.seat);
assert.ok(bustLog != null, "player_busted 로그가 있어야 한다");

const bountyLog = state.logs.find((l) => l.t === "bounty_awarded" && l.bustedSeat === bustedSeat.seat);
assert.ok(bountyLog != null, "버스트 이벤트에 대한 Bounty 지급 로그가 있어야 한다");
if (bountyLog && bountyLog.t === "bounty_awarded") {
  // Bounty는 총 플레이어 수에 따라 달라진다(인원이 적을수록 높다) — 여기서는 3인 테이블.
  assert.equal(survivorSeat.bountyPoint, bountyRewardForSeatCount(3));
}

// 인원별 Bounty가 단조 감소해야 한다(적을수록 높게).
{
  const values = [3, 4, 5, 6, 7, 8, 9, 10].map((n) => bountyRewardForSeatCount(n));
  for (let i = 1; i < values.length; i++) {
    assert.ok(
      values[i]! <= values[i - 1]!,
      `인원이 늘수록 Bounty가 커지면 안 됩니다: ${JSON.stringify(values)}`,
    );
  }
  for (const v of values) {
    assert.equal(v % 10, 0, "Bounty Point는 10단위여야 합니다");
  }
}

// 버스트된 플레이어는 다음 핸드에 참여하지 않는다(카드/미션 없음, Betting Turn 제외).
const nextHand = dispatch(state, { type: "START_NEXT_HAND" }, mulberry32(999));
assert.equal(nextHand.awaitingHoleSelection.includes(bustedSeat.seat), false);
const bustedInNext = nextHand.players.find((p) => p.seat === bustedSeat.seat)!;
assert.equal(bustedInNext.inHand, false);
assert.equal(bustedInNext.holeCards.length, 0);

console.log("OK: mystery bust + bounty");
