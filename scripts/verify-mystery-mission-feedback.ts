import assert from "node:assert/strict";
import { missionSuccessSeatsFromLogs } from "../src/mysteryHoldem/missionFeedback";
import { findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import type { MysteryGameMessage } from "../src/mysteryHoldem/types";

/**
 * 좌석 프로필의 "미션 성공" 연출 대상 판정.
 *
 * 브라우저에서 눈으로 확인할 수 없는 판정이라 여기서 고정한다 — 실측 미션 성공률이 카드에
 * 따라 1~19%라, 우연히 성공이 뜨기를 기다리는 방식으로는 검증이 되지 않는다.
 */

function result(
  seat: number,
  missionId: string,
  achieved: boolean,
  reward: number,
): MysteryGameMessage {
  return { t: "mission_result", seat, missionId, achieved, reward, deniedReward: 0 };
}
const roundStart = (round: number): MysteryGameMessage => ({ t: "round_start", round, buttonSeat: 0 });

// ── 미션형 성공만 대상이다 ──
{
  const logs: MysteryGameMessage[] = [
    roundStart(3),
    result(0, "maker_flush", true, findMissionDef("maker_flush")!.reward), // 미션형 ✓
    result(1, "maker_straight", false, 0), // 실패
    result(2, "four_card", true, 0), // 강화형 — 대상 아님
    result(3, "forced_split", true, 0), // 발동형 — 대상 아님
    result(4, "cooler_insurance", true, 400), // 발동형 — 점수가 있어도 대상 아님
    result(5, "underdog", true, findMissionDef("underdog")!.reward), // 미션형 ✓
  ];
  const seats = missionSuccessSeatsFromLogs(logs);
  assert.deepEqual([...seats].sort((a, b) => a - b), [0, 5]);
}

// ── 여러 명 동시 성공: 좌석별로 전부 잡힌다(전역 배너로 뭉뚱그리지 않는다) ──
{
  const logs: MysteryGameMessage[] = [
    roundStart(7),
    result(0, "maker_straight", true, 180),
    result(2, "maker_straight", true, 180),
    result(5, "blind_defender", true, 60),
  ];
  assert.deepEqual([...missionSuccessSeatsFromLogs(logs)].sort((a, b) => a - b), [0, 2, 5]);
}

// ── 지난 핸드의 성공은 넘어오지 않는다 ──
// 로그는 매치 내내 누적되므로, 마지막 round_start 이후만 봐야 한다.
{
  const logs: MysteryGameMessage[] = [
    roundStart(1),
    result(1, "maker_flush", true, 240), // 1라운드 성공
    roundStart(2),
    result(3, "underdog", true, 120), // 2라운드 성공
  ];
  const seats = missionSuccessSeatsFromLogs(logs);
  assert.deepEqual([...seats], [3], "직전 핸드의 성공이 남아 다시 연출되면 안 된다");
}

// ── 점수 없이 달성한 미션형은 대상이 아니다 ──
// Bounty Hunter는 미션형이지만 보상을 Bounty Point로 받아 Mission Point가 0이다.
// "미션 성공" 연출은 점수를 얻은 순간을 알리는 것이므로 제외한다.
{
  const logs: MysteryGameMessage[] = [roundStart(4), result(2, "bounty_hunter", true, 0)];
  assert.equal(missionSuccessSeatsFromLogs(logs).size, 0);
}

// ── 무효화되어 0점이 된 좌석도 대상이 아니다 ──
// Mission Breaker에게 지워졌다면 점수를 얻지 못했으므로 성공 연출을 띄우면 거짓말이 된다.
{
  const logs: MysteryGameMessage[] = [
    roundStart(5),
    { t: "mission_result", seat: 1, missionId: "maker_flush", achieved: true, reward: 0, deniedReward: 240 },
  ];
  assert.equal(missionSuccessSeatsFromLogs(logs).size, 0);
}

// ── round_start가 없는(매치 시작 직후) 로그도 안전하게 처리한다 ──
{
  const logs: MysteryGameMessage[] = [{ t: "match_start", seatCount: 6 }];
  assert.equal(missionSuccessSeatsFromLogs(logs).size, 0);
  assert.equal(missionSuccessSeatsFromLogs([]).size, 0);
}

console.log("OK: mission success feedback 대상 판정");
