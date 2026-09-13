import { shuffle } from "@/holdem/cards";
import { HAND_RANK } from "@/holdem/pokerEval";
import { roundToTen } from "./missionRewards";
import { isUnderdogVersus } from "./mysteryHandRanking";
import type { MissionEvalContext, MysteryMissionDef } from "./types";

/**
 * Mystery Mission 데이터 풀(§8~§12). Mission을 추가할 때 reducer의 if/else를 늘리지 않도록
 * 각 Mission이 스스로 조건(condition)과 부가효과(onAchieved)를 들고 있는 데이터 중심 설계다.
 *
 * 보상(reward)은 전부 §31에 따라 미확정 잠정값이며 `MYSTERY_HOLDEM_CONFIG`처럼
 * 한곳(이 파일)에서만 관리해 추후 밸런싱 시 쉽게 조정할 수 있게 했다.
 */

/**
 * Made 계열 Mission 생성기. 기준 족보 하나만 선언하면 조건·보상 계수 처리가 전부 따라온다.
 * 높은 족보로 달성하면 `missionRewards.ts`의 계수가 곱해지므로, 포카드/스트레이트 플러시를
 * 위한 별도 초희귀 Mission을 만들 필요가 없다(오히려 EV가 역전돼 함정 선택지가 된다).
 */
function madeMission(opts: {
  id: string;
  name: string;
  description: string;
  threshold: number;
  reward: number;
}): MysteryMissionDef {
  return {
    id: opts.id,
    name: opts.name,
    category: "made",
    description: opts.description,
    trigger: "hand_result(showdown)",
    condition: (ctx) =>
      ctx.wentToShowdown && ctx.bestHandValue != null && ctx.bestHandValue.rank >= opts.threshold,
    reward: opts.reward,
    madeHandThreshold: opts.threshold,
  };
}

