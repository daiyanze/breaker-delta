/** The scan step (M1-10, #26) on an in-memory database, fake blobs and a fake fetch. */
import { describe, expect, test } from "bun:test";
import { slotId } from "@bd/core";
import { drizzleOver, runSteps } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { eq } from "drizzle-orm";
import { runSlot, type StepContext } from "../src/core/runner.ts";
import {
  isGroupDue,
  type RawScan,
  rawKey,
  type ScanOutput,
  scanStep,
  slotStart,
} from "../src/core/scan.ts";
import { changeSettings } from "../src/core/settings.ts";
import { type Adapter, ParseError } from "../src/sources/adapter.ts";
import { lobsters } from "../src/sources/adapters/lobsters.ts";
import type { LaunchGroup } from "../src/sources/launch-groups.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const HOUR = 3_600_000;

function memoryBlobs() {
  const store = new Map<string, string>();
  const blobs: Blobs = {
    async get(key) {
      const v = store.get(key);
      return v === undefined ? null : new TextEncoder().encode(v);
    },
    async put(key, body) {
      store.set(key, typeof body === "string" ? body : new TextDecoder().decode(body));
    },
    async delete(key) {
      store.delete(key);
    },
    async list(prefix) {
      return [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
  const raw = (slot: string, groupId: string): RawScan | null => {
    const v = store.get(rawKey(slot, groupId));
    return v === undefined ? null : (JSON.parse(v) as RawScan);
  };
  return { blobs, store, raw };
}

type Answer = Response | Error | (() => Promise<Response>);

/** A fetch that answers per URL (one answer per call, in order) and records each call. */
function fakeFetch(answers: Record<string, Answer[]>) {
  const calls: string[] = [];
  const f = (async (input: string) => {
    calls.push(input);
    const next = answers[input]?.shift();
    if (!next) throw new Error(`unexpected fetch ${input}`);
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next();
    return next;
  }) as unknown as typeof fetch;
  return { f, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function group(id: string, minIntervalMinutes = 0, members?: string[]): LaunchGroup {
  return {
    id,
    name: id,
    tier: "first_hand",
    countsAsOne: members !== undefined,
    minIntervalMinutes,
    probeUrl: `https://${id}.test/`,
    ...(members ? { members } : {}),
  };
}

/** An adapter that fetches the group's members, or `https://<id>.test/feed`, and reads `{ items: [...] }`. */
function adapter(id: string, parse?: Adapter["parse"]): Adapter {
  return {
    groupId: id,
    format: "json",
    urls: (g) => g.members ?? [`https://${id}.test/feed`],
    parse:
      parse ??
      ((body) => {
        const data = JSON.parse(body) as { items?: unknown };
        if (!Array.isArray(data.items)) throw new ParseError(`${id}: expected { items }`);
        return data.items.map((n) => ({
          url: `https://${id}.test/${n}`,
          title: `t${n}`,
          publishedAt: null,
          heat: null,
        }));
      }),
  };
}

function setup() {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(db);
  const memory = memoryBlobs();
  const ctx = (slot = SLOT, now = NOW): StepContext => ({
    slot,
    db: orm,
    now: () => now,
    outputs: new Map(),
  });
  const rows = (slot = SLOT) =>
    sqlite
      .query(
        "SELECT group_id, ok, http_status, item_count, error FROM scan_results WHERE slot = ? ORDER BY group_id",
      )
      .all(slot);
  const addRow = (slot: string, groupId: string, ok: boolean) =>
    sqlite.run("INSERT INTO scan_results (slot, group_id, ok, item_count) VALUES (?, ?, ?, 0)", [
      slot,
      groupId,
      ok ? 1 : 0,
    ]);
  return { orm, sqlite, ctx, rows, addRow, ...memory };
}

const noWait = async () => {};

describe("slots and due groups", () => {
  test("slotStart reads a slot id back to its start", () => {
    expect(slotStart(SLOT)).toBe(Date.UTC(2026, 10, 19, 5, 0));
    for (const interval of [15, 60, 1440]) {
      const slot = slotId(NOW, interval);
      expect(slotId(slotStart(slot), interval)).toBe(slot);
    }
    expect(() => slotStart("2026-11-19")).toThrow("not a slot id");
  });

  test("a group is due once its interval has passed, slot start to slot start", () => {
    const daily = group("daily", 1440);
    expect(isGroupDue(daily, SLOT, null)).toBe(true);
    expect(isGroupDue(daily, SLOT, slotId(NOW - 23 * HOUR, 60))).toBe(false);
    expect(isGroupDue(daily, SLOT, slotId(NOW - 24 * HOUR, 60))).toBe(true);
    // A run that started late in its slot does not push the next one back an hour.
    expect(isGroupDue(daily, "20261120T0500", SLOT)).toBe(true);
    const always = group("always", 0);
    expect(isGroupDue(always, SLOT, slotId(NOW - HOUR, 60))).toBe(true);
  });
});

describe("scan step", () => {
  test("fetches due groups in parallel, stores the raw responses and writes a row each", async () => {
    const { ctx, rows, blobs, store } = setup();
    // Each answer waits until both requests are in flight: a sequential scan never finishes.
    let started = 0;
    let release: () => void = () => {};
    const both = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waitForBoth = (body: unknown) => async () => {
      started++;
      if (started === 2) release();
      await both;
      return json(body);
    };
    const { f } = fakeFetch({
      "https://a.test/feed": [waitForBoth({ items: [1, 2] })],
      "https://b.test/feed": [waitForBoth({ items: [3] })],
    });
    const step = scanStep({
      blobs,
      fetch: f,
      groups: [group("a"), group("b")],
      adapters: { a: adapter("a"), b: adapter("b") },
      sleep: noWait,
    });
    const output = (await step.run(ctx())) as ScanOutput;
    expect(output).toEqual({ fetched: ["a", "b"], missing: [], notDue: [], noAdapter: [] });
    expect(rows()).toEqual([
      { group_id: "a", ok: 1, http_status: 200, item_count: 2, error: null },
      { group_id: "b", ok: 1, http_status: 200, item_count: 1, error: null },
    ]);
    expect([...store.keys()].sort()).toEqual([rawKey(SLOT, "a"), rawKey(SLOT, "b")]);
  });

  test("stores each fetched group's responses in one blob for ingest", async () => {
    const { ctx, blobs, raw, store } = setup();
    const { f } = fakeFetch({
      "https://a.test/feed": [json({ items: [1] })],
      "https://x.test/1": [json({ items: [2] })],
      "https://x.test/2": [json({ items: [3, 4] })],
    });
    await scanStep({
      blobs,
      fetch: f,
      groups: [group("a"), group("x", 0, ["https://x.test/1", "https://x.test/2"])],
      adapters: { a: adapter("a"), x: adapter("x") },
      sleep: noWait,
    }).run(ctx());
    expect([...store.keys()].sort()).toEqual([rawKey(SLOT, "a"), rawKey(SLOT, "x")]);
    expect(rawKey(SLOT, "x")).toBe("raw/20261119T0500/x.json");
    expect(raw(SLOT, "x")).toEqual({
      groupId: "x",
      slot: SLOT,
      fetchedAt: NOW,
      responses: [
        {
          url: "https://x.test/1",
          status: 200,
          contentType: "application/json",
          body: '{"items":[2]}',
        },
        {
          url: "https://x.test/2",
          status: 200,
          contentType: "application/json",
          body: '{"items":[3,4]}',
        },
      ],
    });
  });

  test("a group that is not due is skipped, not fetched and not counted as missing", async () => {
    const { ctx, rows, addRow, blobs, store } = setup();
    addRow(slotId(NOW - 5 * HOUR, 60), "daily", true);
    // A failed scan since then does not count as the last good one.
    addRow(slotId(NOW - HOUR, 60), "daily", false);
    const { f, calls } = fakeFetch({ "https://hourly.test/feed": [json({ items: [1] })] });
    const output = (await scanStep({
      blobs,
      fetch: f,
      groups: [group("daily", 1440), group("hourly", 0)],
      adapters: { daily: adapter("daily"), hourly: adapter("hourly") },
      sleep: noWait,
    }).run(ctx())) as ScanOutput;
    expect(output).toEqual({ fetched: ["hourly"], missing: [], notDue: ["daily"], noAdapter: [] });
    expect(calls).toEqual(["https://hourly.test/feed"]);
    expect(rows()).toEqual([
      { group_id: "hourly", ok: 1, http_status: 200, item_count: 1, error: null },
    ]);
    expect(store.has(rawKey(SLOT, "daily"))).toBe(false);
  });

  test("a group whose last scan failed is due again at the next run", async () => {
    const { ctx, addRow, blobs } = setup();
    addRow(slotId(NOW - 30 * HOUR, 60), "daily", true);
    addRow(slotId(NOW - HOUR, 60), "daily", false);
    const { f } = fakeFetch({ "https://daily.test/feed": [json({ items: [1] })] });
    const output = (await scanStep({
      blobs,
      fetch: f,
      groups: [group("daily", 1440)],
      adapters: { daily: adapter("daily") },
      sleep: noWait,
    }).run(ctx())) as ScanOutput;
    expect(output.fetched).toEqual(["daily"]);
  });

  test("a failed group is recorded as missing and the others still go through", async () => {
    const { ctx, rows, blobs, store } = setup();
    const { f, calls } = fakeFetch({
      "https://down.test/feed": [json({}, 503), json({}, 503), json({}, 503)],
      "https://gone.test/feed": [json({}, 404)],
      "https://offline.test/feed": [1, 2, 3].map(() => new Error("connect refused")),
      "https://junk.test/feed": [new Response("<html>not json</html>", { status: 200 })],
      "https://ok.test/feed": [json({ items: [1] })],
    });
    const ids = ["down", "gone", "offline", "junk", "ok"];
    const step = scanStep({
      blobs,
      fetch: f,
      groups: ids.map((id) => group(id)),
      adapters: Object.fromEntries(
        ids.map((id) => [
          id,
          adapter(
            id,
            id === "junk"
              ? () => {
                  throw new ParseError("junk: body is not JSON");
                }
              : undefined,
          ),
        ]),
      ),
      sleep: noWait,
    });
    // Default settings: two retries after the first attempt.
    const output = (await step.run(ctx())) as ScanOutput;
    expect(output).toEqual({
      fetched: ["ok"],
      missing: ["down", "gone", "offline", "junk"],
      notDue: [],
      noAdapter: [],
    });
    expect(rows()).toEqual([
      { group_id: "down", ok: 0, http_status: 503, item_count: 0, error: "HTTP 503" },
      { group_id: "gone", ok: 0, http_status: 404, item_count: 0, error: "HTTP 404" },
      {
        group_id: "junk",
        ok: 0,
        http_status: 200,
        item_count: 0,
        error: "parse: junk: body is not JSON",
      },
      { group_id: "offline", ok: 0, http_status: null, item_count: 0, error: "connect refused" },
      { group_id: "ok", ok: 1, http_status: 200, item_count: 1, error: null },
    ]);
    expect(calls.filter((c) => c === "https://down.test/feed")).toHaveLength(3);
    expect([...store.keys()]).toEqual([rawKey(SLOT, "ok")]);
  });

  test("fetch budgets come from settings", async () => {
    const { ctx, orm, blobs } = setup();
    await changeSettings(orm, NOW, { fetchRetries: 0, fetchTimeoutSeconds: 7 });
    const inits: (RequestInit | undefined)[] = [];
    const f = (async (_url: string, init?: RequestInit) => {
      inits.push(init);
      return json({}, 503);
    }) as unknown as typeof fetch;
    await scanStep({
      blobs,
      fetch: f,
      groups: [group("a")],
      adapters: { a: adapter("a") },
      sleep: noWait,
    }).run(ctx());
    expect(inits).toHaveLength(1);

    const waits: number[] = [];
    await changeSettings(orm, NOW, { fetchRetries: 2, fetchRetryDelaySeconds: 3 });
    await scanStep({
      blobs,
      fetch: f,
      groups: [group("a")],
      adapters: { a: adapter("a") },
      sleep: async (ms) => {
        waits.push(ms);
      },
    }).run(ctx());
    expect(waits).toEqual([3000, 6000]);
  });

  test("a group without an adapter is listed, not fetched and not missing", async () => {
    const { ctx, rows, blobs } = setup();
    const { f, calls } = fakeFetch({ "https://a.test/feed": [json({ items: [] })] });
    const output = (await scanStep({
      blobs,
      fetch: f,
      groups: [group("a"), group("rss_only")],
      adapters: { a: adapter("a") },
      sleep: noWait,
    }).run(ctx())) as ScanOutput;
    expect(output).toEqual({ fetched: ["a"], missing: [], notDue: [], noAdapter: ["rss_only"] });
    expect(calls).toEqual(["https://a.test/feed"]);
    expect(rows()).toHaveLength(1);
  });

  test("a bundle with one dead member is fetched, and says which part failed", async () => {
    const { ctx, rows, blobs, raw } = setup();
    const members = ["https://b.test/1", "https://b.test/2", "https://b.test/3"];
    const { f } = fakeFetch({
      "https://b.test/1": [json({ items: [1, 2] })],
      "https://b.test/2": [json({}, 404)],
      "https://b.test/3": [json({ items: [3] })],
    });
    await scanStep({
      blobs,
      fetch: f,
      groups: [group("b", 0, members)],
      adapters: { b: adapter("b") },
      sleep: noWait,
    }).run(ctx());
    expect(rows()).toEqual([
      {
        group_id: "b",
        ok: 1,
        http_status: 200,
        item_count: 3,
        error: "1 of 3 URLs failed; first: HTTP 404",
      },
    ]);
    expect(raw(SLOT, "b")?.responses.map((r) => r.url)).toEqual([
      "https://b.test/1",
      "https://b.test/3",
    ]);
  });

  test("an error that may quote the body is stored by its class only", async () => {
    const { ctx, rows, blobs } = setup();
    const { f } = fakeFetch({ "https://a.test/feed": [new Response("IGNORE ALL RULES")] });
    await scanStep({
      blobs,
      fetch: f,
      groups: [group("a")],
      adapters: {
        a: adapter("a", (body) => {
          throw new TypeError(`cannot read ${body}`);
        }),
      },
      sleep: noWait,
    }).run(ctx());
    expect(rows()).toEqual([
      { group_id: "a", ok: 0, http_status: 200, item_count: 0, error: "parse: TypeError" },
    ]);
  });

  test("a real adapter's fixture is counted and kept as it came", async () => {
    const { ctx, rows, blobs, raw } = setup();
    const fixture = await Bun.file(
      new URL("../src/sources/fixtures/lobsters.json", import.meta.url),
    ).text();
    const { f } = fakeFetch({ "https://lobste.rs/hottest.json": [new Response(fixture)] });
    await scanStep({
      blobs,
      fetch: f,
      groups: [group("lobsters")],
      adapters: { lobsters },
      sleep: noWait,
    }).run(ctx());
    expect(rows()).toEqual([
      { group_id: "lobsters", ok: 1, http_status: 200, item_count: 3, error: null },
    ]);
    expect(raw(SLOT, "lobsters")?.responses[0]?.body).toBe(fixture);
  });

  test("running the step again in the same slot leaves one row per group", async () => {
    const { ctx, rows, blobs } = setup();
    const answers = () => ({
      "https://a.test/feed": [json({ items: [1] })],
      "https://b.test/feed": [json({}, 404)],
    });
    const deps = {
      blobs,
      groups: [group("a", 1440), group("b", 1440)],
      adapters: { a: adapter("a"), b: adapter("b") },
      sleep: noWait,
    };
    await scanStep({ ...deps, fetch: fakeFetch(answers()).f }).run(ctx());
    // Earlier rows of the same slot do not make a group "not due" for that slot.
    const again = (await scanStep({ ...deps, fetch: fakeFetch(answers()).f }).run(
      ctx(),
    )) as ScanOutput;
    expect(again.fetched).toEqual(["a"]);
    expect(rows()).toHaveLength(2);
  });

  test("a blob that cannot be stored fails the step through the runner", async () => {
    const { orm } = setup();
    const { f } = fakeFetch({
      "https://a.test/feed": [json({ items: [1] }), json({ items: [1] })],
    });
    const step = scanStep({
      blobs: {
        ...memoryBlobs().blobs,
        put: async () => {
          throw new Error("disk full");
        },
      },
      fetch: f,
      groups: [group("a")],
      adapters: { a: adapter("a") },
      sleep: noWait,
    });
    const outcome = await runSlot(orm, () => NOW, SLOT, [step], {
      maxAttempts: 2,
      leaseMs: HOUR,
    });
    expect(outcome).toMatchObject({ status: "failed", step: "scan", error: "Error: disk full" });
    const record = await orm.select().from(runSteps).where(eq(runSteps.slot, SLOT)).get();
    expect(record).toMatchObject({ status: "failed", attempts: 2 });
  });
});
