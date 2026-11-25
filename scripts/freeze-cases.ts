/**
 * Freeze eval cases from a stored run (#50): rebuild the inputs the assign
 * and summarize steps gave the model in one slot, from the local-mode
 * database, and write them as case files (`scripts/eval-cases.ts`).
 *
 *   bun scripts/freeze-cases.ts --slot <slot> [--data-dir .bd-data] [--out <dir>]
 *                               [--task assign|summarize]
 *
 * Frozen cases hold fetched titles and excerpts, so they never go into git
 * (owner, #253): the output folder defaults to `<data-dir>/eval-cases`, and
 * a folder git would track is refused (`git check-ignore`). Committed cases
 * in `evals/cases/` are synthetic only (`scripts/eval-cases.ts`). Evaluate
 * frozen cases locally with `bun scripts/eval.ts --cases <dir>`.
 *
 * - **assign:** the echoes first seen in the slot, in the order and batch
 *   size the step uses, each batch with the shortlist the step would build
 *   (`shortlist`) from the topics that existed when the run started and
 *   were active within `assignActivityDays`. Topics the run itself created
 *   are not in it, so a later batch's shortlist can be shorter than it was.
 * - **summarize:** one case per topic the slot wrote a summary for (published
 *   or discarded), with the topic's name, its echoes first seen in the slot
 *   or earlier, the languages, and `first` for a forming wave. When the
 *   summary was written with source text (`summaries.source_text_read`),
 *   each echo whose page the enrich step read gets that text as `page`,
 *   from the slot's enrich blob (`enrichKey`) under `<data-dir>/blobs`, as
 *   the step gave it to the model (#45). Retention removes those blobs
 *   after `rawRetentionDays`; a summary whose pages are gone cannot be
 *   rebuilt as the model saw it, so it is skipped and counted, never frozen
 *   without its pages.
 *
 * Settings are the ones in force when the run started (`settings_history`).
 * A case holds only what the model sees: echo ids, titles, excerpts and page
 * texts, topic ids, names and aliases. No URL, no source, nothing else from the
 * database. Labels are never written: they are the owner's.
 *
 * The database is opened query-only: it is never written. A case file that exists is left as it
 * is, so a case is frozen once. The output names files and counts only, never
 * fetched text (invariant 6). Only the owner runs this on real data, on
 * their own machine, outside a session that can write code.
 */
import { Database as SQLite } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type PoolTopic, shortlist } from "../apps/pipeline/src/core/assign.ts";
import { type Enriched, enrichKey } from "../apps/pipeline/src/core/enrich.ts";
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

/**
 * A wave's page texts by echo id, as the enrich step stored them for `slot`
 * under `blobsDir` (a local-mode `directoryBlobs` root); null when the blob
 * is gone.
 */
export function readPages(
  blobsDir: string,
  slot: string,
  topicId: string,
): Map<string, string> | null {
  const file = join(blobsDir, ...enrichKey(slot, topicId).split("/"));
  if (!existsSync(file)) return null;
  const stored = JSON.parse(readFileSync(file, "utf8")) as Enriched;
  return new Map(stored.pages.map((p) => [p.echoId, p.text]));
}

export interface SummarizeFreeze {
  cases: SummarizeCase[];
  /** Ids of cases not frozen: written with page text that is no longer stored. */
  missingPages: string[];
}

