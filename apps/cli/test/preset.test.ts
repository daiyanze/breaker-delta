// Preset packaging guards (import-based, unlike cli.test.ts):
//  - presets/ai-tech/config.yaml stays in lockstep with
//    config.example.yaml on every shared top-level section — the
//    example file is the legacy fallback for the same instance, so
//    the two must not drift apart.
//  - the preset's categories section parses to exactly the rule set
//    that used to be hardcoded (CAT_RULES + the 行业动态 fallback),
//    so the official instance's output cannot change.
//  - loadCliConfig layers preset (base) <- instance config (wins).

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CAT_RULES, catRulesFromConfig } from "@breaker-delta/core";
import { loadConfig } from "@breaker-delta/fetchers";

import { loadCliConfig, type CliContext } from "../src/context.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..", "..");

function load(rel: string): Record<string, unknown> {
  return loadConfig(path.join(ROOT, rel)) as Record<string, unknown>;
}

describe("ai-tech preset packaging", () => {
  const example = load("config.example.yaml");
  const preset = load(path.join("presets", "ai-tech", "config.yaml"));

  it("example config names the ai-tech preset", () => {
    strictEqual(example["preset"], "ai-tech");
  });

  it("shared sections deep-equal the example config (no drift)", () => {
    for (const key of Object.keys(example)) {
      if (key === "preset") continue;
      deepStrictEqual(preset[key], example[key], `section ${key} drifted`);
    }
  });

  it("categories parse to the formerly hardcoded rule set", () => {
    deepStrictEqual(catRulesFromConfig(preset), {
      rules: CAT_RULES,
      fallback: "行业动态",
      i18n: {
        "安全": { en: "Security", ja: "セキュリティ" },
        "政策与监管": { en: "Policy", ja: "政策・規制" },
        "开源": { en: "Open Source", ja: "オープンソース" },
        "商业与资本": { en: "Business", ja: "ビジネス" },
        "Agent 与应用": { en: "Agents & Apps", ja: "エージェント" },
        "AI 模型": { en: "AI Models", ja: "AIモデル" },
        "行业动态": { en: "Industry", ja: "業界動向" },
      },
    });
  });
});

describe("loadCliConfig preset layering", () => {
  function ctxWithConfig(text: string): CliContext {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-preset-"));
    fs.writeFileSync(path.join(dir, "config.yaml"), text, "utf-8");
    return { dataDir: dir, rootDir: ROOT, json: false };
  }

  it("preset fills the base layer (categories arrive)", () => {
    const { config, preset } = loadCliConfig(ctxWithConfig("preset: ai-tech\n"));
    strictEqual(preset, "ai-tech");
    strictEqual(catRulesFromConfig(config)?.fallback, "行业动态");
  });

  it("instance sections win over the preset's", () => {
    const { config } = loadCliConfig(
      ctxWithConfig("preset: ai-tech\ntopics:\n  自定义主题: 9\n"),
    );
    deepStrictEqual(config.topics, { "自定义主题": 9 });
    // Sections the instance does not mention still come from the preset.
    strictEqual(config.language, "zh-CN");
  });

  it("no preset key = config passes through untouched", () => {
    const { config, preset } = loadCliConfig(ctxWithConfig("language: en\n"));
    strictEqual(preset, null);
    strictEqual(config.language, "en");
    strictEqual(config.categories, undefined);
  });
});
