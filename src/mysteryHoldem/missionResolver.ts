import type { MissionEffectApi, MissionEvalContext, PlayerMissionState, Seat } from "./types";

export interface MissionResolutionEntry {
  seat: Seat;
  achieved: boolean;
  /** 이번 핸드 최종 지급 Mission Point(무효화·가로채기 반영 후) */
  reward: number;
  nullified: boolean;
}

export interface MissionResolutionInput {
  seat: Seat;
  mission: PlayerMissionState;
  ctx: MissionEvalContext;
}

/**
 * 한 핸드 종료 시점에 활성 Mission을 보유한 모든 플레이어의 조건을 일괄 판정한다.
 * Mission을 추가할 때마다 이 함수를 수정할 필요가 없도록(§8, §26) 판정은 전적으로
 * 각 Mission 정의(`condition`/`onAchieved`)에 위임하고, 여기서는 패스 순서만 조율한다.
 *
 * Pass 1: made/pair/underdog/position/extraHand 등 "자기 결과"에만 의존하는 Mission 판정.
 * Pass 2: counter 계열 판정(§12) — Pass 1에서 달성한 상대 목록을 `opponentsAchievedThisHand`로 주입.
 * Pass 3: 기본 보상 확정.
 * Pass 4: `onAchieved` 부가효과(상대 보상 무효화·가로채기) 적용.
 */
export function resolveMissionsForHand(
  entries: readonly MissionResolutionInput[],
): MissionResolutionEntry[] {
  const achieved = new Map<Seat, boolean>();

  for (const e of entries) {
    if (e.mission.def.category === "counter") continue;
    achieved.set(e.seat, e.mission.def.condition(e.ctx));
  }
  const nonCounterAchievedSeats = [...achieved.entries()]
    .filter(([, ok]) => ok)
    .map(([seat]) => seat);

  for (const e of entries) {
    if (e.mission.def.category !== "counter") continue;
    const ctx: MissionEvalContext = {
      ...e.ctx,
      opponentsAchievedThisHand: nonCounterAchievedSeats.filter((s) => s !== e.seat),
    };
    achieved.set(e.seat, e.mission.def.condition(ctx));
  }

  const reward = new Map<Seat, number>();
  for (const e of entries) {
    if (achieved.get(e.seat)) reward.set(e.seat, e.mission.def.reward);
  }

  const nullified = new Set<Seat>();
  for (const e of entries) {
    if (!achieved.get(e.seat) || e.mission.def.onAchieved == null) continue;
    const ctx: MissionEvalContext = {
      ...e.ctx,
      opponentsAchievedThisHand: nonCounterAchievedSeats.filter((s) => s !== e.seat),
    };
    const api: MissionEffectApi = {
      nullifyReward: (targetSeat) => {
        nullified.add(targetSeat);
        reward.set(targetSeat, 0);
      },
      grantBonus: (amount) => {
        reward.set(e.seat, (reward.get(e.seat) ?? 0) + amount);
      },
      rewardOf: (seat) => reward.get(seat) ?? 0,
    };
    e.mission.def.onAchieved(ctx, api);
  }

  return entries.map((e) => ({
    seat: e.seat,
    achieved: achieved.get(e.seat) ?? false,
    reward: reward.get(e.seat) ?? 0,
    nullified: nullified.has(e.seat),
  }));
}
