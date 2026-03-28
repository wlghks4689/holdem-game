/** 칩 단위. 1 BB = 이 칩 수 (SB = BB/2 칩) */
export const CHIPS_PER_BB = 1;

/** 최소 칩 단위 — 0.5bb = 0.5칩 */
export const SMALLEST_CHIP = 0.5;

/** 자발 베트/레이즈 최소액 (= 1BB) */
export const BET_RAISE_UNIT = CHIPS_PER_BB;

/**
 * 프리플랍 앤티 (bb) — BB만 1BB 블라인드 + 이 앤티를 함께 포스트(총 2bb).
 * 버튼은 SB 0.5bb만 포스트 → 시작 팟 2.5bb.
 */
export const PREFLOP_ANTE_BB = 1;

/** 시작 스택 (칩). CHIPS_PER_BB=1 이면 200 → 200bb */
export const STARTING_CHIPS = 200;
export const TOTAL_ROUNDS = 30;

/** 헤즈업 딜러·SB 프리플랍 최대 총 기여 (bb) — UI: 2bb MAX */
export const PREFLOP_BUTTON_MAX_RAISE_TO_BB = 2;
/** BB 옵션(버튼 림프 후) 최대 총 기여 상한 (bb) — 팟 캡과 교차 */
export const PREFLOP_BB_BB_OPTION_MAX_RAISE_TO_BB = 3;
/** BB 리레이즈 등(프리플랍 facing_raise) 최대 총 기여 상한 (bb) */
export const PREFLOP_BB_MAX_RAISE_TO_BB = 4;
/** 프리플랍 팟 상한(bb) — 이 한도까지 프리플랍 베팅 가능 */
export const PREFLOP_MAX_POT_BB = 9;

/** 프리셋 라벨용 오픈 사이즈 (bb) */
export const PREFLOP_UI_BUTTON_OPEN_BB = [1.5, 2] as const;
/** 버튼이 레이즈한 뒤 BB 반응 프리셋 (bb) — MAX는 별도 */
export const PREFLOP_UI_BB_VS_OPEN_BB = [3] as const;

export const POSTFLOP_MAX_BET_POT_FRACTION = 0.5;

export const IA_COST_POT_FRACTION = 0.3;

export const PLAYER_COUNT = 2;

/** 핸드 선택 단계 제한 시간(초) — 초과 시 자동 선택 */
export const HAND_SELECT_TIMER_SECONDS = 40;

/** 베팅 액션 제한 시간(초) — 초과 시 자동 체크/폴드 */
export const ACTION_TIMER_SECONDS = 30;

/** 판 종료(showdown / hand_over) 후 자동으로 다음 핸드(핸드 선택)까지 대기(초) */
export const NEW_HAND_AUTO_SECONDS = 8;
