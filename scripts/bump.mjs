// Bump the shared engine version everywhere it lives.
//
//   bun scripts/bump.mjs 0.22.0
//
// Updates: root package.json, packages/{core,fetchers,publisher},
// apps/cli (version + its @breaker-delta/* dependency specs),
// packages/fetchers + packages/publisher + apps/extension
// (@breaker-delta/core dependency spec), .claude-plugin/plugin.json,
// and the CLI VERSION constant in apps/cli/src/context.ts.
//
// Edits are surgical text replacements of the version strings only,
// so each file's existing formatting (some package.json files are
// compact one-liners) is preserved.
//
// The extension's OWN version (apps/extension/package.json +
// manifest.json) is a separate line and is NOT touched — bump it in
// both files when the extension itself changes.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];
if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error("usage: bun scripts/bump.mjs X.Y.Z");
  process.exit(2);
}

const current = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
if (next === current) {
  console.error(`bump: already at ${current}`);
  process.exit(1);
}
console.log(`bump: engine version ${current} -> ${next}`);

function edit(rel, { version = false, deps = false } = {}) {
  const file = path.join(root, rel);
  let text = readFileSync(file, "utf8");
  const before = text;
  if (version) {
    text = text.replace(/"version":\s*"[0-9]+\.[0-9]+\.[0-9]+"/, `"version": "${next}"`);
  }
  if (deps) {
    text = text.replace(/"(@breaker-delta\/[a-z]+)":\s*"[0-9]+\.[0-9]+\.[0-9]+"/g, `"$1": "${next}"`);
  }
  if (text === before) {
    console.error(`bump: error: no change made in ${rel}`);
    process.exit(1);
  }
  writeFileSync(file, text);
  console.log(`  ${rel}`);
}

edit("package.json", { version: true });
edit("packages/core/package.json", { version: true, deps: true });
edit("packages/fetchers/package.json", { version: true, deps: true });
edit("packages/publisher/package.json", { version: true, deps: true });
edit("apps/cli/package.json", { version: true, deps: true });
edit("apps/extension/package.json", { deps: true }); // own version untouched
edit(".claude-plugin/plugin.json", { version: true });

const ctxFile = path.join(root, "apps/cli/src/context.ts");
const ctx = readFileSync(ctxFile, "utf8");
if (!/export const VERSION = "[^"]+"/.test(ctx)) {
  console.error("bump: error: VERSION constant not found in apps/cli/src/context.ts");
  process.exit(1);
}
writeFileSync(ctxFile, ctx.replace(/export const VERSION = "[^"]+"/, `export const VERSION = "${next}"`));
console.log("  apps/cli/src/context.ts");

// Sync the lockfiles (they record every workspace version and the
// inter-package dependency specs; --frozen-lockfile / npm ci refuse an
// out-of-sync lock). bun.lock is canonical since the Bun migration;
// package-lock.json is kept in sync only until the last npm consumer
// (the data repo's GitHub workflow) retires at the Cloudflare cutover.
console.log("  bun.lock (bun install)");
execFileSync("bun", ["install"], { cwd: root, stdio: "inherit" });
console.log("  package-lock.json (npm install --package-lock-only)");
execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: root, stdio: "inherit" });

console.log(`bump: done. Next: add a CHANGELOG section, run bun test, commit, tag v${next}.`);
