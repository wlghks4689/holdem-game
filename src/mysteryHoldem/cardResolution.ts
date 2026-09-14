import { resolveMissionReward } from "./missionRewards";
import type { MissionEffectApi, MissionEvalContext, PlayerMissionState, Seat } from "./types";

/**
 * Mystery Card 보상 판정 파이프라인(§20 Phase 2~3, §21).
 *
 * 핵심 요구사항은 **결정론**이다. Seat 1이 Mission Breaker이고 Seat 7이 Parasite라는
 * 이유만으로 결과가 달라져서는 안 된다. 그래서 다음 순서를 강제한다.
 *
 *   Step A. 모든 플레이어의 "원래" 성공 여부와 보상을 계산한다(상호작용 없음).
 *   Step B. 그 결과를 스냅샷으로 얼린다.
 *   Step C. Target 기반 효과(무효화·복제)를 계산한다. 이때 카드들이 읽는 값은 언제나
 *           Step B의 스냅샷이다 — 다른 카드가 이미 바꿔 놓은 값을 읽지 않는다.
 *   Step D. 모아둔 효과를 한 번에 반영해 최종 보상을 만든다.
 *
 * 이전 구현은 Step C/D가 뒤섞여 있었다. onAchieved 훅이 좌석 순서대로 돌면서 보상 맵을
 * 실시간으로 수정했기 때문에, 먼저 실행된 Breaker가 0으로 만든 값을 나중의 Stealer가
 * 읽어 "가장 점수 높은 상대"를 잘못 고르는 식의 순서 의존이 있었다.
 */

export interface CardResolutionInput {
  seat: Seat;
  mission: PlayerMissionState;
  ctx: MissionEvalContext;
}

export interface CardResolutionEntry {
  seat: Seat;
  achieved: boolean;
  /** Counter 효과 반영 전 원래 보상 — Parasite류가 복제할 때 기준이 되는 값(§11) */
  originalReward: number;
  /** 이번 핸드 최종 지급 Mission Point(무효화·가로채기 반영 후) */
  reward: number;
  nullified: boolean;
  /**
   * 무효화로 잃은 점수(= 무효화가 없었다면 받았을 금액).
   * Counter 계열의 실제 가치는 "내가 얻은 점수"가 아니라 "상대에게서 지운 점수"에 있으므로,
   * 밸런싱 때 이 값을 같이 봐야 한다.
   */
  deniedReward: number;
}

export function resolveCardRewardsForHand(
  entries: readonly CardResolutionInput[],
): CardResolutionEntry[] {
  // ── Step A: 자기 결과에만 의존하는 카드부터 판정 ──
  // counter 계열은 "상대가 성공했는가"를 봐야 하므로 뒤로 미룬다.
  const achieved = new Map<Seat, boolean>();
  const dependsOnOpponents = (e: CardResolutionInput) =>
    e.mission.def.dependsOnOpponents === true || e.mission.def.category === "counter";

  for (const e of entries) {
    if (dependsOnOpponents(e)) continue;
    achieved.set(e.seat, e.mission.def.condition(e.ctx));
  }
  const selfAchievedSeats = [...achieved.entries()].filter(([, ok]) => ok).map(([seat]) => seat);

  const ctxWithOpponents = (e: CardResolutionInput): MissionEvalContext => ({
    ...e.ctx,
    opponentsAchievedThisHand: selfAchievedSeats.filter((s) => s !== e.seat),
  });

  for (const e of entries) {
    if (!dependsOnOpponents(e)) continue;
    achieved.set(e.seat, e.mission.def.condition(ctxWithOpponents(e)));
  }

  // ── Step B: 원래 보상 스냅샷(불변) ──
  const originalReward = new Map<Seat, number>();
  for (const e of entries) {
    originalReward.set(e.seat, achieved.get(e.seat) ? resolveMissionReward(e.mission.def, e.ctx) : 0);
  }
  const snapshot: ReadonlyMap<Seat, number> = originalReward;

  // ── Step C: Target 효과 수집 — 적용하지 않고 모으기만 한다 ──
  const nullifyRequests = new Set<Seat>();
  const bonusBySeat = new Map<Seat, number>();
  for (const e of entries) {
    if (!achieved.get(e.seat) || e.mission.def.onAchieved == null) continue;
    const api: MissionEffectApi = {
      nullifyReward: (targetSeat) => {
        nullifyRequests.add(targetSeat);
      },
      grantBonus: (amount) => {
        bonusBySeat.set(e.seat, (bonusBySeat.get(e.seat) ?? 0) + amount);
      },
      // 항상 스냅샷을 읽는다. 이것이 순서 의존을 없애는 핵심이다.
      rewardOf: (seat) => snapshot.get(seat) ?? 0,
    };
    e.mission.def.onAchieved(ctxWithOpponents(e), api);
  }

  // ── Step D: 한 번에 반영 ──
  // 무효화된 좌석은 원래 보상도, 복제로 얻은 보너스도 모두 잃는다(§11 예시: Parasite가
  // Break당하면 0점, 단 Parasite가 바라보던 원본 Mission은 그대로 살아 있다).
  return entries.map((e) => {
    const base = snapshot.get(e.seat) ?? 0;
    const bonus = bonusBySeat.get(e.seat) ?? 0;
    const wouldHaveEarned = base + bonus;
    const nullified = nullifyRequests.has(e.seat);
    return {
      seat: e.seat,
      achieved: achieved.get(e.seat) ?? false,
      originalReward: base,
      reward: nullified ? 0 : wouldHaveEarned,
      nullified,
      deniedReward: nullified ? wouldHaveEarned : 0,
    };
  });
}
