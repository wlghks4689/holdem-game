import { cardCategoryFromLegacy } from "./mysteryCard";
import { findMissionDef } from "./mysteryMissions";
import type { MysteryGameMessage, Seat } from "./types";

/**
 * 이번 핸드에 **미션형** Mystery Card를 성공한 좌석.
 *
 * 하단 결과 로그만으로는 "누가 해냈는지"가 테이블 위에서 전혀 보이지 않아, 좌석 프로필에
 * 짧은 성공 피드백을 붙이기 위한 판정이다.
 *
 * 강화형·발동형은 제외한다. 그쪽은 성공이 곧 규칙 변경이라 이미 결과로 드러나고, 전부
 * 표시하면 거의 매 핸드 모든 좌석이 반짝여서 신호가 죽는다. 점수가 0인 성공(Bounty
 * Hunter처럼 보상을 다른 통화로 받는 카드)도 "미션 성공" 연출 대상은 아니다.
 *
 * UI가 아니라 여기에 두는 이유는 판정을 테스트로 고정하기 위해서다 — 실제 게임에서 미션
 * 성공률이 카드에 따라 1~19%라, 브라우저에서 우연히 뜨기를 기다려 확인할 수 없다.
 */
export function missionSuccessSeatsFromLogs(logs: readonly MysteryGameMessage[]): Set<Seat> {
  const seats = new Set<Seat>();

  // 이번 핸드 몫만 본다. 마지막 round_start 이후가 현재 핸드다.
  let start = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i]!.t === "round_start") {
      start = i;
      break;
    }
  }

  for (let i = start; i < logs.length; i++) {
    const log = logs[i]!;
    if (log.t !== "mission_result" || !log.achieved || log.reward <= 0) continue;
    const def = findMissionDef(log.missionId);
    if (def != null && cardCategoryFromLegacy(def.category) === "mission") seats.add(log.seat);
  }
  return seats;
}
