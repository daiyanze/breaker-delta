/** The ingest step (M1-11, #27) on an in-memory database and fake blobs. */
import { describe, expect, test } from "bun:test";
import { drizzleOver } from "@bd/db";
import type { Blobs } from "@bd/ports";
import {
  echoId,
  type IngestOutput,
  ingestStep,
  MAX_TITLE,
  passesKeywords,
} from "../src/core/ingest.ts";
import { runSlot, type StepContext } from "../src/core/runner.ts";
import { type RawScan, rawKey, type ScanOutput } from "../src/core/scan.ts";
import { changeSettings } from "../src/core/settings.ts";
import { type Adapter, ParseError, type SourceItem } from "../src/sources/adapter.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const NEXT_SLOT = "20261119T0600";
const NEXT_NOW = NOW + 3_600_000;

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
  return { blobs, store };
}

/** An adapter whose responses are JSON arrays of `SourceItem`s. */
function adapter(id: string): Adapter {
  return {
    groupId: id,
    format: "json",
    urls: () => [`https://${id}.test/feed`],
    parse(body) {
      const items = JSON.parse(body) as unknown;
      if (!Array.isArray(items)) throw new ParseError(`${id}: expected an array`);
      return items as SourceItem[];
    },
  };
}

const item = (url: string, title: string, heat: number | null = null): SourceItem => ({
  url,
  title,
  publishedAt: Date.UTC(2026, 10, 18),
  heat,
});

function setup() {
  const { db, sqlite } = migratedDatabase();
  /** Statements in each batch the step sends, to check it stays within D1's limits. */
  const batches: number[] = [];
  const orm = drizzleOver({
    ...db,
    batch: (statements) => {
      batches.push(statements.length);
      return db.batch(statements);
    },
  });
  const { blobs, store } = memoryBlobs();
  const adapters = { a: adapter("a"), b: adapter("b") };
  /** Store raw responses for `slot` as the scan step would. */
  const scanned = (slot: string, groups: Record<string, SourceItem[][]>) => {
    for (const [groupId, responses] of Object.entries(groups)) {
      const raw: RawScan = {
        groupId,
        slot,
        fetchedAt: NOW,
        responses: responses.map((items, i) => ({
          url: `https://${groupId}.test/feed/${i}`,
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(items),
        })),
      };
      store.set(rawKey(slot, groupId), JSON.stringify(raw));
    }
  };
  const ctx = (slot: string, now: number, fetched: string[]): StepContext => {
    const scan: ScanOutput = { fetched, missing: [], notDue: [], noAdapter: [] };
    return { slot, db: orm, now: () => now, outputs: new Map([["scan", scan]]) };
  };
  const run = (slot: string, now: number, fetched: string[]) =>
    ingestStep({ blobs, adapters }).run(ctx(slot, now, fetched)) as Promise<IngestOutput>;
  const echoes = () =>
    sqlite
      .query(
        "SELECT id, url, group_id, title, lang, excerpt, published_at, first_seen_at, first_slot, topic_id FROM echoes ORDER BY url",
      )
      .all() as Record<string, unknown>[];
  const metrics = () =>
    sqlite
      .query(
        "SELECT e.url, m.slot, m.heat, m.seen_at FROM echo_metrics m JOIN echoes e ON e.id = m.echo_id ORDER BY m.slot, e.url",
      )
      .all();
  return { orm, sqlite, blobs, store, scanned, ctx, run, echoes, metrics, adapters, batches };
}

const count = (o: Partial<IngestOutput["dropped"]> = {}) => ({
  badUrl: 0,
  filtered: 0,
  duplicate: 0,
  otherGroup: 0,
  ...o,
});

describe("keyword filters", () => {
  test("no lists: everything passes", () => {
    expect(passesKeywords("Anything", [], [])).toBe(true);
  });

  test("include needs one word; exclude drops either way; case and width ignored", () => {
    expect(passesKeywords("New GPU from Acme", ["gpu", "tpu"], [])).toBe(true);
    expect(passesKeywords("New CPU from Acme", ["gpu", "tpu"], [])).toBe(false);
    expect(passesKeywords("ＧＰＵ news", ["gpu"], [])).toBe(true);
    expect(passesKeywords("GPU sale", ["gpu"], ["SALE"])).toBe(false);
    expect(passesKeywords("Big sale", [], ["sale"])).toBe(false);
  });

  test("blank words are ignored", () => {
    expect(passesKeywords("Anything", ["", "  "], [])).toBe(true);
    expect(passesKeywords("Anything", [], [""])).toBe(true);
  });
});

