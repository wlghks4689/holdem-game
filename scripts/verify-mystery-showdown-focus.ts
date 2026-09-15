import assert from "node:assert/strict";
import type { Card } from "../src/holdem/cards";
import { cardKey } from "../src/holdem/showdownFocus";
import { findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import {
  mainPotResultFromLogs,
  playerShowdownBestFive,
  showdownFocusForMainPot,
} from "../src/mysteryHoldem/showdownFocus";
import { missionStateOf } from "./mysteryTestHelpers";
import type { MysteryGameMessage, PlayerState, Seat } from "../src/mysteryHoldem/types";

/**
 * 메인 팟 쇼다운 포커스(§9~§20).
 *
 * 승자 판정은 awardPots가 이미 끝냈고 로그에 실려 온다. 여기서 검증하는 것은
 * "그 승자의 BEST 5에 어떤 카드가 들어갔는가"뿐이다.
 */

const C = (rank: number, suit: "s" | "h" | "d" | "c"): Card => ({ rank, suit }) as Card;
const keys = (cards: Card[]) => new Set(cards.map(cardKey));

function player(seat: number, hole: Card[], cardId?: string): PlayerState {
  const def = cardId != null ? findMissionDef(cardId)! : null;
  return {
    seat: seat as Seat,
    name: `P${seat}`,
    chips: 10_000,
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

const showdownLog = (
  potIndex: number,
  winners: Seat[],
  forcedSplit = false,
  potCount = 2,
  potAmount = 1000,
): MysteryGameMessage => ({
  t: "showdown",
  potIndex,
  potCount,
  potAmount,
  winners,
  eligibleSeats: [0, 1, 2],
  desc: "",
  forcedSplit,
});

const roundStart: MysteryGameMessage = { t: "round_start", round: 3, buttonSeat: 0 };

// ─────────────── 메인 팟은 potIndex 0이다 (금액이 아니라 레이어 순서) ───────────────
{
  const logs: MysteryGameMessage[] = [
    roundStart,
    showdownLog(0, [1], false, 2, 300),
    showdownLog(1, [2], false, 2, 20_000),
  ];
  const main = mainPotResultFromLogs(logs)!;
  assert.deepEqual(main.winners, [1], "사이드 팟이 더 커도 메인은 potIndex 0이다");
  assert.equal(main.amount, 300);
}

// ─────────────── CASE 3: 메인 승자와 사이드 승자가 다르면 포커스는 메인 기준 ───────────────
{
  const board = [C(14, "h"), C(13, "d"), C(9, "c"), C(5, "s"), C(2, "d")];
  const players = [
    player(0, [C(14, "s"), C(12, "c")]), // A: A 원페어 + Q 킥커 — 메인 승자
    player(1, [C(3, "h"), C(4, "h")]), // B
    player(2, [C(13, "s"), C(13, "c")]), // C: K 트립스 — 사이드 승자
  ];
  const logs = [roundStart, showdownLog(0, [0]), showdownLog(1, [2])];
  const focus = showdownFocusForMainPot(mainPotResultFromLogs(logs), players, board)!;

  assert.deepEqual(focus.winnerSeats, [0], "사이드 팟 승자는 포커스를 가져가지 않는다");
  // A의 BEST5: A♠ A♥ K♦ Q♣ 9♣
  assert.deepEqual(
    [...focus.holeUsedBySeat.get(0 as Seat)!].sort(),
    [...keys([C(14, "s"), C(12, "c")])].sort(),
    "쓰인 홀카드 2장",
  );
  assert.deepEqual(
    [...focus.boardUsedKeys].sort(),
    [...keys([C(14, "h"), C(13, "d"), C(9, "c")])].sort(),
    "쓰인 보드 3장만 강조",
  );
  assert.ok(!focus.boardUsedKeys.has(cardKey(C(5, "s"))), "5♠는 쓰이지 않았다");
  assert.ok(!focus.boardUsedKeys.has(cardKey(C(2, "d"))), "2♦는 쓰이지 않았다");
}

// ─────────────── CASE 8: 홀카드를 한 장만 쓰는 경우 ───────────────
{
  const board = [C(14, "h"), C(13, "d"), C(9, "c"), C(5, "s"), C(2, "d")];
  const players = [player(0, [C(14, "s"), C(3, "c")])]; // 3♣는 킥커에도 못 든다
  const focus = showdownFocusForMainPot(
    mainPotResultFromLogs([roundStart, showdownLog(0, [0], false, 1)]),
    players,
    board,
  )!;
  const used = focus.holeUsedBySeat.get(0 as Seat)!;
  assert.ok(used.has(cardKey(C(14, "s"))), "쓰인 A♠는 강조");
  assert.ok(!used.has(cardKey(C(3, "c"))), "쓰이지 않은 3♣는 제외");
  assert.equal(used.size, 1);
}

// ─────────────── CASE 7: 보드가 그대로 BEST 5인 경우 ───────────────
{
  // 보드 자체가 9-10-J-Q-K 스트레이트. 홀카드는 아무 기여도 하지 않는다.
  const board = [C(9, "s"), C(10, "d"), C(11, "c"), C(12, "h"), C(13, "s")];
  const players = [player(0, [C(2, "c"), C(3, "d")])];
  const focus = showdownFocusForMainPot(
    mainPotResultFromLogs([roundStart, showdownLog(0, [0], false, 1)]),
    players,
    board,
  )!;
  assert.equal(focus.holeUsedBySeat.get(0 as Seat)!.size, 0, "홀카드 전부 dim");
  assert.equal(focus.boardUsedKeys.size, 5, "보드 5장 전부 focus");
}

// ─────────────── CASE 4: 일반 타이 — 공동 승자 각자의 BEST 5 ───────────────
{
  const board = [C(14, "h"), C(13, "d"), C(9, "c"), C(5, "s"), C(2, "d")];
  const players = [
    player(0, [C(14, "s"), C(12, "c")]),
    player(1, [C(14, "d"), C(12, "h")]), // 같은 족보·같은 킥커
  ];
  const focus = showdownFocusForMainPot(
    mainPotResultFromLogs([roundStart, showdownLog(0, [0, 1], false, 1)]),
    players,
    board,
  )!;
  assert.deepEqual(focus.winnerSeats, [0, 1]);
  assert.ok(focus.holeUsedBySeat.get(0 as Seat)!.has(cardKey(C(14, "s"))));
  assert.ok(focus.holeUsedBySeat.get(1 as Seat)!.has(cardKey(C(14, "d"))));
  assert.ok(!focus.holeUsedBySeat.get(0 as Seat)!.has(cardKey(C(14, "d"))), "남의 카드를 밝히지 않는다");
  assert.equal(focus.fxKind, "none", "원페어는 메이드 FX 종류가 없다 — 중립 글로우");
}

// ─────────────── CASE 5: Forced Split은 중립 색 ───────────────
{
  // 족보가 서로 다른 사람들이 함께 승자가 된다. 한 명의 족보색으로 보드를 물들이면
  // 그 사람이 진짜 승자처럼 읽힌다.
  const board = [C(14, "h"), C(13, "h"), C(9, "h"), C(5, "h"), C(2, "d")];
  const players = [
    player(0, [C(3, "h"), C(7, "c")]), // 플러시
    player(1, [C(14, "s"), C(12, "c")]), // A 원페어
  ];
  const focus = showdownFocusForMainPot(
    mainPotResultFromLogs([roundStart, showdownLog(0, [0, 1], true, 1)]),
    players,
    board,
  )!;
  assert.equal(focus.forcedSplit, true);
  assert.equal(focus.fxKind, "none", "Forced Split은 특정 족보색을 쓰지 않는다");
  assert.ok(focus.holeUsedBySeat.get(0 as Seat)!.has(cardKey(C(3, "h"))), "각자 자기 BEST5 기준");
}

// ─────────────── CASE 6: Four Card는 홀 2장 + 보드 3장 ───────────────
{
  // 보드에 하트가 4장 있지만, Four Card는 보드를 정확히 3장만 쓸 수 있어
  // 일반 7장 평가기처럼 "홀 1장 + 보드 4장" 플러시를 만들 수 없다.
  const board = [C(14, "h"), C(13, "h"), C(9, "h"), C(5, "h"), C(2, "d")];
  const four = player(0, [C(3, "h"), C(7, "h"), C(8, "c"), C(4, "d")], "four_card");
  const best = playerShowdownBestFive(four, board);

  assert.equal(best.bestFive.length, 5);
  assert.equal(best.holeUsedKeys.size, 2, "홀카드는 정확히 2장");
  assert.equal(best.boardUsedKeys.size, 3, "보드는 정확히 3장");

  const focus = showdownFocusForMainPot(
    mainPotResultFromLogs([roundStart, showdownLog(0, [0], false, 1)]),
    [four],
    board,
  )!;
  assert.equal(focus.holeUsedBySeat.get(0 as Seat)!.size, 2);
  assert.equal(focus.boardUsedKeys.size, 3, "규칙 밖의 보드 4장이 강조되면 안 된다");
}

// ─────────────── 보드가 덜 열렸으면 포커스를 켜지 않는다(§23) ───────────────
{
  const board = [C(14, "h"), C(13, "d"), C(9, "c")];
  const players = [player(0, [C(14, "s"), C(12, "c")])];
  assert.equal(
    showdownFocusForMainPot(mainPotResultFromLogs([roundStart, showdownLog(0, [0], false, 1)]), players, board),
    null,
    "리버 전에는 BEST 5가 확정되지 않는다",
  );
}

// ─────────────── 폴드 승리에는 쇼다운 로그가 없다(§24) ───────────────
{
  const logs: MysteryGameMessage[] = [roundStart, { t: "fold_win", winner: 0 as Seat, pot: 500 }];
  assert.equal(mainPotResultFromLogs(logs), null);
  assert.equal(showdownFocusForMainPot(null, [], []), null);
}

console.log("OK: mystery 메인 팟 쇼다운 포커스");
