/**
 * Freeze eval cases from a stored run (#50): rebuild the inputs the assign
 * and summarize steps gave the model in one slot, from the local-mode
 * database, and write them as case files (`scripts/eval-cases.ts`).
 *
 *   bun scripts/freeze-cases.ts --slot <slot> [--data-dir .bd-data] [--out evals/cases]
 *                               [--task assign|summarize]
 *
 * - **assign:** the echoes first seen in the slot, in the order and batch
 *   size the step uses, each batch with the shortlist the step would build
 *   (`shortlist`) from the topics that existed when the run started and
 *   were active within `assignActivityDays`. Topics the run itself created
 *   are not in it, so a later batch's shortlist can be shorter than it was.
 * - **summarize:** one case per topic the slot wrote a summary for (published
 *   or discarded), with the topic's name, its echoes first seen in the slot
 *   or earlier, the languages, and `first` for a forming wave.
 *
 * Settings are the ones in force when the run started (`settings_history`).
 * A case holds only what the model sees: echo ids, titles and excerpts,
 * topic ids, names and aliases. No URL, no source, nothing else from the
 * database. Labels are never written: they are the owner's.
 *
 * The database is opened query-only: it is never written. A case file that exists is left as it
 * is, so a case is frozen once. The output names files and counts only, never
 * fetched text (invariant 6): run this on real data yourself, not in a
 * session that can write code, and review the cases before committing them.
 */
import { Database as SQLite } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type PoolTopic, shortlist } from "../apps/pipeline/src/core/assign.ts";
import { type Settings, SettingsSchema } from "../packages/contracts/src/index.ts";
import type { DriverEcho } from "../packages/judge/src/index.ts";
import { type AssignCase, parseCase, type SummarizeCase, type Task } from "./eval-cases.ts";

interface EchoRow {
  id: string;
  title: string;
  excerpt: string | null;
}

function driverEcho(e: EchoRow): DriverEcho {
  return e.excerpt
    ? { id: e.id, title: e.title, summary: e.excerpt }
    : { id: e.id, title: e.title };
}

/** The settings in force at `at`: the last change at or before it, else the row, else defaults. */
function settingsAt(db: SQLite, at: number): Settings {
  const row =
    (db
      .query("SELECT json FROM settings_history WHERE changed_at <= ? ORDER BY id DESC LIMIT 1")
      .get(at) as { json: string } | null) ??
    (db.query("SELECT json FROM settings WHERE id = 1").get() as { json: string } | null);
  return SettingsSchema.parse(row ? JSON.parse(row.json) : {});
}

/** Topics the assign step could shortlist at `startedAt` (its `loadPool`, as of then). */
function poolAt(db: SQLite, startedAt: number, activityDays: number): PoolTopic[] {
  const since = startedAt - activityDays * 86_400_000;
  const rows = db
    .query(
      `SELECT t.id, t.name, max(t.created_at, coalesce(max(e.first_seen_at), 0)) AS lastActive
       FROM topics t LEFT JOIN echoes e ON e.topic_id = t.id AND e.first_seen_at < ?1
       WHERE t.merged_into IS NULL AND t.created_at < ?1
       GROUP BY t.id HAVING lastActive >= ?2`,
    )
    .all(startedAt, since) as { id: string; name: string; lastActive: number }[];
  const aliases = db.query(
    "SELECT alias FROM topic_aliases WHERE topic_id = ? AND created_at < ? ORDER BY alias",
  );
  return rows.map((r) => ({
    ...r,
    aliases: (aliases.all(r.id, startedAt) as { alias: string }[]).map((a) => a.alias),
  }));
}

export function assignCases(db: SQLite, slot: string, startedAt: number): AssignCase[] {
  const settings = settingsAt(db, startedAt);
  const pending = db
    .query("SELECT id, title, excerpt FROM echoes WHERE first_slot = ? ORDER BY first_seen_at, id")
    .all(slot) as EchoRow[];
  const pool = poolAt(db, startedAt, settings.assignActivityDays);
  const out: AssignCase[] = [];
  for (let i = 0; i < pending.length; i += settings.assignBatchSize) {
    const batch = pending.slice(i, i + settings.assignBatchSize);
    const offered = shortlist(
      pool,
      batch.map((e) => e.title),
      settings.assignShortlistSize,
    );
    out.push({
      id: `${slug(slot)}-${String(out.length + 1).padStart(2, "0")}`,
      frozenFrom: slot,
      input: {
        echoes: batch.map(driverEcho),
        topics: offered.map((t) =>
          t.aliases.length > 0
            ? { id: t.id, name: t.name, aliases: t.aliases }
            : { id: t.id, name: t.name },
        ),
      },
    });
  }
  return out;
}

