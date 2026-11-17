// The push API's write side — the same contract the CLI's `serve`
// implements (see apps/cli/src/serve.ts): POST /api/editions drops
// in one finished edition, POST /api/record writes graded topics
// back to the ledger store. Both backends are supported:
//
// - files: editions land as JSON files in the data directory and
//   the ledger is state/seen-topics.json (byte-for-byte the CLI's
//   behaviour, so the two servers can front the same data dir);
// - SQLite: the edition/ledger change is applied to the stored
//   payload and the derived topic rows are rewritten in one
//   transaction (writeAllToDb).
//
// After every accepted write the site-data cache is invalidated, so
// the next page render sees the new data (the CLI re-renders its
// in-memory site; here pages render per request anyway).

import * as fs from "node:fs";
import * as path from "node:path";

import type { Edition, StoreTopic } from "@breaker-delta/core";
import {
  applyRecordToStore,
  editionConflictMessage,
  validateRecordEntries,
  type RecordEntry,
} from "@breaker-delta/services";
import { loadStore, saveStore } from "@breaker-delta/stores";
import { attachEditionHeat, compareEditionOrder } from "@breaker-delta/stores/editions";

import { dataDir, dbPath, invalidateSiteData } from "./data";
import {
  loadEditionsFromDir,
  loadLedgerFromDir,
  openSqlite,
  SqliteStore,
  writeAllToDb,
} from "./store";

export type { RecordEntry };

/** Entry validation is the push contract's, shared with the CLI
 *  via @breaker-delta/services (Rewrite Phase 2b). */
export function validateEntries(data: unknown): RecordEntry[] {
  return validateRecordEntries(data);
}

/** buildTopics requires editions to carry _heat/_rank (attached
 * by the load step); a pushed edition arrives raw, so attach them
 * with the shared loader's helper before it enters the DB path.
 * (The file path writes the raw object, as the CLI's serve does,
 * and its loader attaches them on read.) */
function attachHeat(ed: Edition): Edition {
  const copy: Edition = { ...ed, items: ed.items.map((it) => ({ ...it })) };
  attachEditionHeat(copy);
  return copy;
}

function sortEditions(editions: Edition[]): Edition[] {
  return [...editions].sort(compareEditionOrder);
}

export type PushEditionResult =
  | { ok: true; items: number }
  | { ok: false; conflict: string };

export async function pushEdition(
  ed: Edition,
  replace: boolean,
): Promise<PushEditionResult> {
  const db = dbPath();
  if (db === null) {
    const editionsDir = path.join(dataDir(), "editions");
    const file = path.join(editionsDir, `${ed.date}-${ed.slot}.json`);
    if (fs.existsSync(file) && !replace) {
      return {
        ok: false,
        conflict: editionConflictMessage(ed.date, ed.slot ?? ""),
      };
    }
    fs.mkdirSync(editionsDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(ed, null, 2) + "\n", "utf-8");
    invalidateSiteData();
    return { ok: true, items: ed.items.length };
  }
  const store = new SqliteStore(db);
  const cur = await store.load();
  const editions = [...cur.editions];
  const at = editions.findIndex((x) => x.date === ed.date && x.slot === ed.slot);
  if (at >= 0 && !replace) {
    return {
      ok: false,
      conflict: editionConflictMessage(ed.date, ed.slot ?? ""),
    };
  }
  const prepared = attachHeat(ed);
  if (at >= 0) editions[at] = prepared;
  else editions.push(prepared);
  const handle = await openSqlite(db, false);
  try {
    writeAllToDb(handle, {
      editions: sortEditions(editions),
      ledger: cur.ledger,
      configText: cur.configText,
      trackRecord: cur.trackRecord,
    });
  } finally {
    handle.close();
  }
  invalidateSiteData();
  return { ok: true, items: ed.items.length };
}

export interface RecordResult {
  created: number;
  updated: number;
  total: number;
}

export async function pushRecord(entries: RecordEntry[]): Promise<RecordResult> {
  const db = dbPath();
  if (db === null) {
    const storePath = path.join(dataDir(), "state", "seen-topics.json");
    const store = loadStore(storePath);
    const { created, updated, total } = applyRecordToStore(store, entries);
    saveStore(store, storePath);
    invalidateSiteData();
    return { created, updated, total };
  }
  const store = new SqliteStore(db);
  const cur = await store.load();
  const ledger: StoreTopic[] = cur.ledger.map((t) => JSON.parse(JSON.stringify(t)) as StoreTopic);
  const holder = { topics: ledger };
  const { created, updated } = applyRecordToStore(holder, entries);
  const handle = await openSqlite(db, false);
  try {
    writeAllToDb(handle, {
      editions: cur.editions,
      ledger: holder.topics,
      configText: cur.configText,
      trackRecord: cur.trackRecord,
    });
  } finally {
    handle.close();
  }
  invalidateSiteData();
  return { created, updated, total: holder.topics.length };
}

/** Ledger loader re-export for the record path's file mode. */
export { loadEditionsFromDir, loadLedgerFromDir };
