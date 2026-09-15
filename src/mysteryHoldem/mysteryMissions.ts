import { shuffle } from "@/holdem/cards";
import { HAND_RANK, compareHandValue } from "@/holdem/pokerEval";
import type { MissionEvalContext, MysteryMissionDef, Seat } from "./types";

/**
 * Mystery Card 데이터 풀.
 *
 * 카드를 추가할 때 reducer의 if/else가 늘어나지 않도록, 각 카드가 스스로 조건(condition)·
 * 보상(reward/rewardFor)·교체 규칙(replacementRule)·부가 효과(onAchieved)를 들고 있는
 * 데이터 중심 설계다(§30).
 *
 * 13장. 미션형 6 / 발동형 5 / 강화형 2.
 *
 * Set Miner는 삭제했다 — "정확히 트립스"라는 조건이 애매한 데다 기대 점수도 낮았다.
 */

/**
 * Parasite 추가 점수(§11). 대상의 미션 점수를 그대로 복제한 뒤 이만큼 더 얹는다.
 * 하한(최소 100점) 방식에서 바뀐 값이다 — 복제만으로는 "지정하고 쇼다운까지 간" 값을
 * 치르고도 원본과 같은 점수라, 굳이 이 카드를 고를 이유가 없었다.
 */
export const PARASITE_BONUS_REWARD = 150;

/**
 * High-End Maker 보상표(§9). 기존 HAND_RANK_WEIGHT 기반의 "숨은 배수" 계산을 없애고
 * 족보별 지급액을 그대로 표로 적는다 — UI에 그대로 보여줄 수 있고 밸런싱도 눈으로 읽힌다.
 */
export const HIGH_END_REWARD_BY_HAND_RANK: Record<number, number> = {
  [HAND_RANK.FULL_HOUSE]: 350,
  [HAND_RANK.QUADS]: 600,
  [HAND_RANK.STRAIGHT_FLUSH]: 1_000,
};

/**
 * Maker 계열 생성기 — 기준 족보로 성공한다(§6~§8).
 *
 * 예전 Made 계열은 "기준 족보 이상"이라 트립스 미션이 풀하우스로도 성공했고, 그 위를
 * 보상하려고 배수를 곱했다. 지금은 구간을 나눠 Set Miner가 풀하우스로 발전하면 실패하고,
 * 그 영역은 High-End Maker가 맡는다.
 *
 * 스트레이트 플러시만 예외다(includeStraightFlush). 스티플은 스트레이트이면서 플러시인데,
 * 이걸 실패로 처리하면 "노리던 것을 더 크게 만들었더니 미션이 깨지는" 함정이 된다.
 * 족보를 노리다 완성한 사람이 손해를 보는 규칙은 카드의 목적과 정면으로 어긋난다.
 *
 * 또한 **내 홀카드가 실제로 쓰인 족보**여야 한다(improvesOnBoard). 보드에 스트레이트가
 * 깔려 모두가 그 보드를 그대로 쓰는 핸드에서는 아무것도 하지 않은 사람까지 성공해 버린다.
 */
