import assert from "node:assert/strict";
import { buildPots } from "../src/mysteryHoldem/pots";
import { awardPots } from "../src/mysteryHoldem/showdown";
import type { PlayerState } from "../src/mysteryHoldem/types";

// 서로 다른 스택의 3-way All-In: A 50 올인, B 100 올인, C 30 기여 후 폴드.
const pots = buildPots([
  { seat: 0, amount: 50, folded: false },
  { seat: 1, amount: 100, folded: false },
  { seat: 2, amount: 30, folded: true },
]);

// 레이어: min(50,100,30)=30 × 3명 = 90(A,B 자격) / min(20,70)=20 × 2명 = 40(A,B) → 병합 130(A,B) /
// 나머지 B단독 50.
assert.equal(pots.length, 2, "동일 자격 팟은 병합되어 Main/Side 2개여야 한다");
assert.equal(pots[0]!.amount, 130);
assert.deepEqual([...pots[0]!.eligibleSeats].sort(), [0, 1]);
assert.equal(pots[1]!.amount, 50);
assert.deepEqual(pots[1]!.eligibleSeats, [1]);

const total = pots.reduce((s, p) => s + p.amount, 0);
assert.equal(total, 180, "팟 총액은 전체 기여액(50+100+30)과 같아야 한다");

// 각 팟은 해당 팟에 자격 있는 좌석 중 최고 핸드만 가져간다.
const card = (rank: number, suit: "s" | "h" | "d" | "c") => ({ rank, suit });
function player(seat: number, hole: [ReturnType<typeof card>, ReturnType<typeof card>]): PlayerState {
  return {
    seat,
    name: `P${seat}`,
    chips: 0,
    pendingDeal: [],
    discarded: [],
    holeCards: hole,
    inHand: true,
    folded: seat === 2,
    allIn: seat !== 2,
    busted: false,
    streetContribution: 0,
    handContribution: seat === 0 ? 50 : seat === 1 ? 100 : 30,
    anteContribution: 0,
    mission: null,
    missionPoint: 0,
    bountyPoint: 0,
    survivalPoint: 0,
    chipPoint: 0,
    totalPoint: 0,
  };
}

const board = [card(2, "c"), card(7, "d"), card(9, "h"), card(11, "s"), card(13, "c")];
const players = [
  player(0, [card(14, "s"), card(14, "h")]), // A: 포켓 에이스 — 강함
  player(1, [card(3, "d"), card(4, "d")]), // B: 약한 핸드
  player(2, [card(6, "c"), card(6, "d")]), // C: 폴드
];

const awards = awardPots(pots, players, board, 0, 3);
assert.equal(awards.length, 2);
// Main(A,B 자격) 팟은 A가 가져간다(포켓 에이스가 더 강함).
assert.deepEqual(awards[0]!.winners, [0]);
assert.equal(awards[0]!.amounts.get(0), 130);
// Side(B 단독) 팟은 B만 자격이 있으므로 A의 핸드가 더 강해도 B가 가져간다.
assert.deepEqual(awards[1]!.winners, [1]);
assert.equal(awards[1]!.amounts.get(1), 50);

console.log("OK: mystery side pots");
