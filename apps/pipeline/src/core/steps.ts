/**
 * The steps of one run, in order. Empty in M0: a run opens and closes.
 * M1 adds scan -> ingest -> assign -> compute -> select -> enrich ->
 * summarize -> validate -> commit -> publish (#26 to #35), then retention
 * (#38).
 */
import type { Step } from "./runner.ts";

export const STEPS: readonly Step[] = [];
