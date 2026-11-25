/**
 * #40: `bun run local` completes one full run with the fake model and
 * fixture sources, and the local database then holds echoes, topics, wave
 * points and events. Starts the real launcher (`apps/local/start.ts`) as a
 * separate process, the way a user does. `spike-local.yml` runs the same
 * check against the built executable (`scripts/spike-local.ts`).
 */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { STEP_NAMES } from "../apps/pipeline/src/core/steps.ts";
import { FULL_RUN_TABLES, type FullRunResult, fullRun, fullRunProblem } from "./local-full-run.ts";

const root = join(import.meta.dir, "..");

test("bun run local completes one full run and fills the database", async () => {
  const result = await fullRun({
    command: [process.execPath, join(root, "apps", "local", "start.ts")],
    cwd: root,
    timeoutSeconds: 60,
  });
  expect(fullRunProblem(result)).toBeNull();
  expect(result.steps.map((s) => s.step)).toEqual([...STEP_NAMES]);
  for (const table of FULL_RUN_TABLES) expect(result.counts[table]).toBeGreaterThan(0);
  // The fake model's topics form waves from the fixtures, so the run records them.
  expect(result.events.wave_formed).toBeGreaterThan(0);
}, 90_000);

test("fullRunProblem names a run that skipped a step", () => {
  const done = STEP_NAMES.map((step) => ({ step, status: "done" }));
  const counts = Object.fromEntries(FULL_RUN_TABLES.map((t) => [t, 1])) as FullRunResult["counts"];
  const full: FullRunResult = { status: "done", steps: done, counts, events: {} };
  expect(fullRunProblem(full)).toBeNull();
  const skipped = { ...full, steps: done.filter((s) => s.step !== "select") };
  expect(fullRunProblem(skipped)).toContain("steps ran");
});
