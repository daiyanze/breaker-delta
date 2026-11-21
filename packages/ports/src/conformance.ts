/**
 * Conformance checks for port adapters. Every Database adapter (bun:sqlite,
 * D1, ...) must pass the same list, so the core can rely on one behaviour.
 * Framework-free: each check throws on failure. Run them from any test
 * runner; see `apps/pipeline/src/local/database.test.ts`.
 */
import type { Database } from "./index.ts";

export interface PortCheck {
  name: string;
  run(): Promise<void>;
}

function expectEqual(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

/** `open` must return a fresh, empty database each time it is called. */
export function databaseChecks(open: () => Promise<Database>): PortCheck[] {
  const table = "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL, n INTEGER)";
  return [
    {
      name: "run reports the rows it wrote",
      async run() {
        const db = await open();
        await db.run(table);
        const insert = "INSERT INTO t (id, name) VALUES (?1, ?2), (?3, ?4)";
        const r = await db.run(insert, 1, "a", 2, "b");
        expectEqual(r.changes, 2, "changes after inserting two rows");
        const u = await db.run("UPDATE t SET n = ?1 WHERE id = ?2", 5, 99);
        expectEqual(u.changes, 0, "changes after an update that matches nothing");
      },
    },
    {
      name: "all returns rows in order with positional parameters",
      async run() {
        const db = await open();
        await db.run(table);
        await db.run("INSERT INTO t (id, name, n) VALUES (1, 'a', 10), (2, 'b', 20), (3, 'c', 30)");
        const rows = await db.all("SELECT id, name FROM t WHERE n >= ?1 ORDER BY id DESC", 20);
        expectEqual(
          rows,
          [
            { id: 3, name: "c" },
            { id: 2, name: "b" },
          ],
          "rows",
        );
        expectEqual(await db.all("SELECT id FROM t WHERE id = ?1", 42), [], "no rows");
      },
    },
    {
      name: "values returns rows as arrays in select order",
      async run() {
        const db = await open();
        await db.run(table);
        await db.run("INSERT INTO t (id, name, n) VALUES (1, 'a', 10), (2, 'b', NULL)");
        const rows = await db.values("SELECT name, id, n FROM t WHERE id >= ?1 ORDER BY id", 1);
        expectEqual(
          rows,
          [
            ["a", 1, 10],
            ["b", 2, null],
          ],
          "rows",
        );
        // The same name twice stays two columns.
        expectEqual(await db.values("SELECT id, id AS id FROM t WHERE id = 1"), [[1, 1]], "dup");
        expectEqual(await db.values("SELECT id FROM t WHERE id = 42"), [], "no rows");
      },
    },
    {
      name: "first returns one row, or null",
      async run() {
        const db = await open();
        await db.run(table);
        await db.run("INSERT INTO t (id, name) VALUES (1, 'a')");
        expectEqual(await db.first("SELECT name FROM t WHERE id = ?1", 1), { name: "a" }, "row");
        expectEqual(await db.first("SELECT name FROM t WHERE id = ?1", 2), null, "missing row");
      },
    },
    {
      name: "null and text round-trip unchanged",
      async run() {
        const db = await open();
        await db.run(table);
        await db.run("INSERT INTO t (id, name, n) VALUES (?1, ?2, ?3)", 1, "波頭 · 浪尖 ✓", null);
        const row = await db.first("SELECT name, n FROM t WHERE id = 1");
        expectEqual(row, { name: "波頭 · 浪尖 ✓", n: null }, "row");
      },
    },
    {
      name: "batch applies every statement",
      async run() {
        const db = await open();
        await db.batch([
          { sql: table },
          { sql: "INSERT INTO t (id, name) VALUES (?1, ?2)", params: [1, "a"] },
          { sql: "INSERT INTO t (id, name) VALUES (?1, ?2)", params: [2, "b"] },
        ]);
        expectEqual(await db.all("SELECT id FROM t ORDER BY id"), [{ id: 1 }, { id: 2 }], "rows");
      },
    },
    {
      name: "batch is atomic: one failing statement rolls back the others",
      async run() {
        const db = await open();
        await db.run(table);
        await db.run("INSERT INTO t (id, name) VALUES (1, 'kept')");
        let failed = false;
        try {
          await db.batch([
            { sql: "INSERT INTO t (id, name) VALUES (2, 'rolled back')" },
            { sql: "UPDATE t SET name = 'rolled back' WHERE id = 1" },
            // Violates NOT NULL, so the whole batch must fail.
            { sql: "INSERT INTO t (id, name) VALUES (3, NULL)" },
          ]);
        } catch {
          failed = true;
        }
        expectEqual(failed, true, "the batch rejected");
        expectEqual(await db.all("SELECT id, name FROM t"), [{ id: 1, name: "kept" }], "rows");
      },
    },
    {
      name: "a constraint violation rejects",
      async run() {
        const db = await open();
        await db.run(table);
        await db.run("INSERT INTO t (id, name) VALUES (1, 'a')");
        let failed = false;
        try {
          await db.run("INSERT INTO t (id, name) VALUES (1, 'again')");
        } catch {
          failed = true;
        }
        expectEqual(failed, true, "duplicate primary key rejected");
      },
    },
  ];
}
