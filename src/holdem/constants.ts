/** 칩 단위. 1 BB = 이 칩 수 (SB = BB/2 칩) */
export const CHIPS_PER_BB = 1;

/** 최소 칩 단위 — 0.1bb = 0.1칩 */
export const SMALLEST_CHIP = 0.1;

/** 자발 베트 기준 BB 배수 환산용(티어 1에서의 1BB 칩 수). 실제 최소 베트는 `handBlinds.bb` */
export const BET_RAISE_UNIT = CHIPS_PER_BB;

/** 시작 스택 (칩). 티어 1 기준 200bb */
export const STARTING_CHIPS = 200;
export const TOTAL_ROUNDS = 30;

/** 프리플랍 팟 상한(bb) — 양측 합산 팟이 이 값을 넘지 않도록 제한 */
export const PREFLOP_MAX_POT_BB = 15;

/** 남은 스택이 이 BB 이하일 때 프리플랍 올인(전액 레이즈) 허용 */
export const PREFLOP_SHORT_STACK_ALL_IN_MAX_BB = 15;

/** 포스트플랍 최대 베팅 비율 — 1.0 = 팟사이즈(팟 리밋) */
export const POSTFLOP_MAX_BET_POT_FRACTION = 1.0;

export const IA_COST_POT_FRACTION = 0.3;

/** IA 비용 하한(팟의 30%와 `Math.max`로 적용) — 최소 3BB */
export const IA_COST_MIN_BB = 3;

export const PLAYER_COUNT = 2;

/** 핸드 선택 단계 제한 시간(초) — 초과 시 자동 선택 */
export const HAND_SELECT_TIMER_SECONDS = 40;

/** 베팅 액션 제한 시간(초) — 초과 시 자동 체크/폴드 */
export const ACTION_TIMER_SECONDS = 30;

/** 리버에서 IA 사용 직후, 해당 플레이어 액션 타이머에 더해지는 시간(초) */
export const IA_RIVER_ACTION_EXTRA_SECONDS = 10;

/** 판 종료(showdown / hand_over) 후 자동으로 다음 핸드(핸드 선택)까지 대기(초) */
export const NEW_HAND_AUTO_SECONDS = 8;

/** `runOutBoardToShowdown` 후 `lastActionNote` — UI 올인 쇼다운 연출 트리거 */
export const ALL_IN_RUNOUT_LAST_NOTE =
  "올인 — 남은 보드 전부 개시 후 쇼다운";