export const MISSION_POOL: MysteryMissionDef[] = [
  // ── Made 계열(§12): 기준 족보는 달성 가능한 선까지만 두고, 그 위로는 계수로 보상한다.
  // 기본 보상은 "쇼다운 도달 시 기대값"이 서로 비슷해지도록 맞춘 잠정값이다(§31).
  madeMission({
    id: "made_trips_plus",
    name: "트립스 헌터",
    description: "쇼다운에서 트립스 이상을 완성한다.",
    threshold: HAND_RANK.TRIPS,
    reward: 70,
  }),
  madeMission({
    id: "made_straight_plus",
    name: "스트레이트 헌터",
    description: "쇼다운에서 스트레이트 이상을 완성한다.",
    threshold: HAND_RANK.STRAIGHT,
    reward: 100,
  }),
  madeMission({
    id: "made_flush_plus",
    name: "플러시 헌터",
    description: "쇼다운에서 플러시 이상을 완성한다.",
    threshold: HAND_RANK.FLUSH,
    reward: 190,
  }),
  madeMission({
    id: "made_full_house_plus",
    name: "풀하우스 헌터",
    description: "쇼다운에서 풀하우스 이상을 완성한다. 포카드(×2)·스트레이트 플러시(×4)는 보너스 배수.",
    threshold: HAND_RANK.FULL_HOUSE,
    reward: 270,
  }),

  // ── Pair 계열: "정확히 그 족보로" + "승리까지" 두 조건을 모두 요구해 체감 난도가 높다(§12).
  // 원페어 클로저는 난도 대비 보상 설계를 다시 잡기로 하고 일단 풀에서 제외했다.
  {
    id: "pair_two_pair_win",
    name: "투페어 클로저",
    category: "pair",
    description: "투페어로 팟을 승리한다.",
    trigger: "hand_result(showdown+win)",
    condition: (ctx) =>
      ctx.wentToShowdown && ctx.wonAnyPot && ctx.bestHandValue?.rank === HAND_RANK.TWO_PAIR,
    reward: 110,
  },

  // ── Counter 계열: 상대 Mission 성공에 반응(§12, 상호작용은 §31 미확정 — 잠정 구현) ──
  {
    id: "counter_block_bonus",
    name: "미션 브레이커",
    category: "counter",
    description: "이번 핸드에 상대가 Mission을 성공하면, 그 성공을 무효화하고 고정 보너스를 얻는다.",
    trigger: "hand_result(opponent_mission_achieved)",
    condition: (ctx) => ctx.opponentsAchievedThisHand.length > 0,
    // 이 Mission의 진짜 가치는 획득 점수가 아니라 "상대 점수를 지우는 것"이다
    // (실측 무효화 평균 92점). 달성한 상대 "전원"을 지우는 대신 직접 획득분은 낮게 유지한다.
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
    condition: (ctx) => ctx.opponentsAchievedThisHand.length > 0,
    reward: 0,
    /**
     * 미션 브레이커와의 차별화: 브레이커는 "달성한 상대 전원"을 지우는 광역 방해,
     * 강탈자는 "가장 큰 한 명"만 지우는 대신 그 일부를 직접 가져간다.
     * (둘 다 전원을 지우면 강탈자가 브레이커의 완전한 상위호환이 되어 선택지가 죽는다.)
     */
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

  // ── Extra Hand 계열: 규칙 자체를 변경(§12) ──
  {
    id: "extra_hand_omaha",
    name: "확장 핸드",
    category: "extraHand",
    description: "카드 2장을 추가로 받아 홀카드 4장 중 정확히 2장으로 쇼다운에서 승리한다.",
    trigger: "hand_result(showdown+win)",
    // 홀카드 4장 자체가 이미 큰 우위라 실측 달성률이 36%로 가장 높았다. 규칙 변경이 곧
    // 보상인 Mission이므로 포인트 보상은 낮게 유지한다.
    condition: (ctx) => ctx.extraHandActive && ctx.wentToShowdown && ctx.wonAnyPot,
    reward: 20,
    specialRule: "extra_hand_four_card",
  },

  // ── Underdog 계열: 전용 프리플랍 랭킹 사용(§12) ──
  {
    id: "underdog_win",
    name: "언더독",
    category: "underdog",
    description: "프리플랍 기준 나보다 강한 상대를 쇼다운에서 꺾고 승리한다.",
    trigger: "hand_result(showdown+win)",
    condition: (ctx) =>
      ctx.wentToShowdown &&
      ctx.wonAnyPot &&
      ctx.showdownOpponents.some((seat) =>
        isUnderdogVersus(ctx.myPreflopScore, ctx.opponentPreflopScores[seat] ?? -Infinity),
      ),
    reward: 60,
  },

  // ── Position 계열(§12) ──
  {
    id: "position_win_button",
    name: "윈 더 버튼",
    category: "position",
    description: "버튼(BTN) 포지션에서 팟을 승리한다.",
    trigger: "hand_result(win)",
    condition: (ctx) => ctx.position === "BTN" && ctx.wonAnyPot,
    reward: 170,
  },
  {
    id: "position_win_blinds",
    name: "블라인드 사수",
    category: "position",
    description: "블라인드(SB/BB) 포지션에서 팟을 승리한다.",
    trigger: "hand_result(win)",
    condition: (ctx) => (ctx.position === "SB" || ctx.position === "BB") && ctx.wonAnyPot,
    reward: 40,
  },
  {
    id: "position_showdown_win_late",
    name: "레이트 포지션 마스터",
    category: "position",
    // 시뮬레이션 결과 CO/HJ만으로 한정하면 6인 이하 테이블에서 해당 포지션이 거의 생기지
    // 않아 달성률이 0%였다. 레이트 포지션의 정의에 BTN을 포함해 실제로 달성 가능하게 한다.
    description: "레이트 포지션(BTN/CO/HJ)에서 쇼다운으로 팟을 승리한다.",
    trigger: "hand_result(showdown+win)",
    condition: (ctx) =>
      (ctx.position === "BTN" || ctx.position === "CO" || ctx.position === "HJ") &&
      ctx.wentToShowdown &&
      ctx.wonAnyPot,
    reward: 220,
  },
];

export function findMissionDef(id: string): MysteryMissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}

/**
 * 후보 3개 추첨(§9, §11). 모든 Mission 등장 확률은 동일하며 등급 가중치는 없다.
 * §31 미확정 사항이라 "한 후보 세트 내 중복 비허용"을 기본값으로 선택했다(동일 Mission이
 * 3개 후보 중 2번 뜨는 것을 방지) — 풀이 3개 미만이면 있는 만큼만 반환한다.
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
