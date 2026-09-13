import assert from "node:assert/strict";
import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import {
  bbSeatFor,
  inHandSeatsFromButton,
  positionLabelForSeat,
  preflopFirstActorSeat,
  sbSeatFor,
} from "../src/mysteryHoldem/positions";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";
import type { MysteryGameState } from "../src/mysteryHoldem/types";

/**
 * 회귀 테스트: 버스트로 빈 좌석이 생긴 뒤에도 블라인드가 반드시 실제 참여 좌석에 배정돼야 한다.
 *
 * 과거 버그: SB/BB를 좌석 번호 기준 button+1 / button+2로 계산해서, 그 좌석의 플레이어가
 * 버스트했으면 아무도 블라인드를 내지 않고 currentLevel이 0인 채로 프리플랍이 시작됐다.
 * (시뮬레이션 하네스에서 "봇이 BET 0을 제안" 형태로 드러났다.)
 */

function bustSeatsAndStartNextHand(
  state: MysteryGameState,
  bustSeats: number[],
  rng: () => number,
): MysteryGameState {
  const staged: MysteryGameState = {
    ...state,
    phase: "hand_over",
    matchEnded: false,
    players: state.players.map((p) =>
      bustSeats.includes(p.seat) ? { ...p, chips: 0, busted: true } : p,
    ),
  };
  return dispatch(staged, { type: "START_NEXT_HAND" }, rng);
}

// ── 6좌석 중 2명이 버스트한 상태 ──
{
  const rng = mulberry32(31);
  let state = startMatch(6, rng);
  state = autoCompleteHandSetup(state, rng);

  state = bustSeatsAndStartNextHand(state, [1, 2], rng);
  const ring = inHandSeatsFromButton(state.players, state.buttonSeat, state.seatCount);
  assert.equal(ring.length, 4, "버스트한 2명을 제외한 4명만 핸드에 참여해야 한다");
  for (const seat of [1, 2]) {
    assert.ok(!ring.includes(seat), `버스트 좌석 ${seat}은 참여 링에 없어야 한다`);
  }

  const sb = sbSeatFor(state.players, state.buttonSeat, state.seatCount);
  const bb = bbSeatFor(state.players, state.buttonSeat, state.seatCount);
  assert.ok(sb != null && bb != null);
  assert.ok(ring.includes(sb!), "SB는 실제 참여 좌석이어야 한다");
  assert.ok(ring.includes(bb!), "BB는 실제 참여 좌석이어야 한다");
  assert.notEqual(sb, bb);

  state = autoCompleteHandSetup(state, rng);
  assert.equal(state.phase, "preflop");
  assert.equal(
    state.betting.currentLevel,
    MYSTERY_HOLDEM_CONFIG.bigBlind,
    "버스트 이후에도 빅블라인드가 정상 포스팅되어 베팅 레벨이 잡혀야 한다",
  );

  const sbPlayer = state.players.find((p) => p.seat === sb)!;
  const bbPlayer = state.players.find((p) => p.seat === bb)!;
  assert.equal(sbPlayer.streetContribution, MYSTERY_HOLDEM_CONFIG.smallBlind);
  assert.equal(bbPlayer.streetContribution, MYSTERY_HOLDEM_CONFIG.bigBlind);
  assert.equal(
    bbPlayer.handContribution,
    MYSTERY_HOLDEM_CONFIG.bigBlind + MYSTERY_HOLDEM_CONFIG.bigBlindAnte,
    "BB Ante도 함께 징수되어야 한다",
  );
}

// ── 6좌석이지만 2명만 남은 경우: 좌석 수가 아니라 "남은 인원" 기준으로 헤즈업 규칙 적용 ──
{
  const rng = mulberry32(32);
  let state = startMatch(6, rng);
  state = autoCompleteHandSetup(state, rng);

  state = bustSeatsAndStartNextHand(state, [1, 2, 3, 4], rng);
  const ring = inHandSeatsFromButton(state.players, state.buttonSeat, state.seatCount);
  assert.equal(ring.length, 2, "2명만 남아야 한다");

  const sb = sbSeatFor(state.players, state.buttonSeat, state.seatCount);
  const bb = bbSeatFor(state.players, state.buttonSeat, state.seatCount);
  assert.equal(sb, state.buttonSeat, "헤즈업에서는 버튼이 SB를 낸다");
  assert.notEqual(bb, state.buttonSeat);

  assert.equal(
    positionLabelForSeat(sb!, state.players, state.buttonSeat, state.seatCount),
    "SB",
  );
  assert.equal(
    positionLabelForSeat(bb!, state.players, state.buttonSeat, state.seatCount),
    "BB",
  );

  const firstActor = preflopFirstActorSeat(state.players, state.buttonSeat, state.seatCount);
  assert.equal(firstActor, state.buttonSeat, "헤즈업 프리플랍은 버튼(=SB)부터 행동한다");

  state = autoCompleteHandSetup(state, rng);
  assert.equal(state.betting.currentLevel, MYSTERY_HOLDEM_CONFIG.bigBlind);
}

// ── 포지션 라벨도 빈 좌석을 건너뛴 링 기준이어야 한다(Position Mission 판정에 직결) ──
{
  const rng = mulberry32(33);
  let state = startMatch(6, rng);
  state = autoCompleteHandSetup(state, rng);
  state = bustSeatsAndStartNextHand(state, [1, 3], rng);

  const ring = inHandSeatsFromButton(state.players, state.buttonSeat, state.seatCount);
  const labels = ring.map((seat) =>
    positionLabelForSeat(seat, state.players, state.buttonSeat, state.seatCount),
  );
  assert.equal(labels[0], "BTN");
  assert.equal(labels[1], "SB");
  assert.equal(labels[2], "BB");
  assert.equal(new Set(labels.slice(0, 3)).size, 3, "BTN/SB/BB는 서로 다른 좌석이어야 한다");
}

console.log("OK: mystery blinds/positions after bust");
