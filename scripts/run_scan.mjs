// Minimal Node scan entry for the Phase 2 dual-run (the formal CLI
// arrives in Phase 4). Run from the target data directory:
//   node scripts/run_scan.mjs [edition]
// It loads config from the CWD (same search order as Python) and
// writes state/candidates-<YYYYMMDD>-<edition>.json under the CWD,
// exactly like `python -m radar scan` launched there.

import { loadConfig, runScan, summaryLines } from "../packages/fetchers/dist/src/index.js";

const edition = process.argv[2] ?? "evening";
const config = loadConfig(null, { cwd: process.cwd() });
const report = await runScan(edition, config, { baseDir: process.cwd() });
for (const line of summaryLines(report)) console.log(line);
