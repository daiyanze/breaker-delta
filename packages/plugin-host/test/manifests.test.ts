// Pure plugin-host tests (Rewrite Phase 2a): manifest validation,
// panel def construction, enablement, score/entity resolution and
// schema validation — the logic CLI and web now share.

import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  codeSlotsOf,
  enabledPanelDefs,
  entityPluginIdsFromManifests,
  manifestFromText,
  panelDefFromTexts,
  scoreDescriptorsFromManifests,
  validatePluginSchemaText,
  type PluginManifestFull,
} from "../src/manifests.js";

const MANIFEST = "id: demo\napi: 1\norder: 5\nslots: [panel, grading]\n";
const PANEL = "head:\n  zh: 演示\nblocks: []\n";

describe("manifestFromText", () => {
  it("parses a valid manifest", () => {
    const m = manifestFromText(MANIFEST, "x");
    strictEqual(m.id, "demo");
    deepStrictEqual(codeSlotsOf(m), []);
  });

  it("rejects a missing id and an unsupported api", () => {
    throws(() => manifestFromText("order: 1\n", "here"), /plugin at here: plugin\.yaml has no string id/);
    throws(() => manifestFromText("id: x\napi: 2\n", "x"), /unsupported api 2/);
  });

  it("codeSlotsOf filters to known code slots in canonical order", () => {
    const m = manifestFromText("id: x\nslots: [tools, panel, score, bogus]\n", "x");
    deepStrictEqual(codeSlotsOf(m), ["score", "tools"]);
  });
});

describe("panelDefFromTexts", () => {
  it("builds a def; requires_data falls back to schema presence", () => {
    const def = panelDefFromTexts(MANIFEST, PANEL, true, "x");
    strictEqual(def?.id, "demo");
    strictEqual(def?.order, 5);
    strictEqual(def?.requiresData, true);
    const def2 = panelDefFromTexts("id: d2\nrequires_data: false\n", PANEL, true, "x");
    strictEqual(def2?.requiresData, false);
  });

  it("no panel text → null (code-only pack); bad panel → throw", () => {
    strictEqual(panelDefFromTexts(MANIFEST, null, false, "x"), null);
    throws(() => panelDefFromTexts(MANIFEST, "blocks: []\n", false, "x"), /needs a head and a blocks list/);
  });
});

describe("enablement", () => {
  const defs = [
    { id: "creator", order: 10, requiresData: false, head: { zh: "c" }, blocks: [] },
    { id: "investor", order: 20, requiresData: true, head: { zh: "i" }, blocks: [] },
  ] as never[];

  it("creator defaults on, others off; render order by (order, id)", () => {
    deepStrictEqual(enabledPanelDefs(defs, {}, true).map((d) => d.id), ["creator"]);
    deepStrictEqual(
      enabledPanelDefs(defs, { plugins: { investor: { enabled: true } } }, true).map((d) => d.id),
      ["creator", "investor"],
    );
  });

  it("the creator outer switch wins over config", () => {
    deepStrictEqual(enabledPanelDefs(defs, {}, false), []);
    deepStrictEqual(
      enabledPanelDefs(defs, { plugins: { creator: { enabled: false } } }, true),
      [],
    );
  });
});

describe("score + entity resolution", () => {
  const manifests: PluginManifestFull[] = [
    { id: "momentum", slots: ["score", "page"], score: { label: { zh: "动量", en: "Momentum" } } },
    { id: "tickers", slots: ["entities"] },
    { id: "off", slots: ["score"], score: { label: { zh: "关" } } },
  ];
  const config = { plugins: { momentum: { enabled: true }, tickers: { enabled: true } } };

  it("score descriptors only for enabled score plugins, labels filled", () => {
    deepStrictEqual(scoreDescriptorsFromManifests(manifests, config), [
      { id: "momentum", label: { zh: "动量", en: "Momentum", ja: "动量" } },
    ]);
  });

  it("entity ids only for enabled entities plugins", () => {
    deepStrictEqual(entityPluginIdsFromManifests(manifests, config), ["tickers"]);
    deepStrictEqual(entityPluginIdsFromManifests(manifests, {}), []);
  });
});

describe("validatePluginSchemaText", () => {
  it("missing → problem; valid fields counted; bad shapes named", () => {
    deepStrictEqual(validatePluginSchemaText(null), { problem: "schema.yaml missing" });
    deepStrictEqual(
      validatePluginSchemaText("fields:\n  - name: a\n    type: string\n  - name: b\n    type: enum\n    values: [x]\n"),
      { fields: 2 },
    );
    const dup = validatePluginSchemaText("fields:\n  - name: a\n    type: string\n  - name: a\n    type: string\n");
    strictEqual("problem" in dup && /duplicate/.test(dup.problem), true);
    const badEnum = validatePluginSchemaText("fields:\n  - name: a\n    type: enum\n");
    strictEqual("problem" in badEnum && /values/.test(badEnum.problem), true);
  });
});
