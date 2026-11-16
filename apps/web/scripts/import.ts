// Import a data directory into SQLite and verify the result against
// the file backend, item by item:
//
//   bun scripts/import.ts <data-dir> <db-path>
//
// Checks: edition / item / ledger counts; topic count and slug set;
// every topic's appearance sequence (edition, heat); and the full
// board history — the incremental board-state computation over the
// database's topics must equal the naive reference computation over
// the file backend's topics at every edition (rank, heat, deltas,
// carried flags). Exit code 0 only when everything matches.

import { buildTopics, catRulesFromConfig } from "@breaker-delta/core";

import { boardStates, boardStatesNaive, type BoardState } from "../lib/data";
import { FileStore, SqliteStore, importDataDir } from "../lib/store";

const [dir, dbPath] = process.argv.slice(2);
if (!dir || !dbPath) {
  console.error("usage: bun scripts/import.ts <data-dir> <db-path>");
  process.exit(2);
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const report = await importDataDir(dir, dbPath);
console.log(
  `imported: ${report.editions} editions, ${report.items} items, ` +
    `${report.ledgerTopics} ledger topics, ${report.topics} topics, ` +
    `${report.appearances} appearances -> ${report.dbPath}`,
);

const fileData = await new FileStore(dir).load();
const fileTopics = buildTopics(
  fileData.editions,
  fileData.ledger,
  catRulesFromConfig(fileData.config) ?? undefined,
);
const dbData = await new SqliteStore(dbPath).load();
const dbTopics = dbData.topics ?? [];

check("edition count", dbData.editions.length === fileData.editions.length,
  `${dbData.editions.length} vs ${fileData.editions.length}`);
check(
  "edition payloads identical",
  JSON.stringify(dbData.editions) === JSON.stringify(fileData.editions),
);
check("ledger count", dbData.ledger.length === fileData.ledger.length,
  `${dbData.ledger.length} vs ${fileData.ledger.length}`);
check("topic count", dbTopics.length === fileTopics.length,
  `${dbTopics.length} vs ${fileTopics.length}`);
check(
  "slug sets identical",
  JSON.stringify(dbTopics.map((t) => t.slug).sort()) ===
    JSON.stringify(fileTopics.map((t) => t.slug).sort()),
);

let appsOk = true;
const fileByKey = new Map(fileTopics.map((t) => [t.key, t]));
for (const dt of dbTopics) {
  const ft = fileByKey.get(dt.key);
  if (!ft) {
    appsOk = false;
    break;
  }
  const seq = (apps: typeof dt.apps) => apps.map((a) => `${a.edition}:${a.heat}`).join(",");
  if (seq(dt.apps) !== seq(ft.apps)) {
    appsOk = false;
    console.log(`  appearance mismatch: ${dt.key}`);
    break;
  }
}
check("appearance sequences (edition:heat per topic)", appsOk);

function boardDigest(states: Map<string, BoardState>[]): string {
  return states
    .map((st) =>
      [...st.values()]
        .sort((a, b) => a.rank - b.rank)
        .map(
          (s) =>
            `${s.topic.key}#${s.rank}#${s.heat}#${s.heatDelta ?? ""}#${s.rankDelta ?? ""}#${s.carried ? 1 : 0}`,
        )
        .join("|"),
    )
    .join("\n");
}
const incDigest = boardDigest(boardStates(dbTopics, dbData.editions.length));
const naiveDigest = boardDigest(boardStatesNaive(fileTopics, fileData.editions.length));
check(
  "board history identical (incremental over DB vs naive over files, all editions)",
  incDigest === naiveDigest,
);

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
