/**
 * The prompts that ship, one per task, each with a version (ADR 0005: a
 * summary records its prompt version). A prompt turns a driver input into
 * the messages of one tool-less call; fetched text goes in only as data
 * (invariant 6).
 *
 * The assign prompt is #43 (M2-02, `assign-prompt.ts`); the summarize
 * prompt is #44 (M2-03). Each adds its own file and one entry here, plus
 * eval cases in `evals/cases/<task>/`. The eval (`bun scripts/eval.ts`,
 * `evals/README.md`) runs every prompt listed here, and a PR that changes
 * one gets the result posted by `.github/workflows/evals.yml`. Change a
 * prompt's text and you change its version.
 *
 * The pipeline sends what is listed here (`driverPrompts`, read by
 * `pipelineConfig`); a task with no entry has no model, so its step is
 * skipped.
 */
import { ASSIGN_PROMPT } from "./assign-prompt.ts";
import type { AssignInput, SummarizeInput } from "./driver.ts";
import type { ChatMessage, DriverPrompts } from "./index.ts";

export interface Prompt<I> {
  /** Names this text of the prompt, e.g. `assign-v1`. A new text gets a new version. */
  version: string;
  messages(input: I): ChatMessage[];
}

export interface Prompts {
  assign?: Prompt<AssignInput>;
  summarize?: Prompt<SummarizeInput>;
}

/** The prompts that ship. */
export const PROMPTS: Prompts = {
  assign: ASSIGN_PROMPT,
};

/**
 * What a chain driver sends for these prompts, with their versions. A task
 * with no prompt is absent, so the pipeline gives it no model.
 */
export function driverPrompts(prompts: Prompts): DriverPrompts {
  const out: DriverPrompts = { versions: {} };
  const { assign, summarize } = prompts;
  if (assign) {
    out.assign = (input) => assign.messages(input);
    out.versions = { ...out.versions, assign: assign.version };
  }
  if (summarize) {
    out.summarize = (input) => summarize.messages(input);
    out.versions = { ...out.versions, summarize: summarize.version };
  }
  return out;
}
