/** The summarize, validate and commit steps (M1-18, #34) on an in-memory database. */
import { describe, expect, test } from "bun:test";
import type { SummarizeResult } from "@bd/contracts";
import { slotStart } from "@bd/core";
import { drizzleOver } from "@bd/db";
import { fakeDriver, fakeSummarize, type ModelDriver, type SummarizeInput } from "@bd/judge";
import type { Blobs } from "@bd/ports";
import { type CommitOutput, commitStep, sha256, summaryId } from "../src/core/commit.ts";
import { runSlot, type Step, type StepContext } from "../src/core/runner.ts";
import { selectStep } from "../src/core/select.ts";
import { changeSettings } from "../src/core/settings.ts";
import {
  type Draft,
  draftKey,
  type SummarizeOutput,
  summarizeStep,
} from "../src/core/summarize.ts";
import { type ValidateOutput, validateDraft, validateStep } from "../src/core/validate.ts";
import { d1Limited, migratedDatabase, NOW, SLOT } from "./helpers.ts";

const NEXT = "20261119T0600";
const NEXT_NOW = NOW + 3_600_000;
const DAY = 86_400_000;

type Row = Record<string, unknown>;

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

/** A driver whose summarize answer is the fake's, changed by `edit`. */
function editedDriver(edit: (r: SummarizeResult, input: SummarizeInput) => unknown): ModelDriver {
  const fake = fakeDriver();
  return {
    assign: fake.assign,
    summarize: async (input) => ({
      value: edit(fakeSummarize(input), input) as SummarizeResult,
      provider: "edited",
      model: "m",
      repaired: false,
    }),
  };
}

const failing: ModelDriver = {
  assign: fakeDriver().assign,
  summarize: async () => {
    throw new Error("all providers failed: quoted answer");
  },
};

function setup(driver: ModelDriver = fakeDriver(), { d1 = false } = {}) {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(d1 ? d1Limited(db) : db);
  const { blobs, store } = memoryBlobs();
  let n = 0;
  /** A topic up in `slot` with `count` echoes first seen there. */
  const wave = (id: string, count = 3, slot = SLOT, name = `Topic ${id} launch`) => {
    sqlite.run(
      `INSERT OR IGNORE INTO topics (id, slug, name, state, created_at, formed_at)
       VALUES (?1, ?1, ?2, 'up', 0, ?3)`,
      [id, name, slotStart(slot)],
    );
    sqlite.run(
      `INSERT INTO wave_points (slot, topic_id, state, height, rank, source_count, echo_count)
       VALUES (?1, ?2, 'up', 10, 1, 3, ?3)`,
      [slot, id, count],
    );
    addEchoes(id, count, slot);
  };
  const addEchoes = (topicId: string, count: number, slot = SLOT, title = "A headline") => {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      n++;
      ids.push(`e${n}`);
      sqlite.run(
        `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        [`e${n}`, `https://x.test/${n}`, `g${i}`, title, slotStart(slot) + n, slot, topicId],
      );
    }
    return ids;
  };
  const steps = (d: ModelDriver = driver): Step[] => [
    selectStep(),
    summarizeStep({ driver: d, blobs }),
    validateStep({ blobs }),
    commitStep({ blobs }),
  ];
  /** Runs select to commit for `slot` through the runner. */
  const run = async (slot = SLOT, now = NOW, d: ModelDriver = driver) => {
    const outcome = await runSlot(orm, () => now, slot, steps(d), {
      maxAttempts: 1,
      leaseMs: 60_000,
    });
    const rows = sqlite.query("SELECT step, output FROM run_steps WHERE slot = ?1").all(slot) as {
      step: string;
      output: string;
    }[];
    const out = new Map(rows.map((r) => [r.step, JSON.parse(r.output)]));
    return {
      outcome,
      summarize: out.get("summarize") as SummarizeOutput,
      validate: out.get("validate") as ValidateOutput,
      commit: out.get("commit") as CommitOutput,
    };
  };
  const all = (q: string, ...p: unknown[]) =>
    sqlite.query(q).all(...(p as (string | number | null)[])) as Row[];
  return { sqlite, orm, blobs, store, wave, addEchoes, run, all };
}

