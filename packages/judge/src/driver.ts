/**
 * The model driver: what the pipeline's model steps (assign, summarize) call.
 * Two implementations take the same input: the provider chain over HTTP, and
 * the fake in `fake.ts` for tests and previews. A step is given a driver and
 * never knows which one it has.
 *
 * Inputs carry echo IDs and the text a prompt needs, nothing else. Outputs are
 * the model contracts from `@bd/contracts`: echoes and topics by ID only
 * (invariant 2), and no wave, height or rank (invariant 1).
 */
import type { AssignResult, Language, SummarizeResult } from "@bd/contracts";
import type { ChainResult } from "./index.ts";

/** One echo as a model sees it. */
export interface DriverEcho {
  id: string;
  title: string;
  summary?: string;
}

/** One shortlisted topic the assign step offers. */
export interface DriverTopic {
  id: string;
  name: string;
  aliases?: readonly string[];
}

export interface AssignInput {
  /** The new echoes; each gets one assignment. */
  echoes: readonly DriverEcho[];
  /** The shortlist. An assignment to any other topic ID is invalid. */
  topics: readonly DriverTopic[];
}

export interface SummarizeInput {
  /** The topic's name, as assign proposed it. */
  name: string;
  /** The echoes the summary may cite. At least one. */
  echoes: readonly DriverEcho[];
  /** One text per language, in this order. */
  languages: readonly Language[];
  /** True for the first summary of a topic: it proposes the review criterion. */
  first: boolean;
}

/**
 * The result says which provider and model answered, so a summary can record
 * its writer (ADR 0005).
 */
export interface ModelDriver {
  assign(input: AssignInput): Promise<ChainResult<AssignResult>>;
  summarize(input: SummarizeInput): Promise<ChainResult<SummarizeResult>>;
}
