import { shuffle } from "@/holdem/cards";
import { HAND_RANK } from "@/holdem/pokerEval";
import { roundToTen } from "./missionRewards";
import type { MissionEvalContext, MysteryMissionDef, Seat } from "./types";

/**
 * Mystery Card 데이터 풀.
 *
 * 카드를 추가할 때 reducer의 if/else가 늘어나지 않도록, 각 카드가 스스로 조건(condition)·
 * 보상(reward/rewardFor)·교체 규칙(replacementRule)·부가 효과(onAchieved)를 들고 있는
 * 데이터 중심 설계다(§30).
 *
 * 현재 상태: **미션형 8장이 새 정의로 교체 완료**. 발동형(Cooler Insurance / Mission
 * Breaker / Forced Split)과 강화형(True Sight / Four Card), 그리고 대상 지정이 필요한
 * Parasite는 아직 레거시 정의가 남아 있고 다음 단계에서 교체한다.
 */

/**
 * High-End Maker 보상표(§9). 기존 HAND_RANK_WEIGHT 기반의 "숨은 배수" 계산을 없애고
 * 족보별 지급액을 그대로 표로 적는다 — UI에 그대로 보여줄 수 있고 밸런싱도 눈으로 읽힌다.
 */
export const HIGH_END_REWARD_BY_HAND_RANK: Record<number, number> = {
  [HAND_RANK.FULL_HOUSE]: 300,
  [HAND_RANK.QUADS]: 600,
  [HAND_RANK.STRAIGHT_FLUSH]: 1_200,
};

/**
 * Maker 계열 생성기 — "정확히 그 족보"로만 성공한다(§6~§8).
 *
 * 예전 Made 계열은 "기준 족보 이상"이라 트립스 미션이 풀하우스로도 성공했고, 그 위를
 * 보상하려고 배수를 곱했다. 이제는 구간이 겹치지 않으므로 Set Miner가 풀하우스로
 * 발전하면 실패하고, 그 영역은 High-End Maker가 맡는다.
 */
function exactMakerCard(opts: {
  id: string;
  name: string;
  description: string;
  rank: number;
  reward: number;
}): MysteryMissionDef {
  return {
    id: opts.id,
    name: opts.name,
    category: "mission",
    description: opts.description,
    trigger: "hand_result(showdown)",
    condition: (ctx) => ctx.wentToShowdown && ctx.bestHandValue?.rank === opts.rank,
    reward: opts.reward,
    replacementRule: "on_success",
  };
}

/** 이 좌석이 가져간 팟 중, 해당 팟 참가자 대비 프리플랍 랭킹이 (공동) 최하위인 팟이 있는가(§13) */
function wonAnyPotAsUnderdog(ctx: MissionEvalContext): boolean {
  return ctx.wonPots.some((pot) => {
    const rivals = pot.showdownSeats.filter((s: Seat) => s !== ctx.seat);
    // 혼자 남은 팟은 겨룰 상대가 없으므로 Underdog이라 부를 수 없다.
    if (rivals.length === 0) return false;
    // 공동 최하위도 인정하므로 "<=" 가 아니라 "나보다 낮은 상대가 없다"로 판정한다.
    return rivals.every((s: Seat) => (ctx.opponentPreflopScores[s] ?? Infinity) >= ctx.myPreflopScore);
  });
}