describe("echo ids", () => {
  test("the same URL always gets the same id; another URL another", async () => {
    const a = await echoId("https://x.test/1");
    expect(a).toMatch(/^e[0-9a-f]{24}$/);
    expect(await echoId("https://x.test/1")).toBe(a);
    expect(await echoId("https://x.test/2")).not.toBe(a);
  });
});

describe("ingest step", () => {
  test("turns items into echoes with a heat record each", async () => {
    const { scanned, run, echoes, metrics } = setup();
    scanned(SLOT, {
      a: [[item("http://A.test/one/", "One", 10), item("https://a.test/two", "Two")]],
    });
    const out = await run(SLOT, NOW, ["a"]);
    expect(out).toEqual({
      items: 2,
      newEchoes: 2,
      knownEchoes: 0,
      dropped: count(),
      unreadable: [],
    });
    expect(echoes()).toEqual([
      {
        id: await echoId("https://a.test/one"),
        url: "https://a.test/one",
        group_id: "a",
        title: "One",
        lang: "und",
        excerpt: null,
        published_at: Date.UTC(2026, 10, 18),
        first_seen_at: NOW,
        first_slot: SLOT,
        topic_id: null,
      },
      {
        id: await echoId("https://a.test/two"),
        url: "https://a.test/two",
        group_id: "a",
        title: "Two",
        lang: "und",
        excerpt: null,
        published_at: Date.UTC(2026, 10, 18),
        first_seen_at: NOW,
        first_slot: SLOT,
        topic_id: null,
      },
    ]);
    expect(metrics()).toEqual([
      { url: "https://a.test/one", slot: SLOT, heat: 10, seen_at: NOW },
      { url: "https://a.test/two", slot: SLOT, heat: 0, seen_at: NOW },
    ]);
  });

  test("the same data in a later run adds heat records and no echoes", async () => {
    const { scanned, run, echoes, metrics } = setup();
    const data = { a: [[item("https://a.test/1", "One", 5), item("https://a.test/2", "Two", 7)]] };
    scanned(SLOT, data);
    await run(SLOT, NOW, ["a"]);
    const before = echoes();

    scanned(NEXT_SLOT, {
      a: [[item("https://a.test/1", "One", 9), item("https://a.test/2", "Two", 7)]],
    });
    const out = await run(NEXT_SLOT, NEXT_NOW, ["a"]);
    expect(out).toEqual({
      items: 2,
      newEchoes: 0,
      knownEchoes: 2,
      dropped: count(),
      unreadable: [],
    });
    expect(echoes()).toEqual(before);
    expect(metrics()).toEqual([
      { url: "https://a.test/1", slot: SLOT, heat: 5, seen_at: NOW },
      { url: "https://a.test/2", slot: SLOT, heat: 7, seen_at: NOW },
      { url: "https://a.test/1", slot: NEXT_SLOT, heat: 9, seen_at: NEXT_NOW },
      { url: "https://a.test/2", slot: NEXT_SLOT, heat: 7, seen_at: NEXT_NOW },
    ]);
  });

  test("a retried attempt in the same slot leaves the same rows and output", async () => {
    const { scanned, run, echoes, metrics } = setup();
    scanned(SLOT, { a: [[item("https://a.test/1", "One", 5)]] });
    const first = await run(SLOT, NOW, ["a"]);
    const rows = [echoes(), metrics()];
    const again = await run(SLOT, NOW, ["a"]);
    expect(again).toEqual(first);
    expect([echoes(), metrics()]).toEqual(rows);
  });

  test("normalised URLs de-duplicate within the run; the first group owns a new echo", async () => {
    const { scanned, run, echoes, metrics } = setup();
    scanned(SLOT, {
      a: [
        [item("https://x.test/p?utm_source=a", "From a", 3)],
        [item("https://x.test/p/", "Again", 1)],
      ],
      b: [[item("https://x.test/p#top", "From b", 99)]],
    });
    const out = await run(SLOT, NOW, ["a", "b"]);
    expect(out.newEchoes).toBe(1);
    expect(out.dropped).toEqual(count({ duplicate: 2 }));
    expect(echoes().map((e) => [e.url, e.group_id, e.title])).toEqual([
      ["https://x.test/p", "a", "From a"],
    ]);
    expect(metrics()).toEqual([{ url: "https://x.test/p", slot: SLOT, heat: 3, seen_at: NOW }]);
  });

  test("a known echo takes heat from its own group, even when another group lists it first", async () => {
    const { scanned, run, metrics } = setup();
    scanned(SLOT, { a: [[item("https://x.test/p", "From a", 3)]] });
    await run(SLOT, NOW, ["a"]);

    scanned(NEXT_SLOT, {
      a: [[item("https://x.test/p", "From a", 4)]],
      b: [[item("https://x.test/p", "From b", 99), item("https://x.test/q", "Only b", 1)]],
    });
    const out = await run(NEXT_SLOT, NEXT_NOW, ["b", "a"]);
    expect(out).toMatchObject({ newEchoes: 1, knownEchoes: 1, dropped: count({ duplicate: 1 }) });
    expect(metrics()).toContainEqual({
      url: "https://x.test/p",
      slot: NEXT_SLOT,
      heat: 4,
      seen_at: NEXT_NOW,
    });
  });

  test("a known echo listed only by another group gets no heat record from it", async () => {
    const { scanned, run, metrics } = setup();
    scanned(SLOT, { a: [[item("https://x.test/p", "From a", 3)]] });
    await run(SLOT, NOW, ["a"]);
    scanned(NEXT_SLOT, { b: [[item("https://x.test/p", "From b", 99)]] });
    const out = await run(NEXT_SLOT, NEXT_NOW, ["b"]);
    expect(out).toMatchObject({ newEchoes: 0, knownEchoes: 0, dropped: count({ otherGroup: 1 }) });
    expect(metrics()).toEqual([{ url: "https://x.test/p", slot: SLOT, heat: 3, seen_at: NOW }]);
  });

  test("drops items with URLs normalisation rejects, and applies the keyword settings", async () => {
    const { orm, scanned, run, echoes } = setup();
    await changeSettings(orm, NOW, { keywordsInclude: ["model"], keywordsExclude: ["sponsored"] });
    scanned(SLOT, {
      a: [
        [
          item("ftp://a.test/file", "A model on FTP"),
          item("https://a.test/1", "A new model"),
          item("https://a.test/2", "Nothing relevant"),
          item("https://a.test/3", "Sponsored model post"),
        ],
      ],
    });
    const out = await run(SLOT, NOW, ["a"]);
    expect(out).toMatchObject({
      items: 4,
      newEchoes: 1,
      dropped: count({ badUrl: 1, filtered: 2 }),
    });
    expect(echoes().map((e) => e.url)).toEqual(["https://a.test/1"]);
  });

  test("cuts a title longer than the limit", async () => {
    const { scanned, run, echoes } = setup();
    scanned(SLOT, { a: [[item("https://a.test/1", "x".repeat(MAX_TITLE + 50))]] });
    await run(SLOT, NOW, ["a"]);
    const title = echoes()[0]?.title as string;
    expect([...title].length).toBe(MAX_TITLE);
    expect(title.endsWith("…")).toBe(true);
  });

  test("skips a group whose stored responses cannot be read, naming the group only", async () => {
    const { store, scanned, run, echoes } = setup();
    scanned(SLOT, { a: [[item("https://a.test/1", "One")]] });
    store.set(
      rawKey(SLOT, "b"),
      JSON.stringify({
        groupId: "b",
        slot: SLOT,
        fetchedAt: NOW,
        responses: [{ url: "u", status: 200, contentType: null, body: "{not json" }],
      }),
    );
    const out = await run(SLOT, NOW, ["a", "b", "gone", "c"]);
    expect(out.unreadable).toEqual(["b", "gone", "c"]);
    expect(out.newEchoes).toBe(1);
    expect(echoes()).toHaveLength(1);
  });

  test("writes thousands of items in one batch of a few statements", async () => {
    const { scanned, run, echoes, metrics, batches } = setup();
    const many = Array.from({ length: 1_200 }, (_, i) => item(`https://a.test/${i}`, `T${i}`, i));
    scanned(SLOT, { a: [many] });
    const out = await run(SLOT, NOW, ["a"]);
    expect(out.newEchoes).toBe(1_200);
    expect(echoes()).toHaveLength(1_200);
    expect(metrics()).toHaveLength(1_200);
    // Reading settings seeds them first (a batch of its own); then the
    // writes: 500 rows per statement, three for the echoes, three for their heat.
    expect(batches.at(-1)).toBe(6);
  });

  test("fails without a scan output, and runs after scan on the step runner", async () => {
    const { orm, blobs, adapters, scanned, echoes } = setup();
    const step = ingestStep({ blobs, adapters });
    await expect(
      step.run({ slot: SLOT, db: orm, now: () => NOW, outputs: new Map() }),
    ).rejects.toThrow("no scan output");

    scanned(SLOT, { a: [[item("https://a.test/1", "One")]] });
    const scan = {
      name: "scan",
      run: async (): Promise<ScanOutput> => ({
        fetched: ["a"],
        missing: [],
        notDue: [],
        noAdapter: [],
      }),
    };
    const outcome = await runSlot(orm, () => NOW, SLOT, [scan, step], {
      maxAttempts: 1,
      leaseMs: 60_000,
    });
    expect(outcome).toEqual({ status: "done", resumed: false });
    expect(echoes()).toHaveLength(1);
  });
});
