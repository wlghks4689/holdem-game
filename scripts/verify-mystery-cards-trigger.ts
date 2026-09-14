import assert from "node:assert/strict";
import { HAND_RANK } from "../src/holdem/pokerEval";
import {
  autoAssignPendingCardTargets,
  cardTargetCandidates,
  mysteryHoldemReducer,
} from "../src/mysteryHoldem/gameReducer";
import { resolveMissionsForHand } from "../src/mysteryHoldem/missionResolver";
import { PARASITE_MIN_REWARD, findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import {
  autoCompleteHandSetup,
  dispatch,
  makeMissionCtx,
  missionStateOf,
  mulberry32,
  startMatch,
} from "./mysteryTestHelpers";
import type { MysteryGameState, Seat } from "../src/mysteryHoldem/types";

/**
 * Cooler Insurance / Mission Breaker / Parasite + 대상 지정 시스템 검증(§5, §10, §11, §22).
 */

const COOLER = findMissionDef("cooler_insurance")!;
const BREAKER = findMissionDef("card_breaker")!;
const PARASITE = findMissionDef("parasite")!;
const FLUSH_MAKER = findMissionDef("maker_flush")!; // 180
const SET_MINER = findMissionDef("maker_set")!; // 90
const FOUR_CARD = findMissionDef("four_card")!; // 강화형

const hv = (rank: number) => ({ rank, kickers: [10, 9, 8, 7, 6] });

// ─────────────── Cooler Insurance: 등급이 더 높은 족보에게 패배 ───────────────
{
  const lost = (mine: number, theirs: number) =>
    COOLER.condition(
      makeMissionCtx({
        seat: 0,
        wonAnyPot: false,
        bestHandValue: hv(mine),
        showdownOpponents: [1],
        opponentBestHandValues: { 1: hv(theirs) },
      }),
    );

  // 유저 확정 사양: 트립스 이상에서만 발동한다(기획 원안의 투페어는 제외).
  assert.equal(lost(HAND_RANK.TWO_PAIR, HAND_RANK.TRIPS), false, "투페어는 발동 대상이 아니다");
  assert.equal(lost(HAND_RANK.TRIPS, HAND_RANK.STRAIGHT), true);
  assert.equal(lost(HAND_RANK.STRAIGHT, HAND_RANK.FLUSH), true);
  assert.equal(lost(HAND_RANK.FLUSH, HAND_RANK.FULL_HOUSE), true);

  // 같은 등급 내 강약 차이는 쿨러가 아니다(§5).
  assert.equal(lost(HAND_RANK.FLUSH, HAND_RANK.FLUSH), false, "낮은 플러시가 높은 플러시에 져도 실패");
  assert.equal(lost(HAND_RANK.TRIPS, HAND_RANK.TRIPS), false);

  // 이겼으면 발동하지 않는다.
  assert.equal(
    COOLER.condition(
      makeMissionCtx({
        wonAnyPot: true,
        bestHandValue: hv(HAND_RANK.TRIPS),
        showdownOpponents: [1],
        opponentBestHandValues: { 1: hv(HAND_RANK.FLUSH) },
      }),
    ),
    false,
  );

  // 폴드하면 실패(쇼다운까지 가야 한다).
  assert.equal(
    COOLER.condition(
      makeMissionCtx({
        wentToShowdown: false,
        folded: true,
        bestHandValue: hv(HAND_RANK.TRIPS),
        showdownOpponents: [1],
        opponentBestHandValues: { 1: hv(HAND_RANK.FLUSH) },
      }),
    ),
    false,
  );

  assert.equal(COOLER.reward, 400);
  assert.equal(COOLER.replacementRule, "on_trigger");
}

// ─────────────── Mission Breaker: 지정 상대의 미션형 성공만 막는다 ───────────────
function breakerScenario(opts: {
  targetSeat: Seat | null;
  targetCard: typeof FLUSH_MAKER;
  targetAchieves: boolean;
  targetAtShowdown?: boolean;
}) {
  const targetReachesShowdown = opts.targetAtShowdown ?? true;
  return resolveMissionsForHand([
    {
      seat: 1,
      mission: missionStateOf(opts.targetCard, 3),
      ctx: makeMissionCtx({
        seat: 1,
        wentToShowdown: targetReachesShowdown,
        wonAnyPot: true,
        extraHandActive: true,
        // 조건을 맞추거나 빗나가게 해서 "대상이 성공했는가"를 통제한다.
        bestHandValue: hv(opts.targetAchieves ? HAND_RANK.FLUSH : HAND_RANK.PAIR),
        showdownOpponents: [0],
      }),
    },
    {
      seat: 0,
      mission: missionStateOf(BREAKER, 3, opts.targetSeat),
      ctx: makeMissionCtx({
        seat: 0,
        wentToShowdown: true,
        bestHandValue: hv(HAND_RANK.HIGH_CARD),
        showdownOpponents: targetReachesShowdown ? [1] : [],
      }),
    },
  ]);
}

{
  // 지정 상대가 미션형을 성공 → 상대 0점 / Breaker +150
  const rows = breakerScenario({ targetSeat: 1, targetCard: FLUSH_MAKER, targetAchieves: true });
  const target = rows.find((r) => r.seat === 1)!;
  const breaker = rows.find((r) => r.seat === 0)!;
  assert.equal(target.achieved, true);
  assert.equal(target.reward, 0, "지정 상대의 미션 점수는 무효화된다");
  assert.equal(target.deniedReward, FLUSH_MAKER.reward);
  assert.equal(breaker.achieved, true);
  assert.equal(breaker.reward, 150);
}

{
  // 지정 상대가 미션에 실패 → Breaker도 실패
  const rows = breakerScenario({ targetSeat: 1, targetCard: FLUSH_MAKER, targetAchieves: false });
  assert.equal(rows.find((r) => r.seat === 0)!.achieved, false);
  assert.equal(rows.find((r) => r.seat === 0)!.reward, 0);
}

{
  // 지정 상대가 쇼다운에 오지 않으면 실패
  const rows = breakerScenario({
    targetSeat: 1,
    targetCard: FLUSH_MAKER,
    targetAchieves: true,
    targetAtShowdown: false,
  });
  assert.equal(rows.find((r) => r.seat === 0)!.achieved, false, "둘 다 쇼다운에 가야 성공한다");
  assert.equal(rows.find((r) => r.seat === 1)!.reward, 0, "쇼다운에 못 간 Maker는 애초에 실패다");
}

{
  // 지정하지 않았으면 실패
  const rows = breakerScenario({ targetSeat: null, targetCard: FLUSH_MAKER, targetAchieves: true });
  assert.equal(rows.find((r) => r.seat === 0)!.achieved, false);
  assert.equal(rows.find((r) => r.seat === 1)!.reward, FLUSH_MAKER.reward, "무효화도 없다");
}

{
  // 강화형(Four Card) 효과는 막지 못한다 — 미션형 카드 결과만 차단한다(§10)
  const rows = breakerScenario({ targetSeat: 1, targetCard: FOUR_CARD, targetAchieves: true });
  const target = rows.find((r) => r.seat === 1)!;
  assert.equal(target.achieved, true, "Four Card 자체는 정상 달성된다");
  assert.equal(
    rows.find((r) => r.seat === 0)!.achieved,
    false,
    "강화형을 지정한 Breaker는 성공하지 않는다",
  );
  assert.equal(target.reward, FOUR_CARD.reward, "강화형 보상은 무효화되지 않는다");
}

// ─────────────── Parasite: 대상의 원래 점수를 복제(최소 100) ───────────────
function parasiteScenario(targetCard: typeof FLUSH_MAKER, targetRank: number) {
  return resolveMissionsForHand([
    {
      seat: 1,
      mission: missionStateOf(targetCard, 3),
      ctx: makeMissionCtx({
        seat: 1,
        wonAnyPot: true,
        bestHandValue: hv(targetRank),
        showdownOpponents: [0],
      }),
    },
    {
      seat: 0,
      mission: missionStateOf(PARASITE, 3, 1),
      ctx: makeMissionCtx({
        seat: 0,
        bestHandValue: hv(HAND_RANK.HIGH_CARD),
        showdownOpponents: [1],
      }),
    },
  ]);
}

{
  // 상대 180 → Parasite 180
  const rows = parasiteScenario(FLUSH_MAKER, HAND_RANK.FLUSH);
  assert.equal(rows.find((r) => r.seat === 0)!.reward, 180);
  // 복제일 뿐 강탈이 아니다 — 원본은 그대로 받는다.
  assert.equal(rows.find((r) => r.seat === 1)!.reward, 180, "Parasite는 대상의 점수를 빼앗지 않는다");
}

{
  // 상대 90 → Parasite 최소 100
  const rows = parasiteScenario(SET_MINER, HAND_RANK.TRIPS);
  assert.equal(rows.find((r) => r.seat === 0)!.reward, PARASITE_MIN_REWARD);
  assert.equal(rows.find((r) => r.seat === 1)!.reward, 90);
}

// ─────────────── §11 연쇄: A=Breaker→B, B=Parasite→C, C=Straight Maker ───────────────
{
  const STRAIGHT_MAKER = findMissionDef("maker_straight")!; // 120
  const entries = [
    {
      seat: 2, // C
      mission: missionStateOf(STRAIGHT_MAKER, 3),
      ctx: makeMissionCtx({
        seat: 2,
        bestHandValue: hv(HAND_RANK.STRAIGHT),
        showdownOpponents: [0, 1],
      }),
    },
    {
      seat: 1, // B = Parasite → C
      mission: missionStateOf(PARASITE, 3, 2),
      ctx: makeMissionCtx({
        seat: 1,
        bestHandValue: hv(HAND_RANK.HIGH_CARD),
        showdownOpponents: [0, 2],
      }),
    },
    {
      seat: 0, // A = Breaker → B
      mission: missionStateOf(BREAKER, 3, 1),
      ctx: makeMissionCtx({
        seat: 0,
        bestHandValue: hv(HAND_RANK.HIGH_CARD),
        showdownOpponents: [1, 2],
      }),
    },
  ];

  const check = (rows: ReturnType<typeof resolveMissionsForHand>) => {
    assert.equal(rows.find((r) => r.seat === 2)!.reward, 120, "C는 Straight Maker 점수를 정상 획득");
    assert.equal(rows.find((r) => r.seat === 1)!.reward, 0, "B의 Parasite는 Break당해 0점");
    assert.equal(rows.find((r) => r.seat === 0)!.reward, 150, "A는 Breaker 성공 +150");
  };

  check(resolveMissionsForHand(entries));
  // 결정론: 좌석 순서를 어떻게 넣어도 같은 답이 나와야 한다(§20, §21).
  check(resolveMissionsForHand([...entries].reverse()));
  check(resolveMissionsForHand([entries[1]!, entries[2]!, entries[0]!]));
}

// ─────────────── 대상 지정 시스템(§22) ───────────────
{
  // 지정형 카드 보유자는 플랍에서 대상을 고르기 전까지 액션할 수 없다.
  const rng = mulberry32(7);
  let state = startMatch(4, rng);
  state = autoCompleteHandSetup(state, rng);

  // 전원에게 Mission Breaker를 쥐여주고(지정이 필요한 상태) 프리플랍을 콜로 마감한다.
  state = {
    ...state,
    players: state.players.map((p) => ({ ...p, mission: missionStateOf(BREAKER) })),
  };
  let guard = 0;
  while (state.phase === "preflop" && state.toActSeat != null && guard++ < 30) {
    const seat = state.toActSeat;
    const p = state.players.find((x) => x.seat === seat)!;
    const facing = state.betting.currentLevel - p.streetContribution;
    // 여기서는 자동 지정을 우회해야 하므로 리듀서를 직접 호출한다.
    state = mysteryHoldemReducer(
      state,
      facing > 1e-9 ? { type: "CALL", seat } : { type: "CHECK", seat },
      rng,
    );
  }

  assert.equal(state.phase, "flop", "플랍까지 진행되어야 한다");
  assert.equal(
    state.awaitingCardTarget.length,
    state.players.filter((p) => p.inHand && !p.folded).length,
    "지정형 카드 보유자 전원이 대기 목록에 올라야 한다",
  );

  const actor = state.toActSeat!;
  assert.ok(state.awaitingCardTarget.includes(actor));

  // 지정 전에는 액션이 거부된다(상태가 그대로 돌아온다).
  const blocked = mysteryHoldemReducer(state, { type: "CHECK", seat: actor }, rng);
  assert.strictEqual(blocked, state, "대상 지정 전에는 액션이 막혀야 한다");

  // 자기 자신은 지정할 수 없다.
  const candidates = cardTargetCandidates(state, actor);
  assert.ok(!candidates.includes(actor), "자기 자신은 지정 후보가 아니다");
  const self = mysteryHoldemReducer(
    state,
    { type: "SELECT_CARD_TARGET", seat: actor, targetSeat: actor },
    rng,
  );
  assert.strictEqual(self, state, "자기 자신 지정은 거부된다");

  // 정상 지정 후에는 액션이 통과한다.
  const target = candidates[0]!;
  state = mysteryHoldemReducer(
    state,
    { type: "SELECT_CARD_TARGET", seat: actor, targetSeat: target },
    rng,
  );
  assert.equal(state.players.find((p) => p.seat === actor)!.mission!.targetSeat, target);
  assert.ok(!state.awaitingCardTarget.includes(actor));

  const acted = mysteryHoldemReducer(state, { type: "CHECK", seat: actor }, rng);
  assert.notStrictEqual(acted, state, "지정 후에는 액션이 통과해야 한다");
}

// ─────────────── 지정은 한 핸드 동안만 유효하다 ───────────────
{
  const rng = mulberry32(9);
  let state = startMatch(3, rng);
  state = autoCompleteHandSetup(state, rng);
  state = {
    ...state,
    players: state.players.map((p) => ({ ...p, mission: missionStateOf(BREAKER, 1, 1) })),
  };
  const staged: MysteryGameState = { ...state, phase: "hand_over" };
  const next = dispatch(staged, { type: "START_NEXT_HAND" }, rng);
  for (const p of next.players) {
    assert.equal(p.mission?.targetSeat ?? null, null, "새 핸드에서는 지정이 초기화되어야 한다");
  }
  assert.deepEqual(next.awaitingCardTarget, [], "지정 대기 목록도 초기화된다");
}

// ─────────────── 자동 지정 헬퍼는 팟에 남은 상대만 고른다 ───────────────
{
  const rng = mulberry32(13);
  let state = startMatch(4, rng);
  state = autoCompleteHandSetup(state, rng);
  state = {
    ...state,
    phase: "flop",
    awaitingCardTarget: [0],
    players: state.players.map((p) =>
      p.seat === 0
        ? { ...p, mission: missionStateOf(BREAKER) }
        : p.seat === 3
          ? { ...p, folded: true }
          : p,
    ),
  };
  const assigned = autoAssignPendingCardTargets(state, rng);
  const chosen = assigned.players.find((p) => p.seat === 0)!.mission!.targetSeat;
  assert.ok(chosen != null && [1, 2].includes(chosen), `폴드한 좌석 3을 지정했다: ${chosen}`);
  assert.deepEqual(assigned.awaitingCardTarget, []);
}

console.log("OK: mystery card 발동형/지정형 (Cooler / Breaker / Parasite)");
