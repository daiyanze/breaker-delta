/**
 * Pipeline integration test (#39): two consecutive runs on the local adapter
 * (ADR 0018): a `bun:sqlite` file migrated by `migrate`, blobs in a folder,
 * the recorded fixture sources (`fixtureFetch`) and the fake model (#31).
 * Every launch group and adapter is the real one.
 *
 * Run 1 serves every fixture except three groups', which answer 404 as if
 * down. Run 2, one slot later, serves all of them. The second run must
 * process only the increment: the three groups' echoes are its only new
 * echoes, only they (and any echo run 1 could not place) go to the model's
 * assign, groups whose interval has not passed are not fetched, and the rows
 * run 1 wrote are left as they were.
 *
 * `run.test.ts` covers the wired run with hand-made sources (failures, a
 * slot running once, resuming); this file is the whole thing on fixtures.
 *
 * Fetched content is data (invariant 6): the fixtures are scrubbed when
 * recorded, and these assertions compare ids, group ids and counts only, so
 * a failure never prints a title or an item URL.
 */
import { Database as SQLite } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeDriver, type ModelDriver } from "@bd/judge";
import type { PurgeRequest, SiteCache } from "@bd/ports";
import { createPipeline, pipelineConfig } from "../src/core/app.ts";
import type { AssignOutput } from "../src/core/assign.ts";
import type { CommitOutput } from "../src/core/commit.ts";
import { fixtureFetch } from "../src/core/fixture-sources.ts";
import type { IngestOutput } from "../src/core/ingest.ts";
import type { ScanOutput } from "../src/core/scan.ts";
import type { SelectOutput } from "../src/core/select.ts";
import { buildSteps, STEP_NAMES } from "../src/core/steps.ts";
import { directoryBlobs } from "../src/local/blobs.ts";
import { sqliteDatabase } from "../src/local/database.ts";
import { migrate } from "../src/local/migrate.ts";
import { ADAPTERS } from "../src/sources/adapters/index.ts";
import { LAUNCH_GROUPS } from "../src/sources/launch-groups.ts";
import { NOW, SLOT } from "./helpers.ts";

const HOUR = 3_600_000;
const SLOT_2 = "20261119T0600";

/** Down in run 1, back in run 2. Each has a 0-minute interval, so run 2 is due to fetch it. */
const HELD_BACK = ["devto", "github", "hackernews"];

