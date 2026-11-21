import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RULES, violations } from "./check-deps.ts";

const root = mkdtempSync(join(tmpdir(), "bd-deps-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function file(path: string, source: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}

describe("check-deps", () => {
  test("the repository passes", () => {
    expect(violations(join(import.meta.dir, ".."))).toEqual([]);
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

  test("ports have no imports at all", () => {
    file("packages/ports/src/f.ts", 'import { z } from "zod";');
    expect(violations(root, RULES).join("\n")).toContain('ports/src/f.ts imports "zod"');
  });
});