export function summarizeCases(
  db: SQLite,
  slot: string,
  startedAt: number,
  blobsDir: string,
): SummarizeFreeze {
  const languages = [...new Set(settingsAt(db, startedAt).languages)];
  const rows = db
    .query(
      `SELECT s.topic_id AS topicId, t.name, max(s.reason = 'formed') AS first,
              max(s.source_text_read) AS withPages
       FROM summaries s JOIN topics t ON t.id = s.topic_id
       WHERE s.slot = ? GROUP BY s.topic_id ORDER BY min(s.created_at), s.topic_id`,
    )
    .all(slot) as { topicId: string; name: string; first: number; withPages: number }[];
  const echoes = db.query(
    "SELECT id, title, excerpt FROM echoes WHERE topic_id = ? AND first_slot <= ? ORDER BY first_seen_at, id",
  );
  const out: SummarizeFreeze = { cases: [], missingPages: [] };
  for (const r of rows) {
    const id = `${slug(slot)}-${r.topicId}`;
    const cited = (echoes.all(r.topicId, slot) as EchoRow[]).map(driverEcho);
    if (cited.length === 0) continue;
    if (r.withPages === 1) {
      const pages = readPages(blobsDir, slot, r.topicId);
      // The summarize step marks a draft as read only when an offered echo had a page.
      if (pages === null || !cited.some((e) => pages.has(e.id))) {
        out.missingPages.push(id);
        continue;
      }
      for (const e of cited) {
        const page = pages.get(e.id);
        if (page) e.page = page;
      }
    }
    out.cases.push({
      id,
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
  /** Summarize cases not frozen because their page text is gone (`summarizeCases`). */
  missingPages: string[];
}

/**
 * Write the slot's cases under `out/<task>/`; a file that exists is kept.
 * `blobsDir` is where the run's blobs are (local mode: `<data-dir>/blobs`).
 */
export function freeze(
  db: SQLite,
  slot: string,
  out: string,
  blobsDir: string,
  tasks: readonly Task[] = ["assign", "summarize"],
): FreezeResult {
  const run = db.query("SELECT started_at FROM runs WHERE slot = ?").get(slot) as {
    started_at: number;
  } | null;
  if (!run) throw new Error(`no run for slot ${slot}`);
  const result: FreezeResult = { written: [], kept: [], missingPages: [] };
  for (const task of tasks) {
    let cases: (AssignCase | SummarizeCase)[];
    if (task === "assign") cases = assignCases(db, slot, run.started_at);
    else {
      const s = summarizeCases(db, slot, run.started_at, blobsDir);
      cases = s.cases;
      result.missingPages.push(...s.missingPages);
    }
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

/**
 * Whether git would track files written under `dir`: it is in a working tree
 * and not ignored. Asked of the nearest folder that exists, so it holds for
 * a folder not made yet, and of a file inside, since an ignored folder
 * ignores its files. Fails closed: when git cannot run or answers anything
 * else, the folder counts as tracked and the write is refused. Only a folder
 * git says is in no repository at all is allowed without being ignored.
 */
export function gitTracks(dir: string, git = "git"): boolean {
  let at = resolve(dir);
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  const inside = spawnSync(git, ["-C", at, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
  });
  if (inside.error || inside.status === null) return true;
  if (inside.status !== 0) return !/not a git repository/i.test(inside.stderr ?? "");
  if (inside.stdout.trim() !== "true") return true;
  const probe = join(resolve(dir), "assign", "case.json");
  const r = spawnSync(git, ["-C", at, "check-ignore", "-q", "--no-index", probe]);
  // 0: ignored. Anything else (1: not ignored, or an error): tracked.
  return r.status !== 0;
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
      out: { type: "string" },
      task: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !values.slot) {
    io.out(
      "usage: bun scripts/freeze-cases.ts --slot <slot> [--data-dir <dir>] [--out <dir>] [--task assign|summarize]",
    );
    return values.help ? 0 : 2;
  }
  if (values.task !== undefined && values.task !== "assign" && values.task !== "summarize") {
    io.out("--task must be assign or summarize");
    return 2;
  }
  const dataDir = resolve(values["data-dir"] ?? io.env.BD_DATA_DIR ?? ".bd-data");
  const path = join(dataDir, "content.db");
  const out = resolve(values.out ?? join(dataDir, "eval-cases"));
  if (gitTracks(out)) {
    io.out(
      `${out} is not git-ignored: frozen cases hold fetched text and never go into git; use a folder under .bd-data/`,
    );
    return 2;
  }
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
    const r = freeze(
      db,
      values.slot,
      out,
      join(dataDir, "blobs"),
      values.task ? [values.task] : undefined,
    );
    io.out(`wrote ${r.written.length} cases, kept ${r.kept.length} that exist`);
    for (const f of r.written) io.out(`  ${f}`);
    if (r.missingPages.length > 0) {
      io.out(
        `skipped ${r.missingPages.length} summarize cases whose page text is no longer stored (rawRetentionDays)`,
      );
    }
    return 0;
  } catch (err) {
    io.out(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    db.close();
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
