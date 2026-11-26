/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { Document, renderDocument } from "../runtime/index.ts";
import { catalogProblems } from "./check.ts";
import { CATALOG, type CatalogEntry } from "./index.ts";

const SRC = `${import.meta.dir}/..`;

/** Every file under `src`, relative to it. */
async function srcFiles(): Promise<string[]> {
  const out: string[] = [];
  for await (const path of new Bun.Glob("**/*").scan({ cwd: SRC })) out.push(path);
  return out.map((p) => p.replaceAll("\\", "/"));
}

const listed = (name: string, layer: CatalogEntry["layer"]): CatalogEntry => ({
  name,
  layer,
  states: ["default"],
  render: () => <p />,
});

describe("the catalog (issue 258)", () => {
  test("lists every component folder of the package, each with its states file", async () => {
    expect(catalogProblems(await srcFiles(), CATALOG)).toEqual([]);
  });

  test("a component folder without a states file fails", () => {
    const files = [
      "patterns/Band/Band.tsx",
      "patterns/Band/Band.states.tsx",
      "patterns/Gull/Gull.tsx",
    ];
    expect(catalogProblems(files, [listed("Band", "patterns")])).toEqual([
      "patterns/Gull has no Gull.states.tsx: every component declares its states (issue 258)",
    ]);
  });

  test("a states file missing from the list fails, and so does a listed folder that is gone", () => {
    const files = ["primitives/Menu/Menu.tsx", "primitives/Menu/Menu.states.tsx"];
    expect(catalogProblems(files, [listed("Band", "patterns")])).toEqual([
      "primitives/Menu/Menu.states.tsx is not in CATALOG (packages/ui/src/catalog/index.ts)",
      "CATALOG lists patterns/Band, which has no folder",
    ]);
  });

  test("a component listed under the wrong layer, or with no states, fails", () => {
    const files = ["primitives/Menu/Menu.tsx", "primitives/Menu/Menu.states.tsx"];
    const empty = { ...listed("Menu", "patterns"), states: [] };
    expect(catalogProblems(files, [empty])).toEqual([
      "Menu is listed in CATALOG under patterns, not primitives",
      "CATALOG lists patterns/Menu, which has no folder",
      "Menu declares no states",
    ]);
  });

  // ADR 0020 section 12: rendering every state on the server is also the
  // test that no island touches a browser global while rendering.
  test("every state renders on the server", () => {
    for (const e of CATALOG) {
      for (const state of e.states) {
        const html = renderDocument(
          <Document lang="en" title="T">
            {e.render(state)}
          </Document>,
        );
        expect(html).toContain("<body>");
      }
    }
  });

  test("an unknown state is an error, not an empty render", () => {
    expect(() => CATALOG[0]?.render("nope")).toThrow('has no state "nope"');
  });
});
