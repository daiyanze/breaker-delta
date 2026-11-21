import { Database as SQLite } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATIONS_DIR, migrate } from "./migrate.ts";

describe("migrate", () => {
  test("applies the repository's migrations once, in order", () => {
    const sqlite = new SQLite(":memory:");
    const first = migrate(sqlite);
    expect(first[0]).toBe("0000_init.sql");
    expect(first).toEqual([...first].sort());
    expect(migrate(sqlite)).toEqual([]);
    const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(tables).toContainEqual({ name: "runs" });
    expect(tables).toContainEqual({ name: "run_steps" });
    expect(MIGRATIONS_DIR).toEndWith(join("packages", "db", "migrations"));
  });

  test("a failing migration leaves nothing behind and is not recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "bd-migrate-"));
    writeFileSync(join(dir, "0000_ok.sql"), "CREATE TABLE a (id INTEGER);");
    writeFileSync(join(dir, "0001_bad.sql"), "CREATE TABLE b (id INTEGER); NOT SQL;");
    const sqlite = new SQLite(":memory:");
    expect(() => migrate(sqlite, dir)).toThrow();
    const names = sqlite.query("SELECT name FROM _migrations").all();
    expect(names).toEqual([{ name: "0000_ok.sql" }]);
    const b = sqlite.query("SELECT name FROM sqlite_master WHERE name = 'b'").all();
    expect(b).toEqual([]);
  });
});
