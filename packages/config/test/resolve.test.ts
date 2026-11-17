// Resolution + layering tests for @breaker-delta/config (Rewrite
// Phase 1b): the effective-config semantics the CLI has always had,
// now pinned at the package that owns them.

import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import {
  findConfigFileIn,
  findPresetConfigFileIn,
  layerPresetConfig,
  listPresetNamesIn,
  loadEffectiveConfig,
  parseConfigText,
} from "../src/index.js";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bd-config-"));
}

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf-8");
}

describe("loadEffectiveConfig", () => {
  it("no config anywhere → empty config, no preset", () => {
    const dataDir = tmpdir();
    const rootDir = tmpdir();
    const eff = loadEffectiveConfig({ dataDir, rootDir });
    deepStrictEqual(eff, { config: {}, file: null, preset: null, presetFile: null });
  });

  it("instance config without preset passes through", () => {
    const dataDir = tmpdir();
    const rootDir = tmpdir();
    write(path.join(dataDir, "config.yaml"), "preset: \nplugins:\n  creator:\n    enabled: true\n");
    const eff = loadEffectiveConfig({ dataDir, rootDir });
    strictEqual(eff.preset, null);
    strictEqual(eff.file, path.join(dataDir, "config.yaml"));
    deepStrictEqual((eff.config as { plugins?: unknown }).plugins, { creator: { enabled: true } });
  });

  it("preset layers underneath; instance wins per top-level section", () => {
    const dataDir = tmpdir();
    const rootDir = tmpdir();
    write(
      path.join(rootDir, "presets", "ai-tech", "config.yaml"),
      "categories:\n  a: [x]\nkeywords:\n  mute: [spam]\n",
    );
    write(
      path.join(dataDir, "config.yaml"),
      "preset: ai-tech\nkeywords:\n  mute: [mine]\n",
    );
    const eff = loadEffectiveConfig({ dataDir, rootDir });
    strictEqual(eff.preset, "ai-tech");
    const cfg = eff.config as Record<string, unknown>;
    deepStrictEqual(cfg.keywords, { mute: ["mine"] }); // instance section wins
    deepStrictEqual(cfg.categories, { a: ["x"] }); // preset section survives
  });

  it("a data-dir preset wins over a bundled preset of the same name", () => {
    const dataDir = tmpdir();
    const rootDir = tmpdir();
    write(path.join(rootDir, "presets", "p", "config.yaml"), "topics:\n  from: root\n");
    write(path.join(dataDir, "presets", "p", "config.yaml"), "topics:\n  from: data\n");
    write(path.join(dataDir, "config.yaml"), "preset: p\n");
    const eff = loadEffectiveConfig({ dataDir, rootDir });
    strictEqual(eff.presetFile, path.join(dataDir, "presets", "p", "config.yaml"));
    deepStrictEqual((eff.config as Record<string, unknown>).topics, { from: "data" });
  });

  it("naming a missing preset throws with the preset name", () => {
    const dataDir = tmpdir();
    const rootDir = tmpdir();
    write(path.join(dataDir, "config.yaml"), "preset: nope\n");
    throws(
      () => loadEffectiveConfig({ dataDir, rootDir }),
      /config names preset "nope"/,
    );
  });

  it("finders: explicit path wins; invalid preset names rejected", () => {
    const dataDir = tmpdir();
    const explicit = path.join(dataDir, "mine.yaml");
    write(explicit, "a: 1\n");
    strictEqual(findConfigFileIn([dataDir], explicit), explicit);
    strictEqual(findConfigFileIn([dataDir], path.join(dataDir, "missing.yaml")), null);
    strictEqual(findPresetConfigFileIn([dataDir], "../evil"), null);
    strictEqual(findPresetConfigFileIn([dataDir], "UPPER"), null);
  });

  it("listPresetNamesIn merges dirs, sorted and deduped", () => {
    const dataDir = tmpdir();
    const rootDir = tmpdir();
    write(path.join(dataDir, "presets", "b", "config.yaml"), "x: 1\n");
    write(path.join(rootDir, "presets", "a", "config.yaml"), "x: 1\n");
    write(path.join(rootDir, "presets", "b", "config.yaml"), "x: 1\n");
    deepStrictEqual(listPresetNamesIn([dataDir, rootDir]), ["a", "b"]);
  });
});

describe("parseConfigText / layerPresetConfig", () => {
  it("null and empty text parse to {}", () => {
    deepStrictEqual(parseConfigText(null), {});
    deepStrictEqual(parseConfigText(""), {});
  });

  it("layering is per-section with instance precedence", () => {
    deepStrictEqual(
      layerPresetConfig({ keywords: { mute: ["mine"] } }, { keywords: { mute: ["base"] }, categories: { a: ["x"] } }),
      { keywords: { mute: ["mine"] }, categories: { a: ["x"] } },
    );
    deepStrictEqual(layerPresetConfig({ a: 1 }, null), { a: 1 });
  });
});
