/** The enrich step (M2-04, #45), with select before it and summarize to commit after it. */
import { describe, expect, test } from "bun:test";
import { slotStart } from "@bd/core";
import { drizzleOver } from "@bd/db";
import { fakeDriver, fakeSummarize, type ModelDriver, type SummarizeInput } from "@bd/judge";
import { commitStep } from "../src/core/commit.ts";
import {
  type Enriched,
  type EnrichOutput,
  enrichKey,
  enrichStep,
  pickPages,
} from "../src/core/enrich.ts";
import { runSlot, type Step } from "../src/core/runner.ts";
import { selectStep } from "../src/core/select.ts";
import { changeSettings } from "../src/core/settings.ts";
import { type Draft, draftKey, summarizeStep } from "../src/core/summarize.ts";
import { validateStep } from "../src/core/validate.ts";
import { memoryBlobs, migratedDatabase, NOW, SLOT } from "./helpers.ts";

const NEXT = "20261119T0600";

/** A page per URL, hand-written: no fetched text (invariant 6). */
const page = (url: string) => `<html><body><nav>menu</nav><p>Page text of ${url}</p></body></html>`;

function pageFetch(fail: (url: string) => boolean = () => false) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (fail(url)) return new Response("not here", { status: 404 });
    return new Response(page(url), { headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
  return { fetch: f, calls };
}

function setup(fetcher = pageFetch()) {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(db);
  const { blobs, store } = memoryBlobs();
  let n = 0;
  const inputs: SummarizeInput[] = [];
  const fake = fakeDriver();
  const driver: ModelDriver = {
    assign: fake.assign,
    summarize: async (input) => {
      inputs.push(input);
      return { value: fakeSummarize(input), provider: "fake", model: "m", repaired: false };
    },
  };
  /** A topic up in `slot` with `count` echoes in groups g0, g1, ... (or `groups`). */
  const wave = (id: string, count = 3, height = 10, groups?: string[]) => {
    sqlite.run(
      `INSERT INTO topics (id, slug, name, state, created_at, formed_at)
       VALUES (?1, ?1, ?2, 'up', 0, ?3)`,
      [id, `Topic ${id} launch`, slotStart(SLOT)],
    );
    sqlite.run(
      `INSERT INTO wave_points (slot, topic_id, state, height, rank, source_count, echo_count)
       VALUES (?1, ?2, 'up', ?3, 1, 3, ?4)`,
      [SLOT, id, height, count],
    );
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      n++;
      ids.push(`e${n}`);
      sqlite.run(
        `INSERT INTO echoes (id, url, group_id, title, excerpt, first_seen_at, first_slot, topic_id)
         VALUES (?1, ?2, ?3, 'A headline', 'An excerpt', ?4, ?5, ?6)`,
        [`e${n}`, `https://x.test/${n}`, groups?.[i] ?? `g${i}`, slotStart(SLOT) + n, SLOT, id],
      );
    }
    return ids;
  };
  const steps = (): Step[] => [
    selectStep(),
    enrichStep({ blobs, fetch: fetcher.fetch }),
    summarizeStep({ driver, blobs }),
    validateStep({ blobs }),
    commitStep({ blobs }),
  ];
  const run = async () => {
    const outcome = await runSlot(orm, () => NOW, SLOT, steps(), {
      maxAttempts: 1,
      leaseMs: 60_000,
    });
    const row = sqlite
      .query("SELECT output FROM run_steps WHERE slot = ?1 AND step = 'enrich'")
      .get(SLOT) as { output: string } | null;
    return {
      outcome,
      enrich: JSON.parse(row?.output ?? "null") as EnrichOutput,
      raw: row?.output ?? "",
    };
  };
  const all = (q: string, ...p: (string | number)[]) =>
    sqlite.query(q).all(...p) as Record<string, unknown>[];
  const enriched = (topicId: string) =>
    JSON.parse(store.get(enrichKey(SLOT, topicId)) ?? "null") as Enriched | null;
  const draft = (topicId: string) =>
    JSON.parse(store.get(draftKey(SLOT, topicId)) ?? "null") as Draft | null;
  return { sqlite, orm, store, wave, run, all, enriched, draft, inputs, calls: fetcher.calls };
}

