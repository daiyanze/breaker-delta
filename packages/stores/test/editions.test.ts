// Canonical edition-loading tests (Rewrite Phase 1c): ordering,
// slot adoption, heat attachment, and the error case — the
// semantics the CLI, publisher and web app now share.

import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import {
  attachEditionHeat,
  compareEditionOrder,
  editionFileKey,
  editionsFromFiles,
  parseEditionFiles,
} from "../src/editions.js";
import { loadEditionFilesFromDir, loadEditionsFromDir } from "../src/editions-file.js";

function ed(date: string, items: { title: string; level: string; sources: string[] }[], extra = {}) {
  return JSON.stringify({ date, title: "t", published_at: `${date}T00:00:00Z`, items, ...extra });
}
const hot = { title: "Hot", level: "must", sources: ["a", "b"] };
const warm = { title: "Warm", level: "watch", sources: ["a"] };
const cold = { title: "Cold", level: "echo", sources: ["a"] };

describe("parseEditionFiles", () => {
  it("orders by (date, slot) — evening after morning despite string order", () => {
    const entries = parseEditionFiles([
      { name: "2026-11-17-evening.json", text: ed("2026-11-17", [hot]) },
      { name: "2026-11-17-morning.json", text: ed("2026-11-17", [hot]) },
      { name: "2026-11-16-evening.json", text: ed("2026-11-16", [hot]) },
      { name: "2026-11-17-pilot.json", text: ed("2026-11-17", [hot]) },
    ]);
    deepStrictEqual(
      entries.map((e) => e.file),
      [
        "2026-11-16-evening.json",
        "2026-11-17-pilot.json",
        "2026-11-17-morning.json",
        "2026-11-17-evening.json",
      ],
    );
  });

  it("adopts the filename slot by default; adoptSlot:false leaves the JSON's own", () => {
    const withSlot = parseEditionFiles([
      { name: "2026-11-17-morning.json", text: ed("2026-11-17", [hot]) },
    ]);
    strictEqual(withSlot[0].data.slot, "morning");
    const without = parseEditionFiles(
      [{ name: "2026-11-17-morning.json", text: ed("2026-11-17", [hot]) }],
      { adoptSlot: false },
    );
    strictEqual(without[0].data.slot, undefined);
    // An unknown filename slot is never adopted.
    const unknown = parseEditionFiles([
      { name: "2026-11-17-special.json", text: ed("2026-11-17", [hot]) },
    ]);
    strictEqual(unknown[0].data.slot, undefined);
    strictEqual(editionFileKey("2026-11-17-special.json").order, 9);
  });

  it("attaches _heat and _rank by heat desc, stable for ties", () => {
    const [entry] = parseEditionFiles([
      { name: "2026-11-17-morning.json", text: ed("2026-11-17", [cold, hot, warm]) },
    ]);
    deepStrictEqual(
      entry.data.items.map((i) => [i.title, i._rank]),
      [
        ["Cold", 3],
        ["Hot", 1],
        ["Warm", 2],
      ],
    );
    strictEqual(entry.data.items.every((i) => typeof i._heat === "number"), true);
  });

  it("throws on an unparseable filename", () => {
    throws(
      () => parseEditionFiles([{ name: "backup.json", text: "{}" }]),
      /edition filename does not parse: backup\.json/,
    );
  });

  it("compareEditionOrder matches the file ordering", () => {
    strictEqual(compareEditionOrder({ date: "2026-11-17", slot: "morning" }, { date: "2026-11-17", slot: "evening" }) < 0, true);
    strictEqual(compareEditionOrder({ date: "2026-11-16", slot: "evening" }, { date: "2026-11-17", slot: "pilot" }) < 0, true);
  });

  it("attachEditionHeat tolerates a missing items array", () => {
    const bare = { date: "2026-11-17" } as never;
    attachEditionHeat(bare);
    deepStrictEqual(bare, { date: "2026-11-17" });
  });

  it("editionsFromFiles returns just the editions", () => {
    const eds = editionsFromFiles([
      { name: "2026-11-17-morning.json", text: ed("2026-11-17", [hot]) },
    ]);
    strictEqual(eds.length, 1);
    strictEqual(eds[0].slot, "morning");
  });
});

describe("directory loaders", () => {
  it("missing directory yields []; real directory loads in order", () => {
    const td = fs.mkdtempSync(path.join(os.tmpdir(), "bd-editions-"));
    deepStrictEqual(loadEditionFilesFromDir(path.join(td, "nope")), []);
    const dir = path.join(td, "editions");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "2026-11-17-evening.json"), ed("2026-11-17", [hot]));
    fs.writeFileSync(path.join(dir, "2026-11-17-morning.json"), ed("2026-11-17", [warm]));
    fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");
    deepStrictEqual(
      loadEditionFilesFromDir(dir).map((e) => e.file),
      ["2026-11-17-morning.json", "2026-11-17-evening.json"],
    );
    strictEqual(loadEditionsFromDir(dir).length, 2);
  });
});
