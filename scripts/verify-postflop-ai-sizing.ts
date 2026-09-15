import assert from "node:assert/strict";
import {
  computeAIBettingAction,
  type AIPersonality,
} from "../src/holdem/aiPlayer";
import {
  postflopAiMaxOpenBetForActor,
  postflopAiMaxRaiseTargetForActor,
  postflopRaiseTargetCappedByOpponent,
} from "../src/holdem/bettingHelpers";
import type { Card } from "../src/holdem/cards";
import { createInitialGameState } from "../src/holdem/gameReducer";
import type { GameState } from "../src/holdem/types";

const aggressive: AIPersonality = {
  style: "aggressive",
  bluffRate: 0,
  raiseFreq: 1,
};

const card = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

function postflopState(options: {
  pot: number;
  chips: [number, number];
  contributed: [number, number];
}): GameState {
  const base = createInitialGameState("classic");
  return {
    ...base,
    phase: "flop",
    handBlinds: { sb: 0.5, bb: 1, ante: 0 },
    chips: options.chips,
    pot: options.pot,
    betting: {
      contributed: options.contributed,
      currentLevel: Math.max(...options.contributed),
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 0,
    },
    toAct: 1,
    holes: [null, {
      templateId: "hi_AA",
      hole: [card(14, "s"), card(14, "h")],
    }],
    board: [card(9, "c"), card(7, "d"), card(2, "s")],
    boardRevealed: 3,
    isAllIn: false,
  } as unknown as GameState;
}

const deepFacingRaise = postflopState({
  pot: 15,
  chips: [195, 200],
  contributed: [5, 0],
});

assert.equal(postflopRaiseTargetCappedByOpponent(deepFacingRaise), 200);
assert.equal(postflopAiMaxRaiseTargetForActor(deepFacingRaise), 20);

/**
 * computeAIBettingAction은 무작위 요소가 있어, 상한 불변식이 "모든 경우에" 성립하는지
 * 확인하려면 여러 번 표본을 뽑아야 한다.
 *
 * 표본 수는 실측으로 정했다. 각 시나리오에서 관심 있는 액션이 나오는 비율은
 * deep raise 50.6% / deep bet 94.6% / short all-in 48.5%였다. 가장 낮은 48.5%를 기준으로
 * 250회를 뽑으면 한 번도 나오지 않을 확률이 0.515^250 ≈ 10^-73이라, 분기 커버리지는
 * 사실상 확정이다.
 *
 * 원래 값은 2,000회였는데 이 파일 하나가 전체 검증 스위트 181초 중 143초(79%)를 쓰고 있었다.
 * 필요한 표본의 30배를 뽑고 있었던 셈이다. 250회로 줄여 스위트를 실용적인 길이로 되돌린다.
 */
const SAMPLES = 250;

let deepRaiseCount = 0;
for (let i = 0; i < SAMPLES; i++) {
  const action = computeAIBettingAction(
    deepFacingRaise,
    1,
    "hard",
    aggressive,
  );
  if (action?.type !== "POSTFLOP_RAISE") continue;
  deepRaiseCount++;
  assert.ok(action.toLevelChips <= 20 + 1e-9);
  assert.ok(action.toLevelChips < 200 - 1e-9);
}
assert.ok(deepRaiseCount > 0, "deep-stack scenario should exercise raises");

const deepOpen = postflopState({
  pot: 12,
  chips: [200, 200],
  contributed: [0, 0],
});
assert.equal(postflopAiMaxOpenBetForActor(deepOpen), 12);

let deepBetCount = 0;
for (let i = 0; i < SAMPLES; i++) {
  const action = computeAIBettingAction(deepOpen, 1, "hard", aggressive);
  if (action?.type !== "POSTFLOP_BET") continue;
  deepBetCount++;
  assert.ok(action.amount <= 12 + 1e-9);
  assert.ok(action.amount < 200 - 1e-9);
}
assert.ok(deepBetCount > 0, "deep-stack scenario should exercise bets");

// A genuinely short stack may still move all-in when it cannot make a full
// minimum raise. This preserves valid low-SPR no-limit behavior.
const shortFacingRaise = postflopState({
  pot: 120,
  chips: [20, 60],
  contributed: [40, 0],
});
assert.equal(postflopAiMaxRaiseTargetForActor(shortFacingRaise), 60);

let shortAllInCount = 0;
for (let i = 0; i < SAMPLES; i++) {
  const action = computeAIBettingAction(
    shortFacingRaise,
    1,
    "hard",
    aggressive,
  );
  if (action?.type !== "POSTFLOP_RAISE") continue;
  shortAllInCount++;
  assert.equal(action.toLevelChips, 60);
}
assert.ok(shortAllInCount > 0, "short-stack scenario should preserve all-in raises");

console.log("Postflop AI sizing verification passed.");
