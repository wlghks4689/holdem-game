import type { MysteryHoldemConfig } from "./types";

/**
 * MysteryHoldem 게임 전역 설정. 확정값은 작업 프롬프트(§30) 기준이며,
 * 코드 곳곳에 매직 넘버로 흩어놓지 않고 이 한 곳에서만 관리한다.
 *
 * 잠정값(TODO, §31 미확정 영역)은 각 필드 주석에 명시했다.
 */
export const MYSTERY_HOLDEM_CONFIG: MysteryHoldemConfig = {
  startingChips: 30_000,
  smallBlind: 100,
  bigBlind: 200,
  /** Big Blind Ante 방식: BB 좌석이 해당 핸드의 Ante를 추가로 지불 */
  bigBlindAnte: 200,
  totalRounds: 15,
  /** 정규 Mystery Mission 선택/변경 라운드 */
  missionChangeRounds: [1, 4, 7, 10, 13],
  /** 최초 Bet은 포함하지 않는 스트리트별 Raise Cap */
  raiseCap: { preflop: 2, flop: 2, turn: 2, river: 3 },
  /** Chip Point = 보유 Chips / chipPointDivisor */
  chipPointDivisor: 100,
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
