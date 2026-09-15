import assert from "node:assert/strict";
import type { Card } from "@/holdem/cards";
import { HAND_RANK } from "../src/holdem/pokerEval";
import { findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import { computeBestHandForPlayer } from "../src/mysteryHoldem/showdown";
import { makeMissionCtx, missionStateOf } from "./mysteryTestHelpers";
import type { PlayerState } from "../src/mysteryHoldem/types";

/**
 * Straight / Flush Maker가 **원핸드**(홀카드 한 장만 쓰는 조합)와 **스트레이트 플러시**에서도
 * 성립하는지 검증한다.
 *
 * 원핸드는 엔진이 best-5-of-7로 평가하니 자동으로 되어야 하지만, "되어야 한다"와 "된다"는
 * 다르다. Four Card 보유자만은 홀 정확히 2장을 강제하므로 원핸드가 성립하면 안 되고,
 * 그 경계도 같이 못 박는다.
 */

const C = (rank: number, suit: string): Card => ({ rank, suit }) as Card;
const STRAIGHT_MAKER = findMissionDef("maker_straight")!;
const FLUSH_MAKER = findMissionDef("maker_flush")!;

function playerWith(hole: Card[], cardId?: string): PlayerState {
  const def = cardId != null ? findMissionDef(cardId)! : null;
  return {
    seat: 0,
    name: "P",
    chips: 0,
    pendingDeal: [],
    discarded: [],
    holeCards: hole,
    inHand: true,
    folded: false,
    allIn: false,
    busted: false,
    streetContribution: 0,
    handContribution: 0,
    anteContribution: 0,
    mission: def != null ? missionStateOf(def) : null,
    missionPoint: 0,
    bountyPoint: 0,
    survivalPoint: 0,
    chipPoint: 0,
    totalPoint: 0,
  };
}

/** 그 족보로 쇼다운했다고 보고 카드 조건을 평가한다 */
function achieves(def: typeof STRAIGHT_MAKER, hole: Card[], board: Card[]): boolean {
  const value = computeBestHandForPlayer(playerWith(hole), board);
  return def.condition(makeMissionCtx({ wentToShowdown: true, bestHandValue: value }));
}

// ─────────────── 원핸드 스트레이트 ───────────────
{
  // 보드 6 7 8 9 — 홀카드 10 한 장만으로 6-7-8-9-10 스트레이트가 된다.
  const board = [C(6, "c"), C(7, "d"), C(8, "s"), C(9, "h"), C(2, "c")];
  const hole = [C(10, "d"), C(3, "s")];

  const value = computeBestHandForPlayer(playerWith(hole), board);
  assert.equal(value.rank, HAND_RANK.STRAIGHT, "원핸드로 스트레이트가 만들어져야 테스트가 유효하다");
  assert.equal(achieves(STRAIGHT_MAKER, hole, board), true, "원핸드 스트레이트도 Straight Maker 성공");
}

// ─────────────── 보드만으로 완성된 스트레이트도 인정한다 ───────────────
// 홀카드를 한 장도 쓰지 않는 경우다. 규칙상 "최종 족보"가 기준이므로 성공이 맞다.
{
  const board = [C(5, "c"), C(6, "d"), C(7, "s"), C(8, "h"), C(9, "c")];
  const hole = [C(2, "d"), C(3, "s")];
  const value = computeBestHandForPlayer(playerWith(hole), board);
  assert.equal(value.rank, HAND_RANK.STRAIGHT);
  assert.equal(achieves(STRAIGHT_MAKER, hole, board), true);
}

// ─────────────── 원핸드 플러시 ───────────────
{
  // 보드에 스페이드 4장 — 홀카드 스페이드 한 장만으로 플러시가 된다.
  const board = [C(2, "s"), C(5, "s"), C(9, "s"), C(13, "s"), C(4, "h")];
  const hole = [C(7, "s"), C(3, "d")];

  const value = computeBestHandForPlayer(playerWith(hole), board);
  assert.equal(value.rank, HAND_RANK.FLUSH, "원핸드로 플러시가 만들어져야 테스트가 유효하다");
  assert.equal(achieves(FLUSH_MAKER, hole, board), true, "원핸드 플러시도 Flush Maker 성공");
}

// ─────────────── 스트레이트 플러시는 두 Maker 모두 성공 ───────────────
{
  // 보드 6♠ 7♠ 8♠ 9♠ — 홀 10♠ 하나로 스티플(원핸드 스티플)
  const board = [C(6, "s"), C(7, "s"), C(8, "s"), C(9, "s"), C(2, "d")];
  const hole = [C(10, "s"), C(3, "h")];

  const value = computeBestHandForPlayer(playerWith(hole), board);
  assert.equal(value.rank, HAND_RANK.STRAIGHT_FLUSH, "스티플이 만들어져야 테스트가 유효하다");

  assert.equal(achieves(STRAIGHT_MAKER, hole, board), true, "스티플은 Straight Maker로 인정한다");
  assert.equal(achieves(FLUSH_MAKER, hole, board), true, "스티플은 Flush Maker로 인정한다");
  assert.equal(
    findMissionDef("maker_high_end")!.condition(
      makeMissionCtx({ wentToShowdown: true, bestHandValue: value }),
    ),
    true,
    "스티플은 High-End Maker에도 포함된다",
  );
}

// ─────────────── Four Card 보유자는 원핸드가 성립하지 않는다 ───────────────
// 홀 정확히 2장 + 보드 정확히 3장이라는 제약 때문이다. 이건 버그가 아니라 그 카드의 규칙이다.
{
  const board = [C(2, "s"), C(5, "s"), C(9, "s"), C(13, "s"), C(4, "h")];
  // 스페이드는 홀에 한 장뿐 — 보드 4장을 다 써야 플러시인데 보드는 3장만 쓸 수 있다.
  const hole = [C(7, "s"), C(3, "d"), C(11, "h"), C(12, "c")];

  const normal = computeBestHandForPlayer(playerWith([C(7, "s"), C(3, "d")]), board);
  assert.equal(normal.rank, HAND_RANK.FLUSH, "일반 플레이어라면 원핸드 플러시가 된다(대조군)");

  const fourCard = computeBestHandForPlayer(playerWith(hole, "four_card"), board);
  assert.notEqual(
    fourCard.rank,
    HAND_RANK.FLUSH,
    "Four Card는 보드 3장 제한 때문에 원핸드 플러시가 성립하지 않는다",
  );
}

// ─────────────── 확정된 보상값 ───────────────
{
  assert.equal(findMissionDef("maker_set")!.reward, 120);
  assert.equal(STRAIGHT_MAKER.reward, 180);
  assert.equal(FLUSH_MAKER.reward, 240);
}

console.log("OK: maker 원핸드 / 스트레이트 플러시");
