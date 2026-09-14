import { HAND_RANK } from "../src/holdem/pokerEval";
import { MYSTERY_HOLDEM_CONFIG, bountyRewardForSeatCount } from "../src/mysteryHoldem/config";
import { HIGH_END_REWARD_BY_HAND_RANK, MISSION_POOL } from "../src/mysteryHoldem/mysteryMissions";
import { CARD_CATEGORY_LABEL, cardCategoryFromLegacy } from "../src/mysteryHoldem/mysteryCard";

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

console.log("\n=== Mystery Card 풀 ===");
console.log(`  ${"Card".padEnd(20)} ${"분류".padEnd(8)} ${"점수".padStart(6)}   조건`);
for (const m of MISSION_POOL) {
  // 보상이 고정값이 아닌 카드(High-End Maker, Blind Defender, 강탈 등)는 "가변"으로 표기한다.
  const reward = m.rewardFor != null || (m.reward === 0 && m.onAchieved != null) ? "가변" : String(m.reward);
  const label = CARD_CATEGORY_LABEL[cardCategoryFromLegacy(m.category)];
  console.log(`  ${m.name.padEnd(20)} ${label.padEnd(8)} ${reward.padStart(6)}   ${m.description}`);
}

console.log("\n=== High-End Maker 보상표(족보별 명시값) ===");
for (const rank of LADDER) {
  const reward = HIGH_END_REWARD_BY_HAND_RANK[rank];
  if (reward == null) continue;
  console.log(`  ${RANK_NAMES[rank]!.padEnd(18)} ${String(reward).padStart(6)}점`);
}
console.log("  * 로열 플러시는 스트레이트 플러시의 최상위이므로 같은 구간이다");

console.log("\n=== Blind Defender: 시작 인원별 보상 ===");
for (let n = MYSTERY_HOLDEM_CONFIG.minSeats; n <= MYSTERY_HOLDEM_CONFIG.maxSeats; n++) {
  console.log(`  ${String(n).padStart(2)}인   ${String(n * 10).padStart(4)}점`);
}
console.log("  * 중간 버스트로 생존자가 줄어도 시작 인원 기준값을 유지한다\n");
