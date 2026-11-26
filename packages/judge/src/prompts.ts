/**
 * The prompts that ship, one per task, each with a version (ADR 0005: a
 * summary records its prompt version). A prompt turns a driver input into
 * the messages of one tool-less call; fetched text goes in only as data
 * (invariant 6).
 *
 * The summarize prompt is `summarize-prompt.ts` (#44, M2-03); the assign
 * prompt is #43 (M2-02). Each has its own file and one entry here, plus eval cases in
 * `evals/cases/<task>/`. The eval (`bun scripts/eval.ts`, `evals/README.md`)
 * runs every prompt listed here, and a PR that changes one gets the result
 * posted by `.github/workflows/evals.yml`. Change a prompt's text and you
 * change its version.
 */
import type { AssignInput, SummarizeInput } from "./driver.ts";
import type { ChatMessage } from "./index.ts";
import { SUMMARIZE_PROMPT } from "./summarize-prompt.ts";

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
  summarize: SUMMARIZE_PROMPT,
};
