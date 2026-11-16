// Bundle the compiled CLI into one self-contained executable file:
// apps/cli/dist/breaker-delta.mjs (bun shebang included, chmod +x).
// Built with Bun.build; the bundle has no runtime dependencies
// beyond Bun itself. Run with: bun scripts/bundle.mjs

import { chmodSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const entry = path.join(pkgRoot, "dist", "src", "cli.js");
const outfile = path.join(pkgRoot, "dist", "breaker-delta.mjs");

const result = await Bun.build({
  entrypoints: [entry],
  outdir: path.join(pkgRoot, "dist"),
  naming: "breaker-delta.mjs",
  target: "bun",
  format: "esm",
  banner: "#!/usr/bin/env bun",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
chmodSync(outfile, 0o755);
console.log(`bundled ${outfile}`);
