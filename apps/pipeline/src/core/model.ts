/**
 * Which model driver a run uses (#36). The adapter passes `MODEL_DRIVER`, the
 * same variable name in every adapter (`pipelineConfig`):
 *
 * - unset or empty: no model. Every call fails at once, so assign leaves its
 *   echoes for a later run and summarize leaves its waves due; the rest of
 *   the run goes on. Provider chains from settings come with #42 (M2-01);
 *   until then this is what a deployment without the variable runs.
 * - `fake`: the deterministic fake from `@bd/judge` (#31), for local mode,
 *   verify-local and previews. Its texts are marked as fake.
 *
 * Any other value is refused when the config is read, so a typo does not
 * quietly run without a model.
 */
import { fakeDriver, type ModelDriver } from "@bd/judge";

export const MODEL_DRIVERS = ["fake"] as const;
export type ModelDriverName = (typeof MODEL_DRIVERS)[number];

export function parseModelDriver(value: string | undefined): ModelDriverName | null {
  if (value === undefined || value === "") return null;
  if ((MODEL_DRIVERS as readonly string[]).includes(value)) return value as ModelDriverName;
  throw new Error(`MODEL_DRIVER must be unset or one of: ${MODEL_DRIVERS.join(", ")}`);
}

/** A driver whose every call fails: the run without a configured model. */
export function noModelDriver(): ModelDriver {
  const fail = async (): Promise<never> => {
    throw new Error("no model configured (MODEL_DRIVER)");
  };
  return { assign: fail, summarize: fail };
}

export function modelDriver(name: ModelDriverName | null): ModelDriver {
  return name === "fake" ? fakeDriver() : noModelDriver();
}
