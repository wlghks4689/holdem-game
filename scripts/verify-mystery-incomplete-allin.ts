import assert from "node:assert/strict";
import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import { legalActionsForSeat } from "../src/mysteryHoldem/selectors";
import { awardPots } from "../src/mysteryHoldem/showdown";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";
import type { MysteryGameState, Seat } from "../src/mysteryHoldem/types";

const STEP = MYSTERY_HOLDEM_CONFIG.betStepUnit;

/**
 * 불완전 올인(풀 레이즈 폭에 못 미치는 올인)은 완전한 레이즈와 구분되어야 한다.
 * - 최소 레이즈 폭을 낮추지 않는다(낮추면 아주 작은 레이즈로 Raise Cap을 태울 수 있다).
 * - 이미 행동을 마친 좌석의 레이즈 권한을 다시 열지 않는다(콜/폴드만 가능).
 */

function streetOf(state: MysteryGameState, seat: Seat): number {
  return state.players.find((p) => p.seat === seat)!.streetContribution;
}

/** 다음 액터가 콜 금액보다 딱 한 단위만 더 낼 수 있는 숏스택을 만들어 불완전 올인을 유도한다 */
function setupIncompleteAllIn(seed: number) {
  const rng = mulberry32(seed);
  let state = startMatch(3, rng);
  state = autoCompleteHandSetup(state, rng);

  const firstSeat = state.toActSeat!;
  state = dispatch(state, { type: "CALL", seat: firstSeat }, rng);

  const shover = state.toActSeat!;
  const levelBefore = state.betting.currentLevel;
  const minIncBefore = state.betting.minRaiseIncrement;
  state = {
    ...state,
    players: state.players.map((p) =>
      p.seat === shover ? { ...p, chips: levelBefore - streetOf(state, shover) + STEP } : p,
    ),
  };
  return { rng, state, firstSeat, shover, levelBefore, minIncBefore };
}

// ── 불완전 올인은 최소 레이즈 폭을 낮추지 않는다 ──
{
  const setup = setupIncompleteAllIn(3);
  let { state } = setup;
  const { rng, levelBefore, minIncBefore, shover, firstSeat } = setup;

  assert.ok(STEP < minIncBefore, "이 시나리오는 올인 증가폭이 최소 레이즈보다 작아야 성립한다");

  state = dispatch(state, { type: "ALL_IN", seat: shover }, rng);
  assert.equal(state.betting.currentLevel, levelBefore + STEP, "불완전 올인만큼 레벨이 오른다");
  assert.equal(
    state.betting.minRaiseIncrement,
    minIncBefore,
    "불완전 올인은 최소 레이즈 폭을 낮추지 않아야 한다",
  );

  // 다음 액터의 최소 레이즈는 여전히 "현재 레벨 + 원래 최소 증가폭" 이상이어야 한다.
  const next = state.toActSeat!;
  const legal = legalActionsForSeat(state, next);
  assert.ok(legal.raiseRange != null, "다음 액터는 레이즈할 수 있어야 한다");
  assert.ok(
    legal.raiseRange!.min >= state.betting.currentLevel + minIncBefore - 1e-9,
    `최소 레이즈가 ${state.betting.currentLevel + minIncBefore} 이상이어야 하는데 ${legal.raiseRange!.min}`,
  );

  // 최소 증가폭에 못 미치는 레이즈는 거부된다(Raise Cap을 싸게 태울 수 없다).
  const tiny = dispatch(
    state,
    { type: "RAISE", seat: next, toAmount: state.betting.currentLevel + STEP },
    rng,
  );
  assert.strictEqual(tiny, state, "최소 레이즈 미만의 레이즈는 거부되어야 한다");

  // ── 이미 행동을 마친 좌석은 재레이즈할 수 없다 ──
  state = dispatch(state, { type: "CALL", seat: next }, rng);
  assert.equal(state.toActSeat, firstSeat, "늘어난 금액을 콜/폴드하도록 차례는 돌아와야 한다");

  const reopened = legalActionsForSeat(state, firstSeat);
  assert.equal(reopened.canRaise, false, "불완전 올인은 이미 행동한 좌석의 레이즈를 열지 않는다");
  assert.equal(reopened.canCall, true, "대신 콜은 할 수 있어야 한다");

  const blocked = dispatch(
    state,
    { type: "RAISE", seat: firstSeat, toAmount: state.betting.currentLevel + minIncBefore },
    rng,
  );
  assert.strictEqual(blocked, state, "재레이즈는 리듀서에서도 거부되어야 한다");

  const blockedAllIn = dispatch(state, { type: "ALL_IN", seat: firstSeat }, rng);
  assert.strictEqual(blockedAllIn, state, "레이즈성 올인도 함께 막혀야 한다");
}

