import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RULES, relativeViolations, selfImports, unpinned, violations } from "./check-deps.ts";

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
    const entry = ["./a.ts", "./deep/c.ts", "./d", "./e.ts"].map((m) => `export * from "${m}";`);
    file("packages/x/src/index.ts", entry.join("\n"));
    file("packages/x/src/d.ts", 'import { b } from "./index";');
    file("packages/x/src/e.ts", 'import { b } from ".";');
    // Not cycles: a test the entry never imports, and a type-only import.
    file("packages/x/src/a.test.ts", 'import { b } from "./index.ts";');
    file("packages/x/src/types.ts", 'import type { B } from "./index.ts";');
    const found = selfImports(root).join("\n");
    expect(found).toContain("x/src/a.ts and its package entry import each other");
    expect(found).toContain("x/src/deep/c.ts and its package entry import each other");
    expect(found).toContain("x/src/d.ts and its package entry import each other");
    expect(found).toContain("x/src/e.ts and its package entry import each other");
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
      file(
        "apps/web/src/core/data.ts",
        'import tokens from "../../../../design/system/tokens.json";',
      );
      file(
        "apps/pipeline/src/local/sql.ts",
        'import m from "../../../../packages/db/migrations/0000_init.sql" with { type: "text" };',
      );
      const found = rel();
      const ok = ["app2.ts", "core/q.ts", "srv.ts", "core/t.ts", "data.ts", "sql.ts"];
      for (const name of ok) expect(found).not.toContain(name);
    });

    test("an edge is one way: sources may not reach the core", () => {
      file("apps/pipeline/src/sources/back.ts", 'import { q } from "../core/q.ts";');
      expect(rel()).toContain(
        'apps/pipeline/src/sources/back.ts imports "../core/q.ts", which is in apps/pipeline/src/core',
      );
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
});
