import assert from "node:assert/strict";
import { buildPots, totalPotAmount, withdrawUncalledExcess } from "../src/mysteryHoldem/pots";
import { awardPots } from "../src/mysteryHoldem/showdown";
import type { PlayerState, Seat } from "../src/mysteryHoldem/types";

/**
 * Multi-Way All-In의 팟 레이어링 검증(§24).
 *
 * 팟을 만들기 전에 **매칭되지 않은 초과분**을 떼어내는 것이 핵심이다. 그러지 않으면
 * "자기 혼자만 참가 자격이 있는 사이드 팟"이 생겨, 있지도 않은 승부가 하나 더 있는 것처럼
 * 보인다.
 */

const layersOf = (rows: { seat: Seat; amount: number; folded: boolean }[], dead = 0) => {
  const { contributors, refunds } = withdrawUncalledExcess(rows);
  return { pots: buildPots(contributors, dead), refunds };
};

// ─────────────── CASE 1: 5,000 / 12,000 / 20,000 / 20,000 ───────────────
{
  const { pots, refunds } = layersOf([
    { seat: 0, amount: 5_000, folded: false }, // A
    { seat: 1, amount: 12_000, folded: false }, // B
    { seat: 2, amount: 20_000, folded: false }, // C
    { seat: 3, amount: 20_000, folded: false }, // D
  ]);

  assert.deepEqual(refunds, [], "최고액이 동률이면 초과분이 없다");
  assert.equal(pots.length, 3);

  assert.equal(pots[0]!.amount, 20_000, "Main = 5,000 × 4");
  assert.deepEqual([...pots[0]!.eligibleSeats].sort(), [0, 1, 2, 3]);

  assert.equal(pots[1]!.amount, 21_000, "Side 1 = 7,000 × 3");
  assert.deepEqual([...pots[1]!.eligibleSeats].sort(), [1, 2, 3]);

  assert.equal(pots[2]!.amount, 16_000, "Side 2 = 8,000 × 2");
  assert.deepEqual([...pots[2]!.eligibleSeats].sort(), [2, 3]);

  assert.equal(totalPotAmount(pots), 57_000, "총액 = 5,000+12,000+20,000+20,000");
}

// ─────────────── CASE 2: 같은 상황에서 D가 폴드 ───────────────
// 돈은 팟에 남지만 승리 자격은 없다.
{
  const { pots, refunds } = layersOf([
    { seat: 0, amount: 5_000, folded: false },
    { seat: 1, amount: 12_000, folded: false },
    { seat: 2, amount: 20_000, folded: false },
    { seat: 3, amount: 20_000, folded: true }, // D 폴드
  ]);

  assert.deepEqual(refunds, [], "D가 폴드해도 이미 매칭된 돈이라 반환은 없다");
  assert.equal(totalPotAmount(pots), 57_000, "폴드해도 팟 총액은 그대로다");

  assert.deepEqual([...pots[0]!.eligibleSeats].sort(), [0, 1, 2]);
  assert.deepEqual([...pots[1]!.eligibleSeats].sort(), [1, 2]);
  assert.deepEqual([...pots[2]!.eligibleSeats].sort(), [2]);
}

// ─────────────── 매칭되지 않은 초과 베팅은 팟이 아니다 ───────────────
{
  // A 5,000 올인 / B 8,000 올인 / C 15,000 — C의 8,000 초과분(7,000)은 겨룰 상대가 없다.
  const { pots, refunds } = layersOf([
    { seat: 0, amount: 5_000, folded: false },
    { seat: 1, amount: 8_000, folded: false },
    { seat: 2, amount: 15_000, folded: false },
  ]);

  assert.deepEqual(refunds, [{ seat: 2, amount: 7_000 }], "초과분은 주인에게 돌려준다");
  assert.equal(pots.length, 2, "1인 사이드 팟이 생기면 안 된다");
  assert.equal(pots[0]!.amount, 15_000, "Main = 5,000 × 3");
  assert.deepEqual([...pots[0]!.eligibleSeats].sort(), [0, 1, 2]);
  assert.equal(pots[1]!.amount, 6_000, "Side 1 = 3,000 × 2");
  assert.deepEqual([...pots[1]!.eligibleSeats].sort(), [1, 2]);

  // 칩 보존: 팟 + 반환 = 전체 기여액
  assert.equal(totalPotAmount(pots) + 7_000, 28_000);
}

