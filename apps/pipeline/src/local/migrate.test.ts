import { Database as SQLite } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "./migrate.ts";
import { MIGRATIONS } from "./migrations.ts";

const DIR = join(import.meta.dir, "../../../../packages/db/migrations");

describe("migrations", () => {
  test("every file in packages/db/migrations is embedded, with its exact text", () => {
    const files = readdirSync(DIR).filter((n) => n.endsWith(".sql"));
    expect(MIGRATIONS.map((m) => m.name)).toEqual(files.sort());
    for (const m of MIGRATIONS) expect(m.sql).toBe(readFileSync(join(DIR, m.name), "utf8"));
  });
});

describe("migrate", () => {
  test("applies the embedded migrations once, in order", () => {
    const sqlite = new SQLite(":memory:");
    expect(migrate(sqlite)).toEqual(MIGRATIONS.map((m) => m.name));
    expect(migrate(sqlite)).toEqual([]);
    const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(tables).toContainEqual({ name: "runs" });
    expect(tables).toContainEqual({ name: "run_steps" });
  });

  test("a failing migration leaves nothing behind and is not recorded", () => {
    const sqlite = new SQLite(":memory:");
    const bad = [
      { name: "0000_ok.sql", sql: "CREATE TABLE a (id INTEGER);" },
      { name: "0001_bad.sql", sql: "CREATE TABLE b (id INTEGER); NOT SQL;" },
    ];
    expect(() => migrate(sqlite, bad)).toThrow();
    const names = sqlite.query("SELECT name FROM _migrations").all();
    expect(names).toEqual([{ name: "0000_ok.sql" }]);
    const b = sqlite.query("SELECT name FROM sqlite_master WHERE name = 'b'").all();
    expect(b).toEqual([]);
  });
});
