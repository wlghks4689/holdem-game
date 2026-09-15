/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const typescriptRunner = path.join("scripts", "run-typescript-check.cjs");

const checks = [
  { group: "ai", label: "Preflop AI", file: "scripts/verify-preflop-ai.ts" },
  {
    group: "ai",
    label: "Postflop AI strength",
    file: "scripts/verify-postflop-ai-strength.ts",
  },
  {
    group: "ai",
    label: "Postflop AI sizing",
    file: "scripts/verify-postflop-ai-sizing.ts",
  },
  { group: "ai", label: "All-in call AI", file: "scripts/verify-allin-call-ai.ts" },
  { group: "game", label: "Action timer", file: "scripts/verify-action-timer.ts" },
  {
    group: "game",
    label: "Betting pressure feedback",
    file: "scripts/verify-betting-pressure.ts",
  },
  { group: "game", label: "All-in actions", file: "scripts/verify-allin-actions.ts" },
  { group: "game", label: "All-in cinema", file: "scripts/verify-allin-cinema.ts" },
  {
    group: "game",
    label: "All-in runout",
    file: "scripts/verify-allin-runout-flow.ts",
  },
  { group: "game", label: "Cost game", file: "scripts/verify-cost-mode.ts" },
  { group: "game", label: "Cost Turbo", file: "scripts/verify-cost-turbo.ts" },
  {
    group: "game",
    label: "Showdown presentation",
    file: "scripts/verify-showdown-presentation.ts",
  },
  {
    group: "game",
    label: "Showdown range tracking",
    file: "scripts/verify-showdown-range-tracker.ts",
  },
  {
    group: "online",
    label: "Room storage",
    file: "scripts/verify-room-storage.cjs",
  },
  { group: "mystery", label: "MysteryHoldem cards", file: "scripts/verify-mystery-cards.ts" },
  { group: "mystery", label: "MysteryHoldem blinds/ante", file: "scripts/verify-mystery-blinds.ts" },
  {
    group: "mystery",
    label: "MysteryHoldem blinds after bust",
    file: "scripts/verify-mystery-blinds-after-bust.ts",
  },
  {
    group: "mystery",
    label: "MysteryHoldem mission rewards",
    file: "scripts/verify-mystery-missionrewards.ts",
  },
  { group: "mystery", label: "MysteryHoldem missions", file: "scripts/verify-mystery-missions.ts" },
  {
    group: "mystery",
    label: "MysteryHoldem card resolution order",
    file: "scripts/verify-mystery-card-resolution.ts",
  },
  {
    group: "mystery",
    label: "MysteryHoldem mission cards",
    file: "scripts/verify-mystery-cards-mission.ts",
  },
  {
    group: "mystery",
    label: "MysteryHoldem trigger/target cards",
    file: "scripts/verify-mystery-cards-trigger.ts",
  },
  {
    group: "mystery",
    label: "MysteryHoldem enhancement cards",
    file: "scripts/verify-mystery-cards-enhance.ts",
  },
  {
    group: "mystery",
    label: "MysteryHoldem maker one-card/SF",
    file: "scripts/verify-mystery-maker-onecard.ts",
  },
  {
    group: "mystery",
    label: "MysteryHoldem mission feedback",
    file: "scripts/verify-mystery-mission-feedback.ts",
  },
  {
    group: "mystery",
    label: "MysteryHoldem board-play exclusion",
    file: "scripts/verify-mystery-board-play.ts",
  },
  { group: "mystery", label: "MysteryHoldem four card", file: "scripts/verify-mystery-fourcard.ts" },
  { group: "mystery", label: "MysteryHoldem pot-limit", file: "scripts/verify-mystery-potlimit.ts" },
  {
    group: "mystery",
    label: "MysteryHoldem all-in pot limit",
    file: "scripts/verify-mystery-allin-potlimit.ts",
  },
  { group: "mystery", label: "MysteryHoldem raise cap", file: "scripts/verify-mystery-raisecap.ts" },
  {
    group: "mystery",
    label: "MysteryHoldem incomplete all-in",
    file: "scripts/verify-mystery-incomplete-allin.ts",
  },
  { group: "mystery", label: "MysteryHoldem turn order", file: "scripts/verify-mystery-turnorder.ts" },
  { group: "mystery", label: "MysteryHoldem fold (no penalty)", file: "scripts/verify-mystery-fold.ts" },
  { group: "mystery", label: "MysteryHoldem side pots", file: "scripts/verify-mystery-sidepot.ts" },
  { group: "mystery", label: "MysteryHoldem bust + bounty", file: "scripts/verify-mystery-bust.ts" },
  { group: "mystery", label: "MysteryHoldem scoring", file: "scripts/verify-mystery-scoring.ts" },
  { group: "mystery", label: "MysteryHoldem game end", file: "scripts/verify-mystery-gameend.ts" },
  { group: "mystery", label: "MysteryHoldem full game loop", file: "scripts/verify-mystery-fullgame.ts" },
];

/**
 * 검증 스크립트는 서로 상태를 공유하지 않는 독립 프로세스라 병렬로 돌려도 안전하다.
 * 직렬로 돌리면 코어 하나만 쓰면서 나머지가 놀기 때문에, CPU 수만큼 동시에 띄운다.
 *
 * 출력은 실행 순서가 아니라 **목록 순서대로** 모아서 찍는다. 병렬 실행의 출력이 뒤섞이면
 * 어떤 테스트가 무엇을 출력했는지 읽을 수 없기 때문에, 각 프로세스의 출력을 버퍼에 담아
 * 두었다가 순서대로 내보낸다.
 */
function runChecks(selectedChecks) {
  const concurrency = Math.max(1, Math.min(os.cpus().length, selectedChecks.length));
  const results = new Array(selectedChecks.length).fill(null);
  let nextIndex = 0;
  let failed = false;

  return new Promise((resolve) => {
    function launchNext() {
      if (nextIndex >= selectedChecks.length) {
        if (results.every((r) => r != null)) finish();
        return;
      }
      const index = nextIndex++;
      const check = selectedChecks[index];
      const args = check.file.endsWith(".ts") ? [typescriptRunner, check.file] : [check.file];
      const child = spawn(process.execPath, args, { cwd: root, env: process.env });

      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      child.on("error", (error) => {
        results[index] = { check, output: String(error), status: 1 };
        launchNext();
      });
      child.on("close", (status) => {
        results[index] = { check, output, status };
        launchNext();
      });
    }

    function finish() {
      for (const { check, output, status } of results) {
        console.log(`\n> ${check.label} (${check.file})`);
        if (output) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
        if (status !== 0) {
          console.error(`FAILED: ${check.label} (${check.file})`);
          process.exitCode = status || 1;
          failed = true;
        } else {
          console.log(`PASS: ${check.label}`);
        }
      }
      if (!failed) console.log("\nAll holdem regression checks passed.");
      resolve(!failed);
    }

    for (let i = 0; i < concurrency; i++) launchNext();
  });
}

function checksForGroup(group) {
  if (group == null) return checks;
  const selected = checks.filter((check) => check.group === group);
  if (selected.length === 0) {
    console.error(`Unknown test group: ${group}`);
    console.error("Available groups: ai, game, online, mystery");
    process.exitCode = 2;
  }
  return selected;
}

if (require.main === module) {
  const selected = checksForGroup(process.argv[2]);
  if (selected.length > 0) runChecks(selected);
}

module.exports = { checks, runChecks };
