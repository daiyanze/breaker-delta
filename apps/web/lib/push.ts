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

import {
  heatOf,
  loadStore,
  saveStore,
  upsertTopic,
  type Edition,
  type StoreTopic,
} from "@breaker-delta/core";

import { dataDir, dbPath, invalidateSiteData } from "./data";
import {
  loadEditionsFromDir,
  loadLedgerFromDir,
  openSqlite,
  SqliteStore,
  writeAllToDb,
} from "./store";

export interface RecordEntry {
  name: string;
  sources: string[];
  grade: string;
}

/** validateEntries in apps/cli/src/commands.ts, same messages. */
export function validateEntries(data: unknown): RecordEntry[] {
  if (!Array.isArray(data)) {
    throw new Error("record: input must be a JSON array of {name, sources, grade}");
  }
  return data.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    if (typeof e?.name !== "string" || e.name === "") {
      throw new Error(`record: entry ${i}: name must be a non-empty string`);
    }
    if (!Array.isArray(e.sources) || e.sources.some((x) => typeof x !== "string")) {
      throw new Error(`record: entry ${i}: sources must be an array of strings`);
    }
    if (typeof e.grade !== "string" || e.grade === "") {
      throw new Error(`record: entry ${i}: grade must be a non-empty string`);
    }
    return { name: e.name, sources: e.sources as string[], grade: e.grade };
  });
}

/** buildTopics requires editions to carry _heat/_rank (attached
 * by the load step); a pushed edition arrives raw, so attach them
 * exactly like the loaders do before it enters the DB path. (The
 * file path writes the raw object, as the CLI's serve does, and
 * its loader attaches them on read.) */
function attachHeat(ed: Edition): Edition {
  const copy: Edition = { ...ed, items: ed.items.map((it) => ({ ...it })) };
  for (const it of copy.items) it._heat = heatOf(it);
  const ranked = [...copy.items].sort((a, b) => b._heat - a._heat);
  ranked.forEach((it, i) => {
    it._rank = i + 1;
  });
  return copy;
}

const SLOT_ORDER: Record<string, number> = { pilot: 0, morning: 1, evening: 2 };

function sortEditions(editions: Edition[]): Edition[] {
  return [...editions].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (SLOT_ORDER[a.slot ?? ""] ?? 9) - (SLOT_ORDER[b.slot ?? ""] ?? 9),
  );
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
        conflict: `${ed.date}-${ed.slot}.json already exists (append ?replace=1 to overwrite)`,
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
      conflict: `${ed.date}-${ed.slot}.json already exists (append ?replace=1 to overwrite)`,
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
    let created = 0;
    let updated = 0;
    for (const entry of entries) {
      const existed = store.topics.some((t) => t.name === entry.name);
      upsertTopic(store, entry.name, entry.sources, entry.grade);
      if (existed) updated += 1;
      else created += 1;
    }
    saveStore(store, storePath);
    invalidateSiteData();
    return { created, updated, total: store.topics.length };
  }
  const store = new SqliteStore(db);
  const cur = await store.load();
  const ledger: StoreTopic[] = cur.ledger.map((t) => JSON.parse(JSON.stringify(t)) as StoreTopic);
  const holder = { topics: ledger };
  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    const existed = holder.topics.some((t) => t.name === entry.name);
    upsertTopic(holder, entry.name, entry.sources, entry.grade);
    if (existed) updated += 1;
    else created += 1;
  }
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
