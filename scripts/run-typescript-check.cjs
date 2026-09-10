/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const requestedFile = process.argv[2];

if (!requestedFile) {
  console.error("Usage: node scripts/run-typescript-check.cjs <verify-file.ts>");
  process.exit(2);
}

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveHoldemModule(name, ...args) {
  const resolvedName = name.startsWith("@/")
    ? path.join(root, "src", name.slice(2))
    : name;
  return resolveFilename.call(this, resolvedName, ...args);
};

require(path.resolve(root, requestedFile));
