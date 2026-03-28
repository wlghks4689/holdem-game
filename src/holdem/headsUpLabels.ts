import type { GameState, PlayerIndex } from "./types";

/**
 * 2인 헤즈업 텍사스 홀덤: 딜러 버튼이 스몰 블라인드, 상대가 빅 블라인드(+앤티 규칙은 게임 상수).
 * 매 핸드 종료 후 `NEW_HAND`에서 `button`이 교대합니다.
 */
export const HEADS_UP_RULES_BLURB =
  "헤즈업 홀덤: 딜러가 SB, 상대가 BB입니다. 매 핸드 후 딜러 버튼이 교대합니다.";

export const HU_DEALER_SB_LABEL = "딜러 · SB";

export const HU_BB_LABEL = "BB";

/** 이번 핸드에서 해당 좌석의 포지션 라벨 */
export function headsUpPositionLabel(
  state: Pick<GameState, "button">,
  seat: PlayerIndex,
): string {
  return state.button === seat ? HU_DEALER_SB_LABEL : HU_BB_LABEL;
}
