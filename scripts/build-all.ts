#!/usr/bin/env bun
// Cross-compile standalone `bs` binaries for common platforms.
import { mkdirSync } from "node:fs";

const targets = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
];

mkdirSync("dist", { recursive: true });

for (const target of targets) {
  const out = `dist/bs-${target.replace("bun-", "")}`;
  console.error(`building ${out} ...`);
  const proc = Bun.spawnSync([
    "bun",
    "build",
    "./src/cli.ts",
    "--compile",
    `--target=${target}`,
    "--outfile",
    out,
  ]);
  if (proc.exitCode !== 0) {
    console.error(new TextDecoder().decode(proc.stderr));
    process.exit(proc.exitCode ?? 1);
  }
}
console.error("done.");
