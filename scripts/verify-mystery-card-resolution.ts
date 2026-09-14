import assert from "node:assert/strict";
import { resolveCardRewardsForHand, type CardResolutionInput } from "../src/mysteryHoldem/cardResolution";
import {
  CARD_CATEGORY_LABEL,
  cardCategoryFromLegacy,
  shouldReplaceCard,
} from "../src/mysteryHoldem/mysteryCard";
import type { MissionEvalContext, MysteryMissionDef, Seat } from "../src/mysteryHoldem/types";

/**
 * Mystery Card 판정 순서(§20~§21) 골격 검증.
 * 핵심은 "Seat 번호나 순회 순서 때문에 결과가 달라지지 않는다"이다.
 */

function ctxFor(seat: Seat): MissionEvalContext {
  return {
    seat,
    round: 1,
    buttonSeat: 0,
    position: "BTN",
    board: [],
    folded: false,
    wentToShowdown: true,
    wonAnyPot: false,
    wonPotAmount: 0,
    bestHandValue: null,
    showdownOpponents: [],
    opponentBestHandValues: {},
    myPreflopScore: 0,
    opponentPreflopScores: {},
    opponentsAchievedThisHand: [],
    extraHandActive: false,
  };
}

function missionCard(id: string, reward: number): MysteryMissionDef {
  return {
    id,
    name: id,
    category: "made",
    description: "",
    trigger: "",
    condition: () => true,
    reward,
  };
}

/** 성공한 상대 전원을 무효화하는 발동형(기존 Mission Breaker와 같은 형태) */
function breakerCard(id: string): MysteryMissionDef {
  return {
    id,
    name: id,
    category: "counter",
    description: "",
    trigger: "",
    condition: (ctx) => ctx.opponentsAchievedThisHand.length > 0,
    reward: 150,
    onAchieved: (ctx, api) => {
      for (const seat of ctx.opponentsAchievedThisHand) api.nullifyReward(seat);
    },
  };
}

/** 가장 점수 높은 상대를 무효화하고 그 절반을 가져오는 발동형(Parasite/Stealer 형태) */
function parasiteCard(id: string): MysteryMissionDef {
  return {
    id,
    name: id,
    category: "counter",
    description: "",
    trigger: "",
    condition: (ctx) => ctx.opponentsAchievedThisHand.length > 0,
    reward: 0,
    onAchieved: (ctx, api) => {
      let top: Seat | null = null;
      let topReward = 0;
      for (const seat of ctx.opponentsAchievedThisHand) {
        const v = api.rewardOf(seat);
        if (v > topReward) {
          topReward = v;
          top = seat;
        }
      }
      if (top == null) return;
      api.nullifyReward(top);
      api.grantBonus(Math.round(topReward / 2));
    },
  };
}

function entry(seat: Seat, def: MysteryMissionDef): CardResolutionInput {
  return { seat, mission: { def, assignedRound: 1, achieved: false }, ctx: ctxFor(seat) };
}

// ── 좌석 순서를 바꿔도 결과가 같아야 한다 ──
{
  const build = (): CardResolutionInput[] => [
    entry(0, missionCard("maker_a", 200)),
    entry(1, breakerCard("breaker")),
    entry(2, missionCard("maker_b", 90)),
    entry(3, parasiteCard("parasite")),
  ];

  const forward = resolveCardRewardsForHand(build());
  const reversed = resolveCardRewardsForHand([...build()].reverse());
  const shuffled = resolveCardRewardsForHand([build()[2]!, build()[0]!, build()[3]!, build()[1]!]);

  const bySeat = (rows: ReturnType<typeof resolveCardRewardsForHand>) =>
    Object.fromEntries(rows.map((r) => [r.seat, `${r.achieved}/${r.reward}/${r.nullified}/${r.deniedReward}`]));

  assert.deepEqual(bySeat(reversed), bySeat(forward), "좌석 순서를 뒤집어도 결과가 같아야 한다");
  assert.deepEqual(bySeat(shuffled), bySeat(forward), "임의 순서에서도 결과가 같아야 한다");
}