// ── 풀 레이즈는 잠금을 해제한다 ──
{
  const rng = mulberry32(7);
  let state = startMatch(3, rng);
  state = autoCompleteHandSetup(state, rng);

  const a = state.toActSeat!;
  state = dispatch(state, { type: "CALL", seat: a }, rng);
  const b = state.toActSeat!;
  const legalB = legalActionsForSeat(state, b);
  // b가 정상적인 풀 레이즈를 하면 a의 액션이 다시 열려야 한다.
  state = dispatch(state, { type: "RAISE", seat: b, toAmount: legalB.raiseRange!.min }, rng);
  assert.deepEqual(state.betting.raiseLockedSeats, [], "풀 레이즈 후에는 잠긴 좌석이 없어야 한다");

  const c = state.toActSeat!;
  state = dispatch(state, { type: "CALL", seat: c }, rng);
  assert.equal(state.toActSeat, a);
  assert.equal(legalActionsForSeat(state, a).canRaise, true, "풀 레이즈를 만난 좌석은 재레이즈할 수 있다");
}

// ── 팟 분배는 100칩 단위로만 이루어지고, 남는 덩어리는 불리한 포지션이 가져간다 ──
{
  // 버튼 0, 3인. 동점 승자 1과 2 → 버튼 다음 좌석인 1이 포지션상 더 불리하다.
  const players = [0, 1, 2].map((seat) => ({
    seat,
    name: `P${seat}`,
    chips: 0,
    pendingDeal: [],
    discarded: [],
    holeCards: [],
    inHand: true,
    folded: false,
    allIn: false,
    busted: false,
    streetContribution: 0,
    handContribution: 0,
    mission: null,
    missionPoint: 0,
    bountyPoint: 0,
    chipPoint: 0,
    totalPoint: 0,
  }));

  // 승패 판정을 타지 않도록 awardPots 대신 분배 결과만 확인할 수 있는 구조를 쓴다:
  // 동일한 홀카드가 불가능하므로, 여기서는 분배 함수의 동작을 awardPots을 통해 간접 검증한다.
  // (정확한 chop이 불가능한 900칩을 2명이 나눠 갖는 상황)
  const board = [
    { rank: 14, suit: "s" },
    { rank: 13, suit: "s" },
    { rank: 12, suit: "s" },
    { rank: 11, suit: "s" },
    { rank: 10, suit: "s" },
  ] as const;
  // 보드가 로열 스트레이트 플러시 — 두 좌석 모두 보드 플레이라 정확히 동점이 된다.
  const tied = players.map((p) =>
    p.seat === 0
      ? p
      : {
          ...p,
          holeCards: [
            { rank: 2, suit: p.seat === 1 ? "h" : "d" },
            { rank: 3, suit: p.seat === 1 ? "h" : "d" },
          ],
        },
  );

  const awards = awardPots(
    [{ amount: 900, eligibleSeats: [1, 2] }],
    tied as never,
    board as never,
    0,
    3,
  );
  const amounts = awards[0]!.amounts;
  assert.equal(awards[0]!.winners.length, 2, "보드 플레이로 두 좌석이 동점이어야 한다");

  const toSeat1 = amounts.get(1)!;
  const toSeat2 = amounts.get(2)!;
  assert.equal(toSeat1 + toSeat2, 900, "합계는 팟과 정확히 같아야 한다");
  assert.equal(toSeat1 % STEP, 0, `좌석 1의 수령액(${toSeat1})이 100 단위여야 한다`);
  assert.equal(toSeat2 % STEP, 0, `좌석 2의 수령액(${toSeat2})이 100 단위여야 한다`);
  assert.equal(toSeat1, 500, "버튼 다음 좌석(포지션 열위)이 남는 100칩을 가져간다");
  assert.equal(toSeat2, 400);
}

// ── 정확히 나누어떨어지면 그대로 균등 분배 ──
{
  const board = [
    { rank: 14, suit: "s" },
    { rank: 13, suit: "s" },
    { rank: 12, suit: "s" },
    { rank: 11, suit: "s" },
    { rank: 10, suit: "s" },
  ] as const;
  const base = {
    name: "P",
    chips: 0,
    pendingDeal: [],
    discarded: [],
    inHand: true,
    folded: false,
    allIn: false,
    busted: false,
    streetContribution: 0,
    handContribution: 0,
    mission: null,
    missionPoint: 0,
    bountyPoint: 0,
    chipPoint: 0,
    totalPoint: 0,
  };
  const tied = [
    { ...base, seat: 1, holeCards: [{ rank: 2, suit: "h" }, { rank: 3, suit: "h" }] },
    { ...base, seat: 2, holeCards: [{ rank: 2, suit: "d" }, { rank: 3, suit: "d" }] },
  ];
  const awards = awardPots([{ amount: 800, eligibleSeats: [1, 2] }], tied as never, board as never, 0, 3);
  assert.equal(awards[0]!.amounts.get(1), 400);
  assert.equal(awards[0]!.amounts.get(2), 400);
}

console.log("OK: mystery incomplete all-in / chop unit");
