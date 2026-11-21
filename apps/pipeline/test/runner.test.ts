/** The step runner (#171) on an in-memory SQLite database. */
import { describe, expect, test } from "bun:test";
import { drizzleOver, runSteps, runs } from "@bd/db";
import { eq } from "drizzle-orm";
import { runSlot, type Step } from "../src/core/runner.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const OPTIONS = { maxAttempts: 3, leaseMs: 30 * 60_000 };

function setup() {
  const { db } = migratedDatabase();
  const orm = drizzleOver(db);
  let clock = NOW;
  return {
    orm,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    run: (steps: readonly Step[], options = OPTIONS) =>
      runSlot(orm, () => clock, SLOT, steps, options),
  };
}

/** A step that counts its calls and fails its first `failures` attempts. */
function step(name: string, output: unknown, failures = 0) {
  const calls = { count: 0 };
  const s: Step = {
    name,
    async run() {
      calls.count++;
      if (calls.count <= failures) throw new Error(`${name} failed on call ${calls.count}`);
      return output;
    },
  };
  return { step: s, calls };
}

describe("runSlot", () => {
  test("runs the steps in order and passes earlier outputs on", async () => {
    const t = setup();
    const seen: unknown[] = [];
    const scan: Step = { name: "scan", run: async () => ({ echoIds: ["e1", "e2"] }) };
    const ingest: Step = {
      name: "ingest",
      async run(ctx) {
        seen.push(ctx.outputs.get("scan"));
        return { stored: 2 };
      },
    };
    expect(await t.run([scan, ingest])).toEqual({ status: "done", resumed: false });
    expect(seen).toEqual([{ echoIds: ["e1", "e2"] }]);

    const rows = await t.orm.select().from(runSteps).orderBy(runSteps.finishedAt, runSteps.step);
    expect(rows.map((r) => [r.step, r.status, r.attempts, r.output])).toEqual([
      ["ingest", "done", 1, '{"stored":2}'],
      ["scan", "done", 1, '{"echoIds":["e1","e2"]}'],
    ]);
    const run = await t.orm.select().from(runs).where(eq(runs.slot, SLOT)).get();
    expect(run).toMatchObject({ status: "done", leaseUntil: null, finishedAt: NOW });
  });

  test("a slot runs once: a finished slot starts nothing", async () => {
    const t = setup();
    const a = step("a", 1);
    await t.run([a.step]);
    expect(await t.run([a.step])).toEqual({ status: "finished", runStatus: "done" });
    expect(a.calls.count).toBe(1);
  });

  test("a run killed after step N resumes at step N+1 once its lease expires", async () => {
    const t = setup();
    // State left by a runner that finished step "a" and then died.
    await t.orm.insert(runs).values({
      slot: SLOT,
      status: "running",
      startedAt: NOW,
      leaseUntil: NOW + OPTIONS.leaseMs,
    });
    await t.orm.insert(runSteps).values({
      slot: SLOT,
      step: "a",
      status: "done",
      attempts: 1,
      output: '"from-a"',
      finishedAt: NOW,
    });
    const a = step("a", "again");
    let fromA: unknown;
    const b: Step = {
      name: "b",
      async run(ctx) {
        fromA = ctx.outputs.get("a");
      },
    };

    // While the dead runner's lease is still valid, nobody takes over.
    expect(await t.run([a.step, b])).toEqual({ status: "busy" });

    t.advance(OPTIONS.leaseMs + 1);
    expect(await t.run([a.step, b])).toEqual({ status: "done", resumed: true });
    expect(a.calls.count).toBe(0);
    expect(fromA).toBe("from-a");
  });

  test("a failing step is retried, then succeeds", async () => {
    const t = setup();
    const flaky = step("flaky", { ok: true }, 2);
    expect(await t.run([flaky.step])).toEqual({ status: "done", resumed: false });
    expect(flaky.calls.count).toBe(3);
    const row = await t.orm.select().from(runSteps).where(eq(runSteps.step, "flaky")).get();
    expect(row).toMatchObject({ status: "done", attempts: 3, error: null });
  });

  test("a step that keeps failing fails the run; later steps do not run", async () => {
    const t = setup();
    const broken = step("broken", null, 99);
    const after = step("after", null);
    const outcome = await t.run([broken.step, after.step], { ...OPTIONS, maxAttempts: 2 });
    expect(outcome).toEqual({
      status: "failed",
      resumed: false,
      step: "broken",
      error: "Error: broken failed on call 2",
    });
    expect(broken.calls.count).toBe(2);
    expect(after.calls.count).toBe(0);
    const row = await t.orm.select().from(runSteps).where(eq(runSteps.step, "broken")).get();
    expect(row).toMatchObject({ status: "failed", attempts: 2, output: null });
    const run = await t.orm.select().from(runs).where(eq(runs.slot, SLOT)).get();
    expect(run).toMatchObject({ status: "failed", leaseUntil: null });
    // A failed slot is not retried by later ticks.
    expect(await t.run([broken.step])).toEqual({ status: "finished", runStatus: "failed" });
  });

  test("an output that cannot be stored is a failed attempt, not a stuck run", async () => {
    const t = setup();
    const bad: Step = { name: "bad", run: async () => ({ count: 1n }) };
    const outcome = await t.run([bad], { ...OPTIONS, maxAttempts: 2 });
    expect(outcome).toMatchObject({ status: "failed", step: "bad" });
    const run = await t.orm.select().from(runs).where(eq(runs.slot, SLOT)).get();
    expect(run).toMatchObject({ status: "failed", leaseUntil: null });
  });

  test("error text is cut short", async () => {
    const t = setup();
    const long: Step = {
      name: "long",
      async run() {
        throw new Error("x".repeat(1000));
      },
    };
    const outcome = await t.run([long], { ...OPTIONS, maxAttempts: 1 });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error.length).toBeLessThanOrEqual(200);
  });

  test("the lease is renewed after each step", async () => {
    const t = setup();
    let leaseSeen: number | null | undefined;
    const slow: Step = {
      name: "slow",
      async run() {
        t.advance(20 * 60_000);
      },
    };
    const look: Step = {
      name: "look",
      async run(ctx) {
        const row = await ctx.db.select().from(runs).where(eq(runs.slot, SLOT)).get();
        leaseSeen = row?.leaseUntil;
      },
    };
    await t.run([slow, look]);
    // Renewed after "slow" finished at NOW + 20 min, so it runs to NOW + 50 min.
    expect(leaseSeen).toBe(NOW + 20 * 60_000 + OPTIONS.leaseMs);
  });
});
