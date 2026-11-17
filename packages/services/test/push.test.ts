// Push contract tests (Rewrite Phase 2b): the shared validation,
// store application, edition envelope and auth gate both servers
// now run. The CLI's serve.test.ts exercises the same contract
// over HTTP on the CLI adapter.

import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";

import type { TopicStore } from "@breaker-delta/core";

import {
  applyRecordToStore,
  checkBearerToken,
  editionConflictMessage,
  editionFileName,
  validatePushEdition,
  validateRecordEntries,
} from "../src/push.js";

describe("validateRecordEntries", () => {
  it("accepts a well-formed body", () => {
    deepStrictEqual(
      validateRecordEntries([{ name: "A", sources: ["x"], grade: "must" }]),
      [{ name: "A", sources: ["x"], grade: "must" }],
    );
  });

  it("rejects with the contract messages", () => {
    throws(() => validateRecordEntries({}), /input must be a JSON array/);
    throws(() => validateRecordEntries([{ name: "", sources: [], grade: "g" }]), /entry 0: name/);
    throws(() => validateRecordEntries([{ name: "A", sources: [1], grade: "g" }]), /entry 0: sources/);
    throws(() => validateRecordEntries([{ name: "A", sources: [], grade: "" }]), /entry 0: grade/);
  });
});

describe("applyRecordToStore", () => {
  it("counts created vs updated and reports lines", () => {
    const store: TopicStore = { topics: [] };
    const r1 = applyRecordToStore(store, [
      { name: "A", sources: ["x"], grade: "must" },
      { name: "B", sources: ["y"], grade: "watch" },
    ]);
    deepStrictEqual([r1.created, r1.updated, r1.total], [2, 0, 2]);
    deepStrictEqual(r1.lines, ["created: A", "created: B"]);
    const r2 = applyRecordToStore(store, [{ name: "A", sources: ["x", "z"], grade: "must" }]);
    deepStrictEqual([r2.created, r2.updated, r2.total], [0, 1, 2]);
    deepStrictEqual(r2.lines, ["updated: A"]);
  });
});

describe("validatePushEdition", () => {
  it("accepts morning/evening editions, rejects the rest with one message", () => {
    const ed = validatePushEdition({ date: "2026-11-17", slot: "morning", items: [] });
    strictEqual(ed.date, "2026-11-17");
    for (const bad of [
      { date: "17-11-2026", slot: "morning", items: [] },
      { date: "2026-11-17", slot: "pilot", items: [] },
      { date: "2026-11-17", slot: "morning" },
      null,
      "x",
    ]) {
      throws(() => validatePushEdition(bad), /edition must be an object with date/);
    }
  });

  it("file name and conflict message follow the contract", () => {
    strictEqual(editionFileName("2026-11-17", "evening"), "2026-11-17-evening.json");
    strictEqual(
      editionConflictMessage("2026-11-17", "evening"),
      "2026-11-17-evening.json already exists (append ?replace=1 to overwrite)",
    );
  });
});

describe("checkBearerToken", () => {
  it("403 when unconfigured, 401 when wrong, ok when matching", () => {
    deepStrictEqual(checkBearerToken("Bearer x", ""), {
      ok: false,
      status: 403,
      error: "push API disabled (set BD_PUSH_TOKEN)",
    });
    deepStrictEqual(checkBearerToken(undefined, "tok"), {
      ok: false,
      status: 401,
      error: "bad or missing bearer token",
    });
    strictEqual(checkBearerToken("Bearer tok", "tok").ok, true);
  });
});
