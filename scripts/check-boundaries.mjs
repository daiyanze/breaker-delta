#!/usr/bin/env bun
// Import-boundary check (Rewrite Phase 0, design doc §3.1/§9.2).
//
// The target architecture has one dependency direction: apps depend
// on packages, packages never depend on apps, and the domain package
// (@breaker-delta/core) depends on nothing — no sibling packages, no
// node IO in src. CI runs this with --strict (any violation fails);
// without the flag it only reports (warn mode, for local triage).

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

const AREAS = [
  { dir: "packages/core", pkg: "@breaker-delta/core", layer: "domain" },
  { dir: "packages/stores", pkg: "@breaker-delta/stores", layer: "package" },
  { dir: "packages/fetchers", pkg: "@breaker-delta/fetchers", layer: "package" },
  { dir: "packages/publisher", pkg: "@breaker-delta/publisher", layer: "package" },
  { dir: "apps/cli", pkg: "@breaker-delta/cli", layer: "app" },
  { dir: "apps/web", pkg: "@breaker-delta/web", layer: "app" },
  { dir: "apps/extension", pkg: "@breaker-delta/extension", layer: "app" },
];
const PKG_OF = new Map(AREAS.map((a) => [a.pkg, a]));

function* sourceFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".next") continue;
      yield* sourceFiles(p);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield p;
    }
  }
}

const violations = [];
for (const area of AREAS) {
  for (const file of sourceFiles(path.join(root, area.dir))) {
    const rel = path.relative(root, file);
    if (rel.includes(`${path.sep}test${path.sep}`) || rel.endsWith(".test.ts")) continue;
    const text = fs.readFileSync(file, "utf-8");
    for (const m of text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (spec.startsWith("@breaker-delta/")) {
        const target = PKG_OF.get(spec.split("/").slice(0, 2).join("/"));
        if (!target || target === area) continue;
        if (area.layer === "domain") {
          violations.push(`${rel}: domain imports ${spec} (domain must depend on nothing)`);
        } else if (area.layer === "package" && target.layer === "app") {
          violations.push(`${rel}: package imports app package ${spec}`);
        } else if (area.layer === "app" && target.layer === "app") {
          violations.push(`${rel}: app imports sibling app ${spec}`);
        }
      } else if (area.layer === "domain" && spec.startsWith("node:")) {
        violations.push(`${rel}: domain imports ${spec} (IO belongs in adapters; Phase 1)`);
      }
    }
  }
}

if (violations.length === 0) {
  console.log("boundaries: no violations");
} else {
  console.log(`boundaries: ${violations.length} violation(s)${strict ? "" : " (warn mode)"}:`);
  for (const v of violations) console.log(`  - ${v}`);
}
process.exit(strict && violations.length > 0 ? 1 : 0);