// ─────────────── 폴드한 상대의 기여도 "매칭된 돈"이다 ───────────────
{
  // C가 20,000까지 올렸지만 폴드한 D도 20,000을 넣었다면 초과분이 없다.
  const { refunds } = layersOf([
    { seat: 0, amount: 5_000, folded: false },
    { seat: 1, amount: 20_000, folded: false },
    { seat: 2, amount: 20_000, folded: true },
  ]);
  assert.deepEqual(refunds, [], "폴드한 상대가 같은 금액을 넣었으면 매칭된 것이다");
}

// ─────────────── BB Ante는 메인 팟에 데드머니로만 얹힌다 ───────────────
{
  const { pots } = layersOf(
    [
      { seat: 0, amount: 5_000, folded: false },
      { seat: 1, amount: 5_000, folded: false },
    ],
    600, // 앤티
  );
  assert.equal(pots.length, 1, "앤티가 별도 레이어를 만들면 안 된다");
  assert.equal(pots[0]!.amount, 10_600);
  assert.deepEqual([...pots[0]!.eligibleSeats].sort(), [0, 1], "앤티를 낸 좌석만의 팟이 생기면 안 된다");
}

// ─────────────── 팟별 승자는 독립적으로 판정한다 ───────────────
// A 50 올인 / B 100 올인 / C 30 폴드. B의 초과분(50)은 반환되고 팟은 하나만 남는다.
{
  const { pots, refunds } = layersOf([
    { seat: 0, amount: 50, folded: false },
    { seat: 1, amount: 100, folded: false },
    { seat: 2, amount: 30, folded: true },
  ]);
  assert.deepEqual(refunds, [{ seat: 1, amount: 50 }]);
  // 초과분을 떼고 나면 A와 B의 기여가 같아져 자격이 동일한 레이어가 하나로 합쳐진다.
  assert.equal(pots.length, 1, "겨룰 자격이 같으면 팟은 하나다");
  assert.equal(pots[0]!.amount, 130, "30×3 + 20×2");
  assert.deepEqual([...pots[0]!.eligibleSeats].sort(), [0, 1]);

  const card = (rank: number, suit: "s" | "h" | "d" | "c") => ({ rank, suit });
  const contribution: Record<number, number> = { 0: 50, 1: 100, 2: 30 };
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
      handContribution: contribution[seat]!,
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
    player(0, [card(14, "s"), card(14, "h")]), // A: 포켓 에이스
    player(1, [card(3, "d"), card(4, "d")]), // B: 약한 핸드
    player(2, [card(6, "c"), card(6, "d")]), // C: 폴드
  ];

  const awards = awardPots(pots, players, board, 0, 3);
  assert.equal(awards.length, 1);
  assert.deepEqual(awards[0]!.winners, [0], "A의 포켓 에이스가 팟을 가져간다");
  assert.equal(awards[0]!.amounts.get(0), 130);
  // 칩 보존: 팟 + 반환 = 전체 기여액(50+100+30)
  assert.equal(totalPotAmount(pots) + 50, 180);
}

// ─────────────── buildPots는 Main → Side 순서를 보장한다 ───────────────
// UI가 "가장 큰 팟"을 메인으로 추론하지 않고 pots[0]을 그대로 믿을 수 있어야 한다(§10).
{
  const { pots } = layersOf([
    { seat: 0, amount: 100, folded: false },
    { seat: 1, amount: 10_000, folded: false },
    { seat: 2, amount: 10_000, folded: false },
  ]);
  assert.equal(pots[0]!.amount, 300, "Main은 가장 낮은 공통 레이어다 — 금액이 작아도 pots[0]");
  assert.deepEqual([...pots[0]!.eligibleSeats].sort(), [0, 1, 2]);
  assert.ok(pots[1]!.amount > pots[0]!.amount, "사이드 팟이 메인보다 클 수 있다");
  for (let i = 1; i < pots.length; i++) {
    assert.ok(
      pots[i]!.eligibleSeats.length < pots[i - 1]!.eligibleSeats.length,
      "뒤쪽 팟일수록 자격자가 줄어든다",
    );
  }
}

console.log("OK: mystery side pots");
