import type { MadeHandFxKind } from "@/holdem/pokerEval";

/**
 * 쇼다운 BEST 5 강조/디밍에 쓰는 클래스 모음.
 *
 * Select Hold'em의 BoardDisplay / HoleCards가 각자 인라인으로 들고 있던 값을 그대로 옮겼다.
 * MysteryHoldem이 같은 연출을 쓰려면 이 값들을 눈대중으로 다시 만드는 대신 공유해야 한다 —
 * 그러지 않으면 한쪽만 조정됐을 때 두 게임의 쇼다운이 조용히 달라진다.
 *
 * **값은 바꾸지 않았다.** 기존 Select Hold'em의 시각 결과가 달라지면 안 된다.
 */

/** 승자의 메이드 족보별 보드 글로우 */
export const SHOWDOWN_BOARD_GLOW: Record<MadeHandFxKind, string> = {
  none: "holdem-showdown-default-card-glow",
  straight: "holdem-made-card-glow-t1",
  flush: "holdem-made-card-glow-t2",
  "full-house": "holdem-made-card-glow-t3",
  quads: "holdem-preview-quads-coral-card",
  "straight-flush": "holdem-preview-straight-flush-rainbow-card",
  "royal-flush": "holdem-preview-royal-flush-card",
};

/** 승자 BEST 5에 포함된 커뮤니티 카드 */
export const BOARD_FOCUS_FILTER = "brightness-[1.16] contrast-[1.1] saturate-[1.12]";

/** BEST 5에 포함되지 않은 커뮤니티 카드 */
export const BOARD_DIM_CLASS =
  "opacity-20 brightness-[0.48] contrast-75 saturate-[0.28] grayscale-[0.58]";

/** 승자의 홀카드 중 BEST 5에 쓰이지 않은 카드 */
export const HOLE_DIM_CLASS = "opacity-35 brightness-[0.78] saturate-50 grayscale-[0.18]";

/** 족보 글로우를 쓸 수 없을 때(트립스 이하, Forced Split)의 중립 강조 */
export const NEUTRAL_FOCUS_GLOW = "holdem-showdown-default-card-glow";

/**
 * 메인 팟 승자가 아닌 좌석 — 정보는 계속 읽혀야 하므로 약하게만 누른다.
 *
 * Select Hold'em은 2인 패널이라 강하게 눌러도 됐지만, 10인 테이블에서 같은 세기로 누르면
 * 좌석 이름과 칩이 사라져 사이드 팟 결과를 확인할 수 없다.
 */
export const SEAT_DIM_CLASS = "opacity-55 saturate-[0.6]";
