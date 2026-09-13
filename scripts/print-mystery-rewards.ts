import { HAND_RANK } from "../src/holdem/pokerEval";
import { MYSTERY_HOLDEM_CONFIG, bountyRewardForSeatCount } from "../src/mysteryHoldem/config";
import { HAND_RANK_WEIGHT, madeHandRewardMultiplier, roundToTen } from "../src/mysteryHoldem/missionRewards";
import { MISSION_POOL } from "../src/mysteryHoldem/mysteryMissions";

/**
 * 현재 확정된 Mission/Bounty 점수 구성표를 소스에서 직접 출력한다.
 * 밸런스 논의 때 문서와 코드가 어긋나지 않도록, 표는 항상 코드가 진실이다.
 */

const RANK_NAMES: Record<number, string> = {
  [HAND_RANK.TRIPS]: "트립스",
  [HAND_RANK.STRAIGHT]: "스트레이트",
  [HAND_RANK.FLUSH]: "플러시",
  [HAND_RANK.FULL_HOUSE]: "풀하우스",
  [HAND_RANK.QUADS]: "포카드",
  [HAND_RANK.STRAIGHT_FLUSH]: "스트레이트플러시",
};
const LADDER = [
  HAND_RANK.TRIPS,
  HAND_RANK.STRAIGHT,
  HAND_RANK.FLUSH,
  HAND_RANK.FULL_HOUSE,
  HAND_RANK.QUADS,
  HAND_RANK.STRAIGHT_FLUSH,
];

console.log("\n=== 점수 환산 기준 ===");
console.log(`  Chip Point      = 보유 칩 / ${MYSTERY_HOLDEM_CONFIG.chipPointDivisor}`);
console.log(
  `  시작 칩 ${MYSTERY_HOLDEM_CONFIG.startingChips.toLocaleString()} = ${MYSTERY_HOLDEM_CONFIG.startingChips / MYSTERY_HOLDEM_CONFIG.chipPointDivisor} Chip Point (= 1 Mission Point는 칩 ${MYSTERY_HOLDEM_CONFIG.chipPointDivisor}개와 동일)`,
);
console.log("\n=== Bounty Point (총 플레이어 수별, 버스트 1명당) ===");
for (let n = MYSTERY_HOLDEM_CONFIG.minSeats; n <= MYSTERY_HOLDEM_CONFIG.maxSeats; n++) {
  const note = n === 2 ? "  (헤즈업은 버스트 즉시 생존 승리라 점수 비교 없음)" : "";
  console.log(`  ${String(n).padStart(2)}인   ${String(bountyRewardForSeatCount(n)).padStart(4)}점${note}`);
}
console.log("  * 해당 팟 승자가 여럿이면 균등 분배");

console.log("\n=== 족보 가중치 (높은 족보 계수 산출용) ===");
for (const rank of LADDER) {
  console.log(`  ${RANK_NAMES[rank]!.padEnd(18)} weight ${HAND_RANK_WEIGHT[rank]}`);
}

console.log("\n=== Mission별 기본 점수 ===");
console.log(`  ${"Mission".padEnd(20)} ${"분류".padEnd(10)} ${"기본점수".padStart(8)}   조건`);
for (const m of MISSION_POOL) {
  const reward = m.id === "counter_steal" ? "피해자의 50%" : String(m.reward);
  console.log(`  ${m.name.padEnd(20)} ${m.category.padEnd(10)} ${reward.padStart(8)}   ${m.description}`);
}

console.log("\n=== Made 계열: 달성 족보별 실제 지급액 ===");
const madeMissions = MISSION_POOL.filter((m) => m.madeHandThreshold != null);
const header = ["Mission".padEnd(16), ...LADDER.map((r) => RANK_NAMES[r]!.padStart(9))].join(" ");
console.log(`  ${header}`);
for (const m of madeMissions) {
  const cells = LADDER.map((rank) => {
    if (rank < m.madeHandThreshold!) return "—".padStart(9);
    const mult = madeHandRewardMultiplier(rank, m.madeHandThreshold!);
    return String(roundToTen(m.reward * mult)).padStart(9);
  });
  console.log(`  ${m.name.padEnd(16)} ${cells.join(" ")}`);
}
console.log("\n  (— 는 해당 족보로는 조건 미달)\n");
