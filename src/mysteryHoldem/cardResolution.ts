import { resolveMissionReward } from "./missionRewards";
import { cardCategoryFromLegacy } from "./mysteryCard";
import type {
  MissionEffectApi,
  MissionEvalContext,
  MysteryMissionDef,
  PlayerMissionState,
  Seat,
} from "./types";

/** 판정 티어(§21). 명시가 없으면 상대 의존 여부로 0/1을 고른다. */
function tierOf(def: MysteryMissionDef): number {
  if (def.resolutionTier != null) return def.resolutionTier;
  return def.dependsOnOpponents === true || def.category === "counter" ? 1 : 0;
}

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
  // 티어 순서대로 확정한다. 각 티어는 "자기보다 낮은 티어에서 이미 확정된 결과"만 본다.
  // 이렇게 해야 §11의 A=Breaker→B, B=Parasite→C 연쇄가 좌석 번호와 무관하게 같은 답을 낸다.
  const achieved = new Map<Seat, boolean>();
  const confirmedAchievers: Seat[] = [];
  const isMissionCard = (e: CardResolutionInput) =>
    cardCategoryFromLegacy(e.mission.def.category) === "mission";

  const ctxFor = (e: CardResolutionInput): MissionEvalContext => ({
    ...e.ctx,
    opponentsAchievedThisHand: confirmedAchievers.filter((s) => s !== e.seat),
    opponentMissionAchievers: confirmedAchievers.filter(
      (s) => s !== e.seat && entries.some((x) => x.seat === s && isMissionCard(x)),
    ),
    targetSeat: e.mission.targetSeat,
  });

  // 판정에 쓴 컨텍스트를 좌석별로 얼려 둔다. Step C의 부가 효과는 "자기 조건이 참이라고
  // 판단했을 때 본 세계"와 똑같은 것을 봐야 한다 — 나중 티어가 확정되면서 목록이 늘어난 뒤의
  // 컨텍스트를 읽으면, 조건은 A만 보고 통과했는데 효과는 A와 B를 건드리는 불일치가 생긴다.
  const frozenCtx = new Map<Seat, MissionEvalContext>();

  const tiers = [...new Set(entries.map((e) => tierOf(e.mission.def)))].sort((a, b) => a - b);
  for (const tier of tiers) {
    const inTier = entries.filter((e) => tierOf(e.mission.def) === tier);
    // 같은 티어끼리는 서로의 결과를 보지 않는다 — 먼저 전부 판정한 뒤 한 번에 공개한다.
    const results = inTier.map((e) => {
      const ctx = ctxFor(e);
      frozenCtx.set(e.seat, ctx);
      return [e.seat, e.mission.def.condition(ctx)] as const;
    });
    for (const [seat, ok] of results) {
      achieved.set(seat, ok);
      if (ok) confirmedAchievers.push(seat);
    }
  }

  const ctxWithOpponents = (e: CardResolutionInput): MissionEvalContext =>
    frozenCtx.get(e.seat) ?? ctxFor(e);

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