describe("pickPages", () => {
  const e = (id: string, groupId: string) => ({ id, groupId });

  test("one echo per fetch group first, oldest first, then the rest oldest first", () => {
    const echoes = [e("a", "g1"), e("b", "g1"), e("c", "g2"), e("d", "g1"), e("f", "g3")];
    expect(pickPages(echoes, 3)).toEqual(["a", "c", "f"]);
    expect(pickPages(echoes, 4)).toEqual(["a", "c", "f", "b"]);
    expect(pickPages(echoes, 10)).toEqual(["a", "c", "f", "b", "d"]);
  });

  test("no more than the cap, and none at 0", () => {
    expect(pickPages([e("a", "g1"), e("b", "g2")], 1)).toEqual(["a"]);
    expect(pickPages([e("a", "g1")], 0)).toEqual([]);
    expect(pickPages([], 3)).toEqual([]);
  });
});

describe("enrich", () => {
  test("fetches the selected wave's pages and stores their text; the output holds ids and counts", async () => {
    const t = setup();
    t.wave("t1");
    const { outcome, enrich, raw } = await t.run();
    expect(outcome.status).toBe("done");
    expect(enrich).toEqual({
      read: [{ topicId: "t1", pages: 3 }],
      unread: [],
      fetched: 3,
      failed: 0,
    });
    expect(raw).not.toContain("Page text");
    expect(raw).not.toContain("x.test");
    expect(t.calls).toEqual(["https://x.test/1", "https://x.test/2", "https://x.test/3"]);
    expect(t.enriched("t1")).toEqual({
      topicId: "t1",
      pages: [
        { echoId: "e1", text: "Page text of https://x.test/1" },
        { echoId: "e2", text: "Page text of https://x.test/2" },
        { echoId: "e3", text: "Page text of https://x.test/3" },
      ],
    });
    expect(enrichKey(SLOT, "t1")).toStartWith(`raw/${SLOT}/`); // removed by retention
  });

  test("the page text reaches the summarize call, and the summary is marked as written with it", async () => {
    const t = setup();
    t.wave("t1");
    await t.run();
    expect(t.inputs[0]?.echoes).toEqual([
      { id: "e1", title: "A headline", summary: "An excerpt\n\nPage text of https://x.test/1" },
      { id: "e2", title: "A headline", summary: "An excerpt\n\nPage text of https://x.test/2" },
      { id: "e3", title: "A headline", summary: "An excerpt\n\nPage text of https://x.test/3" },
    ]);
    expect(t.draft("t1")?.sourceTextRead).toBe(true);
    expect(t.all("SELECT status, source_text_read FROM summaries")).toEqual([
      { status: "published", source_text_read: 1 },
    ]);
  });

  test("when every fetch fails, the summary is still written, marked as without the source text", async () => {
    const t = setup(pageFetch(() => true));
    t.wave("t1");
    const { outcome, enrich } = await t.run();
    expect(outcome.status).toBe("done");
    expect(enrich).toEqual({ read: [], unread: ["t1"], fetched: 3, failed: 3 });
    expect(t.enriched("t1")).toBeNull();
    expect(t.inputs[0]?.echoes.map((e) => e.summary)).toEqual([
      "An excerpt",
      "An excerpt",
      "An excerpt",
    ]);
    expect(t.draft("t1")?.sourceTextRead).toBe(false);
    expect(t.all("SELECT status, source_text_read FROM summaries")).toEqual([
      { status: "published", source_text_read: 0 },
    ]);
  });

  test("when some fetches fail, the pages read are used and the summary counts as written with them", async () => {
    const t = setup(pageFetch((url) => url.endsWith("/2")));
    t.wave("t1");
    const { enrich } = await t.run();
    expect(enrich).toEqual({
      read: [{ topicId: "t1", pages: 2 }],
      unread: [],
      fetched: 3,
      failed: 1,
    });
    expect(t.enriched("t1")?.pages.map((p) => p.echoId)).toEqual(["e1", "e3"]);
    expect(t.inputs[0]?.echoes[1]?.summary).toBe("An excerpt");
    expect(t.all("SELECT source_text_read FROM summaries")).toEqual([{ source_text_read: 1 }]);
  });

  test("at most enrichPagesPerTopic pages per wave, one per fetch group first", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { enrichPagesPerTopic: 2 });
    t.wave("t1", 4, 10, ["g1", "g1", "g2", "g3"]);
    const { enrich } = await t.run();
    expect(enrich.fetched).toBe(2);
    expect(t.calls).toEqual(["https://x.test/1", "https://x.test/3"]);
  });

  test("the run fetches at most enrichPagesPerRun pages; waves past the cap are written without source text", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { enrichPagesPerRun: 4 });
    t.wave("t1", 3, 30);
    t.wave("t2", 3, 20);
    t.wave("t3", 3, 10);
    const { enrich } = await t.run();
    expect(enrich).toEqual({
      read: [
        { topicId: "t1", pages: 3 },
        { topicId: "t2", pages: 1 },
      ],
      unread: ["t3"],
      fetched: 4,
      failed: 0,
    });
    expect(t.calls).toHaveLength(4);
    expect(t.all("SELECT topic_id, source_text_read FROM summaries ORDER BY topic_id")).toEqual([
      { topic_id: "t1", source_text_read: 1 },
      { topic_id: "t2", source_text_read: 1 },
      { topic_id: "t3", source_text_read: 0 },
    ]);
  });

  test("a failed fetch counts against the run's cap", async () => {
    const t = setup(pageFetch(() => true));
    await changeSettings(t.orm, NOW, { enrichPagesPerRun: 2 });
    t.wave("t1", 3, 20);
    t.wave("t2", 3, 10);
    const { enrich } = await t.run();
    expect(enrich).toEqual({ read: [], unread: ["t1", "t2"], fetched: 2, failed: 2 });
    expect(t.calls).toHaveLength(2);
  });

  test("only selected waves are fetched: a wave left waiting is not", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    t.wave("t1", 3, 20);
    t.wave("t2", 3, 10);
    const { enrich } = await t.run();
    expect(enrich.read).toEqual([{ topicId: "t1", pages: 3 }]);
    expect(t.calls).toEqual(["https://x.test/1", "https://x.test/2", "https://x.test/3"]);
  });

  test("an echo first seen after the slot is not fetched", async () => {
    const t = setup();
    t.wave("t1", 1);
    t.sqlite.run(
      `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
       VALUES ('late', 'https://x.test/late', 'g9', 'Later', ?1, ?2, 't1')`,
      [slotStart(NEXT), NEXT],
    );
    await t.run();
    expect(t.calls).toEqual(["https://x.test/1"]);
  });

  test("enrichPagesPerTopic 0 fetches nothing", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { enrichPagesPerTopic: 0 });
    t.wave("t1");
    const { enrich } = await t.run();
    expect(enrich).toEqual({ read: [], unread: ["t1"], fetched: 0, failed: 0 });
    expect(t.calls).toEqual([]);
  });

  test("a wave left unread loses the blob an earlier attempt stored", async () => {
    const t = setup(pageFetch(() => true));
    t.wave("t1");
    t.store.set(enrichKey(SLOT, "t1"), JSON.stringify({ topicId: "t1", pages: [] }));
    await t.run();
    expect(t.enriched("t1")).toBeNull();
  });

  test("the page's text is cut to enrichPageMaxChars", async () => {
    const long = (async () =>
      new Response(`<p>${"word ".repeat(1000)}</p>`, {
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const t = setup({ fetch: long, calls: [] });
    await changeSettings(t.orm, NOW, { enrichPageMaxChars: 200 });
    t.wave("t1", 1);
    await t.run();
    const text = t.enriched("t1")?.pages[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(150);
    expect(text.length).toBeLessThanOrEqual(200);
  });
});
