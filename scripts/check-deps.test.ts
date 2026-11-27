import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  RULES,
  relativeViolations,
  selfImports,
  uncovered,
  unpinned,
  violations,
} from "./check-deps.ts";

const root = mkdtempSync(join(tmpdir(), "bd-deps-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function file(path: string, source: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}

describe("check-deps", () => {
  test("the repository passes", () => {
    const repo = join(import.meta.dir, "..");
    const found = [
      ...violations(repo),
      ...relativeViolations(repo),
      ...uncovered(repo),
      ...selfImports(repo),
      ...unpinned(repo),
    ];
    expect(found).toEqual([]);
  });

  test("every dependency names a version range (#3)", () => {
    const deps = { a: "latest", b: "*", c: "", d: "^1.2.3", e: "workspace:*" };
    file("apps/y/package.json", JSON.stringify({ devDependencies: deps }));
    const found = unpinned(root).join("\n");
    expect(found).toContain('apps/y/package.json: a is "latest"');
    expect(found).toContain('apps/y/package.json: b is "*"');
    expect(found).toContain('apps/y/package.json: c is ""');
    expect(found).not.toContain(": d is");
    expect(found).not.toContain(": e is");
  });

  test("the root manifest and every dependency field are covered (#3)", () => {
    file("package.json", JSON.stringify({ dependencies: { r: "latest" } }));
    const fields = { peerDependencies: { p: "*" }, optionalDependencies: { o: "latest" } };
    file("packages/z/package.json", JSON.stringify(fields));
    const found = unpinned(root).join("\n");
    expect(found).toContain('package.json: r is "latest"');
    expect(found).toContain('packages/z/package.json: p is "*"');
    expect(found).toContain('packages/z/package.json: o is "latest"');
  });

  test("a module and its package entry may not import each other (lesson L1)", () => {
    file("packages/x/src/a.ts", 'import { b } from "./index.ts";');
    file("packages/x/src/deep/c.ts", 'import { b } from "../index.ts";');
    // Extensionless forms resolve the same under bundler resolution.
    const entry = ["./a.ts", "./deep/c.ts", "./d", "./e.ts", "./inline.ts"].map(
      (m) => `export * from "${m}";`,
    );
    file("packages/x/src/index.ts", entry.join("\n"));
    file("packages/x/src/d.ts", 'import { b } from "./index";');
    file("packages/x/src/e.ts", 'import { b } from ".";');
    // Not cycles: a test the entry never imports, and a type-only import.
    file("packages/x/src/a.test.ts", 'import { b } from "./index.ts";');
    file("packages/x/src/types.ts", 'import type { B } from "./index.ts";');
    // Kept as `import {} from` under verbatimModuleSyntax: still a cycle.
    file("packages/x/src/inline.ts", 'import { type B } from "./index.ts";');
    const found = selfImports(root).join("\n");
    expect(found).toContain("x/src/a.ts and its package entry import each other");
    expect(found).toContain("x/src/deep/c.ts and its package entry import each other");
    expect(found).toContain("x/src/d.ts and its package entry import each other");
    expect(found).toContain("x/src/e.ts and its package entry import each other");
    expect(found).toContain("x/src/inline.ts and its package entry import each other");
    expect(found).not.toContain("a.test.ts");
    expect(found).not.toContain("types.ts");
  });

  test("an app core may not import Cloudflare or Bun APIs (ADR 0018)", () => {
    file("apps/pipeline/src/core/a.ts", 'import { WorkflowEntrypoint } from "cloudflare:workers";');
    file("apps/pipeline/src/core/b.ts", 'import { Database } from "bun:sqlite";');
    file("apps/web/src/core/c.ts", 'export { env } from "cloudflare:workers";');
    file("apps/pipeline/src/core/ok.ts", 'import type { Database } from "@bd/ports";');
    const found = violations(root, RULES);
    expect(found).toHaveLength(3);
    expect(found.join("\n")).toContain('core/a.ts imports "cloudflare:workers"');
    expect(found.join("\n")).toContain('core/b.ts imports "bun:sqlite"');
    expect(found.join("\n")).toContain('core/c.ts imports "cloudflare:workers"');
  });

  test("the local adapter may not import Cloudflare, and the Cloudflare adapter not Bun", () => {
    file("apps/pipeline/src/local/d.ts", 'import { env } from "cloudflare:workers";');
    file("apps/pipeline/src/cloudflare/e.ts", 'import { Database } from "bun:sqlite";');
    const found = violations(root, RULES).join("\n");
    expect(found).toContain('local/d.ts imports "cloudflare:workers"');
    expect(found).toContain('cloudflare/e.ts imports "bun:sqlite"');
  });

  test("cores may use drizzle's proxy driver but not a native one", () => {
    file("apps/pipeline/src/core/g.ts", 'import { drizzle } from "drizzle-orm/d1";');
    file("packages/db/src/h.ts", 'import { drizzle } from "drizzle-orm/bun-sqlite";');
    file("packages/db/src/ok.ts", 'import { drizzle } from "drizzle-orm/sqlite-proxy";');
    const found = violations(root, RULES).join("\n");
    expect(found).toContain('core/g.ts imports "drizzle-orm/d1"');
    expect(found).toContain('db/src/h.ts imports "drizzle-orm/bun-sqlite"');
    expect(found).not.toContain("db/src/ok.ts");
  });

  test("local mode may not reach for wrangler or Cloudflare (ADR 0018)", () => {
    file("apps/local/start.ts", 'import { unstable_dev } from "wrangler";');
    file("apps/web/src/local/s.ts", 'import { env } from "cloudflare:workers";');
    // A rule can name a single file: select.ts is shared by both adapters.
    file("apps/web/src/select.ts", 'import { connect } from "cloudflare:sockets";');
    const found = violations(root, RULES).join("\n");
    expect(found).toContain('apps/local/start.ts imports "wrangler"');
    expect(found).toContain('web/src/local/s.ts imports "cloudflare:workers"');
    expect(found).toContain('web/src/select.ts imports "cloudflare:sockets"');
  });

  test("content-database code may not reference the private database (#18)", () => {
    const named = 'import { subscribers } from "@bd/private-db";';
    file("packages/db/src/p.ts", named);
    file("apps/pipeline/src/core/p.ts", named);
    file("apps/pipeline/src/cloudflare/p.ts", named);
    file("apps/pipeline/src/local/p.ts", named);
    file("apps/web/src/p.ts", `export type { Subscriber } from "@bd/private-db";`);
    file("packages/private-db/src/q.ts", 'import { echoes } from "@bd/db";');
    const found = violations(root, RULES).join("\n");
    for (const area of ["db/src", "core", "cloudflare", "local", "web/src"]) {
      expect(found).toContain(`${area}/p.ts imports "@bd/private-db"`);
    }
    expect(found).toContain('private-db/src/q.ts imports "@bd/db"');
  });

  test("ports have no imports at all", () => {
    file("packages/ports/src/f.ts", 'import { z } from "zod";');
    expect(violations(root, RULES).join("\n")).toContain('ports/src/f.ts imports "zod"');
  });

  describe("relative imports (#209)", () => {
    const rel = () => relativeViolations(root, RULES).join("\n");

    test("a relative import into another package fails and names the fix", () => {
      file("packages/judge/src/index.ts", "export const judge = 1;");
      file("apps/web/src/leak.ts", 'import { judge } from "../../../packages/judge/src/index.ts";');
      file("apps/web/src/leak-dir.ts", 'import { judge } from "../../../packages/judge/src";');
      const found = rel();
      expect(found).toContain(
        'apps/web/src/leak.ts imports "../../../packages/judge/src/index.ts"',
      );
      expect(found).toContain('apps/web/src/leak-dir.ts imports "../../../packages/judge/src"');
      expect(found).toContain("import it by its package name");
    });

    test("content-database code may not reach the private schema by path (#18)", () => {
      file("packages/private-db/src/schema.ts", "export const subscribers = 1;");
      file(
        "packages/db/src/leak.ts",
        'import { subscribers } from "../../private-db/src/schema.ts";',
      );
      file(
        "apps/pipeline/src/core/leak.ts",
        'import { subscribers } from "../../../../packages/private-db/src/schema.ts";',
      );
      const found = rel();
      expect(found).toContain('packages/db/src/leak.ts imports "../../private-db/src/schema.ts"');
      expect(found).toContain("apps/pipeline/src/core/leak.ts imports");
    });

    test("an app core may not reach an adapter by relative path", () => {
      file("apps/web/src/local/x.ts", "export const x = 1;");
      file("apps/pipeline/src/local/x.ts", "export const x = 1;");
      file("apps/web/src/core/bad.ts", 'import { x } from "../local/x.ts";');
      file("apps/pipeline/src/core/bad.ts", 'export { x } from "../local/x";');
      file("apps/pipeline/src/core/lazy.ts", 'const m = await import("../local/x.ts");');
      const found = rel();
      expect(found).toContain(
        'apps/web/src/core/bad.ts imports "../local/x.ts", which is in apps/web/src/local',
      );
      expect(found).toContain('apps/pipeline/src/core/bad.ts imports "../local/x"');
      expect(found).toContain('apps/pipeline/src/core/lazy.ts imports "../local/x.ts"');
    });

    test("the listed edges, files in the same area, type-only imports and data files pass", () => {
      file(
        "apps/pipeline/src/core/app2.ts",
        'import { p } from "../sources/p.ts";\nimport { q } from "./q.ts";',
      );
      file("apps/pipeline/src/sources/p.ts", "export const p = 1;");
      file("apps/pipeline/src/core/q.ts", "export const q = 1;");
      file("apps/pipeline/src/local/srv.ts", 'import { q } from "../core/q.ts";');
      file(
        "apps/web/src/core/t.ts",
        'import type { X } from "../local/x.ts";\nexport type { Y } from "../local/x.ts";',
      );
      // A data file in its own package, and one the rule lists from another (#269).
      file(
        "apps/pipeline/src/local/data.ts",
        'import f from "../sources/fixtures/x.json" with { type: "text" };',
      );
      file(
        "apps/pipeline/src/local/sql.ts",
        'import m from "../../../../packages/db/migrations/0000_init.sql" with { type: "text" };',
      );
      file(
        "packages/ui/src/tokens/json.ts",
        'import t from "../../../../design/system/tokens.json" with { type: "json" };',
      );
      const found = rel();
      const ok = ["app2.ts", "core/q.ts", "srv.ts", "core/t.ts", "data.ts", "sql.ts", "json.ts"];
      for (const name of ok) expect(found).not.toContain(name);
    });

    test("a data file outside the areas a rule reaches passes only when the rule lists it (#269)", () => {
      file(
        "apps/web/src/core/tokens-json.ts",
        'import tokens from "../../../../design/system/tokens.json" with { type: "json" };',
      );
      file(
        "apps/pipeline/src/core/sql.ts",
        'import m from "../../../../packages/db/migrations/0000_init.sql" with { type: "text" };',
      );
      const found = rel();
      expect(found).toContain(
        'apps/web/src/core/tokens-json.ts imports "../../../../design/system/tokens.json", ' +
          "a data file outside the areas apps/web/src/core reaches that it does not list",
      );
      expect(found).toContain("apps/pipeline/src/core/sql.ts imports");
      expect(found).toContain("list it in the rule's data");
    });

    test("an edge is one way: sources may not reach the core", () => {
      file("apps/pipeline/src/sources/back.ts", 'import { q } from "../core/q.ts";');
      expect(rel()).toContain(
        'apps/pipeline/src/sources/back.ts imports "../core/q.ts", which is in apps/pipeline/src/core',
      );
    });

    test("a code file with a dotted name is code, not data (#211 review)", () => {
      file("packages/judge/src/client.http.ts", "export const c = 1;");
      file("apps/pipeline/src/local/server.bun.ts", "export const s = 1;");
      file(
        "apps/web/src/core/dot.ts",
        'import { c } from "../../../../packages/judge/src/client.http";',
      );
      file("apps/pipeline/src/core/dot.ts", 'import { s } from "../local/server.bun";');
      const found = rel();
      expect(found).toContain(
        'apps/web/src/core/dot.ts imports "../../../../packages/judge/src/client.http"',
      );
      expect(found).toContain('apps/pipeline/src/core/dot.ts imports "../local/server.bun"');
    });

    test("require, a plain template import(), `import type from` and a symlink are seen", () => {
      file("apps/web/src/local/zz.ts", "export default 1;");
      file("apps/web/src/core/req.ts", 'const z = require("../local/zz.ts");');
      file("apps/web/src/core/tpl.ts", "const z = await import(`../local/zz.ts`);");
      file("apps/web/src/core/named.ts", 'import type from "../local/zz.ts";');
      mkdirSync(join(root, "apps/web/src/core/link"), { recursive: true });
      symlinkSync(join(root, "apps/web/src/local"), join(root, "apps/web/src/core/link/to-local"));
      file("apps/web/src/core/via.ts", 'import z from "./link/to-local/zz.ts";');
      const found = rel();
      for (const name of ["req.ts", "tpl.ts", "named.ts", "via.ts"]) {
        expect(found).toContain(`apps/web/src/core/${name} imports`);
      }
    });

    test("call options, template require, .js and .tsx resolution (#211 round 2)", () => {
      file("packages/judge/src/z.ts", "export const z = 1;");
      file("apps/pipeline/src/local/srv.bun.tsx", "export const s = 1;");
      file("apps/pipeline/src/local/zz.ts", "export const z = 1;");
      const judge = "../../../../packages/judge/src/z.ts";
      file("apps/web/src/core/e2.ts", `await import("${judge}", { with: {} });`);
      file("apps/web/src/local/d2.ts", `const z = require(\`${judge}\`);`);
      symlinkSync(join(root, "packages/judge/src/z.ts"), join(root, "apps/web/src/core/j.ts"));
      file("apps/web/src/core/a2.ts", 'import z from "./j.js";');
      file("apps/pipeline/src/core/js.ts", 'import { z } from "../local/zz.js";');
      file("apps/pipeline/src/core/b.ts", 'import { s } from "../local/srv.bun";');
      const found = rel();
      expect(found).toContain(`apps/web/src/core/e2.ts imports "${judge}"`);
      expect(found).toContain(`apps/web/src/local/d2.ts imports "${judge}"`);
      expect(found).toContain('apps/web/src/core/a2.ts imports "./j.js", code in packages/judge');
      expect(found).toContain('apps/pipeline/src/core/js.ts imports "../local/zz.js"');
      expect(found).toContain('apps/pipeline/src/core/b.ts imports "../local/srv.bun"');
    });

    test("a name ending in require is not an import; spacing after type does not matter", () => {
      file("apps/web/src/core/g2.ts", 'loader.require("anything");\nprerequire("abc");');
      file("apps/web/src/core/sp.ts", 'import type  from "../local/zz.ts";');
      const all = [...violations(root, RULES), ...relativeViolations(root, RULES)].join("\n");
      expect(all).not.toContain("core/g2.ts");
      expect(all).toContain('apps/web/src/core/sp.ts imports "../local/zz.ts"');
    });

    test("inline type imports, import.meta.require and .ts generics (#211 round 3)", () => {
      file("packages/judge/src/zj.ts", "export type J = 1;");
      file("apps/pipeline/src/local/zt.ts", "export type X = 1;");
      // verbatimModuleSyntax keeps these as `import {} from`, so the target is bundled.
      file("apps/pipeline/src/core/inline.ts", 'import { type X } from "../local/zt.ts";');
      const judge = "../../../../packages/judge/src/zj.ts";
      file("apps/web/src/core/reexp.ts", `export { type J } from "${judge}";`);
      file("apps/web/src/local/meta.ts", `const j = import.meta.require("${judge}");`);
      file("apps/web/src/local/metapkg.ts", 'const w = import.meta.require("wrangler");');
      // Valid TypeScript that a tsx parser rejects.
      file("apps/web/src/core/generic.ts", "export const first = <T>(xs: T[]): T => xs[0];");
      const found = rel();
      expect(found).toContain('apps/pipeline/src/core/inline.ts imports "../local/zt.ts"');
      expect(found).toContain("apps/web/src/core/reexp.ts imports");
      expect(found).toContain("apps/web/src/local/meta.ts imports");
      const pkg = violations(root, RULES).join("\n");
      expect(pkg).toContain('web/src/local/metapkg.ts imports "wrangler"');
      expect(found).not.toContain("generic.ts");
    });

    test("a file the parser cannot read is reported, not a crash", () => {
      file("apps/web/src/core/broken.ts", "export const = ;");
      expect(rel()).toContain("apps/web/src/core/broken.ts could not be parsed");
    });

    test("a #! line parses, and a template import.meta.require is read (#215 decision)", () => {
      file("apps/pipeline/src/local/zt.ts", "export const n = 1;");
      file("apps/web/src/local/hashbang.ts", '#!/usr/bin/env bun\nimport { s } from "../select";');
      file("apps/pipeline/src/core/tplmeta.ts", "const l = import.meta.require(`../local/zt.ts`);");
      file("apps/web/src/local/tplpkg.ts", "const w = import.meta.require(`wrangler`);");
      // Imports after the #! line are still read (#218 review).
      file(
        "apps/pipeline/src/core/hashbang.ts",
        '#!/usr/bin/env bun\nimport { n } from "../local/zt.ts";',
      );
      // A $ without { is part of the path (#218 review).
      file("apps/pipeline/src/core/dollar.ts", "const d = import.meta.require(`../local/z$t.ts`);");
      const found = rel();
      expect(found).not.toContain("web/src/local/hashbang.ts");
      expect(found).toContain('apps/pipeline/src/core/hashbang.ts imports "../local/zt.ts"');
      expect(found).toContain('apps/pipeline/src/core/dollar.ts imports "../local/z$t.ts"');
      expect(found).toContain('apps/pipeline/src/core/tplmeta.ts imports "../local/zt.ts"');
      const pkg = violations(root, RULES).join("\n");
      expect(pkg).toContain('web/src/local/tplpkg.ts imports "wrangler"');
    });

    test("a file under a single-file rule is its own area", () => {
      file("apps/web/src/core/sel.ts", 'import { s } from "../select.ts";');
      file("apps/web/src/local/sel.ts", 'import { s } from "../select.ts";');
      const found = rel();
      expect(found).toContain(
        'apps/web/src/core/sel.ts imports "../select.ts", which is in apps/web/src/select.ts',
      );
      expect(found).not.toContain("web/src/local/sel.ts");
    });
  });

  // #269, ADR 0020 section 3: one planted violation per rule.
  describe("@bd/ui layers", () => {
    const all = () => [...violations(root, RULES), ...relativeViolations(root, RULES)].join("\n");

    test("no layer or area imports an app, by name or by relative path", () => {
      file("apps/web/src/core/site-x.ts", "export const s = 1;");
      file("packages/ui/src/tokens/app.ts", 'import { s } from "@bd/web/local";');
      file("packages/ui/src/patterns/app.ts", 'import { s } from "@bd/pipeline";');
      file(
        "packages/ui/src/primitives/app-path.ts",
        'import { s } from "../../../../apps/web/src/core/site-x.ts";',
      );
      const found = all();
      expect(found).toContain('ui/src/tokens/app.ts imports "@bd/web/local"');
      expect(found).toContain('ui/src/patterns/app.ts imports "@bd/pipeline"');
      expect(found).toContain(
        'packages/ui/src/primitives/app-path.ts imports "../../../../apps/web/src/core/site-x.ts", code in apps/web',
      );
    });

    test("no layer imports another package, except contract types in patterns", () => {
      file("packages/ui/src/tokens/pkg.ts", 'import { z } from "zod";');
      file("packages/ui/src/primitives/pkg.ts", 'import type { RankRow } from "@bd/contracts";');
      file("packages/ui/src/runtime/pkg.ts", 'import { core } from "@bd/core";');
      file("packages/ui/src/patterns/ok.ts", 'import type { RankRow } from "@bd/contracts";');
      file("packages/ui/src/primitives/compat.ts", 'import { forwardRef } from "preact/compat";');
      const found = all();
      expect(found).toContain('ui/src/tokens/pkg.ts imports "zod"');
      expect(found).toContain('ui/src/primitives/pkg.ts imports "@bd/contracts"');
      expect(found).toContain('ui/src/runtime/pkg.ts imports "@bd/core"');
      expect(found).toContain('ui/src/primitives/compat.ts imports "preact/compat"');
      expect(found).not.toContain("patterns/ok.ts");
    });

    test("tokens import tokens.json and no other JSON file", () => {
      file(
        "packages/ui/src/tokens/other.ts",
        'import d from "../../../../design/system/design-system.json" with { type: "json" };',
      );
      file(
        "packages/ui/src/runtime/json.ts",
        'import t from "../../../../design/system/tokens.json" with { type: "json" };',
      );
      const found = all();
      expect(found).toContain(
        'packages/ui/src/tokens/other.ts imports "../../../../design/system/design-system.json", ' +
          "a data file outside the areas packages/ui/src/tokens reaches that it does not list",
      );
      expect(found).toContain("packages/ui/src/runtime/json.ts imports");
    });

    test("data inside @bd/ui is checked by layer too (#275 review)", () => {
      file("packages/ui/src/tokens/extra.json", "{}");
      file("packages/ui/package.json", "{}");
      file("packages/ui/src/patterns/Band/Band.css", ".Band{}");
      file("packages/ui/src/primitives/Button/Button.css", ".Button{}");
      file(
        "packages/ui/src/tokens/planted.ts",
        [
          'import a from "./extra.json" with { type: "json" };',
          'import b from "../../package.json" with { type: "json" };',
          'import c from "../patterns/Band/Band.css" with { type: "text" };',
        ].join("\n"),
      );
      file(
        "packages/ui/src/primitives/css.ts",
        'import c from "../patterns/Band/Band.css" with { type: "text" };',
      );
      // Its own area's data, and the components' .css in styles, pass.
      file(
        "packages/ui/src/patterns/own.ts",
        'import c from "./Band/Band.css" with { type: "text" };',
      );
      file(
        "packages/ui/src/styles/ui.ts",
        'import a from "../primitives/Button/Button.css" with { type: "text" };\n' +
          'import b from "../patterns/Band/Band.css" with { type: "text" };',
      );
      const found = all();
      expect(found).toContain('packages/ui/src/tokens/planted.ts imports "./extra.json"');
      expect(found).toContain('packages/ui/src/tokens/planted.ts imports "../../package.json"');
      expect(found).toContain(
        'packages/ui/src/tokens/planted.ts imports "../patterns/Band/Band.css", a data file',
      );
      expect(found).toContain(
        'packages/ui/src/primitives/css.ts imports "../patterns/Band/Band.css"',
      );
      expect(found).not.toContain("patterns/own.ts");
      expect(found).not.toContain("styles/ui.ts");
    });

    test("styles, catalog and build keep to their rules (L7)", () => {
      file("packages/ui/src/patterns/band2.ts", "export const b = 1;");
      file("packages/ui/src/styles/code.ts", 'import { b } from "../patterns/band2.ts";');
      file("packages/ui/src/styles/bun.ts", 'import { file } from "bun";');
      file("packages/ui/src/catalog/pkg.ts", 'import { z } from "zod";');
      file("packages/ui/src/catalog/build.ts", 'import { x } from "../build/x.ts";');
      file("packages/ui/src/build/x.ts", "export const x = 1;");
      file("packages/ui/src/build/app.ts", 'import { s } from "@bd/web/local";');
      file(
        "packages/ui/src/build/ok.ts",
        'import { b } from "../patterns/band2.ts";\nimport "bun";',
      );
      const found = all();
      expect(found).toContain(
        'packages/ui/src/styles/code.ts imports "../patterns/band2.ts", which is in packages/ui/src/patterns',
      );
      expect(found).toContain('ui/src/styles/bun.ts imports "bun"');
      expect(found).toContain('ui/src/catalog/pkg.ts imports "zod"');
      expect(found).toContain(
        'packages/ui/src/catalog/build.ts imports "../build/x.ts", which is in packages/ui/src/build',
      );
      expect(found).toContain('ui/src/build/app.ts imports "@bd/web/local"');
      expect(found).not.toContain("build/ok.ts");
    });

    test("a layer imports only the layers before it", () => {
      file("packages/ui/src/runtime/document.ts", "export const d = 1;");
      file("packages/ui/src/patterns/band.ts", "export const b = 1;");
      file("packages/ui/src/tokens/up.ts", 'import { d } from "../runtime/document.ts";');
      file("packages/ui/src/primitives/up.ts", 'import { b } from "../patterns/band.ts";');
      file("packages/ui/src/patterns/down.ts", 'import { d } from "../runtime/document.ts";');
      const found = all();
      expect(found).toContain(
        'packages/ui/src/tokens/up.ts imports "../runtime/document.ts", which is in packages/ui/src/runtime',
      );
      expect(found).toContain(
        'packages/ui/src/primitives/up.ts imports "../patterns/band.ts", which is in packages/ui/src/patterns',
      );
      expect(found).not.toContain("patterns/down.ts");
    });

    test("a file directly under packages/ui/src is under no rule", () => {
      file("packages/ui/src/index.ts", "export {};");
      expect(uncovered(root, RULES).join("\n")).toContain(
        "packages/ui/src/index.ts is under no check-deps rule",
      );
    });

    test("site pages may use tokens, runtime, patterns and preact, not the renderer itself (#271)", () => {
      file("apps/web/src/core/ui-ok.ts", 'import { colorOf } from "@bd/ui/tokens";');
      file(
        "apps/web/src/core/pages/ok.tsx",
        [
          'import { Band } from "@bd/ui/patterns";',
          'import { Document } from "@bd/ui/runtime";',
          'import type { VNode } from "preact";',
          'import { jsx } from "preact/jsx-runtime";',
        ].join("\n"),
      );
      file("apps/web/src/core/ui-build.ts", 'import { buildClient } from "@bd/ui/build";');
      file("apps/web/src/core/ui-styles.ts", 'import { uiCss } from "@bd/ui/styles";');
      file("apps/web/src/core/render.ts", 'import { render } from "preact-render-to-string";');
      file("apps/web/src/core/compat.ts", 'import { useState } from "preact/compat";');
      file("apps/web/src/local/render.ts", 'import { render } from "preact-render-to-string";');
      const found = all();
      expect(found).not.toContain("core/ui-ok.ts");
      expect(found).not.toContain("pages/ok.tsx");
      expect(found).toContain('web/src/core/ui-build.ts imports "@bd/ui/build"');
      expect(found).toContain('web/src/core/ui-styles.ts imports "@bd/ui/styles"');
      expect(found).toContain('web/src/core/render.ts imports "preact-render-to-string"');
      expect(found).toContain('web/src/core/compat.ts imports "preact/compat"');
      expect(found).toContain('web/src/local/render.ts imports "preact-render-to-string"');
    });
  });

  describe("every source file is under a rule (#210)", () => {
    test("a source file no rule covers fails and names the fix", () => {
      file("apps/pipeline/src/util.ts", "export const u = 1;");
      file("apps/pipeline/src/core/covered.ts", "export const c = 1;");
      const found = uncovered(root, RULES).join("\n");
      expect(found).toContain("apps/pipeline/src/util.ts is under no check-deps rule");
      expect(found).toContain("add a rule for it or move it under one");
      expect(found).not.toContain("core/covered.ts");
    });

    test(".mts and .cts files are checked too (#214 review)", () => {
      file("apps/pipeline/src/util.mts", "export const u = 1;");
      file("apps/web/src/local/y.mts", 'export { judge } from "@bd/judge";');
      file("apps/web/src/core/z.cts", 'export * from "../local/x.ts";');
      file("apps/pipeline/src/util2.cts", "export const u = 2;");
      // A ruled .ts importing through a .mts (#214 review).
      file("apps/web/src/core/via-mts.ts", 'export * from "./w.mts";');
      file("apps/web/src/core/w.mts", 'export * from "../local/x.ts";');
      const missing = uncovered(root, RULES).join("\n");
      expect(missing).toContain("apps/pipeline/src/util.mts is under no");
      expect(missing).toContain("apps/pipeline/src/util2.cts is under no");
      expect(relativeViolations(root, RULES).join("\n")).toContain(
        'apps/web/src/core/w.mts imports "../local/x.ts"',
      );
      expect(violations(root, RULES).join("\n")).toContain(
        'apps/web/src/local/y.mts imports "@bd/judge"',
      );
      expect(relativeViolations(root, RULES).join("\n")).toContain(
        'apps/web/src/core/z.cts imports "../local/x.ts"',
      );
    });

    test("a package with no src folder is not an error", () => {
      file("apps/nosrc/start.ts", "export {};");
      expect(uncovered(root, RULES).join("\n")).not.toContain("apps/nosrc");
    });

    test("a ruled file may not import code that no rule covers", () => {
      file("apps/pipeline/test/helper.ts", 'export * from "../src/local/x.ts";');
      file("apps/pipeline/src/core/through.ts", 'import { x } from "../../test/helper.ts";');
      const found = relativeViolations(root, RULES).join("\n");
      expect(found).toContain('apps/pipeline/src/core/through.ts imports "../../test/helper.ts"');
      expect(found).toContain("which no check-deps rule covers");
      expect(found).toContain("move it into a ruled area (#210)");
    });
  });
});
