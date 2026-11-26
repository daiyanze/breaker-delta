/**
 * The run report (#53): `/__report` answers only with the configured
 * `REPORT_TOKEN`, covers `reportWindowDays` UTC days of slots, and holds
 * counts, durations, tokens, step, provider and model names and days only.
 *
 * Rows are seeded with raw SQL; the "fetched" text in them is made up here,
 * not fetched (invariant 6). The token is an obviously fake value.
 */
import { describe, expect, test } from "bun:test";
import { drizzleOver } from "@bd/db";
import { createPipeline, pipelineConfig } from "../src/core/app.ts";
import { runReport } from "../src/core/report.ts";
import { changeSettings } from "../src/core/settings.ts";
import { sameSecret } from "../src/core/token.ts";
import { memoryBlobs, migratedDatabase, NOW } from "./helpers.ts";

const TOKEN = "fake-report-token-for-tests";
const HOUR = 3_600_000;

function setup(vars: Record<string, string | undefined> = { REPORT_TOKEN: TOKEN }) {
  const { sqlite, db } = migratedDatabase();
  const pipeline = createPipeline(
    { db, clock: { now: () => NOW }, blobs: memoryBlobs().blobs },
    pipelineConfig(vars),
  );
  return { sqlite, db, pipeline };
}

const report = (headers: Record<string, string> = {}, method = "GET") =>
  new Request("https://bd.test/__report", { method, headers });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

type Sqlite = ReturnType<typeof migratedDatabase>["sqlite"];

function seedRun(
  sqlite: Sqlite,
  slot: string,
  status: "done" | "failed" | "running",
  startedAt: number,
  durationMs: number | null,
) {
  sqlite
    .query("INSERT INTO runs (slot, status, started_at, finished_at) VALUES (?, ?, ?, ?)")
    .run(slot, status, startedAt, durationMs === null ? null : startedAt + durationMs);
}