export function summarizeCases(db: SQLite, slot: string, startedAt: number): SummarizeCase[] {
  const languages = [...new Set(settingsAt(db, startedAt).languages)];
  const rows = db
    .query(
      `SELECT s.topic_id AS topicId, t.name, max(s.reason = 'formed') AS first
       FROM summaries s JOIN topics t ON t.id = s.topic_id
       WHERE s.slot = ? GROUP BY s.topic_id ORDER BY min(s.created_at), s.topic_id`,
    )
    .all(slot) as { topicId: string; name: string; first: number }[];
  const echoes = db.query(
    "SELECT id, title, excerpt FROM echoes WHERE topic_id = ? AND first_slot <= ? ORDER BY first_seen_at, id",
  );
  const out: SummarizeCase[] = [];
  for (const r of rows) {
    const cited = (echoes.all(r.topicId, slot) as EchoRow[]).map(driverEcho);
    if (cited.length === 0) continue;
    out.push({
      id: `${slug(slot)}-${r.topicId}`,
      frozenFrom: slot,
      input: { name: r.name, echoes: cited, languages, first: r.first === 1 },
    });
  }
  return out;
}

/** A slot as a file-name part. */
function slug(slot: string): string {
  return slot.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export interface FreezeResult {
  written: string[];
  kept: string[];
}

/** Write the slot's cases under `out/<task>/`; a file that exists is kept. */
export function freeze(
  db: SQLite,
  slot: string,
  out: string,
  tasks: readonly Task[] = ["assign", "summarize"],
): FreezeResult {
  const run = db.query("SELECT started_at FROM runs WHERE slot = ?").get(slot) as {
    started_at: number;
  } | null;
  if (!run) throw new Error(`no run for slot ${slot}`);
  const result: FreezeResult = { written: [], kept: [] };
  for (const task of tasks) {
    const cases =
      task === "assign"
        ? assignCases(db, slot, run.started_at)
        : summarizeCases(db, slot, run.started_at);
    if (cases.length === 0) continue;
    mkdirSync(join(out, task), { recursive: true });
    for (const c of cases) {
      const { id, ...body } = c;
      // Through the parser, so a frozen case is one the eval reads.
      parseCase(task, id, body);
      const file = join(out, task, `${id}.json`);
      if (existsSync(file)) {
        result.kept.push(file);
        continue;
      }
      writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
      result.written.push(file);
    }
  }
  return result;
}

export interface Io {
  out(line: string): void;
  env: Record<string, string | undefined>;
}

const defaultIo: Io = { out: (line) => console.log(line), env: process.env };

export async function main(argv: readonly string[], io: Io = defaultIo): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      slot: { type: "string" },
      "data-dir": { type: "string" },
      out: { type: "string", default: "evals/cases" },
      task: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !values.slot) {
    io.out(
      "usage: bun scripts/freeze-cases.ts --slot <slot> [--data-dir <dir>] [--out evals/cases] [--task assign|summarize]",
    );
    return values.help ? 0 : 2;
  }
  if (values.task !== undefined && values.task !== "assign" && values.task !== "summarize") {
    io.out("--task must be assign or summarize");
    return 2;
  }
  const path = join(resolve(values["data-dir"] ?? io.env.BD_DATA_DIR ?? ".bd-data"), "content.db");
  if (!existsSync(path)) {
    io.out(`no database at ${path}`);
    return 2;
  }
  // Not `readonly`: on macOS a read-only handle cannot read a WAL file whose
  // app is stopped (no -shm file), "unable to open database file".
  // `query_only` refuses every write instead.
  const db = new SQLite(path, { readwrite: true, create: false });
  db.exec("PRAGMA query_only = ON");
  try {
    const r = freeze(db, values.slot, values.out, values.task ? [values.task] : undefined);
    io.out(`wrote ${r.written.length} cases, kept ${r.kept.length} that exist`);
    for (const f of r.written) io.out(`  ${f}`);
    return 0;
  } catch (err) {
    io.out(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    db.close();
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
