import assert from "node:assert/strict";
import type { Card } from "@/holdem/cards";
import { MISSION_POOL, findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import { trueSightRevealedCards } from "../src/mysteryHoldem/selectors";
import { awardPots } from "../src/mysteryHoldem/showdown";
import {
  autoCompleteHandSetup,
  makeMissionCtx,
  missionStateOf,
  mulberry32,
  startMatch,
} from "./mysteryTestHelpers";
import type { MysteryGameState, PlayerState, Pot, Seat } from "../src/mysteryHoldem/types";

/**
 * Forced Split(§14) / True Sight(§17) / Four Card(§18) 검증.
 */

const FORCED_SPLIT = findMissionDef("forced_split")!;
const TRUE_SIGHT = findMissionDef("true_sight")!;
const FOUR_CARD = findMissionDef("four_card")!;
const MISSION_CARD = findMissionDef("underdog")!;

const C = (rank: number, suit: string): Card => ({ rank, suit }) as Card;

/**
 * 족보를 원하는 대로 만들기 위해 보드를 고정하고 홀카드로 결과를 조종한다.
 *
 * 보드: A♠ K♦ 7♣ 7♥ 2♠ — 레인보우에 연결이 없어 스트레이트/플러시는 생기지 않지만,
 * 7 페어가 있어 홀카드 한 장으로 트립스·풀하우스까지 올릴 수 있다(High-End 예외 검증에 필요).
 * 보드에 페어가 있으므로 모든 참가자가 최소 원페어이며, 그래도 전원 플러시 이하라
 * Forced Split 조건은 그대로 성립한다.
 *
 * 홀카드는 플레이어끼리 겹치지 않게 배분했다.
 */
const BOARD = [C(14, "s"), C(13, "d"), C(7, "c"), C(7, "h"), C(2, "s")];

const HOLE = {
  /** 7,7,7 + A,A 풀하우스 */
  fullHouse: [C(14, "d"), C(7, "s")],
  /** 7,7,7 + A,K 트립스 */
  trips: [C(7, "d"), C(3, "c")],
  /** A,A + K,K 투페어 */
  twoPair: [C(14, "c"), C(13, "s")],
  /** 7,7 + A,K,Q 원페어 — 이 보드에서 가능한 가장 약한 패 */
  weak: [C(12, "h"), C(11, "d")],
  /** weak과 족보·킥커가 완전히 같은 패(동률 확인용) */
  weakTie: [C(12, "c"), C(11, "s")],
};

function playerWith(seat: Seat, hole: Card[], cardId?: string): PlayerState {
  const def = cardId != null ? findMissionDef(cardId)! : null;
  return {
    seat,
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

const pot = (amount: number, seats: Seat[]): Pot => ({ amount, eligibleSeats: seats });

function award(players: PlayerState[], pots: Pot[]) {
  return awardPots(pots, players, BOARD, 0, players.length);
}

// ─────────────── Forced Split: 전원 플러시 이하면 강제 스플릿 ───────────────
{
  const players = [
    playerWith(0, HOLE.trips), // 원래 단독 승자
    playerWith(1, HOLE.twoPair),
    playerWith(2, HOLE.weak, "forced_split"),
  ];
  const [main] = award(players, [pot(3000, [0, 1, 2])]);
  assert.deepEqual([...main!.winners].sort(), [0, 1, 2], "전원이 플러시 이하면 강제 스플릿");
  assert.equal(main!.forcedSplit, true, "원래는 0 단독 승리였으므로 발동으로 기록된다");
  assert.ok(main!.amounts.get(2)! > 0, "가장 약한 패인 보유자도 몫을 받는다");
  const total = [...main!.amounts.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 3000, "칩 보존");
}

// ─────────────── High-End 예외: 풀하우스 이상이 있으면 적용하지 않는다 ───────────────
{
  const players = [
    playerWith(0, HOLE.fullHouse),
    playerWith(1, HOLE.twoPair),
    playerWith(2, HOLE.weak, "forced_split"),
  ];
  const [main] = award(players, [pot(3000, [0, 1, 2])]);
  assert.deepEqual(main!.winners, [0], "풀하우스가 있으면 정상 승부다(§14 High-End 예외)");
  assert.equal(main!.forcedSplit, false, "결과가 바뀌지 않았으므로 발동이 아니다");
}

// ─────────────── 보유자 2명 이상이면 상쇄되어 팟을 못 가져간다 ───────────────
{
  const players = [
    playerWith(0, HOLE.trips, "forced_split"), // 원래 단독 승자이지만 보유자
    playerWith(1, HOLE.weak, "forced_split"),
    playerWith(2, HOLE.twoPair),
  ];
  const [main] = award(players, [pot(3000, [0, 1, 2])]);
  assert.deepEqual(main!.winners, [2], "보유자 2명은 상쇄되어 비보유자만 가져간다");
  assert.equal(main!.forcedSplit, true);
  assert.equal(main!.amounts.get(0) ?? 0, 0, "가장 강한 패였지만 보유자라 0");
}

// ─────────────── 참가자가 전부 보유자면 상쇄 대상이 없으므로 표준 랭킹 ───────────────
{
  const players = [
    playerWith(0, HOLE.trips, "forced_split"),
    playerWith(1, HOLE.weak, "forced_split"),
  ];
  const [main] = award(players, [pot(2000, [0, 1])]);
  assert.deepEqual(main!.winners, [0], "아무도 못 가져가면 칩이 사라지므로 표준 랭킹으로 되돌린다");
  const total = [...main!.amounts.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 2000, "칩 보존");
}

// ─────────────── 팟별 개별 판정: 메인은 스플릿, 사이드는 정상 승부 ───────────────
{
  const players = [
    playerWith(0, HOLE.fullHouse),
    playerWith(1, HOLE.trips),
    playerWith(2, HOLE.weak, "forced_split"),
  ];
  const awards = award(players, [pot(3000, [1, 2]), pot(1000, [0, 1])]);

  assert.deepEqual([...awards[0]!.winners].sort(), [1, 2], "메인 팟에는 풀하우스가 없어 강제 스플릿");
  assert.equal(awards[0]!.forcedSplit, true);

  assert.deepEqual(awards[1]!.winners, [0], "사이드 팟에는 풀하우스가 있어 정상 승부");
  assert.equal(awards[1]!.forcedSplit, false);
}

// ─────────────── 결과가 바뀌지 않으면 발동이 아니다(= 카드를 교체하지 않는다) ───────────────
{
  const players = [
    playerWith(0, HOLE.weak, "forced_split"),
    playerWith(1, HOLE.weakTie), // 족보·킥커가 같아 원래도 동률
  ];
  const [main] = award(players, [pot(2000, [0, 1])]);
  assert.deepEqual([...main!.winners].sort(), [0, 1]);
  assert.equal(main!.forcedSplit, false, "원래도 스플릿이었으므로 '결과가 바뀌었다'가 아니다");
}

// ─────────────── Forced Split 카드 정의 ───────────────
{
  assert.equal(FORCED_SPLIT.reward, 0, "추가 점수 없음(§14)");
  assert.equal(FORCED_SPLIT.potRule, "forced_split");
  assert.equal(FORCED_SPLIT.replacementRule, "on_trigger");
  assert.equal(FORCED_SPLIT.condition(makeMissionCtx({ potRuleTriggered: true })), true);
  assert.equal(FORCED_SPLIT.condition(makeMissionCtx({ potRuleTriggered: false })), false);
}

// ─────────────── True Sight: 보유자에게만 상대 카드가 보인다 ───────────────
{
  const rng = mulberry32(3);
  let state: MysteryGameState = startMatch(4, rng);
  state = autoCompleteHandSetup(state, rng);
  state = {
    ...state,
    boardRevealed: 3,
    players: state.players.map((p) =>
      p.seat === 0
        ? { ...p, mission: missionStateOf(TRUE_SIGHT) }
        : { ...p, mission: missionStateOf(MISSION_CARD) },
    ),
  };

  const mine = trueSightRevealedCards(state, 0);
  assert.equal(mine.length, 3, "팟에 남은 상대 3명의 카드가 보여야 한다");
  assert.ok(mine.every((r) => r.cardName === MISSION_CARD.name));
  assert.ok(mine.every((r) => r.seat !== 0), "자기 자신은 포함하지 않는다");

  // 상대 좌석에서 같은 함수를 호출하면 아무것도 나오지 않는다 — 공개 사실조차 드러나지 않는다.
  for (const seat of [1, 2, 3]) {
    assert.deepEqual(trueSightRevealedCards(state, seat), [], `좌석 ${seat}에는 보이면 안 된다`);
  }

  assert.deepEqual(
    trueSightRevealedCards({ ...state, boardRevealed: 0 }, 0),
    [],
    "플랍 전에는 보이지 않는다",
  );

  const withFold: MysteryGameState = {
    ...state,
    players: state.players.map((p) => (p.seat === 3 ? { ...p, folded: true } : p)),
  };
  assert.equal(trueSightRevealedCards(withFold, 0).length, 2, "폴드한 상대는 빠진다");

  const iFolded: MysteryGameState = {
    ...state,
    players: state.players.map((p) => (p.seat === 0 ? { ...p, folded: true } : p)),
  };
  assert.deepEqual(trueSightRevealedCards(iFolded, 0), [], "내가 폴드하면 볼 수 없다");
}

// ─────────────── True Sight 카드 정의 ───────────────
{
  assert.equal(TRUE_SIGHT.reward, 30);
  assert.equal(TRUE_SIGHT.category, "enhancement");
  // 정보를 한 번 본 시점에 값어치를 다 쓴다 — 팟 승패와 무관하게 1회 사용 후 교체한다.
  assert.equal(TRUE_SIGHT.replacementRule, "on_trigger", "1회 사용 후 교체(§17)");
  assert.equal(TRUE_SIGHT.condition(makeMissionCtx({ boardRevealed: 3 })), true);
  assert.equal(TRUE_SIGHT.condition(makeMissionCtx({ boardRevealed: 0 })), false);
  assert.equal(TRUE_SIGHT.condition(makeMissionCtx({ boardRevealed: 5, folded: true })), false);
}

// ─────────────── Four Card 카드 정의 ───────────────
{
  assert.equal(FOUR_CARD.reward, 0, "Mission Point 없음(§18)");
  assert.equal(FOUR_CARD.category, "enhancement");
  assert.equal(FOUR_CARD.specialRule, "extra_hand_four_card");
  assert.equal(FOUR_CARD.replacementRule, "on_pot_win", "승리하면 교체, 패배하면 유지(§18)");
  assert.equal(FOUR_CARD.condition(makeMissionCtx({ extraHandActive: true })), true);
  assert.equal(FOUR_CARD.condition(makeMissionCtx({ extraHandActive: false })), false);
}

// ─────────────── 풀 구성: 13장(Forced Exchange 제외, Set Miner 삭제) ───────────────
{
  // §19의 Forced Exchange는 미구현이고, Set Miner는 조건이 애매해 삭제했다.
  assert.equal(MISSION_POOL.length, 13, "기본 풀은 13장이어야 한다(§4)");
  assert.ok(
    !MISSION_POOL.some((m) => m.id.includes("exchange")),
    "Forced Exchange는 타입·설정·후보 추첨 어디에도 없어야 한다(§19)",
  );
  const byCategory = MISSION_POOL.reduce<Record<string, number>>((acc, m) => {
    acc[m.category] = (acc[m.category] ?? 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(
    byCategory,
    { mission: 7, trigger: 4, enhancement: 2 },
    "미션형 7 / 발동형 4(Parasite 포함) / 강화형 2",
  );

  // 레거시 Mission id가 하나도 남아 있으면 안 된다(§24).
  for (const legacy of [
    "made_trips_plus", "made_straight_plus", "made_flush_plus", "made_full_house_plus",
    "pair_two_pair_win", "counter_block_bonus", "counter_steal", "extra_hand_omaha",
    "underdog_win", "position_win_button", "position_win_blinds", "position_showdown_win_late",
  ]) {
    assert.equal(findMissionDef(legacy), undefined, `레거시 Mission ${legacy}이 남아 있다`);
  }
}

console.log("OK: mystery card Forced Split / True Sight / Four Card");
