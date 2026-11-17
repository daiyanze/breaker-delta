// Parity tests: every case in fixtures/golden.json was produced by
// running the Python implementations (scripts/make_golden.py) over
// fixed inputs. These tests replay the same inputs through the
// TypeScript port and compare item by item.

import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  alertsData,
  applyControls,
  applyVocab,
  buildTopics,
  classify,
  dueForReview,
  ENTITY_SOURCES,
  heatOf,
  itemTime,
  parseTrackRecord,
  publishTokens,
  recordReview,
  RESERVED_FILES,
  resonanceGroups,
  scanTokens,
  slugify,
  titleKeywords,
  topicFile,
  topicKey,
  topicsData,
  topicWeights,
  upsertTopic,
} from "../src/index.js";
import type { Edition, TopicStore, VocabIo } from "../src/index.js";

// Test-local fs VocabIo for the pure applyVocab (the production
// implementation is @breaker-delta/stores' fsVocabIo, covered by
// that package's own tests).
const testVocabIo: VocabIo = {
  exists: (p) => fs.existsSync(p),
  load: (p) => {
    try {
      const data: unknown = JSON.parse(fs.readFileSync(p, "utf-8"));
      return data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  },
  save: (p, data) => {
    fs.mkdirSync(path.dirname(p) || ".", { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 1), "utf-8");
  },
};

const goldenPath = fileURLToPath(new URL("../../fixtures/golden.json", import.meta.url).href);
const G = JSON.parse(fs.readFileSync(goldenPath, "utf-8"));

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("golden: heat", () => {
  for (const [i, c] of (G.heat as Any[]).entries()) {
    it(`case ${i}`, () => strictEqual(heatOf(clone(c.item)), c.expected));
  }
});

describe("golden: classify", () => {
  for (const [i, c] of (G.classify as Any[]).entries()) {
    it(`case ${i}`, () => strictEqual(classify(c.title, c.body), c.expected));
  }
});

describe("golden: slugify / reserved / topic_file", () => {
  for (const [i, c] of (G.slugify as Any[]).entries()) {
    it(`slugify case ${i}`, () => strictEqual(slugify(c.title, c.fallback), c.expected));
  }
  it("reserved files", () =>
    deepStrictEqual([...RESERVED_FILES].sort(), G.reserved_files));
  it("topic file", () => {
    for (const c of G.topic_file as Any[]) {
      strictEqual(topicFile({ slug: c.slug }), c.expected);
    }
  });
});

describe("golden: title_keywords", () => {
  for (const [i, c] of (G.title_keywords as Any[]).entries()) {
    it(`case ${i}`, () => deepStrictEqual(titleKeywords(c.title), c.expected));
  }
});

describe("golden: tokens", () => {
  for (const [i, c] of (G.scan_tokens as Any[]).entries()) {
    it(`scanTokens case ${i}`, () =>
      deepStrictEqual([...scanTokens(c.name)].sort(), c.expected));
  }
  for (const [i, c] of (G.publish_tokens as Any[]).entries()) {
    it(`publishTokens case ${i}`, () =>
      deepStrictEqual([...publishTokens(c.title)].sort(), c.expected));
  }
});

describe("golden: topic_weights", () => {
  for (const [i, c] of (G.topic_weights as Any[]).entries()) {
    it(`case ${i}`, () => deepStrictEqual(topicWeights(clone(c.config)), c.expected));
  }
});

describe("golden: item_time", () => {
  for (const [i, c] of (G.item_time as Any[]).entries()) {
    it(`case ${i}`, () => {
      const got = itemTime({ source: "test", name: "x", url: "https://example.com", metrics: clone(c.metrics), detail: "" });
      if (c.expected === null) {
        strictEqual(got, null);
      } else {
        strictEqual(got?.getTime(), new Date(c.expected).getTime());
      }
    });
  }
});

describe("golden: apply_controls", () => {
  for (const [i, c] of (G.apply_controls as Any[]).entries()) {
    it(`case ${i}`, () => {
      const results = clone(c.input.results);
      const [stats, alerts] = applyControls(results, clone(c.input.config), new Date(c.input.now));
      deepStrictEqual(stats, c.expected.stats);
      deepStrictEqual(alerts, c.expected.alerts);
      deepStrictEqual(results, c.expected.results);
    });
  }
});

describe("golden: resonance", () => {
  for (const [i, c] of (G.resonance as Any[]).entries()) {
    it(`case ${i}`, () => deepStrictEqual(resonanceGroups(clone(c.input)), c.expected));
  }
});

describe("golden: store", () => {
  it("replays the Python operation sequence", () => {
    const S = G.store;
    const store: TopicStore = { topics: [] };
    deepStrictEqual(clone(upsertTopic(store, "Model X", ["x", "github"], "必看", "2026-11-11")), S.upsert_new);
    deepStrictEqual(clone(upsertTopic(store, "Model X", ["reddit", "x"], "关注", "2026-11-12")), S.upsert_update);
    deepStrictEqual(clone(upsertTopic(store, "Old Topic", ["hn"], "苗头", "2026-10-20")), S.upsert_second);
    store.topics.push({
      name: "Legacy", first_seen: "2026-11-01", last_seen: "2026-11-01",
      sources: ["x"], history: [{ date: "2026-11-01", grade: "关注" }],
    });
    deepStrictEqual(clone(upsertTopic(store, "Legacy", ["y"], "必看", "2026-11-05")), S.upsert_legacy_fills_review);
    deepStrictEqual(dueForReview(store, "2026-11-03").map((t) => t.name), S.due_at_14d_exact);
    deepStrictEqual(dueForReview(store, "2026-11-25").map((t) => t.name), S.due_later);
    deepStrictEqual(clone(recordReview(store, "Old Topic", "hit", "2026-11-25")), S.record_hit);
    deepStrictEqual(dueForReview(store, "2026-11-26").map((t) => t.name), S.due_after_review);
    throws(() => recordReview(store, "Model X", "maybe", "2026-11-26"),
      (err: unknown) => err instanceof Error && err.message === S.record_invalid.error_arg);
    throws(() => recordReview(store, "Nope", "hit", "2026-11-26"),
      (err: unknown) => err instanceof Error && err.message === S.record_missing.error_arg);
    deepStrictEqual(store, S.final_store);
    // The file roundtrip (saveStore/loadStore) is covered by
    // @breaker-delta/stores' tests against these same golden values.
  });
});

describe("golden: vocab", () => {
  it("replays baseline / novel / window-expiry rounds", () => {
    const td = fs.mkdtempSync(path.join(os.tmpdir(), "bd-vocab-"));
    const stateFile = path.join(td, "vocab.json");
    const cfg = { vocab: { window_days: 60, state_file: stateFile } };
    for (const round of G.vocab.rounds as Any[]) {
      const results = clone(round.input);
      const stats = applyVocab(results, clone(cfg), new Date(round.now), testVocabIo);
      deepStrictEqual(stats, round.expected.stats);
      const novelItems = results.flatMap((r: Any) => r.items).filter((i: Any) => i.novel).map((i: Any) => i.name);
      deepStrictEqual(novelItems, round.expected.novel_items);
      deepStrictEqual(JSON.parse(fs.readFileSync(stateFile, "utf-8")), round.expected.saved_vocab);
    }
    deepStrictEqual(applyVocab([], { vocab: { enabled: false } }, new Date(), testVocabIo), G.vocab.disabled);
    deepStrictEqual([...ENTITY_SOURCES].sort(), G.vocab.entity_sources);
  });
});

describe("golden: topic_key", () => {
  for (const [i, c] of (G.topic_key as Any[]).entries()) {
    it(`case ${i}`, () => deepStrictEqual(topicKey({ title: c.title }, clone(c.ledger)), c.expected));
  }
});

/** Mirror publish.load(): attach _heat, then _rank by heat desc (stable). */
function withHeatRank(editions: Edition[]): Edition[] {
  const eds = clone(editions) as Edition[];
  for (const ed of eds) {
    for (const it of ed.items) {
      delete (it as Any)._heat;
      delete (it as Any)._rank;
      it._heat = heatOf(it);
    }
    const ranked = [...ed.items].sort((a, b) => b._heat - a._heat);
    ranked.forEach((it, i) => {
      it._rank = i + 1;
    });
  }
  return eds;
}

function checkChain(chain: Any): void {
  const eds = withHeatRank(chain.editions);
  deepStrictEqual(eds, chain.editions); // _heat/_rank recomputation matches Python
  const topics = buildTopics(eds, clone(chain.ledger));
  deepStrictEqual(topics, chain.topics);
  deepStrictEqual(topicsData(eds, topics), chain.topics_data);
  deepStrictEqual(alertsData(eds, topics), chain.alerts_data);
}

describe("golden: build_topics full chain (ED1+ED2+ED3)", () => {
  it("topics + topics_data + alerts_data match", () => checkChain(G.chain));
});

describe("golden: build_topics slug collisions", () => {
  it("topics + data match", () => checkChain(G.chain_collide));
});

describe("golden: empty chain", () => {
  it("topics_data / alerts_data on no editions", () => {
    deepStrictEqual(topicsData([], []), G.chain_empty.topics_data);
    deepStrictEqual(alertsData([], []), G.chain_empty.alerts_data);
  });
});

describe("golden: track_record", () => {
  it("parses the sample ledger", () => {
    deepStrictEqual(parseTrackRecord(G.track_record.markdown), G.track_record.expected);
  });
  // The missing-file case goes through parseTrackRecordFile, which
  // lives in @breaker-delta/stores and is covered by its tests.
});