/** Every published version 1 has a prediction naming it and a wave_formed event (invariant 5). */
function expectEveryFirstSummaryRegistered(t: ReturnType<typeof setup>) {
  const firsts = t.all("SELECT id, topic_id FROM summaries WHERE version = 1");
  for (const s of firsts) {
    expect(t.all("SELECT summary_id FROM predictions WHERE topic_id = ?1", s.topic_id)).toEqual([
      { summary_id: s.id },
    ]);
    expect(
      t.all(
        "SELECT summary_id FROM events WHERE topic_id = ?1 AND type = 'wave_formed'",
        s.topic_id,
      ),
    ).toEqual([{ summary_id: s.id }]);
  }
  // And nothing registered without its first summary.
  for (const p of t.all("SELECT summary_id FROM predictions")) {
    expect(t.all("SELECT version FROM summaries WHERE id = ?1", p.summary_id)).toEqual([
      { version: 1 },
    ]);
  }
}

describe("summarize", () => {
  test("one draft per selected wave, holding the model's answer; the output holds ids", async () => {
    const t = setup();
    t.wave("t1");
    t.addEchoes("t1", 2, NEXT); // after this slot: not offered
    const { summarize } = await t.run();
    expect(summarize).toEqual({ drafted: [{ topicId: "t1", reason: "formed" }], failed: [] });
    const draft = JSON.parse(t.store.get(draftKey(SLOT, "t1")) ?? "") as Draft;
    expect(draft).toMatchObject({
      topicId: "t1",
      reason: "formed",
      first: true,
      offered: ["e1", "e2", "e3"],
      languages: ["en", "zh", "ja"],
      provider: "fake",
    });
    expect((draft.answer as SummarizeResult).evidenceEchoIds).toEqual(["e1", "e2", "e3"]);
    expect(draftKey(SLOT, "t1")).toStartWith(`raw/${SLOT}/`); // removed by retention
  });

  test("a failed model call leaves no draft and no row; the wave is due again next run", async () => {
    const t = setup(failing);
    t.wave("t1");
    const first = await t.run();
    expect(first.outcome.status).toBe("done");
    expect(first.summarize).toEqual({ drafted: [], failed: ["t1"] });
    expect(JSON.stringify(first.summarize)).not.toContain("quoted");
    expect(t.store.size).toBe(0);
    expect(t.all("SELECT * FROM summaries")).toEqual([]);
    t.wave("t1", 1, NEXT);
    const next = await t.run(NEXT, NEXT_NOW, fakeDriver());
    expect(next.commit).toEqual({ published: ["t1"], formed: ["t1"], discarded: [] });
  });

  test("the languages asked for come from settings", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { languages: ["ja", "en"] });
    t.wave("t1");
    await t.run();
    const draft = JSON.parse(t.store.get(draftKey(SLOT, "t1")) ?? "") as Draft;
    expect(draft.languages).toEqual(["ja", "en"]);
    expect(t.all("SELECT lang FROM summary_texts ORDER BY lang")).toEqual([
      { lang: "en" },
      { lang: "ja" },
    ]);
    expect(t.all("SELECT lang FROM predictions")).toEqual([{ lang: "ja" }]);
  });
});

