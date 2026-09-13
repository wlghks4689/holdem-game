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
  /** TODO(§31 미확정): Bounty Point 보상량 잠정값 — 밸런스 확정 전 */
  bountyRewardPerBust: 50,
  maxSeats: 10,
  minSeats: 2,
};

export const MIN_SEATS = MYSTERY_HOLDEM_CONFIG.minSeats;
export const MAX_SEATS = MYSTERY_HOLDEM_CONFIG.maxSeats;

/** 초기 플레이 테스트 기본값(§27) — 엔진 자체는 2~10인 확장 가능 */
export const DEFAULT_PROTOTYPE_SEAT_COUNT = 4;
