// Bundle the compiled CLI into one self-contained executable file:
// apps/cli/dist/breaker-delta.mjs (shebang included, chmod +x).
// The bundle has no runtime dependencies beyond node itself.

import { chmodSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const entry = path.join(pkgRoot, "dist", "src", "cli.js");
const outfile = path.join(pkgRoot, "dist", "breaker-delta.mjs");

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  banner: { js: "#!/usr/bin/env node" },
});
chmodSync(outfile, 0o755);
console.log(`bundled ${outfile}`);
