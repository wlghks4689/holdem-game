import assert from "node:assert/strict";
import { autoCompleteHandSetup, dispatch, mulberry32, startMatch } from "./mysteryTestHelpers";

// 5인 테이블: button=0, SB=1, BB=2, UTG=3 — 프리플랍은 UTG(3)부터 시작해야 한다.
const rng = mulberry32(8);
let state = startMatch(5, rng);
state = autoCompleteHandSetup(state, rng);
assert.equal(state.phase, "preflop");
assert.equal(state.buttonSeat, 0);
assert.equal(state.toActSeat, 3, "프리플랍은 UTG(버튼+3)부터 시작해야 한다");

// UTG(3), UTG+1(4) 폴드 → 버튼(0)으로 순환해야 한다(Fold 좌석 스킵).
state = dispatch(state, { type: "FOLD", seat: 3 }, rng);
assert.equal(state.toActSeat, 4);
state = dispatch(state, { type: "FOLD", seat: 4 }, rng);
assert.equal(state.toActSeat, 0, "폴드한 좌석을 건너뛰고 다음 유효 좌석(버튼)으로 순환해야 한다");

// 버튼(0) 콜, SB(1) 콜, BB(2) 체크 옵션으로 프리플랍 종료 → 포스트플랍은 버튼 왼쪽(SB=1)부터.
state = dispatch(state, { type: "CALL", seat: 0 }, rng);
assert.equal(state.toActSeat, 1);
state = dispatch(state, { type: "CALL", seat: 1 }, rng);
assert.equal(state.toActSeat, 2, "BB 옵션까지 액션이 순환해야 한다");
state = dispatch(state, { type: "CHECK", seat: 2 }, rng);

assert.equal(state.phase, "flop", "3명 모두 매칭되면 플랍으로 진행해야 한다");
assert.equal(state.toActSeat, 1, "포스트플랍은 버튼 왼쪽의 첫 액션 가능 좌석부터 시작해야 한다");

// 마지막 좌석 이후 다시 첫 유효 좌석으로 순환하는지 확인: 1,2,0 순서로 전원 체크.
state = dispatch(state, { type: "CHECK", seat: 1 }, rng);
assert.equal(state.toActSeat, 2);
state = dispatch(state, { type: "CHECK", seat: 2 }, rng);
assert.equal(state.toActSeat, 0);
state = dispatch(state, { type: "CHECK", seat: 0 }, rng);
assert.equal(state.phase, "turn", "전원 체크 시 다음 스트리트로 진행해야 한다");
assert.equal(state.toActSeat, 1);

// ── All-in 스킵: 3명(0,1,2)이 남은 상태에서 한 명이 올인하면 이후 액션 순서에서 제외되어야 한다.
// Pot Limit 게임이므로 딥스택 올인은 애초에 불법이다(스택 > 팟 상한). 이 테스트의 주제는
// 턴 순서이지 베팅 상한이 아니므로, 남은 3명의 스택을 팟(프리플랍 3명 x 200 + Ante 200 = 800)
// 이내로 맞춰 올인이 합법이 되게 한 뒤 순서를 확인한다. 세 명 모두 같은 스택이라 콜이 이어지면
// 전원 올인이 되어 자동 런아웃까지 검증할 수 있다.
const shortStack = 600;
state = {
  ...state,
  players: state.players.map((p) => ([0, 1, 2].includes(p.seat) ? { ...p, chips: shortStack } : p)),
};

state = dispatch(state, { type: "ALL_IN", seat: 1 }, rng);
assert.equal(state.players.find((p) => p.seat === 1)!.allIn, true);
assert.equal(state.toActSeat, 2, "올인한 좌석은 건너뛰고 다음 액션 가능 좌석으로 넘어가야 한다");
state = dispatch(state, { type: "CALL", seat: 2 }, rng);
assert.equal(state.toActSeat, 0, "올인 좌석(1)을 건너뛰어 좌석 0 차례가 되어야 한다");
state = dispatch(state, { type: "CALL", seat: 0 }, rng);
assert.equal(state.runout?.active, true, "액션 가능 좌석이 1명 이하로 남으면 자동 런아웃으로 처리되어야 한다");
assert.equal(state.phase, "hand_over");
assert.equal(state.boardRevealed, 5);

console.log("OK: mystery turn order");
