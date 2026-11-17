// Catalog tests (Rewrite Phase 3b): three-language key parity
// (also enforced by the types), spot values against the frozen
// copy, and the lookup helpers.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import { LANGS, STRINGS, fmt, s, sArr } from "../src/index.js";

describe("catalog parity", () => {
  it("all three languages carry the same 130 string keys", () => {
    const keys = Object.keys(STRINGS.zh).sort();
    strictEqual(keys.length, 130);
    deepStrictEqual(Object.keys(STRINGS.en).sort(), keys);
    deepStrictEqual(Object.keys(STRINGS.ja).sort(), keys);
    deepStrictEqual(LANGS, ["zh", "en", "ja"]);
  });

  it("frozen spot values are unchanged", () => {
    strictEqual(STRINGS.zh.site_name, "浪尖雷达 Breaker Delta");
    strictEqual(STRINGS.zh.wave, "浪高");
    deepStrictEqual(STRINGS.zh.tabs?.length, 10);
  });
});

describe("lookups", () => {
  it("s falls back to zh for unknown languages and missing keys", () => {
    strictEqual(s("en", "wave"), "Wave");
    strictEqual(s("fr", "wave"), "浪高");
    strictEqual(s("en", "no-such-key"), "");
    deepStrictEqual(sArr("ja", "tabs")?.length, 10);
    deepStrictEqual(sArr("en", "wave"), []);
  });

  it("fmt interpolates {name} placeholders", () => {
    strictEqual(fmt("{n} 期", { n: 10 }), "10 期");
    strictEqual(fmt("{n} 期", {}), " 期");
  });
});