describe("validateDraft", () => {
  const draft = (answer: unknown, first = true): Draft => ({
    topicId: "t1",
    reason: "formed",
    first,
    offered: ["e1", "e2"],
    languages: ["en", "ja"],
    provider: "p",
    model: "m",
    answer,
  });
  const good = (): SummarizeResult => ({
    texts: [
      { lang: "en", title: "Rust 2.0 ships", body: "Three sources report it." },
      { lang: "ja", title: "Rust 2.0", body: "三つのソース。" },
    ],
    evidenceEchoIds: ["e1", "e2"],
    riskFlags: [],
    criterion: "A fourth source reports it.",
  });
  const ref = "Rust 2.0 compiler released on rust-lang.org";

  test("a draft that keeps every rule passes", () => {
    expect(validateDraft(draft(good()), ref)).toEqual({ ok: true, value: good() });
  });

  test("a version citing an echo id it was not given is discarded", () => {
    const answer = { ...good(), evidenceEchoIds: ["e1", "e9"] };
    expect(validateDraft(draft(answer), ref)).toEqual({ ok: false, check: "echo_id" });
  });

  test("an answer outside the contract is discarded", () => {
    expect(validateDraft(draft({ texts: [] }), ref)).toEqual({ ok: false, check: "contract" });
    expect(validateDraft(draft({ ...good(), evidenceEchoIds: [] }), ref)).toEqual({
      ok: false,
      check: "contract",
    });
  });

  test("one text per language asked for, no more, no fewer, no repeats", () => {
    const [en, ja] = good().texts;
    if (!en || !ja) throw new Error("fixture");
    for (const texts of [[en], [en, ja, { ...en, lang: "zh" as const }], [en, en]]) {
      expect(validateDraft(draft({ ...good(), texts }), ref)).toEqual({
        ok: false,
        check: "languages",
      });
    }
    expect(validateDraft(draft({ ...good(), texts: [ja, en] }), ref).ok).toBe(true);
  });

  test("a first summary without a criterion is discarded; a later one needs none", () => {
    const { criterion: _, ...answer } = good();
    expect(validateDraft(draft(answer), ref)).toEqual({ ok: false, check: "criterion" });
    expect(validateDraft(draft(answer, false), ref).ok).toBe(true);
  });

  test("a Chinese or Japanese body of several sentences passes", () => {
    const g = good();
    const [en] = g.texts;
    if (!en) throw new Error("fixture");
    const zh = { lang: "zh" as const, title: "Rust 2.0", body: "新功能已发布。服务将于下月推出。" };
    const ja = {
      lang: "ja" as const,
      title: "Rust 2.0",
      body: "新機能が公開された。提供は来月始まる。",
    };
    const d = { ...draft({ ...g, texts: [en, zh, ja] }), languages: ["en", "zh", "ja"] };
    expect(validateDraft(d, ref).ok).toBe(true);
  });

  test("an address the echoes do not have is discarded, in a title, a body or the criterion", () => {
    const g = good();
    const [en, ja] = g.texts;
    if (!en || !ja) throw new Error("fixture");
    const cases: SummarizeResult[] = [
      { ...g, texts: [{ ...en, title: "See https://evil.test" }, ja] },
      { ...g, texts: [{ ...en, body: "More at www.example" }, ja] },
      { ...g, texts: [en, { ...ja, body: "詳細は evil.example で" }] },
      { ...g, criterion: "x.ai confirms it" },
    ];
    for (const c of cases) {
      expect(validateDraft(draft(c), ref)).toEqual({ ok: false, check: "address" });
    }
    // A dotted word the echoes have is kept.
    const kept = { ...g, texts: [{ ...en, body: "Announced on rust-lang.org." }, ja] };
    expect(validateDraft(draft(kept), ref).ok).toBe(true);
  });
});

describe("validate and commit", () => {
  test("a version citing an invalid echo id is discarded: a row with no version, texts or evidence", async () => {
    const t = setup(editedDriver((r) => ({ ...r, evidenceEchoIds: ["e1", "e999"] })));
    t.wave("t1");
    const { validate, commit } = await t.run();
    expect(validate).toEqual({ valid: [], discarded: [{ topicId: "t1", check: "echo_id" }] });
    expect(commit).toEqual({ published: [], formed: [], discarded: ["t1"] });
    expect(t.all("SELECT topic_id, version, status, reason, writer FROM summaries")).toEqual([
      { topic_id: "t1", version: null, status: "discarded", reason: "formed", writer: "edited" },
    ]);
    expect(t.all("SELECT * FROM summary_texts")).toEqual([]);
    expect(t.all("SELECT * FROM summary_evidence")).toEqual([]);
    expect(t.all("SELECT * FROM events")).toEqual([]);
    expect(t.all("SELECT * FROM predictions")).toEqual([]);
  });

  test("a discarded first attempt is tried again next run and can then form the wave", async () => {
    let bad = true;
    const t = setup(editedDriver((r) => (bad ? { ...r, evidenceEchoIds: ["nope"] } : r)));
    t.wave("t1");
    await t.run();
    bad = false;
    t.wave("t1", 1, NEXT);
    const { commit } = await t.run(NEXT, NEXT_NOW);
    expect(commit).toEqual({ published: ["t1"], formed: ["t1"], discarded: [] });
    expect(t.all("SELECT status, version FROM summaries ORDER BY slot")).toEqual([
      { status: "discarded", version: null },
      { status: "published", version: 1 },
    ]);
    expectEveryFirstSummaryRegistered(t);
  });
});

