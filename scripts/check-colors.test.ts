import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { hardCodedColors } from "./check-colors.ts";

const root = mkdtempSync(join(tmpdir(), "bd-colors-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function file(path: string, source: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}

describe("check-colors", () => {
  test("the site's code passes", () => {
    expect(hardCodedColors(join(import.meta.dir, ".."))).toEqual([]);
  });

  test("reports a colour literal in every part of the site", () => {
    file("apps/web/src/core/a.ts", 'const css = "a{color:#C8351D}";');
    file("apps/web/src/local/b.ts", 'const css = "a{color:#fff}";');
    file("apps/web/src/cloudflare/c.ts", 'const css = "a{background:rgb(0 0 0)}";');
    file("apps/web/src/select.ts", 'const css = "a{color:oklch(50% 0.1 30)}";');
    file("apps/web/src/core/d.css", "a{color:hsla(0,0%,0%,.5)}");
    const found = hardCodedColors(root).join("\n");
    expect(found).toContain('apps/web/src/core/a.ts:1: "#C8351D"');
    expect(found).toContain('apps/web/src/local/b.ts:1: "#fff"');
    expect(found).toContain('apps/web/src/cloudflare/c.ts:1: "rgb("');
    expect(found).toContain('apps/web/src/select.ts:1: "oklch("');
    expect(found).toContain('apps/web/src/core/d.css:1: "hsla("');
  });

  test("reports CSS lines that start with * and named colours (#198 review)", () => {
    file(
      "apps/z/src/a.ts",
      ["const css = `", "*{color:#C8351D}", "a{background:white}", "`;"].join("\n"),
    );
    file(
      "apps/z/src/b.css",
      "a{border-color: Black}\nb{color:var(--ink);fill:currentColor;stroke:none}",
    );
    const found = hardCodedColors(root, "apps/z/src").join("\n");
    expect(found).toContain('apps/z/src/a.ts:2: "#C8351D"');
    expect(found).toContain('apps/z/src/a.ts:3: "background:white"');
    expect(found).toContain('apps/z/src/b.css:1: "border-color: Black"');
    expect(found).not.toContain("b.css:2");
  });

  test("ignores character references, anchors, variables and comments", () => {
    file(
      "apps/x/src/a.ts",
      [
        `const s = "&#160; <a href='#top'> var(--red) &#" + code + ";"; // see #104`,
        "/** Issue #162. */",
        " * #fff in a comment",
      ].join("\n"),
    );
    expect(hardCodedColors(root, "apps/x/src")).toEqual([]);
  });
});
