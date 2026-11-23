import { describe, expect, test } from "bun:test";
import { readImports } from "./imports.ts";

const read = (source: string) =>
  readImports(source).map((i) => `${i.typeOnly ? "type " : ""}${i.spec}`);

describe("readImports (#212)", () => {
  test("statements, re-exports and calls", () => {
    const source = [
      'import a from "a";',
      'import "side";',
      'import b, { c } from "bc";',
      'import * as d from "d";',
      'export * from "e";',
      'export * as f from "f";',
      'export { g } from "g";',
      'const h = await import("h", { with: { type: "json" } });',
      "const i = require(`i`);",
      'const j = import.meta.require("j");',
      'import k = require("k");',
    ].join("\n");
    expect(read(source)).toEqual(["a", "side", "bc", "d", "e", "f", "g", "h", "i", "j", "k"]);
  });

  test("type-only imports are marked; inline type and `import type from` are not", () => {
    const source = [
      'import type { A } from "a";',
      'import type B from "b";',
      'export type { C } from "c";',
      'export type * from "d";',
      'import { type E } from "e";',
      'import type from "f";',
      "import {",
      "  type G,",
      '} from "g";',
    ].join("\n");
    expect(read(source)).toEqual(["type a", "type b", "type c", "type d", "e", "f", "g"]);
  });

  test("comments, strings, templates, regular expressions and names ending in require", () => {
    const source = [
      "#!/usr/bin/env bun",
      '// import a from "a";',
      '/* require("b") */',
      "const c = \"import c from 'c'\";",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
      "const d = `${c} import d from 'd' ${`${c}`}`;",
      "const e = /['\"]/.test(c);",
      'loader.require("f");',
      'prerequire("g");',
      "export { h };",
      'const i = Array.from("i");',
      "const j = import(name);",
      'import k from "k";',
    ].join("\n");
    expect(read(source)).toEqual(["k"]);
  });
});
