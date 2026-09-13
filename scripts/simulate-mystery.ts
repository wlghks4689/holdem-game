import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import { createInitialMysteryGameState, mysteryHoldemReducer } from "../src/mysteryHoldem/gameReducer";
import { decideBotAction, pickHoleKeepIndexes, pickMissionId } from "../src/mysteryHoldem/bot/botPolicy";
import { MISSION_POOL } from "../src/mysteryHoldem/mysteryMissions";
import type { MysteryGameAction, MysteryGameState } from "../src/mysteryHoldem/types";

/**
 * MysteryHoldem 밸런스 측정 하네스.
 *
 * 엔진이 순수 함수라서 UI 없이 수천 판을 돌릴 수 있다. 기획에서 미확정으로 남긴 값들
 * (Mission 보상, Bounty 보상, 높은 족보 계수 등)을 감이 아니라 실측으로 조정하기 위한 도구다.
 *
 * 사용법:
 *   node scripts/run-typescript-check.cjs scripts/simulate-mystery.ts [매치수] [좌석수]
 */

// run-typescript-check.cjs를 거치면 argv 앞쪽에 러너·스크립트 경로가 붙으므로 숫자 인자만 추린다.
const numericArgs = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const matchCount = numericArgs[0] ?? 150;
const seatCount = numericArgs[1] ?? 6;
const EQUITY_SAMPLES = 30;

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

interface Totals {
  matches: number;
  endReason: Record<string, number>;
  rounds: number[];
  chipPoints: number[];
  missionPoints: number[];
  bountyPoints: number[];
  totalPoints: number[];
  winnerMissionShare: number[];
  handsPlayed: number;
  handsToShowdown: number;
  foldWins: number;
  busts: number;
  potSizes: number[];
  voluntaryActions: number;
  totalDecisions: number;
  missionActive: Record<string, number>;
  missionAchieved: Record<string, number>;
  missionRewardTotal: Record<string, number>;
}

const totals: Totals = {
  matches: 0,
  endReason: {},
  rounds: [],
  chipPoints: [],
  missionPoints: [],
  bountyPoints: [],
  totalPoints: [],
  winnerMissionShare: [],
  handsPlayed: 0,
  handsToShowdown: 0,
  foldWins: 0,
  busts: 0,
  potSizes: [],
  voluntaryActions: 0,
  totalDecisions: 0,
  missionActive: {},
  missionAchieved: {},
  missionRewardTotal: {},
};

function dispatch(state: MysteryGameState, action: MysteryGameAction, rng: () => number): MysteryGameState {
  return mysteryHoldemReducer(state, action, rng);
}

function runMatch(seed: number): void {
  const rng = mulberry32(seed);
  let state = dispatch(createInitialMysteryGameState(), { type: "START_MATCH", seatCount }, rng);
  let logCursor = 0;
  let guard = 0;

  while (!state.matchEnded) {
    if (guard++ > 4000) throw new Error("match did not converge");

    if (state.phase === "hand_setup") {
      const holeSeat = state.awaitingHoleSelection[0];
      if (holeSeat != null) {
        const dealt = state.players.find((p) => p.seat === holeSeat)?.pendingDeal ?? [];
        state = dispatch(state, { type: "SELECT_HOLE_CARDS", seat: holeSeat, keepIndexes: pickHoleKeepIndexes(dealt) }, rng);
        continue;
      }
      const missionSeat = state.awaitingMissionSelection[0];
      if (missionSeat != null) {
        const missionId = pickMissionId(state.missionOffers[missionSeat] ?? [], missionSeat, rng);
        state = dispatch(state, { type: "SELECT_MISSION", seat: missionSeat, missionId }, rng);
        continue;
      }
    }

    if (state.toActSeat != null) {
      const actingSeat = state.toActSeat;
      const action = decideBotAction(state, actingSeat, rng, { equitySamples: EQUITY_SAMPLES });
      totals.totalDecisions++;
      if (action.type !== "FOLD" && action.type !== "CHECK") totals.voluntaryActions++;
      const next = dispatch(state, action, rng);
      if (next === state) {
        // 엔진이 액션을 거부했다 = 봇 정책 버그. 조용히 넘기면 무한 루프가 되므로 바로 드러낸다.
        throw new Error(
          `봇이 불법 액션을 제안했습니다: ${JSON.stringify(action)} / phase=${state.phase} ` +
            `level=${state.betting.currentLevel} raises=${state.betting.raisesUsed}/${state.betting.raiseCap}`,
        );
      }
      state = next;
      continue;
    }

    if (state.phase === "hand_over") {
      logCursor = collectHandStats(state, logCursor);
      state = dispatch(state, { type: "START_NEXT_HAND" }, rng);
      continue;
    }

    break;
  }

  collectHandStats(state, logCursor);

  totals.matches++;
  totals.rounds.push(state.round);
  const reason = state.matchEndReason ?? "unknown";
  totals.endReason[reason] = (totals.endReason[reason] ?? 0) + 1;

  for (const p of state.players) {
    totals.chipPoints.push(p.chipPoint);
    totals.missionPoints.push(p.missionPoint);
    totals.bountyPoints.push(p.bountyPoint);
    totals.totalPoints.push(p.totalPoint);
  }
  const winnerSeat = state.matchWinners?.[0];
  if (winnerSeat != null) {
    const w = state.players.find((p) => p.seat === winnerSeat);
    if (w && w.totalPoint > 0) {
      totals.winnerMissionShare.push((w.missionPoint + w.bountyPoint) / w.totalPoint);
    }
  }
}

