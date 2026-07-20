/** 칩 단위. 1 BB = 이 칩 수 (SB = BB/2 칩) */
export const CHIPS_PER_BB = 1;

/** 최소 칩 단위 — 0.1bb = 0.1칩 */
export const SMALLEST_CHIP = 0.1;

/** 자발 베트 기준 BB 배수 환산용(티어 1에서의 1BB 칩 수). 실제 최소 베트는 `handBlinds.bb` */
export const BET_RAISE_UNIT = CHIPS_PER_BB;

/** 시작 스택 (칩). 티어 1 기준 200bb */
export const STARTING_CHIPS = 200;

/** Hell 싱글: AI만 시작 스택에 +칩 (플레이어는 STARTING_CHIPS 유지) */
export const HELL_AI_EXTRA_STARTING_CHIPS = 100;

/** Hell 모드 잠금 해제: Hard 매치 승리 횟수 */
export const HELL_UNLOCK_HARD_MATCH_WINS = 10;
export const TOTAL_ROUNDS = 30;

/** Hell: 마지막 N라운드에서 배당·엔드게임 보정(역전/칩 우위 운영) */
export const HELL_ENDGAME_LAST_ROUNDS = 3;

/** 프리플랍 팟 상한(bb) — 양측 합산 팟이 이 값을 넘지 않도록 제한(유지) */
export const PREFLOP_MAX_POT_BB = 15;

/** 프리플랍·플랍·턴·리버 각각에서 추가 레이즈(또는 프리 올인 오픈) 가능 횟수 상한 — 3회째 레이즈 이후 상대는 콜/폴드만 */
export const MAX_RAISES_PER_STREET = 3;

/** 남은 스택이 이 BB 이하일 때 프리플랍 올인(전액 레이즈) 허용 */
export const PREFLOP_SHORT_STACK_ALL_IN_MAX_BB = 15;

/** AI의 통상 포스트플랍 베팅/레이즈 크기 상한. 게임 규칙 자체는 노리밋이며, 1.0은 팟사이즈 후보까지만 생성한다. */
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

/**
 * 싱글플레이 AI가 액션을 내기 전 추가 대기(ms).
 * 의사결정 +0.5s 정도로 체감 속도를 낮춤.
 */
export const SINGLE_PLAYER_AI_THINK_EXTRA_MS = 500;

/** 싱글플레이 AI 베팅(콜·레이즈·폴드 등) 직전 추가 대기(ms) — 반응이 너무 빠를 때 긴장감용 */
export const SINGLE_PLAYER_AI_BETTING_REACTION_MS = 300;

/** 올인 런아웃 직전 `GameState.lastActionNote` — UI 시네마 전용 마커 */
export const ALL_IN_RUNOUT_LAST_NOTE = "올인 · 남은 보드 공개";