describe("commit", () => {
  test("a first version is written with its texts, evidence, wave_formed event and prediction", async () => {
    const t = setup();
    t.wave("t1");
    const { commit } = await t.run();
    expect(commit).toEqual({ published: ["t1"], formed: ["t1"], discarded: [] });
    const id = await summaryId(SLOT, "t1");
    expect(
      t.all(
        "SELECT id, topic_id, version, status, reason, writer, slot, created_at, source_text_read FROM summaries",
      ),
    ).toEqual([
      {
        id,
        topic_id: "t1",
        version: 1,
        status: "published",
        reason: "formed",
        writer: "fake",
        slot: SLOT,
        created_at: NOW,
        source_text_read: 0,
      },
    ]);
    expect(t.all("SELECT lang FROM summary_texts WHERE summary_id = ?1 ORDER BY lang", id)).toEqual(
      [{ lang: "en" }, { lang: "ja" }, { lang: "zh" }],
    );
    expect(t.all("SELECT echo_id FROM summary_evidence ORDER BY echo_id")).toEqual([
      { echo_id: "e1" },
      { echo_id: "e2" },
      { echo_id: "e3" },
    ]);
    expect(t.all("SELECT type, topic_id, slot, at, summary_id FROM events")).toEqual([
      { type: "wave_formed", topic_id: "t1", slot: SLOT, at: slotStart(SLOT), summary_id: id },
    ]);
    const [p] = t.all("SELECT * FROM predictions");
    if (!p) throw new Error("no prediction");
    expect(p.summary_id).toBe(id);
    expect(p.criterion).toStartWith("[fake]");
    expect(p.hash).toBe(await sha256(String(p.criterion)));
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.registered_at).toBe(slotStart(SLOT));
    expect(p.due_at).toBe(slotStart(SLOT) + 14 * DAY);
    expectEveryFirstSummaryRegistered(t);
  });

  test("a version citing more than 50 echoes fits D1's limit of 100 bound values per statement", async () => {
    const t = setup(fakeDriver(), { d1: true });
    t.wave("t1", 60);
    const { outcome, commit } = await t.run();
    expect(outcome.status).toBe("done");
    expect(commit).toEqual({ published: ["t1"], formed: ["t1"], discarded: [] });
    expect(t.all("SELECT count(*) AS n FROM summary_evidence")).toEqual([{ n: 60 }]);
    expectEveryFirstSummaryRegistered(t);
  });

  test("the review window comes from settings (reviewWindowDays)", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { reviewWindowDays: 3 });
    t.wave("t1");
    await t.run();
    expect(t.all("SELECT due_at FROM predictions")).toEqual([
      { due_at: slotStart(SLOT) + 3 * DAY },
    ]);
  });

  test("a later version is the next number, with a summary_updated event and no new prediction", async () => {
    const t = setup();
    t.wave("t1");
    await t.run();
    const before = t.all("SELECT * FROM predictions");
    expect(before.length).toBe(1);
    t.wave("t1", 5, NEXT); // rewriteAfterNewEchoes, 5 by default
    const { commit } = await t.run(NEXT, NEXT_NOW);
    expect(commit).toEqual({ published: ["t1"], formed: [], discarded: [] });
    expect(t.all("SELECT version, reason, slot FROM summaries ORDER BY version")).toEqual([
      { version: 1, reason: "formed", slot: SLOT },
      { version: 2, reason: "new_echoes", slot: NEXT },
    ]);
    expect(t.all("SELECT type, slot FROM events ORDER BY id")).toEqual([
      { type: "wave_formed", slot: SLOT },
      { type: "summary_updated", slot: NEXT },
    ]);
    // The first version and the prediction are untouched (invariants 4 and 5).
    expect(t.all("SELECT * FROM predictions")).toEqual(before);
    expect(t.all("SELECT count(*) AS n FROM summary_evidence")).toEqual([{ n: 3 + 8 }]);
    expectEveryFirstSummaryRegistered(t);
  });

  test("a retried commit writes nothing twice and reports the same", async () => {
    const t = setup(
      editedDriver((r, input) =>
        input.name.includes("bad") ? { ...r, evidenceEchoIds: ["x"] } : r,
      ),
    );
    t.wave("t1");
    t.wave("bad", 3, SLOT, "Topic bad launch");
    const first = await t.run();
    const tables = ["summaries", "summary_texts", "summary_evidence", "events", "predictions"];
    const snapshot = () => tables.map((name) => t.all(`SELECT * FROM ${name}`));
    const before = snapshot();
    const ctx: StepContext = {
      slot: SLOT,
      db: t.orm,
      now: () => NOW + 1000,
      outputs: new Map<string, unknown>([["validate", first.validate]]),
    };
    expect(await commitStep({ blobs: t.blobs }).run(ctx)).toEqual(first.commit);
    expect(snapshot()).toEqual(before);
  });
});

