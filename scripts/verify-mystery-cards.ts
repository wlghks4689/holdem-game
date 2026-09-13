import assert from "node:assert/strict";
import { mulberry32, startMatch, dispatch } from "./mysteryTestHelpers";

const rng = mulberry32(1);
let state = startMatch(4, rng);

assert.equal(state.phase, "hand_setup");
assert.equal(state.awaitingHoleSelection.length, 4);

// 각 플레이어에게 정확히 3장이 중복 없이 지급된다.
const key = (c: { rank: number; suit: string }) => `${c.rank}${c.suit}`;
const allDealt: string[] = [];
for (const seat of state.awaitingHoleSelection) {
  const player = state.players.find((p) => p.seat === seat)!;
  assert.equal(player.pendingDeal.length, 3);
  allDealt.push(...player.pendingDeal.map(key));
}
assert.equal(new Set(allDealt).size, allDealt.length, "딜된 카드에 중복이 없어야 한다");

// 3장 중 정확히 2장을 선택할 수 있다(잘못된 인덱스는 거부).
const seat0Before = state;
const rejected = dispatch(seat0Before, { type: "SELECT_HOLE_CARDS", seat: 0, keepIndexes: [0, 0] }, rng);
assert.strictEqual(rejected, seat0Before, "동일 인덱스 선택은 거부되어야 한다");

for (const seat of [0, 1, 2, 3]) {
  const before = state.players.find((p) => p.seat === seat)!;
  const dealtCards = [...before.pendingDeal];
  state = dispatch(state, { type: "SELECT_HOLE_CARDS", seat, keepIndexes: [0, 1] }, rng);
  const after = state.players.find((p) => p.seat === seat)!;
  assert.equal(after.holeCards.length, 2);
  assert.equal(after.pendingDeal.length, 0);
  assert.equal(after.discarded.length, 1);
  assert.deepEqual(after.holeCards, [dealtCards[0], dealtCards[1]]);
  assert.deepEqual(after.discarded, [dealtCards[2]]);
}

// Round 1은 정규 Mission 교체 라운드 — 후보 3개가 제공된다.
for (const seat of [0, 1, 2, 3]) {
  const offers = state.missionOffers[seat];
  assert.ok(offers != null && offers.length === 3, `seat ${seat}는 Mission 후보 3개를 받아야 한다`);
}

for (const seat of [0, 1, 2, 3]) {
  const candidates = state.missionOffers[seat]!;
  state = dispatch(state, { type: "SELECT_MISSION", seat, missionId: candidates[0]!.id }, rng);
}

assert.equal(state.phase, "preflop", "모든 선택 완료 후 프리플랍으로 전환되어야 한다");

// 버린 카드는 이번 핸드에서 홀카드·보드에 다시 등장하지 않는다.
while (state.phase !== "hand_over") {
  const seat = state.toActSeat;
  if (seat == null) break;
  const player = state.players.find((p) => p.seat === seat)!;
  const facing = state.betting.currentLevel - player.streetContribution;
  state = facing > 1e-9
    ? dispatch(state, { type: "CALL", seat }, rng)
    : dispatch(state, { type: "CHECK", seat }, rng);
}

const discardedKeys = new Set<string>();
for (const p of state.players) {
  for (const c of p.discarded) discardedKeys.add(key(c));
}
const usedNowKeys: string[] = [];
for (const p of state.players) {
  for (const c of p.holeCards) usedNowKeys.push(key(c));
}
for (const c of state.board) usedNowKeys.push(key(c));

for (const k of usedNowKeys) {
  assert.ok(!discardedKeys.has(k), `버린 카드 ${k}가 홀카드/보드에 재등장하면 안 된다`);
}
assert.equal(new Set(usedNowKeys).size, usedNowKeys.length, "홀카드·보드에 중복 카드가 없어야 한다");

console.log("OK: mystery cards");
