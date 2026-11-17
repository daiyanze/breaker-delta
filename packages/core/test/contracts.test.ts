// Contract tests (Rewrite Phase 0): every cross-boundary structure
// validates against its schema in packages/core/src/schemas.ts.
// Fixtures under fixtures/contracts/ are real payloads — a live
// edition file, the official topic store, the generated momentum
// page file, all eight bundled plugin manifests (YAML parsed to
// JSON), the ai-tech preset config and the official instance config.
// Producer outputs (topicsData/alertsData) are validated against
// their consumer schemas, so producer and consumer cannot drift.

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  alertsData,
  alertsDataSchema,
  buildTopics,
  editionItemSchema,
  editionSchema,
  heatOf,
  installsFileSchema,
  pluginManifestSchema,
  pluginPageFileSchema,
  radarConfigSchema,
  recordEntriesSchema,
  topicsData,
  topicsDataSchema,
  topicStoreSchema,
  validate,
  type Edition,
  type EditionWire,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "..", "..", "fixtures", "contracts");
const readJson = (rel: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(fixturesDir, rel), "utf-8"));

describe("contracts: real payloads validate", () => {
  it("edition file (wire form)", () => {
    const edition = readJson("edition-real.json");
    deepStrictEqual(validate(editionSchema, edition), []);
    const items = (edition as EditionWire).items ?? [];
    ok(items.length > 0, "fixture edition has items");
    for (const item of items) {
      deepStrictEqual(validate(editionSchema, { date: "2026-01-01", items: [item] }), []);
    }
  });

  it("loaded edition items carry _heat/_rank numbers", () => {
    const edition = readJson("edition-real.json") as EditionWire;
    for (const item of edition.items ?? []) {
      const loaded = { ...item, _heat: 42, _rank: 1 };
      deepStrictEqual(validate(editionItemSchema, loaded), []);
      const errors = validate(editionItemSchema, item);
      ok(errors.some((e) => e.includes("_heat")), "wire item without _heat is rejected");
    }
  });

  it("topic store", () => {
    deepStrictEqual(validate(topicStoreSchema, readJson("store-real.json")), []);
  });

  it("plugin page file", () => {
    deepStrictEqual(validate(pluginPageFileSchema, readJson("plugin-page-momentum.json")), []);
  });

  it("all bundled plugin manifests", () => {
    const dir = path.join(fixturesDir, "manifests");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    strictEqual(files.length, 8);
    for (const f of files) {
      deepStrictEqual(validate(pluginManifestSchema, readJson(path.join("manifests", f))), [], f);
    }
  });

  it("configs (preset + official instance)", () => {
    deepStrictEqual(validate(radarConfigSchema, readJson("config-ai-tech.json")), []);
    deepStrictEqual(validate(radarConfigSchema, readJson("config-official.json")), []);
  });

  it("installs file", () => {
    deepStrictEqual(validate(installsFileSchema, readJson("installs-sample.json")), []);
  });

  it("producer outputs match consumer schemas (topics/alerts)", () => {
    const raw = readJson("edition-real.json") as EditionWire;
    const edition: Edition = {
      ...raw,
      items: (raw.items ?? []).map((item, i) => ({
        ...item,
        _heat: heatOf(item as Parameters<typeof heatOf>[0]),
        _rank: i + 1,
      })),
    } as Edition;
    const store = readJson("store-real.json") as { topics: { name: string }[] };
    const topics = buildTopics([edition], store.topics);
    deepStrictEqual(validate(topicsDataSchema, topicsData([edition], topics)), []);
    deepStrictEqual(validate(alertsDataSchema, alertsData([edition], topics)), []);
  });

  it("record entries", () => {
    deepStrictEqual(
      validate(recordEntriesSchema, [{ name: "X", sources: ["GitHub"], grade: "must" }]),
      [],
    );
  });
});

describe("contracts: invalid payloads are rejected with paths", () => {
  const edition = readJson("edition-real.json") as Record<string, unknown>;

  it("missing date", () => {
    const bad = { ...edition };
    delete bad.date;
    const errors = validate(editionSchema, bad);
    ok(errors.some((e) => e.includes("$.date")), errors.join("; "));
  });

  it("items not an array", () => {
    const errors = validate(editionSchema, { ...edition, items: {} });
    ok(errors.some((e) => e.includes("$.items")), errors.join("; "));
  });

  it("item sources of wrong type", () => {
    const items = [...(edition.items as unknown[])];
    items[0] = { ...(items[0] as Record<string, unknown>), sources: [42] };
    const errors = validate(editionSchema, { ...edition, items });
    ok(errors.some((e) => e.includes("sources")), errors.join("; "));
  });

  it("manifest with unknown slot", () => {
    const manifest = readJson(path.join("manifests", "momentum.json")) as Record<string, unknown>;
    const errors = validate(pluginManifestSchema, { ...manifest, slots: ["fly"] });
    ok(errors.some((e) => e.includes("slots")), errors.join("; "));
  });

  it("record entry with empty name", () => {
    const errors = validate(recordEntriesSchema, [{ name: "", sources: [], grade: "must" }]);
    ok(errors.length > 0, "empty name rejected");
  });

  it("store topic missing history", () => {
    const store = readJson("store-real.json") as { topics: Record<string, unknown>[] };
    const bad = { topics: store.topics.map((t) => ({ ...t })) };
    delete bad.topics[0].history;
    const errors = validate(topicStoreSchema, bad);
    ok(errors.some((e) => e.includes("history")), errors.join("; "));
  });
});
