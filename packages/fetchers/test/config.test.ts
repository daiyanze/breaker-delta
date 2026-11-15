// Config parity: the YAML subset parser's output for the repo's
// config.example.yaml must deep-equal what PyYAML (production
// Python's parser) produces — that expected value is frozen in
// fixtures/golden-config.json by scripts/make_golden_fetchers.py.
// The JSON variant must match the plain JSON load.

import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { loadConfig, parseYaml } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const goldenPath = fileURLToPath(
  new URL("../../fixtures/golden-config.json", import.meta.url).href,
);
const G = JSON.parse(fs.readFileSync(goldenPath, "utf-8"));

describe("config golden", () => {
  it("config.example.yaml parses exactly like PyYAML", () => {
    const text = fs.readFileSync(path.join(repoRoot, G.yaml_file), "utf-8");
    deepStrictEqual(parseYaml(text), G.expected_from_yaml);
  });
  it("config.example.json parses as plain JSON", () => {
    const text = fs.readFileSync(path.join(repoRoot, G.json_file), "utf-8");
    deepStrictEqual(JSON.parse(text), G.expected_from_json);
  });
  it("yaml and json example configs agree on shared structure", () => {
    // The JSON file is generated from the YAML; the loader-facing
    // shapes must be identical.
    deepStrictEqual(G.expected_from_yaml, (() => {
      const j = JSON.parse(JSON.stringify(G.expected_from_json));
      delete j["$comment"];
      return j;
    })());
  });
  it("loadConfig finds config.example.yaml in a directory", () => {
    const cfg = loadConfig(null, { cwd: repoRoot });
    strictEqual(cfg["language"], "zh-CN");
    deepStrictEqual(cfg, G.expected_from_yaml);
  });
  it("loadConfig returns {} when nothing exists", () => {
    deepStrictEqual(loadConfig(null, { cwd: path.join(repoRoot, "packages") }), {});
  });
  it("loadConfig prefers an explicit JSON path", () => {
    const cfg = loadConfig(path.join(repoRoot, "config.example.json"), { cwd: repoRoot });
    strictEqual(cfg["language"], "zh-CN");
  });
});

describe("yaml subset boundaries", () => {
  it("block sequences of mappings and flow values", () => {
    deepStrictEqual(
      parseYaml("a:\n  - name: x\n    n: 1\n  - name: y\n    n: 2\nb: [1, two, true, null]\n"),
      { a: [{ name: "x", n: 1 }, { name: "y", n: 2 }], b: [1, "two", true, null] },
    );
  });
  it("quoted scalars keep colons and hashes", () => {
    deepStrictEqual(parseYaml('a: "x: y # z"\nb: \'it\'\'s\'\n'), { a: "x: y # z", b: "it's" });
  });
  it("multiline strings throw instead of being misread", () => {
    throws(() => parseYaml("a: |\n  some text\n"), /unsupported construct/);
  });
  it("anchors throw instead of being misread", () => {
    throws(() => parseYaml("a: &anchor 1\n"), /unsupported construct/);
  });
  it("unparseable lines throw", () => {
    throws(() => parseYaml("just a bare string\n"), /cannot parse line/);
  });
});