const FIXTURES = join(import.meta.dir, "../src/sources/fixtures");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "bd-integration-"));
  dirs.push(dataDir);
  // As `startPipeline` opens it: a file, WAL, migrations by `migrate`.
  const sqlite = new SQLite(join(dataDir, "content.db"), { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL");
  migrate(sqlite);
  const blobs = directoryBlobs(join(dataDir, "blobs"));

  let now = NOW;
  const clock = { now: () => now };

  // Fixture sources; `heldBack` groups answer 404 while it holds them.
  const heldBack = new Set(HELD_BACK);
  const read = (file: string) => {
    if (heldBack.has(file.split(".")[0] ?? "")) return null;
    try {
      return readFileSync(join(FIXTURES, file), "utf8");
    } catch {
      return null;
    }
  };
  const fixtures = fixtureFetch(read, clock.now);
  const fetched: string[] = [];
  const recordingFetch = (async (input: string | URL | Request) => {
    fetched.push(input instanceof Request ? input.url : String(input));
    return fixtures(input);
  }) as typeof fetch;

  // The fake model, with its calls recorded: echo ids only.
  const fake = fakeDriver();
  const calls = { assign: [] as string[][], summarize: 0 };
  const driver: ModelDriver = {
    assign: (input) => {
      calls.assign.push(input.echoes.map((e) => e.id));
      return fake.assign(input);
    },
    summarize: (input) => {
      calls.summarize++;
      return fake.summarize(input);
    },
  };

  const purges: PurgeRequest[] = [];
  const site: SiteCache = {
    async purge(request) {
      purges.push(request);
      return { purged: 0 };
    },
  };

  const pipeline = createPipeline(
    { db: sqliteDatabase(sqlite), clock, blobs },
    pipelineConfig({ MODEL_DRIVER: "fake" }),
    buildSteps({
      blobs,
      fetch: recordingFetch,
      driver,
      site,
      groups: LAUNCH_GROUPS,
      adapters: ADAPTERS,
    }),
  );

  const q = <T>(sql: string, ...params: string[]) => sqlite.query(sql).all(...params) as T[];
  const output = <T>(slot: string, step: string): T => {
    const [row] = q<{ output: string }>(
      "SELECT output FROM run_steps WHERE slot = ? AND step = ?",
      slot,
      step,
    );
    return JSON.parse(row?.output ?? "null") as T;
  };
  /** The first URL `fixtureFetch` answers for each group, at the clock's time. */
  const firstUrl = (groupId: string) => {
    const group = LAUNCH_GROUPS.find((g) => g.id === groupId);
    const adapter = ADAPTERS[groupId];
    if (!group || !adapter) throw new Error(`no group ${groupId}`);
    return adapter.urls(group, now)[0] ?? "";
  };
  /** Every URL a group's adapter asks for at the clock's time. */
  const urlsOf = (groupId: string) => {
    const group = LAUNCH_GROUPS.find((g) => g.id === groupId);
    const adapter = ADAPTERS[groupId];
    if (!group || !adapter) throw new Error(`no group ${groupId}`);
    return adapter.urls(group, now);
  };

  return {
    q,
    output,
    calls,
    purges,
    fetched,
    firstUrl,
    urlsOf,
    release: () => heldBack.clear(),
    tick: () => pipeline.tick(),
    setNow: (ms: number) => {
      now = ms;
    },
    close: () => sqlite.close(),
  };
}

type EchoRow = {
  id: string;
  group_id: string;
  first_slot: string;
  first_seen_at: number;
  topic_id: string | null;
};
const ECHOES = "SELECT id, group_id, first_slot, first_seen_at, topic_id FROM echoes ORDER BY id";
const SUMMARIES = "SELECT id, topic_id, version, status FROM summaries ORDER BY id";
const PREDICTIONS = "SELECT id, topic_id FROM predictions ORDER BY id";
const TOPICS = "SELECT id FROM topics ORDER BY id";

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe("two consecutive runs on fixtures (acceptance: the second processes only the increment)", () => {
  test("run 2 fetches what is due, ingests and assigns only the new echoes, and keeps run 1's rows", async () => {
    const t = setup();
    try {
      // ---- Run 1: every fixture but the held-back groups.
      expect(await t.tick()).toMatchObject({ slot: SLOT, status: "done" });
      const steps1 = t.q<{ step: string; status: string }>(
        "SELECT step, status FROM run_steps WHERE slot = ?",
        SLOT,
      );
      expect(sorted(steps1.map((s) => s.step))).toEqual(sorted(STEP_NAMES));
      expect(steps1.every((s) => s.status === "done")).toBe(true);

      const scan1 = t.output<ScanOutput>(SLOT, "scan");
      const withAdapter = LAUNCH_GROUPS.filter((g) => ADAPTERS[g.id]).map((g) => g.id);
      expect(sorted(scan1.missing)).toEqual(HELD_BACK);
      expect(sorted(scan1.fetched)).toEqual(
        sorted(withAdapter.filter((id) => !HELD_BACK.includes(id))),
      );
      expect(scan1.notDue).toEqual([]);

      const ingest1 = t.output<IngestOutput>(SLOT, "ingest");
      expect(ingest1.newEchoes).toBeGreaterThan(0);
      expect(ingest1.knownEchoes).toBe(0);
      expect(ingest1.unreadable).toEqual([]);

      const echoes1 = t.q<EchoRow>(ECHOES);
      expect(echoes1).toHaveLength(ingest1.newEchoes);
      expect(echoes1.every((e) => e.first_slot === SLOT)).toBe(true);
      expect(echoes1.some((e) => HELD_BACK.includes(e.group_id))).toBe(false);

      // Assign was given every new echo, each once.
      const assigned1 = t.calls.assign.flat();
      expect(sorted(assigned1)).toEqual(sorted(echoes1.map((e) => e.id)));
      const assign1 = t.output<AssignOutput>(SLOT, "assign");
      expect(assign1.echoes).toBe(echoes1.length);
      const unplaced1 = echoes1.filter((e) => e.topic_id === null).map((e) => e.id);
      expect(assign1.unassigned).toBe(unplaced1.length);

      // One summarize call per selected wave.
      const select1 = t.output<SelectOutput>(SLOT, "select");
      expect(t.calls.summarize).toBe(select1.selected.length);
      const commit1 = t.output<CommitOutput>(SLOT, "commit");

      const summaries1 = t.q<{ id: string; topic_id: string }>(SUMMARIES);
      const predictions1 = t.q<{ id: string; topic_id: string }>(PREDICTIONS);
      const topics1 = t.q<{ id: string }>(TOPICS);
      const metrics1 = t.q(
        "SELECT echo_id, slot, heat, seen_at FROM echo_metrics ORDER BY echo_id",
      );
      expect(metrics1).toHaveLength(echoes1.length);
      expect(t.purges).toEqual([
        { slot: SLOT, topicIds: [...new Set([...commit1.published, ...commit1.discarded])] },
      ]);

      // ---- Run 2: one slot later, the held-back groups are back.
      t.release();
      t.setNow(NOW + HOUR);
      t.fetched.length = 0;
      t.calls.assign.length = 0;
      t.calls.summarize = 0;
      t.purges.length = 0;
      expect(await t.tick()).toMatchObject({ slot: SLOT_2, status: "done" });

      // Fetches: daily groups fetched well in run 1 are not due; the rest are,
      // and only their URLs are requested.
      const daily = LAUNCH_GROUPS.filter((g) => g.minIntervalMinutes >= 1440).map((g) => g.id);
      expect(daily.length).toBeGreaterThan(0);
      const scan2 = t.output<ScanOutput>(SLOT_2, "scan");
      expect(sorted(scan2.notDue)).toEqual(sorted(daily));
      const due2 = withAdapter.filter((id) => !daily.includes(id));
      expect(sorted(scan2.fetched)).toEqual(sorted(due2));
      expect(scan2.missing).toEqual([]);
      expect(sorted(new Set(t.fetched))).toEqual(sorted(new Set(due2.flatMap(t.urlsOf))));
      for (const id of daily) expect(t.fetched).not.toContain(t.firstUrl(id));

      // Ingest: the new echoes are exactly the held-back groups' items; the
      // groups fetched again only add heat to echoes run 1 made.
      const ingest2 = t.output<IngestOutput>(SLOT_2, "ingest");
      const echoes2 = t.q<EchoRow>(ECHOES);
      const known = new Set(echoes1.map((e) => e.id));
      const fresh = echoes2.filter((e) => !known.has(e.id));
      expect(fresh.length).toBeGreaterThan(0);
      expect(ingest2.newEchoes).toBe(fresh.length);
      expect(fresh.every((e) => e.first_slot === SLOT_2)).toBe(true);
      expect(sorted(new Set(fresh.map((e) => e.group_id)))).toEqual(HELD_BACK);
      expect(ingest2.knownEchoes).toBeGreaterThan(0);
      const metrics2 = t.q<{ echo_id: string }>(
        "SELECT echo_id FROM echo_metrics WHERE slot = ?",
        SLOT_2,
      );
      expect(metrics2).toHaveLength(ingest2.newEchoes + ingest2.knownEchoes);
      // No echo of a group run 2 did not fetch got a heat record.
      const notFetched = new Set(daily);
      const groupOf = new Map(echoes2.map((e) => [e.id, e.group_id]));
      expect(metrics2.some((m) => notFetched.has(groupOf.get(m.echo_id) ?? ""))).toBe(false);

      // Assign: only the new echoes and the ones run 1 could not place.
      const assigned2 = t.calls.assign.flat();
      expect(sorted(assigned2)).toEqual(sorted([...fresh.map((e) => e.id), ...unplaced1]));
      expect(t.output<AssignOutput>(SLOT_2, "assign").echoes).toBe(assigned2.length);

      // Summarize: one call per wave select picked in run 2.
      const select2 = t.output<SelectOutput>(SLOT_2, "select");
      expect(t.calls.summarize).toBe(select2.selected.length);
      // A wave run 1 summarised is never due again as `formed` (review on #245).
      const summarised1 = new Set(
        (summaries1 as { topic_id: string; status: string }[])
          .filter((s) => s.status === "published")
          .map((s) => s.topic_id),
      );
      expect(summarised1.size).toBeGreaterThan(0);
      expect(
        select2.selected.filter((s) => s.reason === "formed" && summarised1.has(s.topicId)),
      ).toEqual([]);

      // Writes: run 1's rows are left as they were; run 2 adds rows.
      const placed1 = echoes1.filter((e) => e.topic_id !== null);
      const byId = new Map(echoes2.map((e) => [e.id, e]));
      expect(placed1.map((e) => byId.get(e.id))).toEqual(placed1);
      // An echo run 1 could not place may get its topic now; nothing else changes.
      const withoutTopic = ({ topic_id: _, ...rest }: EchoRow) => rest;
      const unplacedRows1 = echoes1.filter((e) => e.topic_id === null);
      expect(
        unplacedRows1.map((e) => {
          const row = byId.get(e.id);
          return row ? withoutTopic(row) : null;
        }),
      ).toEqual(unplacedRows1.map(withoutTopic));
      expect(
        t.q(
          "SELECT echo_id, slot, heat, seen_at FROM echo_metrics WHERE slot = ? ORDER BY echo_id",
          SLOT,
        ),
      ).toEqual(metrics1);

      const summaries2 = t.q<{ id: string; topic_id: string }>(SUMMARIES);
      const oldSummaries = new Set(summaries1.map((s) => s.id));
      expect(summaries2.filter((s) => oldSummaries.has(s.id))).toEqual(summaries1);
      const commit2 = t.output<CommitOutput>(SLOT_2, "commit");
      expect(
        sorted(summaries2.filter((s) => !oldSummaries.has(s.id)).map((s) => s.topic_id)),
      ).toEqual(sorted([...commit2.published, ...commit2.discarded]));
      const predictions2 = t.q<{ id: string; topic_id: string }>(PREDICTIONS);
      const oldPredictions = new Set(predictions1.map((p) => p.id));
      expect(predictions2.filter((p) => oldPredictions.has(p.id))).toEqual(predictions1);
      expect(
        sorted(predictions2.filter((p) => !oldPredictions.has(p.id)).map((p) => p.topic_id)),
      ).toEqual(sorted(commit2.formed));

      const topics2 = new Set(t.q<{ id: string }>(TOPICS).map((r) => r.id));
      expect(topics1.every((r) => topics2.has(r.id))).toBe(true);
      expect(topics2.size - topics1.length).toBe(
        t.output<AssignOutput>(SLOT_2, "assign").newTopics,
      );

      expect(t.purges).toEqual([
        { slot: SLOT_2, topicIds: [...new Set([...commit2.published, ...commit2.discarded])] },
      ]);
    } finally {
      t.close();
    }
  });
});
