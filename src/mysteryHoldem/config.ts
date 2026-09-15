import type { MysteryHoldemConfig } from "./types";

/**
 * MysteryHoldem 게임 전역 설정. 확정값은 작업 프롬프트(§30) 기준이며,
 * 코드 곳곳에 매직 넘버로 흩어놓지 않고 이 한 곳에서만 관리한다.
 *
 * 잠정값(TODO, §31 미확정 영역)은 각 필드 주석에 명시했다.
 */
export const MYSTERY_HOLDEM_CONFIG: MysteryHoldemConfig = {
  /**
   * 시작 스택. 40,000 = 200BB로, 플레이 깊이를 확보하면서 Chip Point 기준값을 400으로 맞춘다.
   * chipPointDivisor를 함께 올리지 않으므로 Chip Point 비중이 커지고, 상대적으로 Mission
   * Point의 영향력과 Last Player Standing(조기 버스트) 빈도가 줄어드는 점을 감안한 값이다.
   */
  startingChips: 40_000,
  smallBlind: 100,
  bigBlind: 200,
  /** Big Blind Ante 방식: BB 좌석이 해당 핸드의 Ante를 추가로 지불 */
  bigBlindAnte: 200,
  totalRounds: 15,
  /** 정규 Mystery Mission 선택/변경 라운드 */
  missionChangeRounds: [1, 4, 7, 10, 13],
  /** 최초 Bet은 포함하지 않는 스트리트별 Raise Cap */
  raiseCap: { preflop: 2, flop: 2, turn: 2, river: 3 },
  /**
   * 베트/레이즈는 이 단위로만 이루어진다(SB와 동일한 100). 사람 플레이어는 슬라이더가
   * 이 단위로 스냅되고, 봇도 같은 단위로 반올림한다. 다만 합법 구간의 폭이 이 단위보다
   * 좁을 수 있으므로(숏스택 올인 근처) 강제할 수 없는 경우에는 원래 금액을 그대로 쓴다.
   */
  betStepUnit: 100,
  /**
   * Chip Point = 보유 Chips / chipPointDivisor.
   *
   * 100에서 200으로 올렸다. 실측에서 칩이 다른 점수를 압도하고 있었다 — 최후 1인의 Chip
   * Point가 1,600점인데 2위의 Mission 총합이 310점 수준이라, Mystery Card로 무엇을 하든
   * 순위가 칩 하나로 결정됐다. 분모를 두 배로 하면 칩 비중이 절반이 되고 Mission·Bounty·
   * 생존 점수가 상대적으로 그만큼 커진다.
   */
  chipPointDivisor: 200,
  /**
   * 생존 점수(시작 인원 1명당). 실제 지급액 = 값 × 시작 인원, 10단위 반올림.
   * 10인이면 1위 200 / 2위 100 / 3위 50, 4인이면 80 / 40 / 20이 된다.
   *
   * 크기는 실측에서 잡았다. 10인 기준 2위와 3위의 총점 격차 중앙값이 178점이라, 1위와
   * 3위의 생존 점수 차이(150점)가 그와 비슷한 수준이다 — 순위를 통째로 뒤집지는 않으면서
   * "끝까지 남았다"가 분명히 보상되는 지점이다. 반대로 인원이 적을수록 1-2위 격차 자체가
   * 커지므로(3인 1,020점) 생존 점수도 같이 작아져야 비중이 유지된다.
   */
  survivalRewardPerSeat: { first: 20, second: 10, third: 5 },
  /**
   * Bounty Point 보상량 — 총 플레이어 수에 따라 달라진다(§31 잠정값).
   *
   * 인원이 많을수록 버스트가 자주 나오고 풀리는 칩 총량(= n × 300 Chip Point)도 커지므로,
   * 버스트 1건당 가치는 인원이 적을수록 높아야 한다. 대략 400/(n-1) 곡선을 10단위로 정리해
   * "한 매치에서 한 플레이어가 벌 수 있는 Bounty 총량"이 테이블 크기와 무관하게 비슷해지도록 했다.
   *
   * 참고: 2인(및 마지막 1명을 남기는 버스트)은 즉시 Last Player Standing 승리라 점수 비교를
   * 하지 않으므로 실제 승패에는 영향이 없다.
   */
  bountyRewardBySeatCount: {
    2: 400,
    3: 200,
    4: 130,
    5: 100,
    6: 80,
    7: 70,
    8: 60,
    9: 50,
    10: 40,
  },
  maxSeats: 10,
  minSeats: 2,
};

export const MIN_SEATS = MYSTERY_HOLDEM_CONFIG.minSeats;
export const MAX_SEATS = MYSTERY_HOLDEM_CONFIG.maxSeats;

/** 해당 테이블 인원에서 버스트 1건당 지급되는 Bounty Point */
export function bountyRewardForSeatCount(
  seatCount: number,
  config: MysteryHoldemConfig = MYSTERY_HOLDEM_CONFIG,
): number {
  const table = config.bountyRewardBySeatCount;
  const exact = table[seatCount];
  if (exact != null) return exact;
  const clamped = Math.max(config.minSeats, Math.min(config.maxSeats, seatCount));
  return table[clamped] ?? table[config.maxSeats] ?? 0;
}

/** 초기 플레이 테스트 기본값(§27) — 엔진 자체는 2~10인 확장 가능 */
export const DEFAULT_PROTOTYPE_SEAT_COUNT = 4;
