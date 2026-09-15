import {
  autoAssignPendingCardTargets,
  createInitialMysteryGameState,
  mysteryHoldemReducer,
} from "../src/mysteryHoldem/gameReducer";
import { decideBotAction, pickHoleKeepIndexes, pickMissionId } from "../src/mysteryHoldem/bot/botPolicy";
import { scoreBreakdownForAll } from "../src/mysteryHoldem/scoring";
import type { MysteryGameState } from "../src/mysteryHoldem/types";

/**
 * 생존 점수 크기를 정하기 위한 실측.
 *
 * "얼마를 주면 의미가 있고, 얼마부터 다른 점수를 압도하는가"를 감이 아니라 현재 분포에서
 * 읽는다. 기준이 되는 값은 1등과 2등의 실제 점수 차이다 — 생존 점수가 그 격차보다 크면
 * 순위를 통째로 뒤집어 버리고, 너무 작으면 있으나 마나다.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runMatch(seatCount: number, seed: number) {
  const rng = mulberry32(seed);
  let state: MysteryGameState = mysteryHoldemReducer(
    createInitialMysteryGameState(),
    { type: "START_MATCH", seatCount },
    rng,
  );
  let guard = 0;
  while (!state.matchEnded) {
    if (guard++ > 5000) throw new Error("did not converge");
    if (state.phase === "hand_setup") {
      const holeSeat = state.awaitingHoleSelection[0];
      if (holeSeat != null) {
        const dealt = state.players.find((p) => p.seat === holeSeat)?.pendingDeal ?? [];
        state = mysteryHoldemReducer(
          state,
          { type: "SELECT_HOLE_CARDS", seat: holeSeat, keepIndexes: pickHoleKeepIndexes(dealt) },
          rng,
        );
        continue;
      }
      const missionSeat = state.awaitingMissionSelection[0];
      if (missionSeat != null) {
        const missionId = pickMissionId(state.missionOffers[missionSeat] ?? [], missionSeat, rng);
        state = mysteryHoldemReducer(state, { type: "SELECT_MISSION", seat: missionSeat, missionId }, rng);
        continue;
      }
    }
    if (state.awaitingCardTarget.length > 0) {
      state = autoAssignPendingCardTargets(state, rng);
      continue;
    }
    if (state.toActSeat != null) {
      state = mysteryHoldemReducer(state, decideBotAction(state, state.toActSeat, rng, { equitySamples: 24 }), rng);
      continue;
    }
    if (state.phase === "hand_over") {
      state = mysteryHoldemReducer(state, { type: "START_NEXT_HAND" }, rng);
      continue;
    }
    break;
  }
  return state;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

const MATCHES = 60;

console.log(`\n=== 생존 점수 도입 후 영향 (${MATCHES}매치/인원) ===\n`);
console.log(
  `  ${"인원".padStart(4)} ${"1위생존pt".padStart(10)} ${"생존/총점".padStart(10)} ` +
    `${"1위바뀜".padStart(8)} ${"LPS비율".padStart(8)} ${"LPS생존자=1위".padStart(14)}`,
);

for (const seatCount of [3, 4, 6, 8, 10]) {
  let rankChanged = 0;
  let lps = 0;
  let lpsSurvivorWon = 0;
  const survPt: number[] = [];
  const survShare: number[] = [];

  for (let i = 0; i < MATCHES; i++) {
    const state = runMatch(seatCount, 5000 + i * 13 + seatCount);
    if (state.matchEndReason === "last_player_standing") lps++;

    const withSurv = scoreBreakdownForAll(state.players).sort((a, b) => b.totalPoint - a.totalPoint);
    // 생존 점수를 빼고 다시 줄 세워, 이 보너스가 실제로 1위를 바꿨는지 본다.
    const withoutSurv = scoreBreakdownForAll(state.players)
      .map((s) => ({ seat: s.seat, base: s.totalPoint - s.survivalPoint }))
      .sort((a, b) => b.base - a.base);
    if (withSurv[0]!.seat !== withoutSurv[0]!.seat) rankChanged++;

    const top = withSurv[0]!;
    survPt.push(top.survivalPoint);
    if (top.totalPoint > 0) survShare.push(top.survivalPoint / top.totalPoint);

    if (state.matchEndReason === "last_player_standing") {
      const survivor = state.players.find((p) => !p.busted);
      if (survivor != null && withSurv[0]!.seat === survivor.seat) lpsSurvivorWon++;
    }
  }

  const lpsShare = lps === 0 ? "—" : `${((lpsSurvivorWon / lps) * 100).toFixed(0)}%`;
  console.log(
    `  ${String(seatCount).padStart(4)} ${median(survPt).toFixed(0).padStart(10)} ` +
      `${`${(mean(survShare) * 100).toFixed(1)}%`.padStart(10)} ${String(rankChanged).padStart(8)} ` +
      `${`${((lps / MATCHES) * 100).toFixed(0)}%`.padStart(8)} ${lpsShare.padStart(14)}`,
  );
}

console.log("\n  * 1위바뀜 = 생존 점수 때문에 매치 1위가 달라진 매치 수");
console.log("  * LPS생존자=1위 = 최후 1인이 그대로 총점 1위였던 비율\n");
