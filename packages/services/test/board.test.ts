// Site assembly + publish options tests (Rewrite Phase 2c): the
// MCP tools' data assembly and the config-derived build options
// both publishers share.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import { assembleSite } from "../src/board.js";
import { applyConfigOptions, langPackError, loadLangPackOptions } from "../src/publish.js";

function tempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-services-"));
  fs.mkdirSync(path.join(dir, "editions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state"), { recursive: true });
  const edition = {
    date: "2026-11-17",
    slot: "morning",
    title: "t",
    published_at: "2026-11-17T00:00:00Z",
    items: [
      { title: "Probe Topic", level: "must", sources: ["a", "b"], links: [], body: "x", action: "y" },
    ],
  };
  fs.writeFileSync(path.join(dir, "editions", "2026-11-17-morning.json"), JSON.stringify(edition));
  fs.writeFileSync(
    path.join(dir, "state", "seen-topics.json"),
    JSON.stringify({ topics: [{ name: "Probe Topic", sources: ["a"], grade: "must", first_seen: "2026-11-17" }] }),
  );
  return dir;
}

describe("assembleSite", () => {
  it("loads editions via the stores loader and builds topics", () => {
    const site = assembleSite(tempDataDir());
    strictEqual(site.editions.length, 1);
    strictEqual(site.editions[0].slot, "morning");
    strictEqual(site.topics.length, 1);
    strictEqual(site.topics[0].name, "Probe Topic");
    strictEqual(typeof site.topics[0].apps[0].heat, "number");
  });
});

describe("publish options", () => {
  it("applyConfigOptions resolves panel plugins from the host roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bd-services-root-"));
    const pluginDir = path.join(root, "plugins", "creator");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), "id: creator\napi: 1\norder: 10\n");
    fs.writeFileSync(path.join(pluginDir, "panel.yaml"), "head:\n  zh: 创作\nblocks: []\n");
    const opts = {} as never;
    applyConfigOptions(opts, { rootDir: root, dataDir: tempDataDir() }, {}, true);
    const panel = (opts as { panelPlugins?: { id: string }[] }).panelPlugins;
    deepStrictEqual(panel?.map((p) => p.id), ["creator"]);
  });

  it("lang packs: none present → empty; error message format is shared", () => {
    const opts = {} as never;
    const res = loadLangPackOptions(opts, tempDataDir());
    deepStrictEqual(res, { packs: [], problems: [] });
    strictEqual(
      langPackError(["a", "b"]).message,
      "language pack problems:\n  a\n  b",
    );
  });
});
