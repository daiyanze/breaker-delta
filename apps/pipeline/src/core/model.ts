/**
 * Which model a run's assign and summarize steps use (#36, #42). The adapter
 * passes `MODEL_DRIVER`, the same variable name in every adapter
 * (`pipelineConfig`):
 *
 * - unset or empty: the provider chains from settings (ADR 0005, 0008),
 *   `assignProviders` for assign and `summarizeProviders` for summarize, each
 *   its own chain, sent the prompts in `PipelineConfig.prompts`. A task has
 *   no model when its chain is empty or when it has no prompt: its step is
 *   skipped (no call is made) and the rest of the run goes on, so compute
 *   still writes the board. The chains default to empty, so no provider is
 *   called until the owner sets one. The prompts are the shipped `PROMPTS`
 *   (`pipelineConfig`): assign (#43) and summarize (#44).
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
 * a step's output, a draft or an error the chain throws. A key with a
 * control character inside it (CR, LF, NUL, ...) is refused, since an
 * invalid header value would be quoted in the fetch error.
 */
import type { Provider, Settings } from "@bd/contracts";
import {
  chainDriver,
  type DriverPrompts,
  fakeDriver,
  type ModelDriver,
  type ResolvedProvider,
} from "@bd/judge";

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
 * A chain's providers with their keys read through `secret`, trimmed. A
 * provider whose `apiKeyRef` names a secret that is not set, is empty, or
 * holds a control character after trimming is left out rather than called
 * without its key; the rest of the chain is tried.
 * A provider with no `apiKeyRef` needs no key (a local model, the bridge).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL = /[\u0000-\u001f\u007f]/;

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
    const apiKey = secret(p.apiKeyRef)?.trim();
    if (apiKey && !CONTROL.test(apiKey)) out.push({ ...base, apiKey });
  }
  return out;
}

/**
 * The model for one run. With chains, a task whose chain in settings is
 * empty gets null (skipped), and so does a task with no prompt in `prompts`
 * (every task while `prompts` is null). One whose providers all lack their key gets a
 * driver over an empty chain, so its calls fail and its echoes or waves wait
 * for a later run: it was configured, so it is not skipped.
 */
export function runModel(
  name: ModelDriverName | null,
  settings: Pick<Settings, "assignProviders" | "summarizeProviders">,
  secret: SecretReader,
  fetch: typeof globalThis.fetch,
  prompts: DriverPrompts | null = null,
): RunModel {
  if (name === "fake") {
    const fake = fakeDriver();
    return { assign: fake, summarize: fake };
  }
  const chain = (providers: readonly Provider[], prompted: boolean) =>
    prompts === null || !prompted || providers.length === 0
      ? null
      : chainDriver(resolveProviders(providers, secret), prompts, { fetch });
  return {
    assign: chain(settings.assignProviders, prompts?.assign !== undefined),
    summarize: chain(settings.summarizeProviders, prompts?.summarize !== undefined),
  };
}
