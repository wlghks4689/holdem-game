import fs from "node:fs";
import path from "node:path";
import { chromium } from "C:/Users/PC21/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const outputDirectory = path.resolve("artifacts/showcase");
const outputPath = path.join(
  outputDirectory,
  "holdem-4bet-allin-showdown-1920x1080.webm",
);

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: outputDirectory,
      size: { width: 1920, height: 1080 },
    },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const video = page.video();

  await page.goto("http://localhost:3000/holdem/showcase/allin", {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => {
    localStorage.setItem("holdem-motion-debug-v1", "1");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "연출 시작" }).click();
  await page.waitForTimeout(29_000);

  const recordedPath = video ? await video.path() : null;
  await context.close();
  await browser.close();
  if (!recordedPath) throw new Error("Playwright video recorder was not initialized.");
  fs.copyFileSync(recordedPath, outputPath);
  if (path.resolve(recordedPath) !== path.resolve(outputPath)) {
    fs.unlinkSync(recordedPath);
  }
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