function collectHandStats(state: MysteryGameState, cursor: number): number {
  // 한 핸드가 Main/Side Pot을 여러 개 만들면 showdown 로그도 여러 개 나온다.
  // "쇼다운 도달 핸드 수"는 핸드 단위로 세고, 팟 크기만 팟 단위로 모은다.
  let sawShowdownThisBatch = false;
  for (let i = cursor; i < state.logs.length; i++) {
    const log = state.logs[i]!;
    if (log.t === "round_start") totals.handsPlayed++;
    if (log.t === "showdown") {
      if (!sawShowdownThisBatch) {
        totals.handsToShowdown++;
        sawShowdownThisBatch = true;
      }
      totals.potSizes.push(log.potAmount);
    }
    if (log.t === "fold_win") {
      totals.foldWins++;
      totals.potSizes.push(log.pot);
    }
    if (log.t === "player_busted") totals.busts++;
    if (log.t === "mission_result") {
      totals.missionActive[log.missionId] = (totals.missionActive[log.missionId] ?? 0) + 1;
      if (log.achieved) {
        totals.missionAchieved[log.missionId] = (totals.missionAchieved[log.missionId] ?? 0) + 1;
        totals.missionRewardTotal[log.missionId] = (totals.missionRewardTotal[log.missionId] ?? 0) + log.reward;
      }
    }
  }
  return state.logs.length;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}
function pct(n: number, d: number): string {
  return d === 0 ? "0.0%" : `${((n / d) * 100).toFixed(1)}%`;
}

const startedAt = Date.now();
for (let i = 0; i < matchCount; i++) {
  runMatch(1000 + i);
}
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

console.log(`\n=== MysteryHoldem 시뮬레이션 (${matchCount}매치 / ${seatCount}인 / ${elapsed}s) ===\n`);

console.log("── 매치 종료 ──");
for (const [reason, count] of Object.entries(totals.endReason)) {
  console.log(`  ${reason.padEnd(22)} ${count}회 (${pct(count, totals.matches)})`);
}
console.log(`  평균 진행 라운드          ${mean(totals.rounds).toFixed(1)} / ${MYSTERY_HOLDEM_CONFIG.totalRounds}`);
console.log(`  매치당 버스트             ${(totals.busts / totals.matches).toFixed(2)}명`);

console.log("\n── 핸드 진행 ──");
console.log(`  총 핸드                   ${totals.handsPlayed}`);
console.log(`  쇼다운 도달               ${pct(totals.handsToShowdown, totals.handsPlayed)}`);
console.log(`  폴드 승리                 ${pct(totals.foldWins, totals.handsPlayed)}`);
console.log(`  평균 팟                   ${mean(totals.potSizes).toFixed(0)} chips`);
console.log(`  자발적 액션 비율(VPIP감)  ${pct(totals.voluntaryActions, totals.totalDecisions)}`);

console.log("\n── 점수 구성 (플레이어 단위) ──");
console.log(`  Chip Point    평균 ${mean(totals.chipPoints).toFixed(1)}  (p10 ${percentile(totals.chipPoints, 0.1).toFixed(0)} / p90 ${percentile(totals.chipPoints, 0.9).toFixed(0)})`);
console.log(`  Mission Point 평균 ${mean(totals.missionPoints).toFixed(1)}  (p10 ${percentile(totals.missionPoints, 0.1).toFixed(0)} / p90 ${percentile(totals.missionPoints, 0.9).toFixed(0)})`);
console.log(`  Bounty Point  평균 ${mean(totals.bountyPoints).toFixed(1)}  (p10 ${percentile(totals.bountyPoints, 0.1).toFixed(0)} / p90 ${percentile(totals.bountyPoints, 0.9).toFixed(0)})`);
const avgTotal = mean(totals.totalPoints);
console.log(`  Total Point   평균 ${avgTotal.toFixed(1)}`);
console.log(
  `  → 비중: Chip ${pct(mean(totals.chipPoints), avgTotal)} / Mission ${pct(mean(totals.missionPoints), avgTotal)} / Bounty ${pct(mean(totals.bountyPoints), avgTotal)}`,
);
if (totals.winnerMissionShare.length > 0) {
  console.log(`  우승자의 Mission+Bounty 의존도 평균 ${(mean(totals.winnerMissionShare) * 100).toFixed(1)}%`);
}

console.log("\n── Mission별 실측 (핸드 단위 달성률 / 평균 지급) ──");
const rows = MISSION_POOL.map((m) => {
  const active = totals.missionActive[m.id] ?? 0;
  const achieved = totals.missionAchieved[m.id] ?? 0;
  const rewardTotal = totals.missionRewardTotal[m.id] ?? 0;
  return {
    id: m.id,
    name: m.name,
    active,
    achieved,
    rate: active === 0 ? 0 : achieved / active,
    avgReward: achieved === 0 ? 0 : rewardTotal / achieved,
    evPerHand: active === 0 ? 0 : rewardTotal / active,
  };
}).sort((a, b) => b.evPerHand - a.evPerHand);

console.log(`  ${"Mission".padEnd(22)} ${"보유핸드".padStart(8)} ${"달성률".padStart(8)} ${"평균보상".padStart(9)} ${"핸드당EV".padStart(9)}`);
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(22)} ${String(r.active).padStart(8)} ${(r.rate * 100).toFixed(1).padStart(7)}% ${r.avgReward.toFixed(1).padStart(9)} ${r.evPerHand.toFixed(2).padStart(9)}`,
  );
}

const evs = rows.filter((r) => r.active > 0).map((r) => r.evPerHand);
if (evs.length > 1) {
  const spread = Math.max(...evs) / Math.max(0.0001, Math.min(...evs));
  console.log(`\n  Mission 간 EV 격차(최대/최소): ${spread.toFixed(1)}배`);
}
console.log("");
