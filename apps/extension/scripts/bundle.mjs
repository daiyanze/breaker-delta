// Build the loadable extension directory apps/extension/dist/:
// Bun.build bundles the four compiled entry points (popup / content /
// background / options, with @breaker-delta/core inlined) as classic
// scripts — the manifest declares no module service worker — and the
// static files (manifest, html/css, icons, data/ scaffolding, README)
// are copied verbatim. dist/ is a build product and is not committed;
// data/topics.json and data/alerts.json are instance data and are
// injected at packaging time (see data/README.md), never built here.
// Run with: bun scripts/bundle.mjs

import { cpSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const dist = path.join(pkgRoot, "dist");
const tscOut = path.join(dist, "tsc");

for (const name of ["popup", "content", "background", "options"]) {
  const result = await Bun.build({
    entrypoints: [path.join(tscOut, "src", `${name}.js`)],
    outdir: dist,
    naming: `${name}.js`,
    target: "browser",
    format: "iife",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

for (const file of ["manifest.json", "popup.html", "popup.css", "content.css", "options.html", "options.css", "README.md", "README.zh-CN.md"]) {
  cpSync(path.join(pkgRoot, file), path.join(dist, file));
}
cpSync(path.join(pkgRoot, "icons"), path.join(dist, "icons"), { recursive: true });
mkdirSync(path.join(dist, "data"), { recursive: true });
for (const file of ["README.md", ".gitignore"]) {
  cpSync(path.join(pkgRoot, "data", file), path.join(dist, "data", file));
}

console.log(`extension built in ${dist}`);
