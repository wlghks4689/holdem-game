import assert from "node:assert/strict";
import type { Card } from "@/holdem/cards";
import { HAND_RANK } from "../src/holdem/pokerEval";
import { MISSION_POOL } from "../src/mysteryHoldem/mysteryMissions";
import { computeBestHandForPlayer, showdownHoleCardsForPlayer } from "../src/mysteryHoldem/showdown";
import { SPECIAL_RULES } from "../src/mysteryHoldem/specialRules";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";
import type { PlayerState } from "../src/mysteryHoldem/types";

/**
 * Four Card(Extra Hand): 홀 4장을 받지만 쇼다운은 반드시 "홀 정확히 2장 + 보드 정확히 3장"이다.
 * 홀카드를 3장 이상 쓰면 완성되는 족보가 인정되어서는 안 된다.
 */

const def = MISSION_POOL.find((m) => m.specialRule === "extra_hand_four_card");
assert.ok(def != null, "extra_hand_four_card specialRule을 가진 Mission이 있어야 한다");

const C = (rank: number, suit: string): Card => ({ rank, suit }) as Card;

function withFourCards(hole: Card[], withRule: boolean): PlayerState {
  return {
    seat: 0, name: "P", chips: 0, pendingDeal: [], discarded: [], holeCards: hole,
    inHand: true, folded: false, allIn: false, busted: false,
    streetContribution: 0, handContribution: 0, anteContribution: 0,
    mission: withRule ? { def: def!, assignedRound: 1, achieved: false } : null,
    missionPoint: 0, bountyPoint: 0, chipPoint: 0, totalPoint: 0,
  };
}

// ── 홀 4장을 자유 조합하면 플러시지만, 정확히 2장만 쓰면 플러시가 될 수 없다 ──
{
  const board = [C(10, "c"), C(3, "d"), C(2, "s"), C(13, "h"), C(12, "h")];
  const hole = [C(4, "c"), C(5, "c"), C(6, "c"), C(8, "c")];

  const strict = computeBestHandForPlayer(withFourCards(hole, true), board);
  assert.notEqual(strict.rank, HAND_RANK.FLUSH, "홀 3장 이상을 써야 나오는 플러시를 인정하면 안 된다");

  const free = computeBestHandForPlayer(withFourCards(hole, false), board);
  assert.equal(free.rank, HAND_RANK.FLUSH, "대조군(자유 조합)에서는 플러시가 나와야 테스트가 유효하다");
}

// ── 홀 3장을 써야 완성되는 스트레이트도 인정하지 않는다 ──
{
  const board = [C(7, "h"), C(9, "d"), C(2, "s"), C(13, "h"), C(12, "h")];
  const hole = [C(4, "c"), C(5, "c"), C(6, "c"), C(8, "c")];

  const strict = computeBestHandForPlayer(withFourCards(hole, true), board);
  assert.notEqual(strict.rank, HAND_RANK.STRAIGHT, "홀 3장을 써야 나오는 스트레이트를 인정하면 안 된다");

  const free = computeBestHandForPlayer(withFourCards(hole, false), board);
  assert.equal(free.rank, HAND_RANK.STRAIGHT, "대조군에서는 스트레이트가 나와야 한다");
}

// ── 홀 정확히 2장으로 만들어지는 족보는 정상 인정된다 ──
{
  const board = [C(9, "s"), C(9, "d"), C(2, "c"), C(5, "h"), C(7, "d")];
  const hole = [C(9, "h"), C(9, "c"), C(3, "s"), C(4, "d")];
  // 홀의 9 두 장 + 보드의 9 두 장을 함께 쓰면 포카드지만, 보드는 정확히 3장만 쓸 수 있으므로
  // 9,9(홀) + 9,x,y(보드) = 트립스 위의 풀하우스가 아니라 포카드가 된다.
  const strict = computeBestHandForPlayer(withFourCards(hole, true), board);
  assert.equal(strict.rank, HAND_RANK.QUADS, "홀 2장 + 보드 3장으로 만들어지는 포카드는 인정된다");
}

// ── 쇼다운 공개 카드: 실제로 사용한 2장만 ──
{
  const board = [C(9, "s"), C(9, "d"), C(2, "c"), C(5, "h"), C(7, "d")];
  const hole = [C(9, "h"), C(9, "c"), C(3, "s"), C(4, "d")];
  const shown = showdownHoleCardsForPlayer(withFourCards(hole, true), board);
  assert.equal(shown.length, 2, "Four Card 보유자는 쇼다운에 정확히 2장만 공개한다");
  assert.ok(
    shown.every((c) => c.rank === 9),
    `실제 최선 조합에 쓰인 9 두 장이 공개되어야 하는데 ${JSON.stringify(shown)}`,
  );

  // specialRule이 없는 일반 플레이어는 보유한 홀카드를 그대로 공개한다.
  const normal = showdownHoleCardsForPlayer(withFourCards([C(9, "h"), C(9, "c")], false), board);
  assert.equal(normal.length, 2);
}

// ── 리듀서 실경로: Extra Hand를 고르면 홀카드가 정확히 4장이 되고 추가 버림은 없다 ──
{
  const rng = mulberry32(5);
  let state = startMatch(3, rng);
  const seat = state.awaitingHoleSelection[0]!;
  state = dispatch(state, { type: "SELECT_HOLE_CARDS", seat, keepIndexes: [0, 1] }, rng);

  const offers = state.missionOffers[seat];
  if (offers?.some((m) => m.specialRule === "extra_hand_four_card")) {
    const extraHand = offers.find((m) => m.specialRule === "extra_hand_four_card")!;
    const after = dispatch(state, { type: "SELECT_MISSION", seat, missionId: extraHand.id }, rng);
    const p = after.players.find((x) => x.seat === seat)!;
    assert.equal(p.holeCards.length, 4, "Extra Hand 선택 후 홀카드는 정확히 4장이어야 한다");
    assert.equal(p.discarded.length, 1, "추가 버림 없이 최초 1장만 버린 상태여야 한다");
  }
}

// ── specialRule 설정값 자체 검증 ──
{
  const rule = SPECIAL_RULES.extra_hand_four_card;
  assert.equal(rule.finalHoleCardCount, 4);
  assert.equal(rule.extraDealCount, 2);
  assert.equal(rule.showdownHoleCardCount, 2, "쇼다운 공개 매수는 2장");
}

// ── 봇 실플레이에서도 Four Card 보유자의 공개 카드는 항상 2장 ──
{
  const rng = mulberry32(21);
  let state = startMatch(4, rng);
  state = autoCompleteHandSetup(state, rng);
  let guard = 0;
  while (state.phase !== "hand_over" && state.toActSeat != null && guard++ < 200) {
    const seat = state.toActSeat;
    const p = state.players.find((x) => x.seat === seat)!;
    const facing = state.betting.currentLevel - p.streetContribution;
    state = facing > 1e-9
      ? dispatch(state, { type: "CALL", seat }, rng)
      : dispatch(state, { type: "CHECK", seat }, rng);
  }
  for (const p of state.players) {
    if (!p.inHand || p.folded) continue;
    const shown = showdownHoleCardsForPlayer(p, state.board.slice(0, state.boardRevealed));
    assert.ok(shown.length <= 2, `좌석 ${p.seat}의 공개 카드가 ${shown.length}장 — 2장을 넘으면 안 된다`);
  }
}

console.log("OK: mystery four card (홀 2장 + 보드 3장 강제)");
