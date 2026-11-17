// File-adapter tests for the pieces that moved out of
// @breaker-delta/core in Rewrite Phase 1. The store roundtrip and
// the track-record missing-file expectations reuse core's golden
// fixture values, so the on-disk behavior is pinned to the same
// Python-derived contract as before the move.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { upsertTopic, type TopicStore } from "@breaker-delta/core";

import { loadStore, saveStore } from "../src/store-file.js";
import { parseTrackRecordFile } from "../src/track-record-file.js";
import { fsVocabIo } from "../src/vocab-file.js";

const goldenPath = fileURLToPath(
  new URL("../../../core/fixtures/golden.json", import.meta.url).href,
);
const G = JSON.parse(fs.readFileSync(goldenPath, "utf-8"));

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bd-stores-"));
}

describe("store file", () => {
  it("roundtrips through save/load; file content is 2-space JSON", () => {
    const td = tmpdir();
    const store: TopicStore = { topics: [] };
    upsertTopic(store, "Old Topic", ["GitHub"], "must", "2026-11-11");
    upsertTopic(store, "Old Topic", ["Hacker News"], "watch", "2026-11-12");
    const p = path.join(td, "sub", "seen.json");
    saveStore(store, p);
    deepStrictEqual(loadStore(p), store);
    strictEqual(fs.readFileSync(p, "utf-8"), JSON.stringify(store, null, 2));
  });

  it("missing file loads as an empty store", () => {
    const td = tmpdir();
    deepStrictEqual(loadStore(path.join(td, "nope.json")), { topics: [] });
  });

  it("a file without topics is normalized", () => {
    const td = tmpdir();
    const p = path.join(td, "seen.json");
    fs.writeFileSync(p, "{}", "utf-8");
    deepStrictEqual(loadStore(p), { topics: [] });
  });
});

describe("track record file", () => {
  it("missing file returns the golden empty structure", () => {
    const td = tmpdir();
    deepStrictEqual(
      parseTrackRecordFile(path.join(td, "nope.md")),
      G.track_record.missing_file,
    );
  });

  it("parses a real file identically to the pure parser", () => {
    const td = tmpdir();
    const p = path.join(td, "track-record.md");
    fs.writeFileSync(p, G.track_record.markdown, "utf-8");
    deepStrictEqual(parseTrackRecordFile(p), G.track_record.expected);
  });
});

describe("vocab io", () => {
  it("save/load/exists roundtrip; corrupt files load as {}", () => {
    const td = tmpdir();
    const p = path.join(td, "sub", "vocab.json");
    strictEqual(fsVocabIo.exists(p), false);
    fsVocabIo.save(p, { github: "2026-11-17" });
    strictEqual(fsVocabIo.exists(p), true);
    deepStrictEqual(fsVocabIo.load(p), { github: "2026-11-17" });
    fs.writeFileSync(p, "not json", "utf-8");
    deepStrictEqual(fsVocabIo.load(p), {});
    fs.writeFileSync(p, "[1,2]", "utf-8");
    deepStrictEqual(fsVocabIo.load(p), {});
  });
});
