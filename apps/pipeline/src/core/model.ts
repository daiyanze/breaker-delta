/**
 * Which model a run's assign and summarize steps use (#36, #42). The adapter
 * passes `MODEL_DRIVER`, the same variable name in every adapter
 * (`pipelineConfig`):
 *
 * - unset or empty: the provider chains from settings (ADR 0005, 0008),
 *   `assignProviders` for assign and `summarizeProviders` for summarize, each
 *   its own chain. A task whose chain is empty has no model: its step is
 *   skipped (no call is made) and the rest of the run goes on, so compute
 *   still writes the board. The defaults are empty.
 * - `fake`: the deterministic fake from `@bd/judge` (#31) for both tasks,
 *   whatever the chains say, for local mode, verify-local and previews. Its
 *   texts are marked as fake.
 *
 * Any other value is refused when the config is read, so a typo does not
 * quietly run another model.
 *
 * Keys are never stored. A provider names the secret that holds its key
 * (`apiKeyRef`); the adapter's `secret` reads it when a run starts (an
 * environment variable locally, a Worker secret or variable on Cloudflare).
 * The key goes only into the request's authorization header: it is not in
 * a step's output, a draft or an error the chain throws.
 */
import type { Provider, Settings } from "@bd/contracts";
import { chainDriver, fakeDriver, type ModelDriver, type ResolvedProvider } from "@bd/judge";

export const MODEL_DRIVERS = ["fake"] as const;
export type ModelDriverName = (typeof MODEL_DRIVERS)[number];

export function parseModelDriver(value: string | undefined): ModelDriverName | null {
  if (value === undefined || value === "") return null;
  if ((MODEL_DRIVERS as readonly string[]).includes(value)) return value as ModelDriverName;
  throw new Error(`MODEL_DRIVER must be unset or one of: ${MODEL_DRIVERS.join(", ")}`);
}

/** Reads a secret by name; undefined when it is not set. */
export type SecretReader = (name: string) => string | undefined;

/**
 * A `SecretReader` over an adapter's variables: the process environment
 * locally, the Worker's `env` on Cloudflare. Only an own, non-empty string
 * counts, so a binding (D1, R2, a service) or an inherited property is never
 * read as a key.
 */
export function stringVars(vars: Readonly<Record<string, unknown>>): SecretReader {
  return (name) => {
    const value = Object.hasOwn(vars, name) ? vars[name] : undefined;
    return typeof value === "string" && value !== "" ? value : undefined;
  };
}

/** The driver each model step uses this run. Null: no model, the step is skipped. */
export interface RunModel {
  assign: ModelDriver | null;
  summarize: ModelDriver | null;
}

/** A driver whose every call fails, for tests of a model that is down. */
export function noModelDriver(): ModelDriver {
  const fail = async (): Promise<never> => {
    throw new Error("no model");
  };
  return { assign: fail, summarize: fail };
}

/**
 * A chain's providers with their keys read through `secret`. A provider
 * whose `apiKeyRef` names a secret that is not set (or is empty) is left
 * out rather than called without its key; the rest of the chain is tried.
 * A provider with no `apiKeyRef` needs no key (a local model, the bridge).
 */
export function resolveProviders(
  providers: readonly Provider[],
  secret: SecretReader,
): ResolvedProvider[] {
  const out: ResolvedProvider[] = [];
  for (const p of providers) {
    const base = { name: p.name, baseUrl: p.baseUrl, model: p.model };
    if (p.apiKeyRef === undefined) {
      out.push(base);
      continue;
    }
    const apiKey = secret(p.apiKeyRef);
    if (apiKey) out.push({ ...base, apiKey });
  }
  return out;
}

/**
 * The model for one run. With chains, a task whose chain in settings is
 * empty gets null (skipped). One whose providers all lack their key gets a
 * driver over an empty chain, so its calls fail and its echoes or waves wait
 * for a later run: it was configured, so it is not skipped.
 */
export function runModel(
  name: ModelDriverName | null,
  settings: Pick<Settings, "assignProviders" | "summarizeProviders">,
  secret: SecretReader,
  fetch: typeof globalThis.fetch,
): RunModel {
  if (name === "fake") {
    const fake = fakeDriver();
    return { assign: fake, summarize: fake };
  }
  const chain = (providers: readonly Provider[]) =>
    providers.length === 0 ? null : chainDriver(resolveProviders(providers, secret), { fetch });
  return { assign: chain(settings.assignProviders), summarize: chain(settings.summarizeProviders) };
}
