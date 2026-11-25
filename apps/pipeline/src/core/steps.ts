/**
 * The steps of one run, in order (#36): scan -> ingest -> assign -> compute
 * -> changes -> select -> enrich -> summarize -> validate -> commit ->
 * publish -> retention. Enrich (#45) fetches evidence pages for the waves
 * select chose; a page it cannot fetch does not fail it.
 *
 * Each step reads ids and counts from the outputs of the steps before it
 * (`run_steps`, kept by the runner) and the rows they wrote, never fetched
 * text (invariant 6), so any step can be retried or resumed on its own.
 *
 * A model failure does not fail a step: assign leaves the echoes of a failed
 * batch without a topic, and summarize leaves a wave whose call failed
 * without a draft. Neither is lost: assign takes every echo with no topic
 * next run, and select finds the wave still due, though under a full
 * budget it can wait behind other waves (`selectForSummary`). So compute, which
 * writes the board (`wave_points`, topic states), runs whatever the model
 * does, and the run goes on to publish and retention.
 */
import type { ModelDriver } from "@bd/judge";
import type { Blobs, SiteCache } from "@bd/ports";
import type { Adapter } from "../sources/adapter.ts";
import type { LaunchGroup } from "../sources/launch-groups.ts";
import { assignStep } from "./assign.ts";
import { changesStep } from "./changes.ts";
import { commitStep } from "./commit.ts";
import { computeStep } from "./compute.ts";
import { enrichStep } from "./enrich.ts";
import { ingestStep } from "./ingest.ts";
import { publishStep } from "./publish.ts";
import { retentionStep } from "./retention.ts";
import type { Step } from "./runner.ts";
import { scanStep } from "./scan.ts";
import { selectStep } from "./select.ts";
import { summarizeStep } from "./summarize.ts";
import { validateStep } from "./validate.ts";

/** The step names of a run, in the order they run. */
export const STEP_NAMES = [
  "scan",
  "ingest",
  "assign",
  "compute",
  "changes",
  "select",
  "enrich",
  "summarize",
  "validate",
  "commit",
  "publish",
  "retention",
] as const;

/** What the steps need from outside: ports, the model and the source list. */
export interface StepDeps {
  blobs: Blobs;
  fetch: typeof fetch;
  driver: ModelDriver;
  site: SiteCache;
  groups: readonly LaunchGroup[];
  adapters: Readonly<Record<string, Adapter>>;
}

export function buildSteps(deps: StepDeps): Step[] {
  const { blobs, adapters } = deps;
  return [
    scanStep({ blobs, fetch: deps.fetch, groups: deps.groups, adapters }),
    ingestStep({ blobs, adapters }),
    assignStep({ driver: deps.driver }),
    computeStep(),
    changesStep(),
    selectStep(),
    enrichStep({ blobs, fetch: deps.fetch }),
    summarizeStep({ driver: deps.driver, blobs }),
    validateStep({ blobs }),
    commitStep({ blobs }),
    publishStep({ site: deps.site }),
    retentionStep({ blobs }),
  ];
}