// ── Parasite는 Breaker가 지우기 전의 "원래" 보상을 읽어야 한다(§21) ──
// 이전 구현에서는 Breaker가 먼저 돌면 보상 맵이 이미 0이라, Parasite가 0을 읽어
// 아무것도 가져오지 못했다. 스냅샷을 읽으면 실행 순서와 무관하게 200을 본다.
{
  const rows = resolveCardRewardsForHand([
    entry(0, missionCard("big", 200)),
    entry(1, breakerCard("breaker")),
    entry(2, parasiteCard("parasite")),
  ]);
  const maker = rows.find((r) => r.seat === 0)!;
  const parasite = rows.find((r) => r.seat === 2)!;

  assert.equal(maker.originalReward, 200, "원래 보상 스냅샷은 무효화 전 값이어야 한다");
  assert.equal(maker.reward, 0, "Breaker/Parasite 양쪽에게 무효화되어 0점");
  assert.equal(maker.deniedReward, 200, "지워진 점수가 기록되어야 한다");
  assert.equal(
    parasite.reward,
    100,
    "Breaker가 먼저 지웠더라도 Parasite는 원래 보상 200을 읽어 절반인 100을 가져와야 한다",
  );
}

// ── 무효화된 좌석은 복제 보너스까지 함께 잃는다 ──
// (Breaker가 Parasite 자신을 지정하는 §11 상호작용은 Target 지정 시스템과 함께 다음 단계에서
//  다룬다. 여기서는 "무효화 대상이 되면 보너스도 사라진다"는 합산 규칙만 확인한다.)
{
  const selfNullify: MysteryMissionDef = {
    id: "self_nullify",
    name: "self",
    category: "counter",
    description: "",
    trigger: "",
    condition: () => true,
    reward: 0,
    onAchieved: (_ctx, api) => {
      api.grantBonus(80);
      api.nullifyReward(2); // 자기 자신(seat 2)을 대상으로 지정
    },
  };
  const rows = resolveCardRewardsForHand([entry(0, missionCard("x", 50)), entry(2, selfNullify)]);
  const target = rows.find((r) => r.seat === 2)!;
  assert.equal(target.reward, 0, "무효화되면 보너스까지 0");
  assert.equal(target.deniedReward, 80, "잃은 금액에 보너스가 포함되어야 한다");
}

// ── 무효화가 없으면 복제 보너스가 그대로 지급된다 ──
{
  const rows = resolveCardRewardsForHand([
    entry(0, missionCard("big", 200)),
    entry(1, parasiteCard("parasite")),
  ]);
  assert.equal(rows.find((r) => r.seat === 1)!.reward, 100, "원래 200의 절반을 가져온다");
  assert.equal(rows.find((r) => r.seat === 0)!.reward, 0, "가로채인 쪽은 0점");
}

// ── 상호작용이 없으면 원래 보상이 그대로 ──
{
  const rows = resolveCardRewardsForHand([entry(0, missionCard("solo", 120))]);
  assert.equal(rows[0]!.achieved, true);
  assert.equal(rows[0]!.originalReward, 120);
  assert.equal(rows[0]!.reward, 120);
  assert.equal(rows[0]!.nullified, false);
}

// ── 카드 교체 규칙(§3, §20 Phase 6) ──
{
  const outcome = { achieved: false, wonAnyPot: true, triggered: false };
  assert.equal(shouldReplaceCard({ rule: "on_success", outcome, isRegularChangeRound: false }), false);
  assert.equal(shouldReplaceCard({ rule: "on_pot_win", outcome, isRegularChangeRound: false }), true);
  assert.equal(shouldReplaceCard({ rule: "on_trigger", outcome, isRegularChangeRound: false }), false);
  assert.equal(shouldReplaceCard({ rule: "regular_round_only", outcome, isRegularChangeRound: false }), false);

  // 정규 변경 라운드는 규칙·승패와 무관하게 항상 교체한다.
  for (const rule of ["on_success", "on_pot_win", "on_trigger", "regular_round_only"] as const) {
    assert.equal(
      shouldReplaceCard({ rule, outcome: { achieved: false, wonAnyPot: false, triggered: false }, isRegularChangeRound: true }),
      true,
      `${rule}도 정규 변경 라운드에서는 교체되어야 한다`,
    );
  }
}

// ── 카테고리 어휘 ──
{
  assert.equal(CARD_CATEGORY_LABEL.mission, "미션형");
  assert.equal(CARD_CATEGORY_LABEL.enhancement, "강화형");
  assert.equal(CARD_CATEGORY_LABEL.trigger, "발동형");
  assert.equal(cardCategoryFromLegacy("counter"), "trigger");
  assert.equal(cardCategoryFromLegacy("extraHand"), "enhancement");
  assert.equal(cardCategoryFromLegacy("made"), "mission");
  assert.equal(cardCategoryFromLegacy("position"), "mission");
}

console.log("OK: mystery card resolution order");
