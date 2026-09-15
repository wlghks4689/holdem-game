import assert from "node:assert/strict";
import type { Card } from "../src/holdem/cards";
import { bestHandStandard } from "../src/mysteryHoldem/handEval";
import { handImprovesOnBoard } from "../src/mysteryHoldem/showdown";
import { findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import { makeMissionCtx } from "./mysteryTestHelpers";

/**
 * "보드를 그대로 쓴 족보"는 Maker 계열과 Ace High Like a Boss에서 인정하지 않는다.
 *
 * 조건 함수만 테스트하면 improvesOnBoard 값을 손으로 넣게 되어, 정작 그 값을 계산하는
 * 쪽이 검증되지 않는다. 그래서 실제 카드로 계산까지 한 번에 확인한다.
 */

const C = (rank: number, suit: string): Card => ({ rank, suit }) as Card;
const improves = (hole: Card[], board: Card[]) =>
  handImprovesOnBoard(bestHandStandard(hole, board), board);

// ── 보드 스트레이트를 그대로 쓰는 경우 ──
{
  // 보드 자체가 9-10-J-Q-K 스트레이트다.
  const board = [C(9, "s"), C(10, "d"), C(11, "c"), C(12, "h"), C(13, "s")];

  // 보드보다 나아지지 않는 홀카드 — 최종 족보는 보드 스트레이트 그대로다.
  assert.equal(improves([C(2, "c"), C(3, "d")], board), false, "보드 스트레이트를 그대로 쓰면 false");

  // A를 들면 10-A 스트레이트로 올라간다 — 내 카드가 실제로 쓰였다.
  assert.equal(improves([C(14, "d"), C(3, "d")], board), true, "더 높은 스트레이트를 만들면 true");

  // 같은 스트레이트를 내 카드로도 만들 수 있는 동률 상황 — 결과는 여전히 "나아지지 않음"이다.
  assert.equal(improves([C(9, "d"), C(10, "h")], board), false, "동률 조합이 있어도 값은 흔들리지 않는다");
}

// ── 보드 플러시 ──
{
  const board = [C(2, "h"), C(5, "h"), C(9, "h"), C(11, "h"), C(13, "h")];
  assert.equal(improves([C(3, "s"), C(4, "d")], board), false, "보드 플러시를 그대로 쓰면 false");
  assert.equal(improves([C(14, "h"), C(4, "d")], board), true, "A♥로 더 높은 플러시가 되면 true");
}

// ── 보드가 5장 미만이면 항상 홀카드를 쓴다 ──
{
  const board = [C(9, "s"), C(10, "d"), C(11, "c")];
  assert.equal(improves([C(2, "c"), C(3, "d")], board), true, "보드 3장만으로는 족보가 성립하지 않는다");
}

// ── 조건 함수 연결 ──
{
  const straight = findMissionDef("maker_straight")!;
  const flush = findMissionDef("maker_flush")!;
  const boss = findMissionDef("high_card_boss")!;
  const hv = (rank: number) => ({ rank, kickers: [10, 9, 8, 7, 6] });

  const board = [C(9, "s"), C(10, "d"), C(11, "c"), C(12, "h"), C(13, "s")];
  const hole = [C(2, "c"), C(3, "d")];
  const best = bestHandStandard(hole, board);

  assert.equal(
    straight.condition(
      makeMissionCtx({ bestHandValue: best, improvesOnBoard: improves(hole, board) }),
    ),
    false,
    "보드 스트레이트로는 Straight Maker가 성공하지 않는다",
  );

  // 반대로 내 카드가 쓰였으면 성공한다.
  const better = [C(14, "d"), C(3, "d")];
  assert.equal(
    straight.condition(
      makeMissionCtx({
        bestHandValue: bestHandStandard(better, board),
        improvesOnBoard: improves(better, board),
      }),
    ),
    true,
  );

  assert.equal(
    flush.condition(makeMissionCtx({ bestHandValue: hv(6), improvesOnBoard: false })),
    false,
  );
  assert.equal(
    boss.condition(
      makeMissionCtx({ wonAnyPot: true, boardRevealed: 5, bestHandValue: hv(1), improvesOnBoard: false }),
    ),
    false,
    "보드 하이카드로는 Ace High Like a Boss가 성공하지 않는다",
  );
}

console.log("OK: 보드 그대로 쓴 족보는 Maker 계열에서 제외된다");
