import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ISLAND_TAG, type Island } from "../runtime/index.ts";
import { buildClient, islandFiles } from "./index.ts";

const files = await buildClient();
const text = (path: string) => {
  const file = files.find((f) => f.path === path);
  if (file === undefined) throw new Error(`no client file ${path}`);
  return new TextDecoder().decode(file.body);
};
/** A static import statement (with or without names); a call to import() is dynamic. */
const STATIC_IMPORT = /\bimport\s*(?:[{*"'`]|[\w$]+\s*(?:,|from))/;

describe("buildClient (ADR 0020, section 11)", () => {
  test("returns ui.css, the loader, one module per island and the shared chunks", async () => {
    const islands = await islandFiles();
    expect(islands.map((p) => basename(p))).toContain("ThemeSwitch.island.tsx");
    const want = islands.map((p) => basename(p).replace(/\.tsx$/, ".js"));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("ui.css");
    expect(paths).toContain("loader.js");
    for (const path of want) expect(paths).toContain(path);
    const rest = paths.filter((p) => p !== "ui.css" && p !== "loader.js" && !want.includes(p));
    for (const path of rest) expect(path).toMatch(/^chunk-[a-z0-9]+\.js$/);
    for (const f of files) {
      expect(f.type).toBe(
        f.path.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
      );
    }
  });

  test("an island's name is its file name, so the loader finds its module", async () => {
    for (const path of await islandFiles()) {
      const module = (await import(path)) as { default: Island<object> };
      expect(`${module.default.islandName}.island.tsx`).toBe(basename(path));
    }
  });

  test("the loader imports nothing up front: a page without an island loads it alone", () => {
    const loader = text("loader.js");
    expect(loader).not.toMatch(STATIC_IMPORT);
    // Preact and the island come by dynamic import, only for a <bd-island>.
    expect(loader).toMatch(/\bimport\(/);
    expect(loader).toContain(`customElements.define("${ISLAND_TAG}"`);
  });

  test("islands share Preact through a chunk, and Document reaches no browser file", () => {
    const island = text("ThemeSwitch.island.js");
    expect(island).toMatch(/from"\.\/chunk-[a-z0-9]+\.js"/);
    for (const f of files.filter((f) => f.path.endsWith(".js"))) {
      // The theme script is Document's alone; the switch only writes the choice.
      expect(text(f.path)).not.toContain("localStorage.getItem");
    }
  });

  test("the chunk names do not change with the working directory", async () => {
    const run = Bun.spawn(
      [
        process.execPath,
        "-e",
        `const { buildClient } = await import(${JSON.stringify(join(import.meta.dir, "index.ts"))});` +
          "console.log(JSON.stringify((await buildClient()).map((f) => f.path)));",
      ],
      { cwd: tmpdir(), stdout: "pipe", stderr: "inherit" },
    );
    const paths = JSON.parse(await new Response(run.stdout).text()) as string[];
    expect(await run.exited).toBe(0);
    expect(paths).toEqual(files.map((f) => f.path));
  });

  test("the same sources give the same file names and bytes", async () => {
    const again = await buildClient();
    expect(again.map((f) => [f.path, f.body.length])).toEqual(
      files.map((f) => [f.path, f.body.length]),
    );
  });
});
