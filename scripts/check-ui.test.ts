import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Exception, SPEC_HEADINGS, uiProblems } from "./check-ui.ts";

let root = "";
afterEach(() => {
  if (root !== "") rmSync(root, { recursive: true, force: true });
  root = "";
});

function tree(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), "bd-ui-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const PRAGMA = "/** @jsxImportSource preact */\n";
const spec = (name: string, design = "`design/system/README.md`") =>
  [
    `# ${name}`,
    ...SPEC_HEADINGS.map((h) => `## ${h}\n\n${h === "Design" ? design : "Text."}\n`),
  ].join("\n\n");

/** A component folder with everything it needs. */
const component = (name: string) => ({
  [`packages/ui/src/patterns/${name}/${name}.tsx`]: `${PRAGMA}export const ${name} = () => null;\n`,
  [`packages/ui/src/patterns/${name}/${name}.states.tsx`]: `${PRAGMA}export default {};\n`,
  [`packages/ui/src/patterns/${name}/SPEC.md`]: spec(name),
  "design/system/README.md": "# Design\n",
});

const none: readonly Exception[] = [];

describe("check-ui (issue 259)", () => {
  test("the repository passes", () => {
    expect(uiProblems(join(import.meta.dir, ".."))).toEqual([]);
  });

  test("a literal colour or pixel size in apps/web fails with the file and line", () => {
    const r = tree({
      "apps/web/src/core/pages/a.tsx": `${PRAGMA}const css = "a{color:#C8351D}";\nconst pad = "padding: 12px";\n`,
      "apps/web/src/core/b.ts": 'export const x = { gap: "1.5rem" };\n',
    });
    const found = uiProblems(r, undefined, none).join("\n");
    expect(found).toContain('apps/web/src/core/pages/a.tsx:2: colour: "#C8351D"');
    expect(found).toContain('apps/web/src/core/pages/a.tsx:3: size: "12px"');
    expect(found).toContain('apps/web/src/core/b.ts:1: size: "1.5rem"');
  });

  test("the same values inside packages/ui/src/tokens pass", () => {
    const r = tree({
      "packages/ui/src/tokens/supplement.ts":
        'export const A = "#C8351D";\nexport const B = "12px";\nexport const F = "font-family: Newsreader";\n',
    });
    expect(uiProblems(r, undefined, none)).toEqual([]);
  });

  test("a size in a .css file outside tokens fails; the listed breakpoint in a query passes", () => {
    const r = tree({
      "packages/ui/src/styles/base.css":
        "/* 13px in a comment */\n@layer base {\n  a {\n    margin: 4px;\n    @media (min-width: 960px) {\n      margin: 0;\n    }\n    @media (min-width: 700px) {\n      margin: 0;\n    }\n  }\n}\n",
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'packages/ui/src/styles/base.css:4: size: "4px" (use a size token from tokens.json)',
      'packages/ui/src/styles/base.css:8: size: "700px" (use a size token from tokens.json)',
    ]);
  });

  test("a font name fails; a font variable passes", () => {
    const r = tree({
      "packages/ui/src/styles/base.css":
        '@layer base {\n  a { font-family: "Newsreader", serif; }\n  b { font-family: var(--font-serif); }\n}\n',
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'packages/ui/src/styles/base.css:2: font: "font-family: "Newsreader", serif" (use a font token)',
    ]);
  });

  test("document or window outside an island fails; inside one it passes", () => {
    const r = tree({
      "packages/ui/src/runtime/x.ts": "export const h = () => document.title;\n",
      "apps/web/src/core/y.ts": "export const w = () => window.location;\n",
      "packages/ui/src/primitives/Z/Z.island.tsx": `${PRAGMA}export const z = () => document.title;\n`,
    });
    const found = uiProblems(r, undefined, none).filter((l) => l.includes(": global: "));
    expect(found).toEqual([
      'apps/web/src/core/y.ts:1: global: "window." outside an island (only *.island.tsx runs in the browser)',
      'packages/ui/src/runtime/x.ts:1: global: "document." outside an island (only *.island.tsx runs in the browser)',
    ]);
  });

  test("dangerouslySetInnerHTML fails outside an exception", () => {
    const r = tree({
      "apps/web/src/core/pages/p.tsx": `${PRAGMA}export const p = <div dangerouslySetInnerHTML={{ __html: "" }} />;\n`,
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      "apps/web/src/core/pages/p.tsx:2: inner-html: dangerouslySetInnerHTML outside Document",
    ]);
  });

  test("an island importing an island, or a value from @bd/contracts, fails; a type import passes", () => {
    const r = tree({
      ...component("A"),
      "packages/ui/src/patterns/A/A.island.tsx": `${PRAGMA}import type { Echo } from "@bd/contracts";\nimport { LanguageSchema } from "@bd/contracts";\nimport B from "../B/B.island.tsx";\n`,
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      "packages/ui/src/patterns/A/A.island.tsx:4: island-import: imports the island ../B/B.island.tsx: an island imports no island",
      "packages/ui/src/patterns/A/A.island.tsx:3: island-import: imports a value from @bd/contracts: an island takes types only (import type)",
    ]);
  });

  test("an app's .css file, style attribute, <style> element or class rule fails", () => {
    const r = tree({
      "apps/web/src/core/page.css": ".page { display: grid; }\n",
      "apps/web/src/core/pages/q.tsx": `${PRAGMA}export const q = <p style="display:none" />;\nconst sheet = ".hero { display: grid }";\nconst el = "<style>";\n`,
      "apps/web/src/core/r.ts": "export const ok = [1].map((n) => n);\n",
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      "apps/web/src/core/page.css: app-css: a .css file in an app: styles live in @bd/ui",
      'apps/web/src/core/pages/q.tsx:2: app-css: "style=" in an app: use a @bd/ui component',
      'apps/web/src/core/pages/q.tsx:3: app-css: ".hero {" is CSS in an app: use a @bd/ui component',
      'apps/web/src/core/pages/q.tsx:4: app-css: "<style" in an app: use a @bd/ui component',
    ]);
  });

  test("a component folder without a spec or a states file fails", () => {
    const r = tree({
      "packages/ui/src/primitives/Gull/Gull.tsx": `${PRAGMA}export const Gull = () => null;\n`,
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      "packages/ui/src/primitives/Gull: component: no Gull.states.tsx (ADR 0020, section 12)",
      "packages/ui/src/primitives/Gull: component: no SPEC.md (template: packages/ui/SPEC.md)",
    ]);
  });

  test("a spec off the template, or citing no design file that exists, fails", () => {
    const r = tree({
      ...component("A"),
      "packages/ui/src/patterns/A/SPEC.md":
        "# A\n\n## Purpose\n\nText.\n\n## Design\n\n`design/gone.md`\n",
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'packages/ui/src/patterns/A/SPEC.md: component: its sections are "Purpose, Design", not "Purpose, Design, Props, States, Do not" (packages/ui/SPEC.md)',
      "packages/ui/src/patterns/A/SPEC.md: component: its Design section cites design/gone.md, which does not exist",
    ]);
  });

  test("a complete component folder passes", () => {
    expect(uiProblems(tree(component("A")), undefined, none)).toEqual([]);
  });

  test("an exception lets its file and rule pass, and an unused one fails", () => {
    const r = tree({
      "apps/web/src/core/icon.ts": 'export const s = `style="fill:var(--ink)"`;\n',
    });
    const icon: Exception = { file: "apps/web/src/core/icon.ts", rule: "app-css", reason: "test" };
    const stale: Exception = { file: "apps/web/src/gone.ts", rule: "size", reason: "test" };
    expect(uiProblems(r, undefined, [icon, stale])).toEqual([
      "scripts/check-ui.ts: the exception for size in apps/web/src/gone.ts matches nothing: remove it",
    ]);
  });

  test("a style string that spans lines is read on every line (#284 review)", () => {
    const sheet = "export const sheet = `\n  .hero { display: grid; }\n  a { margin: 12px; }\n`;\n";
    const r = tree({
      "apps/web/src/core/pages/m.ts": sheet,
      "packages/ui/src/styles/s.ts": sheet,
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'apps/web/src/core/pages/m.ts:2: app-css: ".hero {" is CSS in an app: use a @bd/ui component',
      'apps/web/src/core/pages/m.ts:3: size: "12px" (use a size token from tokens.json)',
      'packages/ui/src/styles/s.ts:3: size: "12px" (use a size token from tokens.json)',
    ]);
  });

  test("code, comments, regular expressions and template parts are not strings", () => {
    const r = tree({
      "packages/ui/src/styles/t.ts": [
        "const a = 12; // 12px in a comment",
        "/* .x { margin: 4px } */",
        'const re = /"/;',
        "const b = `$" + "{(() => 3)()}`; const c = 5;",
        'const d = "gap: 2rem";',
      ].join("\n"),
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'packages/ui/src/styles/t.ts:5: size: "2rem" (use a size token from tokens.json)',
    ]);
  });

  test("a font shorthand names a font too", () => {
    const r = tree({
      "packages/ui/src/styles/base.css":
        '@layer base {\n  a { font: 1em "Newsreader", serif; }\n  b { font: inherit; }\n  c { font: 600 var(--size-s) / 1.4 var(--font-serif); }\n  d { font: italic bold 1em/2 var(--x); }\n}\n',
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'packages/ui/src/styles/base.css:2: font: "font: 1em "Newsreader", serif" names a font (use a font token)',
    ]);
  });

  test("an island re-exporting or bare-importing @bd/contracts fails", () => {
    const r = tree({
      ...component("A"),
      "packages/ui/src/patterns/A/A.island.tsx": `${PRAGMA}export { LanguageSchema } from "@bd/contracts";\nimport "@bd/contracts";\nexport type { Echo } from "@bd/contracts";\n`,
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      "packages/ui/src/patterns/A/A.island.tsx:2: island-import: imports a value from @bd/contracts: an island takes types only (import type)",
      "packages/ui/src/patterns/A/A.island.tsx:3: island-import: imports a value from @bd/contracts: an island takes types only (import type)",
    ]);
  });

  test("JSX closing tags are not regular expressions (#284 review, round 2)", () => {
    const r = tree({
      "apps/web/src/core/pages/j.tsx": `${PRAGMA}export const a = <p><b>a</b>{"margin: 12px"}</p>;\nexport const b = <><Foo a={x} /><i title="3rem" /></>;\n`,
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'apps/web/src/core/pages/j.tsx:2: size: "12px" (use a size token from tokens.json)',
      'apps/web/src/core/pages/j.tsx:3: size: "3rem" (use a size token from tokens.json)',
    ]);
  });

  test("fontFamily in a style object names a font", () => {
    const r = tree({
      "packages/ui/src/styles/o.ts":
        'export const o = { fontFamily: "Georgia, serif" };\nexport const v = { fontFamily: "var(--font-serif)" };\n',
    });
    expect(uiProblems(r, undefined, none)).toEqual([
      'packages/ui/src/styles/o.ts:1: font: "fontFamily: "Georgia, serif"" (use a font token)',
    ]);
  });

  test("a .tsx without its pragma fails", () => {
    const r = tree({ "apps/web/src/core/pages/n.tsx": "export const n = 1;\n" });
    expect(uiProblems(r, undefined, none)).toEqual([
      "apps/web/src/core/pages/n.tsx: pragma: the first line is not /** @jsxImportSource preact */ (ADR 0020)",
    ]);
  });
});
