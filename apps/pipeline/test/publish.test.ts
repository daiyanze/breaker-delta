/** The publish step (M1-19, #35): the site's cache purge, through the SiteCache port. */
import { describe, expect, test } from "bun:test";
import { drizzleOver, runSteps } from "@bd/db";
import type { PurgeRequest, SiteCache } from "@bd/ports";
import { createPipeline, pipelineConfig } from "../src/core/app.ts";
import type { CommitOutput } from "../src/core/commit.ts";
import { publishStep } from "../src/core/publish.ts";
import type { Step } from "../src/core/runner.ts";
import { changeSettings } from "../src/core/settings.ts";
import { memoryBlobs, migratedDatabase, NOW, SLOT } from "./helpers.ts";

/** A site that records each purge and fails the first `failures` calls. */
function recordingSite(failures = 0, purged = 0) {
  const calls: PurgeRequest[] = [];
  const site: SiteCache = {
    async purge(request) {
      calls.push(request);
      if (calls.length <= failures) throw new Error(`site unreachable (call ${calls.length})`);
      return { purged };
    },
  };
  return { site, calls };
}

/** Stands in for the commit step: its output is what publish reads. */
const commit = (output: CommitOutput): Step => ({ name: "commit", run: async () => output });

function setup(stepMaxAttempts?: number) {
  const { db } = migratedDatabase();
  const orm = drizzleOver(db);
  const tick = async (steps: Step[]) => {
    if (stepMaxAttempts !== undefined) await changeSettings(orm, NOW, { stepMaxAttempts });
    const pipeline = createPipeline(
      { db, clock: { now: () => NOW }, blobs: memoryBlobs().blobs },
      pipelineConfig({}),
      steps,
    );
    return pipeline.tick();
  };
  const stepRow = () =>
    orm
      .select()
      .from(runSteps)
      .all()
      .then((rows) => rows.find((r) => r.step === "publish"));
  return { tick, stepRow };
}

const COMMITTED: CommitOutput = { published: ["t1", "t2"], formed: ["t2"], discarded: ["t3"] };

describe("publish", () => {
  test("the site receives the slot and the topics commit changed, ids only", async () => {
    const t = setup();
    const { site, calls } = recordingSite(0, 4);
    const outcome = await t.tick([commit(COMMITTED), publishStep({ site })]);
    expect(outcome).toMatchObject({ slot: SLOT, status: "done" });
    expect(calls).toEqual([{ slot: SLOT, topicIds: ["t1", "t2", "t3"] }]);
    const row = await t.stepRow();
    expect(row).toMatchObject({ status: "done", attempts: 1 });
    expect(JSON.parse(row?.output ?? "null")).toEqual({ topics: 3, purged: 4 });
  });

  test("a topic in both lists is named once", async () => {
    const t = setup();
    const { site, calls } = recordingSite();
    const both: CommitOutput = { published: ["t1"], formed: [], discarded: ["t1", "t2"] };
    await t.tick([commit(both), publishStep({ site })]);
    expect(calls.map((c) => c.topicIds)).toEqual([["t1", "t2"]]);
  });

  test("the site is called even when no topic changed", async () => {
    const t = setup();
    const { site, calls } = recordingSite();
    const none: CommitOutput = { published: [], formed: [], discarded: [] };
    expect(await t.tick([commit(none), publishStep({ site })])).toMatchObject({ status: "done" });
    expect(calls).toEqual([{ slot: SLOT, topicIds: [] }]);
  });

  test("a failed purge is retried, up to stepMaxAttempts from settings", async () => {
    const t = setup(3);
    const { site, calls } = recordingSite(2);
    expect(await t.tick([commit(COMMITTED), publishStep({ site })])).toMatchObject({
      status: "done",
    });
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => JSON.stringify(c))).size).toBe(1);
    expect(await t.stepRow()).toMatchObject({ status: "done", attempts: 3, error: null });
  });

  test("a purge that keeps failing fails the run after stepMaxAttempts", async () => {
    const t = setup(2);
    const { site, calls } = recordingSite(5);
    const outcome = await t.tick([commit(COMMITTED), publishStep({ site })]);
    expect(outcome).toMatchObject({
      status: "failed",
      reason: "step publish failed: Error: site unreachable (call 2)",
    });
    expect(calls).toHaveLength(2);
    expect(await t.stepRow()).toMatchObject({ status: "failed", attempts: 2 });
  });

  test("without a commit output the step fails and the site is not called", async () => {
    const t = setup(1);
    const { site, calls } = recordingSite();
    expect(await t.tick([publishStep({ site })])).toMatchObject({ status: "failed" });
    expect(calls).toEqual([]);
  });
});