export const MISSION_POOL: MysteryMissionDef[] = [
  // ─────────────── 미션형(§6~§9, §12~§13, §15~§16) ───────────────
  exactMakerCard({
    id: "maker_set",
    name: "SET MINER",
    description: "쇼다운에서 최종 족보가 정확히 트립스면 성공합니다. 승패는 관계없습니다.",
    rank: HAND_RANK.TRIPS,
    reward: 90,
  }),
  exactMakerCard({
    id: "maker_straight",
    name: "STRAIGHT MAKER",
    description: "쇼다운에서 최종 족보가 정확히 스트레이트면 성공합니다. 승패는 관계없습니다.",
    rank: HAND_RANK.STRAIGHT,
    reward: 120,
  }),
  exactMakerCard({
    id: "maker_flush",
    name: "FLUSH MAKER",
    description: "쇼다운에서 최종 족보가 정확히 플러시면 성공합니다. 승패는 관계없습니다.",
    rank: HAND_RANK.FLUSH,
    reward: 180,
  }),
  {
    id: "maker_high_end",
    name: "HIGH-END MAKER",
    category: "mission",
    description:
      "쇼다운에서 풀하우스 이상을 완성합니다. 승패는 관계없고 보상은 족보에 따라 다릅니다(풀하우스 300 / 포카드 600 / 스트레이트 플러시 이상 1,200).",
    trigger: "hand_result(showdown)",
    condition: (ctx) =>
      ctx.wentToShowdown &&
      ctx.bestHandValue != null &&
      ctx.bestHandValue.rank >= HAND_RANK.FULL_HOUSE,
    // 후보 카드 UI에 한 줄로 적을 대표값. 실제 지급은 rewardFor가 결정한다.
    reward: HIGH_END_REWARD_BY_HAND_RANK[HAND_RANK.FULL_HOUSE]!,
    rewardFor: (ctx) => {
      const rank = ctx.bestHandValue?.rank;
      if (rank == null) return 0;
      // 로열 플러시는 별도 랭크가 아니라 스트레이트 플러시의 최상위라 같은 1,200으로 처리된다.
      return HIGH_END_REWARD_BY_HAND_RANK[rank] ?? 0;
    },
    replacementRule: "on_success",
  },
  {
    id: "blind_defender",
    name: "BLIND DEFENDER",
    category: "mission",
    description:
      "SB 또는 BB 포지션에서 팟을 승리합니다. 쇼다운 승리뿐 아니라 상대 전원 폴드로 얻은 팟도 인정합니다.",
    trigger: "hand_result(win)",
    condition: (ctx) => (ctx.position === "SB" || ctx.position === "BB") && ctx.wonAnyPot,
    reward: 40,
    // 인원이 많을수록 블라인드를 지키기 어려우므로 보상도 인원에 비례한다(§12).
    // 중간 버스트로 생존자가 줄어도 값이 흔들리지 않게 "시작 인원"만 본다.
    rewardFor: (ctx) => ctx.initialSeatCount * 10,
    replacementRule: "on_success",
  },
  {
    id: "underdog",
    name: "UNDERDOG",
    category: "mission",
    description:
      "쇼다운 참가자 중 프리플랍 핸드 랭킹이 가장 낮은 상태로 팟을 승리합니다. 공동 최하위도 인정합니다.",
    trigger: "hand_result(showdown+win)",
    condition: (ctx) => ctx.wentToShowdown && ctx.wonAnyPot && wonAnyPotAsUnderdog(ctx),
    reward: 120,
    replacementRule: "on_success",
  },
  {
    id: "high_card_boss",
    name: "A HIGH LIKE A BOSS",
    category: "mission",
    description:
      "메이드 없이 하이카드 상태로 팟을 승리합니다. 상대 전원 폴드·쇼다운 승리·스플릿 모두 인정하지만, 커뮤니티 카드가 한 장도 열리지 않은 프리플랍 승리는 제외합니다.",
    trigger: "hand_result(win)",
    condition: (ctx) =>
      ctx.wonAnyPot &&
      // 프리플랍 올폴드는 제외 — 최소 플랍까지는 봐야 "하이카드로 이겼다"고 말할 수 있다(§15).
      ctx.boardRevealed >= 3 &&
      ctx.bestHandValue?.rank === HAND_RANK.HIGH_CARD,
    reward: 600,
    replacementRule: "on_success",
  },
  {
    id: "bounty_hunter",
    name: "BOUNTY HUNTER",
    category: "mission",
    description:
      "자신이 참여한 팟에서 상대를 버스트시켜 Bounty가 귀속되면, 그 Bounty Point가 3배가 됩니다. 별도의 Mission Point는 없습니다.",
    trigger: "hand_result(bounty_attributed)",
    condition: (ctx) => ctx.bountyShare > 1e-9,
    // 보상은 Mission Point가 아니라 Bounty Point 배수로 지급된다(§16).
    reward: 0,
    bountyMultiplier: 3,
    replacementRule: "on_success",
  },

  // ─────────────── 아직 교체 전인 레거시 정의(다음 단계에서 새 카드로 대체) ───────────────
  {
    id: "counter_block_bonus",
    name: "미션 브레이커",
    category: "counter",
    description: "이번 핸드에 상대가 Mission을 성공하면, 그 성공을 무효화하고 고정 보너스를 얻는다.",
    trigger: "hand_result(opponent_mission_achieved)",
    dependsOnOpponents: true,
    condition: (ctx) => ctx.opponentsAchievedThisHand.length > 0,
    reward: 20,
    onAchieved: (ctx, api) => {
      for (const seat of ctx.opponentsAchievedThisHand) api.nullifyReward(seat);
    },
  },
  {
    id: "counter_steal",
    name: "미션 강탈자",
    category: "counter",
    description:
      "이번 핸드에 Mission을 성공한 상대 중 가장 점수가 높은 한 명을 무효화하고, 그 25%를 가져온다.",
    trigger: "hand_result(opponent_mission_achieved)",
    dependsOnOpponents: true,
    condition: (ctx) => ctx.opponentsAchievedThisHand.length > 0,
    reward: 0,
    onAchieved: (ctx, api) => {
      let topSeat: number | null = null;
      let topReward = 0;
      for (const seat of ctx.opponentsAchievedThisHand) {
        const value = api.rewardOf(seat);
        if (value > topReward) {
          topReward = value;
          topSeat = seat;
        }
      }
      if (topSeat == null) return;
      api.nullifyReward(topSeat);
      api.grantBonus(roundToTen(topReward * 0.25));
    },
  },
  {
    id: "extra_hand_omaha",
    name: "FOUR CARD",
    category: "extraHand",
    description:
      "핸드 선택 후 추가 홀카드 2장을 받아 4장을 보유합니다. 쇼다운에서는 홀카드 정확히 2장 + 커뮤니티 3장으로 조합합니다.",
    trigger: "hand_result(showdown+win)",
    condition: (ctx) => ctx.extraHandActive && ctx.wentToShowdown && ctx.wonAnyPot,
    reward: 20,
    specialRule: "extra_hand_four_card",
    replacementRule: "on_pot_win",
  },
];

export function findMissionDef(id: string): MysteryMissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}

/**
 * 후보 3개 추첨(§3). 모든 Mystery Card 등장 확률은 동일하며 등급 가중치는 없다.
 * 한 후보 세트 안에서는 같은 카드가 중복 등장하지 않는다 — 풀이 3개 미만이면 있는 만큼만 반환한다.
 */
export function drawMissionCandidates(
  rng: () => number,
  count = 3,
  pool: readonly MysteryMissionDef[] = MISSION_POOL,
): MysteryMissionDef[] {
  const shuffled = shuffle([...pool], rng);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export type { MissionEvalContext };