function seedStep(
  sqlite: Sqlite,
  slot: string,
  step: string,
  status: "done" | "failed",
  attempts: number,
  extra: { output?: string; error?: string } = {},
) {
  sqlite
    .query(
      "INSERT INTO run_steps (slot, step, status, attempts, output, error, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(slot, step, status, attempts, extra.output ?? null, extra.error ?? null, NOW);
}

function seedCall(sqlite: Sqlite, slot: string, outcome: "ok" | "error", tokens: number | null) {
  sqlite
    .query(
      `INSERT INTO model_calls (slot, task, provider, model, outcome, fallback, prompt_tokens, completion_tokens, total_tokens, at)
       VALUES (?, 'summarize', 'groq', 'llama-test', ?, 0, ?, ?, ?, ?)`,
    )
    .run(
      slot,
      outcome,
      tokens,
      tokens === null ? null : 10,
      tokens === null ? null : tokens + 10,
      NOW,
    );
}

describe("/__report token", () => {
  test("with no REPORT_TOKEN configured the route does not exist, whatever is sent", async () => {
    for (const vars of [{}, { REPORT_TOKEN: "" }, { PROBE_TOKEN: TOKEN }]) {
      const { pipeline } = setup(vars);
      for (const headers of [{}, bearer(TOKEN), bearer(""), { authorization: "Bearer " }]) {
        const res = await pipeline.fetch(report(headers));
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("not found");
      }
    }
  });

  test("a missing or wrong token gets 404 and no data", async () => {
    const { pipeline } = setup();
    for (const headers of [
      {},
      bearer("wrong"),
      bearer(`${TOKEN}x`),
      bearer(TOKEN.slice(0, -1)),
      { authorization: TOKEN },
      { authorization: `bearer ${TOKEN}` },
      { "x-token": TOKEN },
    ]) {
      const res = await pipeline.fetch(report(headers));
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("not found");
    }
  });

  test("the probe token does not open the report", async () => {
    const { pipeline } = setup({ PROBE_TOKEN: "fake-probe-token", REPORT_TOKEN: TOKEN });
    expect((await pipeline.fetch(report(bearer("fake-probe-token")))).status).toBe(404);
  });

  test("the right token gets the report; only GET", async () => {
    const { pipeline } = setup();
    const res = await pipeline.fetch(report(bearer(TOKEN)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window: unknown; runs: { total: number } };
    expect(body.window).toEqual({ days: 7, fromDay: "20261113", toDay: "20261119" });
    expect(body.runs.total).toBe(0);
    expect((await pipeline.fetch(report(bearer(TOKEN), "POST"))).status).toBe(404);
  });

  test("reading the report writes nothing, not even the settings seed", async () => {
    const { sqlite, pipeline } = setup();
    await pipeline.fetch(report(bearer(TOKEN)));
    expect(sqlite.query("SELECT count(*) AS n FROM settings").get()).toEqual({ n: 0 });
    expect(sqlite.query("SELECT count(*) AS n FROM settings_history").get()).toEqual({ n: 0 });
  });

  test("sameSecret compares whole values", async () => {
    expect(await sameSecret("abc", "abc")).toBe(true);
    expect(await sameSecret("abc", "abd")).toBe(false);
    expect(await sameSecret("abc", "abcd")).toBe(false);
    expect(await sameSecret("", "a")).toBe(false);
  });
});

describe("runReport", () => {
  test("covers the current UTC day and the six before it, by slot", async () => {
    const { sqlite, db } = setup();
    // Inside: the first slot of the first day, and the current slot.
    seedRun(sqlite, "20261113T0000", "done", Date.UTC(2026, 10, 13, 0, 0), 90_000);
    seedRun(sqlite, "20261119T0500", "running", NOW - 7 * 60_000, null);
    // Outside: the last slot of the day before, and a slot after today.
    seedRun(sqlite, "20261112T2300", "failed", Date.UTC(2026, 10, 12, 23, 0), 1000);
    seedRun(sqlite, "20261120T0000", "done", NOW + 24 * HOUR, 1000);
    seedStep(sqlite, "20261113T0000", "scan", "done", 1);
    seedStep(sqlite, "20261112T2300", "scan", "failed", 3);
    seedCall(sqlite, "20261113T0000", "ok", 100);
    seedCall(sqlite, "20261112T2300", "ok", 999);

    const r = await runReport(drizzleOver(db), NOW, 7);
    expect(r.window).toEqual({ days: 7, fromDay: "20261113", toDay: "20261119" });
    expect(r.runs).toEqual({
      total: 2,
      done: 1,
      failed: 0,
      running: 1,
      averageDurationMs: 90_000,
      maxDurationMs: 90_000,
    });
    expect(r.days).toEqual([
      { day: "20261113", runs: 1, done: 1, failed: 0 },
      { day: "20261119", runs: 1, done: 0, failed: 0 },
    ]);
    expect(r.steps).toEqual([{ step: "scan", done: 1, failed: 0, attempts: 1 }]);
    expect(r.models).toHaveLength(1);
    expect(r.models[0]).toMatchObject({ day: "20261113", calls: 1, promptTokens: 100 });
  });

  test("a one-day window is today only", async () => {
    const { sqlite, db } = setup();
    seedRun(sqlite, "20261119T0000", "done", Date.UTC(2026, 10, 19), 1000);
    seedRun(sqlite, "20261118T2300", "done", Date.UTC(2026, 10, 18, 23), 1000);
    const r = await runReport(drizzleOver(db), NOW, 1);
    expect(r.window).toEqual({ days: 1, fromDay: "20261119", toDay: "20261119" });
    expect(r.runs.total).toBe(1);
  });

  test("aggregates steps, failures, durations and model calls", async () => {
    const { sqlite, db } = setup();
    seedRun(sqlite, "20261118T0100", "done", Date.UTC(2026, 10, 18, 1), 60_000);
    seedRun(sqlite, "20261118T0200", "failed", Date.UTC(2026, 10, 18, 2), 30_000);
    seedStep(sqlite, "20261118T0100", "scan", "done", 1);
    seedStep(sqlite, "20261118T0200", "scan", "done", 2);
    seedStep(sqlite, "20261118T0200", "assign", "failed", 3);
    seedCall(sqlite, "20261118T0100", "ok", 50);
    seedCall(sqlite, "20261118T0200", "error", null);
    const r = await runReport(drizzleOver(db), NOW, 7);
    expect(r.runs).toMatchObject({ total: 2, done: 1, failed: 1 });
    expect(r.runs.averageDurationMs).toBe(45_000);
    expect(r.runs.maxDurationMs).toBe(60_000);
    expect(r.days).toEqual([{ day: "20261118", runs: 2, done: 1, failed: 1 }]);
    expect(r.steps).toEqual([
      { step: "assign", done: 0, failed: 1, attempts: 3 },
      { step: "scan", done: 2, failed: 0, attempts: 3 },
    ]);
    expect(r.models).toEqual([
      {
        day: "20261118",
        task: "summarize",
        provider: "groq",
        model: "llama-test",
        calls: 2,
        failed: 1,
        fallbacks: 0,
        promptTokens: 50,
        completionTokens: 10,
        totalTokens: 60,
        withoutUsage: 1,
      },
    ]);
  });

  test("the window length comes from settings", async () => {
    const { sqlite, db, pipeline } = setup();
    seedRun(sqlite, "20261110T0000", "done", Date.UTC(2026, 10, 10), 1000);
    const read = async () =>
      (await (await pipeline.fetch(report(bearer(TOKEN)))).json()) as {
        window: { days: number; fromDay: string };
        runs: { total: number };
      };
    expect((await read()).runs.total).toBe(0);
    await changeSettings(drizzleOver(db), NOW, { reportWindowDays: 10 });
    const wide = await read();
    expect(wide.window).toMatchObject({ days: 10, fromDay: "20261110" });
    expect(wide.runs.total).toBe(1);
  });
});

describe("the report holds no text", () => {
  test("no echo or topic text, no URL, no step output or error, no email address", async () => {
    const { sqlite, pipeline } = setup();
    const slot = "20261118T0300";
    const marks = {
      title: "ZEBRA-TITLE-MARKER quokka headline",
      excerpt: "ZEBRA-EXCERPT-MARKER excerpt text",
      url: "https://zebra-url-marker.example/article",
      topic: "ZEBRA-TOPIC-MARKER topic name",
      output: "ZEBRA-OUTPUT-MARKER",
      error: "ZEBRA-ERROR-MARKER",
      email: "zebra.reader@example.com",
      email2: "subscriber+news@mail.example.org",
    };
    seedRun(sqlite, slot, "failed", Date.UTC(2026, 10, 18, 3), 5000);
    seedStep(sqlite, slot, "scan", "done", 1, {
      output: JSON.stringify({ note: marks.output, to: marks.email, url: marks.url }),
    });
    seedStep(sqlite, slot, "summarize", "failed", 3, {
      error: `Error: ${marks.error} sending to ${marks.email2} at ${marks.url}`,
    });
    seedCall(sqlite, slot, "ok", 42);
    sqlite
      .query(
        "INSERT INTO topics (id, slug, name, state, created_at) VALUES ('t1', 'zebra-slug-marker', ?, 'up', ?)",
      )
      .run(marks.topic, NOW);
    sqlite
      .query(
        `INSERT INTO echoes (id, url, group_id, title, excerpt, first_seen_at, first_slot, topic_id)
         VALUES ('e1', ?, 'hackernews', ?, ?, ?, ?, 't1')`,
      )
      .run(marks.url, `${marks.title} ${marks.email}`, marks.excerpt, NOW, slot);
    sqlite
      .query(
        "INSERT INTO scan_results (slot, group_id, ok, http_status, item_count, error) VALUES (?, 'hackernews', 0, 500, 0, ?)",
      )
      .run(slot, `${marks.error} ${marks.email}`);

    const res = await pipeline.fetch(report(bearer(TOKEN)));
    expect(res.status).toBe(200);
    const text = await res.text();
    // The seeded rows are in the report, so it read them.
    expect(text).toContain('"summarize"');
    expect(text).toContain('"failed":1');
    for (const mark of Object.values(marks)) expect(text).not.toContain(mark);
    expect(text.toLowerCase()).not.toContain("zebra");
    expect(text).not.toContain("http");
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i);
  });
});
