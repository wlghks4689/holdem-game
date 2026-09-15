import { MYSTERY_HOLDEM_CONFIG, bountyRewardForSeatCount } from "../src/mysteryHoldem/config";
import {
  autoAssignPendingCardTargets,
  createInitialMysteryGameState,
  mysteryHoldemReducer,
} from "../src/mysteryHoldem/gameReducer";
import { decideBotAction, pickHoleKeepIndexes, pickMissionId } from "../src/mysteryHoldem/bot/botPolicy";
import { CardMetrics } from "./simulateCardMetrics";
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
  /** 이 Mission이 상대에게서 지운 점수(Counter 계열의 실제 가치) */
  missionDeniedByCounter: number;
  missionDeniedCount: number;
  /** 버스트를 시킨 플레이어가 그 핸드에서 가져간 칩(Chip Point 환산) */
  bustChipGain: number[];
}

const cardMetrics = new CardMetrics();

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
  missionDeniedByCounter: 0,
  missionDeniedCount: 0,
  bustChipGain: [],
};

function dispatch(state: MysteryGameState, action: MysteryGameAction, rng: () => number): MysteryGameState {
  return mysteryHoldemReducer(state, action, rng);
}

function runMatch(seed: number): void {
  const rng = mulberry32(seed);
  let state = dispatch(createInitialMysteryGameState(), { type: "START_MATCH", seatCount }, rng);
  let logCursor = 0;
  let guard = 0;
  // 스냅샷은 라운드마다 정확히 한 번 잡는다. hand_setup 블록 안에서 잡으려 하면, 마지막
  // SELECT_ 액션이 곧바로 preflop으로 넘겨 버리기 때문에 그 지점에 닿지 않는다.
  let snapshotRound = 0;

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

    if (state.phase === "preflop" && snapshotRound !== state.round) {
      // 카드·홀카드가 모두 확정된 시점 = 이 핸드의 "보유 카드"가 정해진 시점이다(§29).
      snapshotRound = state.round;
      cardMetrics.beginHand(state);
    }

    // 지정형 카드(Mission Breaker / Parasite)는 플랍에서 대상을 골라야 액션할 수 있다(§22).
    if (state.awaitingCardTarget.length > 0) {
      state = autoAssignPendingCardTargets(state, rng);
      continue;
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
      cardMetrics.endHand(state, logCursor);
      logCursor = collectHandStats(state, logCursor);
      state = dispatch(state, { type: "START_NEXT_HAND" }, rng);
      continue;
    }

    break;
  }

  cardMetrics.endHand(state, logCursor);
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
  // 이 핸드에서 좌석별로 가져간 팟(버스트 1건의 실제 가치를 재기 위해)
  const wonBySeat = new Map<number, number>();
  for (let i = cursor; i < state.logs.length; i++) {
    const log = state.logs[i]!;
    if (log.t === "showdown") {
      for (const w of log.winners) {
        wonBySeat.set(w, (wonBySeat.get(w) ?? 0) + log.potAmount / log.winners.length);
      }
    }
    if (log.t === "fold_win") {
      wonBySeat.set(log.winner, (wonBySeat.get(log.winner) ?? 0) + log.pot);
    }
    if (log.t === "bounty_awarded") {
      const chipsWon = wonBySeat.get(log.seat) ?? 0;
      totals.bustChipGain.push(chipsWon / MYSTERY_HOLDEM_CONFIG.chipPointDivisor);
    }
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
      if (log.deniedReward > 0) {
        totals.missionDeniedByCounter += log.deniedReward;
        totals.missionDeniedCount++;
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

/**
 * 중요: Chip Point 평균은 항상 시작 칩 / 100(= 300)으로 고정된다(제로섬).
 * 따라서 "Mission이 전체의 몇 %인가"는 의미가 없고, 승패를 가르는 것은
 * 기본값 300에서 얼마나 벗어났는지(편차)다. Mission/Bounty는 그 편차와 비교해야 한다.
 */
const baseline = MYSTERY_HOLDEM_CONFIG.startingChips / MYSTERY_HOLDEM_CONFIG.chipPointDivisor;
const chipDeviations = totals.chipPoints.map((c) => Math.abs(c - baseline));
const avgChipDev = mean(chipDeviations);
console.log(`\n  [기본값 ${baseline}점 기준 실질 영향력]`);
console.log(`  Chip Point 편차   평균 ${avgChipDev.toFixed(1)}  (p90 ${percentile(chipDeviations, 0.9).toFixed(0)})`);
console.log(`  Mission Point     평균 ${mean(totals.missionPoints).toFixed(1)}  → 칩 편차 대비 ${pct(mean(totals.missionPoints), avgChipDev)}`);
console.log(`  Bounty Point      평균 ${mean(totals.bountyPoints).toFixed(1)}  → 칩 편차 대비 ${pct(mean(totals.bountyPoints), avgChipDev)}`);
if (totals.bustChipGain.length > 0) {
  console.log(
    `\n  버스트 1건의 총 가치 = 그 핸드에서 얻은 칩 ${mean(totals.bustChipGain).toFixed(0)}점 + Bounty ${bountyRewardForSeatCount(seatCount)}점`,
  );
}
if (totals.winnerMissionShare.length > 0) {
  console.log(`  우승자의 Mission+Bounty 의존도 평균 ${(mean(totals.winnerMissionShare) * 100).toFixed(1)}%`);
}

console.log("\n── Mystery Card 카테고리별 실측(§29) ──");
console.log(cardMetrics.report());

if (totals.missionDeniedCount > 0) {
  const avgDenied = totals.missionDeniedByCounter / totals.missionDeniedCount;
  console.log(
    `\n  무효화로 사라진 점수: ${totals.missionDeniedCount}건 / ` +
      `총 ${totals.missionDeniedByCounter.toFixed(0)}점 (건당 평균 ${avgDenied.toFixed(0)}점)`,
  );
}

// EV 격차는 미션형끼리만 비교한다. 강화형·발동형은 점수가 0에 가깝게 설계된 카드라
// 함께 넣으면 격차가 무한대로 나오면서 아무 의미도 없는 숫자가 된다(§29).
// Bounty Hunter는 미션형이지만 보상을 Bounty Point로 받도록 설계된 카드라 Mission EV가
// 0이다. 격차 계산에 넣으면 분모가 0에 가까워져 "12만 배" 같은 무의미한 숫자가 나온다.
const missionEvs = cardMetrics
  .rows()
  .filter((r) => r.category === "mission" && r.heldHands > 0 && r.bountyDelta === 0)
  .map((r) => r.rewardTotal / r.heldHands);
if (missionEvs.length > 1) {
  const spread = Math.max(...missionEvs) / Math.max(0.0001, Math.min(...missionEvs));
  console.log(`
  미션형 카드 간 EV 격차(최대/최소): ${spread.toFixed(1)}배`);
}
console.log("");
