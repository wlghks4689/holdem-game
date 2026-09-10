/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "dev", "--port", "3001"], {
  cwd: root,
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-codex",
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
