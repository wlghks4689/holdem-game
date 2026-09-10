/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

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
];

function runChecks(selectedChecks) {
  for (const check of selectedChecks) {
    console.log(`\n> ${check.label} (${check.file})`);
    const args = check.file.endsWith(".ts")
      ? [typescriptRunner, check.file]
      : [check.file];
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`\nFAILED: ${check.label}`);
      console.error(result.error);
      process.exitCode = 1;
      return false;
    }
    if (result.status !== 0) {
      console.error(`\nFAILED: ${check.label} (${check.file})`);
      process.exitCode = result.status ?? 1;
      return false;
    }

    console.log(`PASS: ${check.label}`);
  }

  console.log("\nAll holdem regression checks passed.");
  return true;
}

function checksForGroup(group) {
  if (group == null) return checks;
  const selected = checks.filter((check) => check.group === group);
  if (selected.length === 0) {
    console.error(`Unknown test group: ${group}`);
    console.error("Available groups: ai, game, online");
    process.exitCode = 2;
  }
  return selected;
}

if (require.main === module) {
  const selected = checksForGroup(process.argv[2]);
  if (selected.length > 0) runChecks(selected);
}

module.exports = { checks, runChecks };
