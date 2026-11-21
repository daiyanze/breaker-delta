/** drizzleOver (from @bd/db) on the bun:sqlite Database adapter. */
import { describe, expect, test } from "bun:test";
import { drizzleOver, runs } from "@bd/db";
import { eq } from "drizzle-orm";
import { migratedDatabase } from "./helpers.ts";

const open = () => drizzleOver(migratedDatabase().db);

describe("drizzle over the Database port", () => {
  test("insert, select one, select all", async () => {
    const db = open();
    await db.insert(runs).values({ slot: "20261119T0500", status: "done", startedAt: 1 });
    await db.insert(runs).values({ slot: "20261119T0600", status: "running", startedAt: 2 });
    const one = await db.select().from(runs).where(eq(runs.slot, "20261119T0500")).get();
    expect(one).toEqual({
      slot: "20261119T0500",
      status: "done",
      startedAt: 1,
      finishedAt: null,
      leaseUntil: null,
    });
    const all = await db.select({ slot: runs.slot }).from(runs).orderBy(runs.startedAt);
    expect(all).toEqual([{ slot: "20261119T0500" }, { slot: "20261119T0600" }]);
  });

  test("get on no row is undefined", async () => {
    const db = open();
    expect(await db.select().from(runs).where(eq(runs.slot, "nope")).get()).toBeUndefined();
  });

  test("batch writes atomically", async () => {
    const db = open();
    await db.batch([
      db.insert(runs).values({ slot: "a", status: "done", startedAt: 1 }),
      db.insert(runs).values({ slot: "b", status: "done", startedAt: 2 }),
    ]);
    expect(await db.select({ slot: runs.slot }).from(runs).orderBy(runs.slot)).toEqual([
      { slot: "a" },
      { slot: "b" },
    ]);
    // The second insert repeats a primary key, so neither row is written.
    const failing = db.batch([
      db.insert(runs).values({ slot: "c", status: "done", startedAt: 3 }),
      db.insert(runs).values({ slot: "a", status: "done", startedAt: 4 }),
    ]);
    await expect(failing).rejects.toThrow();
    expect(await db.select().from(runs).where(eq(runs.slot, "c")).get()).toBeUndefined();
  });

  test("batch refuses reads", async () => {
    const db = open();
    await expect(db.batch([db.select().from(runs)])).rejects.toThrow("write statements only");
  });
});