describe("no first summary without a prediction (invariant 5)", () => {
  test("when the prediction cannot be written, neither is the first summary", async () => {
    const t = setup();
    t.wave("t1");
    // A stray prediction for the topic makes the prediction insert fail.
    t.sqlite.run(
      `INSERT INTO predictions (id, topic_id, summary_id, lang, criterion, hash, registered_at, due_at)
       VALUES ('stray', 't1', 'none', 'en', 'c', 'h', 0, 0)`,
    );
    const { outcome } = await t.run();
    expect(outcome).toMatchObject({ status: "failed", step: "commit" });
    expect(t.all("SELECT * FROM summaries")).toEqual([]);
    expect(t.all("SELECT * FROM summary_texts")).toEqual([]);
    expect(t.all("SELECT * FROM summary_evidence")).toEqual([]);
    expect(t.all("SELECT * FROM events")).toEqual([]);
  });

  test("when the wave_formed event cannot be written, neither is the first summary nor its prediction", async () => {
    const t = setup();
    t.wave("t1");
    t.sqlite.run(
      `INSERT INTO events (type, topic_id, slot, at) VALUES ('wave_formed', 't1', 'x', 0)`,
    );
    const { outcome } = await t.run();
    expect(outcome).toMatchObject({ status: "failed", step: "commit" });
    expect(t.all("SELECT * FROM summaries")).toEqual([]);
    expect(t.all("SELECT * FROM predictions")).toEqual([]);
  });

  test("a draft written without a criterion cannot become a first version", async () => {
    // The model drops the criterion it was asked for.
    const t = setup(editedDriver(({ criterion: _, ...r }) => r));
    t.wave("t1");
    const { validate, commit } = await t.run();
    expect(validate.discarded).toEqual([{ topicId: "t1", check: "criterion" }]);
    expect(commit.published).toEqual([]);
    expect(t.all("SELECT status FROM summaries")).toEqual([{ status: "discarded" }]);
    expect(t.all("SELECT * FROM predictions")).toEqual([]);
  });

  test("commit decides first from the database, not from the draft", async () => {
    const t = setup();
    t.wave("t1");
    const ctx = (outputs: [string, unknown][]): StepContext => ({
      slot: SLOT,
      db: t.orm,
      now: () => NOW,
      outputs: new Map(outputs),
    });
    // A draft that was not asked for a criterion, though the topic has no summary yet.
    const answer = fakeSummarize({
      name: "Topic t1 launch",
      echoes: [{ id: "e1", title: "A headline" }],
      languages: ["en", "zh", "ja"],
      first: false,
    });
    const draft: Draft = {
      topicId: "t1",
      reason: "new_echoes",
      first: false,
      offered: ["e1"],
      languages: ["en", "zh", "ja"],
      provider: "p",
      model: "m",
      answer,
    };
    await t.blobs.put(draftKey(SLOT, "t1"), JSON.stringify(draft));
    const out = await commitStep({ blobs: t.blobs }).run(
      ctx([["validate", { valid: ["t1"], discarded: [] }]]),
    );
    expect(out).toEqual({ published: [], formed: [], discarded: ["t1"] });
    expect(t.all("SELECT status, version FROM summaries")).toEqual([
      { status: "discarded", version: null },
    ]);
    expectEveryFirstSummaryRegistered(t);
  });

  test("over many waves and runs, every first summary has its prediction", async () => {
    let call = 0;
    const t = setup(
      editedDriver((r) => {
        call++;
        if (call % 3 === 0) return { ...r, evidenceEchoIds: ["bogus"] };
        if (call % 4 === 0) {
          const { criterion: _, ...rest } = r;
          return rest;
        }
        return r;
      }),
    );
    await changeSettings(t.orm, NOW, { summariesPerRun: 4, rewriteAfterNewEchoes: 1 });
    const slots = ["20261119T0500", "20261119T0600", "20261119T0700", "20261119T0800"];
    for (const [i, slot] of slots.entries()) {
      for (const id of ["a", "b", "c", "d", "e"])
        t.wave(id, 1 + ((i + id.charCodeAt(0)) % 2), slot);
      expect((await t.run(slot, slotStart(slot) + 60_000)).outcome.status).toBe("done");
    }
    expect(
      t.all("SELECT count(*) AS n FROM summaries WHERE status = 'discarded'")[0]?.n,
    ).toBeGreaterThan(0);
    expect(t.all("SELECT count(*) AS n FROM summaries WHERE version = 1")[0]?.n).toBeGreaterThan(0);
    expectEveryFirstSummaryRegistered(t);
  });
});

describe("steps pass ids only", () => {
  test("no step output holds the model's text", async () => {
    const t = setup();
    t.wave("t1");
    const r = await t.run();
    for (const out of [r.summarize, r.validate, r.commit]) {
      expect(JSON.stringify(out)).not.toContain("[fake]");
      expect(JSON.stringify(out)).not.toContain("launch");
    }
  });
});