function exactMakerCard(opts: {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  rank: number;
  reward: number;
  includeStraightFlush?: boolean;
}): MysteryMissionDef {
  return {
    id: opts.id,
    name: opts.name,
    category: "mission",
    description: opts.description,
    shortDescription: opts.shortDescription,
    trigger: "hand_result(showdown)",
    condition: (ctx) => {
      if (!ctx.wentToShowdown || ctx.bestHandValue == null) return false;
      if (!ctx.improvesOnBoard) return false;
      const rank = ctx.bestHandValue.rank;
      if (rank === opts.rank) return true;
      return opts.includeStraightFlush === true && rank === HAND_RANK.STRAIGHT_FLUSH;
    },
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
    id: "maker_straight",
    name: "STRAIGHT MAKER",
    description:
      "스트레이트 플러시 메이드 시에도 인정. 승패는 관계없이 최종 쇼다운에서 자신의 홀 카드를 사용한 최종 족보가 스트레이트면 성공합니다. (단 보드 플러시, 보드 풀 하우스 등 커뮤니티 카드의 더 높은 made가 완성되어 내 족보가 지워지는 경우는 인정되지 않습니다.)",
    shortDescription: "스트레이트를 메이드 후 쇼다운 된 경우 성공",
    rank: HAND_RANK.STRAIGHT,
    reward: 180,
    includeStraightFlush: true,
  }),
  exactMakerCard({
    id: "maker_flush",
    name: "FLUSH MAKER",
    description:
      "스트레이트 플러시 메이드 시에도 인정. 승패는 관계없이 최종 쇼다운에서 자신의 홀 카드를 사용한 최종 족보가 플러시면 성공합니다. (단 보드 풀 하우스, 보드 포카드 등 커뮤니티 카드의 더 높은 made가 완성되어 내 족보가 지워지는 경우는 인정되지 않습니다.)",
    shortDescription: "플러시를 메이드 후 쇼다운 된 경우 성공",
    rank: HAND_RANK.FLUSH,
    reward: 240,
    includeStraightFlush: true,
  }),
  {
    id: "maker_high_end",
    name: "HIGH-END MAKER",
    category: "mission",
    description:
      "쇼다운에서 풀하우스 이상을 완성합니다. 승패는 관계없고 보상은 족보에 따라 다릅니다(풀하우스 350 / 포카드 600 / 스트레이트 플러시 이상 1,000).",
    shortDescription: "쇼다운에서 풀하우스 이상을 완성하세요. 승패는 관계없습니다.",
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
    shortDescription: "SB 또는 BB 포지션에서 팟을 이기세요. 상대 전원 폴드도 성공.",
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
      "쇼다운 참가자 중 프리플랍 핸드 랭킹이 가장 낮은 상태로 팟을 승리합니다. 공동 최하위도 인정합니다. 게임 내 핸드 랭킹을 기준으로 합니다.",
    shortDescription: "함께 쇼다운 된 핸드 중 프리플랍 핸드가 가장 약한 상태로 팟을 승리하면 성공",
    trigger: "hand_result(showdown+win)",
    condition: (ctx) => ctx.wentToShowdown && ctx.wonAnyPot && wonAnyPotAsUnderdog(ctx),
    reward: 120,
    replacementRule: "on_success",
  },
  {
    id: "high_card_boss",
    name: "ACE HIGH LIKE A BOSS",
    category: "mission",
    description:
      "메이드 없이 하이카드 상태로 팟을 승리합니다. 상대 전원 폴드·쇼다운 승리·스플릿 모두 인정하지만, 프리플랍 승리는 제외합니다. (보드 족보를 포함하지 않은 하이카드만 인정됩니다.) 보상은 시작 인원에 비례합니다.",
    shortDescription: "메이드 없이 하이카드로 팟을 이기세요.",
    trigger: "hand_result(win)",
    condition: (ctx) =>
      ctx.wonAnyPot &&
      // 프리플랍 올폴드는 제외 — 최소 플랍까지는 봐야 "하이카드로 이겼다"고 말할 수 있다(§15).
      ctx.boardRevealed >= 3 &&
      // 보드 하이카드를 그대로 쓴 경우는 제외한다 — 내 홀카드가 이긴 것이 아니다.
      ctx.improvesOnBoard &&
      ctx.bestHandValue?.rank === HAND_RANK.HIGH_CARD,
    /*
      고정 보상은 인원수에 따라 EV가 5.4배까지 벌어졌다(실측: 2인 12.4 / 10인 2.3).
      인원이 적을수록 금방 헤즈업이 되어 하이카드로도 팟을 가져가기 쉽기 때문이다.
      Blind Defender와 같은 방식으로 시작 인원에 비례시킨다 — 그 카드가 실측상 인원별
      편차가 가장 작다(1.3배).

      reward는 UI 대표값(기본 4인 기준)이고 실제 지급은 rewardFor가 정한다.
    */
    reward: 400,
    rewardFor: (ctx) => ctx.initialSeatCount * 100,
    replacementRule: "on_success",
  },
  {
    id: "bounty_hunter",
    name: "BOUNTY HUNTER",
    category: "mission",
    description:
      "자신이 참여한 팟에서 상대를 버스트시켜 Bounty가 귀속되면, 그 Bounty Point가 3배가 됩니다. 별도의 Mission Point는 없습니다.",
    shortDescription: "상대를 버스트시켜 Bounty를 가져가세요.",
    trigger: "hand_result(bounty_attributed)",
    condition: (ctx) => ctx.bountyShare > 1e-9,
    // 보상은 Mission Point가 아니라 Bounty Point 배수로 지급된다(§16).
    reward: 0,
    bountyMultiplier: 3,
    replacementRule: "on_success",
  },

  // ─────────────── 발동형 / 지정형(§5, §10, §11) ───────────────
  {
    id: "cooler_insurance",
    name: "COOLER INSURANCE",
    category: "trigger",
    description:
      "트립스 이상을 들고 쇼다운에서 패배하면 보상을 받습니다. 셋 오버 셋이나 낮은 스트레이트처럼 같은 족보 안에서 밀린 경우도 인정합니다.",
    shortDescription: "트립스 이상을 들고 쇼다운에서 지면 발동합니다.",
    trigger: "hand_result(showdown+lose_to_higher_rank)",
    condition: (ctx) => {
      if (!ctx.wentToShowdown || ctx.wonAnyPot) return false;
      const mine = ctx.bestHandValue;
      // 스택까지 잃는 상황을 보상하는 카드이므로, 애초에 "쿨러"라 부를 만한 강한 패에서만 발동한다.
      if (mine == null || mine.rank < HAND_RANK.TRIPS) return false;
      // 등급 차이뿐 아니라 같은 족보 안에서 밀린 경우도 센다. 셋 오버 셋이나 낮은
      // 스트레이트로 지는 것이야말로 전형적인 쿨러인데, 등급만 비교하면 그게 전부 빠진다.
      return ctx.showdownOpponents.some((seat) => {
        const theirs = ctx.opponentBestHandValues[seat];
        return theirs != null && compareHandValue(theirs, mine) > 0;
      });
    },
    reward: 400,
    replacementRule: "on_trigger",
  },
  {
    id: "card_breaker",
    name: "MISSION BREAKER",
    category: "trigger",
    description:
      "플랍에서 상대 한 명을 지정합니다. 둘 다 쇼다운까지 가고 그 상대가 미션형 카드를 성공하면, 그 미션을 무효화하고 보상을 받습니다. 강화형·발동형 효과는 막지 못합니다.",
    shortDescription:
      "플랍에서 상대 한 명을 지정합니다. 지정한 상대가 미션을 성공한 경우 해당 플레이어의 점수 획득을 무효화하고 나만 점수를 획득합니다.",
    trigger: "hand_result(target_mission_achieved)",
    targetRule: "opponent_in_pot_at_flop",
    dependsOnOpponents: true,
    // Parasite(티어 1)의 성공까지 확정된 뒤에 판정해야 "Parasite를 Break한다"가 성립한다(§11).
    resolutionTier: 2,
    condition: (ctx) =>
      ctx.targetSeat != null &&
      ctx.wentToShowdown &&
      ctx.showdownOpponents.includes(ctx.targetSeat) &&
      ctx.opponentMissionAchievers.includes(ctx.targetSeat),
    reward: 150,
    onAchieved: (ctx, api) => {
      // 지정한 한 명만 지운다. 그 상대가 Parasite였더라도, Parasite가 바라보던 원본 미션은
      // 건드리지 않는다 — 스냅샷 기반이라 자동으로 그렇게 된다(§11).
      if (ctx.targetSeat != null) api.nullifyReward(ctx.targetSeat);
    },
    replacementRule: "on_trigger",
  },
  {
    id: "parasite",
    name: "PARASITE",
    // Mission Breaker와 동작이 대칭인 지정형이라 같은 발동형으로 묶는다. 미션형으로 두면
    // 다른 Parasite/Breaker가 이 카드를 "미션 성공"으로 보고 물어 가는 연쇄도 생긴다.
    category: "trigger",
    description:
      "플랍에서 상대 한 명을 지정합니다. 둘 다 쇼다운까지 가고 그 상대가 미션형 카드를 성공한 경우, 그 점수를 동일하게 획득하고 추가 점수 150점을 얻습니다.",
    shortDescription:
      "상대 한 명을 지정합니다. 지정한 상대가 미션을 성공하는 경우 해당 미션 점수를 획득하고 추가 점수를 얻습니다.",
    trigger: "hand_result(target_mission_achieved)",
    targetRule: "opponent_in_pot_at_flop",
    dependsOnOpponents: true,
    resolutionTier: 1,
    condition: (ctx) =>
      ctx.targetSeat != null &&
      ctx.wentToShowdown &&
      ctx.showdownOpponents.includes(ctx.targetSeat) &&
      ctx.opponentMissionAchievers.includes(ctx.targetSeat),
    // 복제액은 대상에 따라 달라지므로 onAchieved에서 지급한다. 여기 0은 "고정 보상 없음"이다.
    reward: 0,
    onAchieved: (ctx, api) => {
      if (ctx.targetSeat == null) return;
      // rewardOf는 언제나 무효화 전 스냅샷을 읽는다. Breaker가 대상을 먼저 지웠더라도
      // Parasite가 보는 값은 "원래 받았을 점수"다(§11).
      api.grantBonus(api.rewardOf(ctx.targetSeat) + PARASITE_BONUS_REWARD);
    },
    replacementRule: "on_trigger",
  },

  {
    id: "forced_split",
    name: "FORCED SPLIT",
    category: "trigger",
    description:
      "쇼다운에 참가한 플레이어의 족보가 전부 플러시 이하라면 그 팟을 강제 스플릿합니다. 참가자 중 풀하우스 이상이 있으면 적용되지 않고, 이 카드를 가진 사람이 둘 이상이면 서로 상쇄되어 보유자들은 팟을 가져가지 못합니다.",
    shortDescription: "쇼다운 된 핸드가 모두 플러시 이하면 쇼다운 된 플레이어끼리 그 팟을 스플릿 합니다.",
    trigger: "pot_resolution(showdown)",
    potRule: "forced_split",
    // 판정은 showdown.ts의 팟 단계에서 끝난다. 여기서는 "실제로 결과가 바뀌었는가"만 읽는다.
    condition: (ctx) => ctx.potRuleTriggered,
    // 추가 점수는 없다(§14). 보상은 팟 결과를 바꾸는 것 자체다.
    reward: 0,
    replacementRule: "on_trigger",
  },
  {
    id: "true_sight",
    name: "TRUE SIGHT",
    category: "enhancement",
    description:
      "플랍에 진입한 경우에만 발동됩니다. 상대는 공개 사실을 알 수 없습니다.",
    shortDescription: "플랍에 진입하면 팟에 참여한 플레이어의 Mystery Card가 나에게만 보입니다.",
    trigger: "street(flop)",
    // 폴드하면 볼 것도 없다. 플랍을 봤다면 그 핸드에 1회 지급한다(§17).
    condition: (ctx) => !ctx.folded && ctx.boardRevealed >= 3,
    // 핵심 보상은 점수가 아니라 정보이므로 점수는 낮게 유지한다.
    reward: 30,
    // 정보를 한 번 보면 그 값어치는 다 쓴 것이다 — 팟 승패와 무관하게 교체한다.
    replacementRule: "on_trigger",
  },
  {
    id: "four_card",
    name: "FOUR CARD",
    category: "enhancement",
    description:
      "핸드 선택 후 추가 홀카드 2장을 받아 4장을 보유합니다. 쇼다운에서는 홀카드 정확히 2장 + 커뮤니티 3장으로만 조합하며, 상대에게는 언제나 카드 뒷면 2장으로만 보입니다.",
    shortDescription:
      "핸드 선택 후 추가로 카드를 2장 딜링 받습니다. 쇼다운 시에는 두 장만 사용합니다.",
    trigger: "hand_setup(extra_deal)",
    // 규칙 변경 자체가 보상이다 — 별도 Mission Point는 없다(§18).
    condition: (ctx) => ctx.extraHandActive,
    reward: 0,
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
