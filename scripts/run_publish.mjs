// Run the Node publisher (@breaker-delta/publisher) with build
// options taken from a JSON file: node scripts/run_publish.mjs opts.json
// The JSON keys are exactly BuildOptions (rootDir, editionsDir,
// ledgerPath, trackRecordPath, configDir, faviconCacheDir, outDir,
// baseUrl, dataRepo, langs, creator, pageSize, archiveDays,
// sourcesPerPage, shareKeys). Used by scripts/diff_builds.py and for
// manual parity checks against radar/publish.py.

import { readFileSync } from "node:fs";
import { buildSite } from "../packages/publisher/dist/src/index.js";

const opts = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const written = await buildSite(opts);
console.log(`wrote ${written.length} html files`);
