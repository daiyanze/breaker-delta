/**
 * Model provider chain. One protocol: OpenAI-compatible chat completions.
 * Calls have no tools. Output is JSON that the caller validates.
 * See docs/adr/0005-model-provider-chain.md.
 */
import {
  type AssignResult,
  AssignResultSchema,
  type SummarizeResult,
  SummarizeResultSchema,
} from "@bd/contracts";
import type { AssignInput, ModelDriver, SummarizeInput } from "./driver.ts";
import type { Prompts } from "./prompts.ts";

export interface ResolvedProvider {
  name: string;
  baseUrl: string;
  model: string;
  /** Resolved key. Omit for endpoints that need none (local models, bridge). */
  apiKey?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };
export type Validate<T> = (raw: unknown) => Validation<T>;

/**
 * Token counts from a completion response's `usage`, when the provider
 * sends it (#48). A count the response does not give is absent.
 */
export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * One HTTP call a chain made (#48): who it went to and how it ended. No key,
 * no message text and no error message, so it can be stored as is.
 *
 * - `ok`: the answer passed validation.
 * - `invalid`: an answer came back but failed validation (or was not JSON).
 * - `error`: no answer: a transport error, an HTTP error or an empty
 *   completion.
 */
export interface ModelCall {
  provider: string;
  model: string;
  /** The version of the prompts that made the messages; null when unversioned. */
  promptVersion: string | null;
  outcome: "ok" | "invalid" | "error";
  /** True when an earlier provider of the same chain call had failed. */
  fallback: boolean;
  usage: Usage;
}

export interface ChainResult<T> {
  value: T;
  provider: string;
  model: string;
  /** The version of the prompts that made the messages; null when unversioned. */
  promptVersion: string | null;
  /** True when the first answer was invalid and the retry succeeded. */
  repaired: boolean;
  /** Every HTTP call this answer took, in order, the answering one last. */
  calls: ModelCall[];
}

/**
 * Why one provider of a chain gave no valid answer, from a fixed list, so it
 * can be counted and shown without the error text (which may quote an
 * answer):
 *
 * - `http-429`, `http-4xx`, `http-5xx`: the provider answered with that HTTP
 *   status (`http-4xx` is every other 4xx, `http-5xx` every 5xx; the exact
 *   status is on the attempt, `Attempt.status`);
 * - `timeout`: no response within the chain's timeout;
 * - `network`: the request failed before any response (DNS, TLS, refused);
 * - `empty`: a response with no completion text;
 * - `not-json`: the repaired answer was not JSON (the first one was invalid too);
 * - `schema`: the repaired answer was JSON but did not fit the contract;
 * - `other`: anything else (an HTTP status outside 4xx/5xx, an unknown error).
 */
export const FAILURE_KINDS = [
  "http-429",
  "http-4xx",
  "http-5xx",
  "timeout",
  "network",
  "empty",
  "not-json",
  "schema",
  "other",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export interface Attempt {
  provider: string;
  error: string;
  /** The error's kind; never text from the answer. */
  kind: FailureKind;
  /** The HTTP status, when the provider answered with an error status (the `http-*` kinds). */
  status?: number;
}

/** An HTTP error status from a provider. */
export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

/** No completion text in a response. */
class EmptyCompletionError extends Error {
  constructor() {
    super("empty completion");
    this.name = "EmptyCompletionError";
  }
}

/** The kind of a transport or HTTP error thrown by one completion request. */
export function failureKind(err: unknown): FailureKind {
  if (err instanceof HttpStatusError) {
    if (err.status === 429) return "http-429";
    if (err.status >= 400 && err.status < 500) return "http-4xx";
    if (err.status >= 500 && err.status < 600) return "http-5xx";
    return "other";
  }
  if (err instanceof EmptyCompletionError) return "empty";
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  // fetch rejects with a TypeError when no response arrives at all.
  if (err instanceof TypeError) return "network";
  return "other";
}

export class ChainExhaustedError extends Error {
  readonly attempts: Attempt[];
  /** Every HTTP call the chain made before giving up (#48). */
  readonly calls: ModelCall[];
  constructor(attempts: Attempt[], calls: ModelCall[] = []) {
    super(`all providers failed: ${attempts.map((a) => `${a.provider}: ${a.error}`).join("; ")}`);
    this.name = "ChainExhaustedError";
    this.attempts = attempts;
    this.calls = calls;
  }
}

/** The calls a failed driver call made: a chain's, or none for any other error. */
export function callsOf(err: unknown): ModelCall[] {
  return err instanceof ChainExhaustedError ? err.calls : [];
}

export interface ChainOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** The version of the prompts that made `messages`, recorded on the result and each call. */
  promptVersion?: string;
}

/**
 * Try providers in order. Per provider: ask once; if the answer fails
 * validation, ask once more with the validation error; then move on.
 * Transport or HTTP errors move on immediately.
 */
export async function callChain<T>(
  providers: readonly ResolvedProvider[],
  messages: readonly ChatMessage[],
  validate: Validate<T>,
  options: ChainOptions = {},
): Promise<ChainResult<T>> {
  const attempts: Attempt[] = [];
  const calls: ModelCall[] = [];
  const promptVersion = options.promptVersion ?? null;
  for (const provider of providers) {
    const fallback = attempts.length > 0;
    const record = (outcome: ModelCall["outcome"], usage: Usage = {}) =>
      calls.push({
        provider: provider.name,
        model: provider.model,
        promptVersion,
        outcome,
        fallback,
        usage,
      });
    const done = (value: T, repaired: boolean): ChainResult<T> => ({
      value,
      provider: provider.name,
      model: provider.model,
      promptVersion,
      repaired,
      calls,
    });
    try {
      const first = await complete(provider, messages, options).catch((err: unknown) => {
        record("error");
        throw err;
      });
      const v1 = validate(parseJson(first.content));
      record(v1.ok ? "ok" : "invalid", first.usage);
      if (v1.ok) return done(v1.value, false);
      const retry: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: first.content },
        {
          role: "user",
          content: `Your previous output was invalid: ${v1.error}\nReturn only the corrected JSON.`,
        },
      ];
      const second = await complete(provider, retry, options).catch((err: unknown) => {
        record("error");
        throw err;
      });
      const json2 = parseJson(second.content);
      const v2 = validate(json2);
      record(v2.ok ? "ok" : "invalid", second.usage);
      if (v2.ok) return done(v2.value, true);
      attempts.push({
        provider: provider.name,
        error: `invalid after repair: ${v2.error}`,
        kind: json2 === undefined ? "not-json" : "schema",
      });
    } catch (err) {
      attempts.push({
        provider: provider.name,
        error: err instanceof Error ? err.message : String(err),
        kind: failureKind(err),
        ...(err instanceof HttpStatusError ? { status: err.status } : {}),
      });
    }
  }
  throw new ChainExhaustedError(attempts, calls);
}

/** A count from `usage`: a non-negative whole number, else absent. */
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** The token counts of an OpenAI-compatible `usage` object; only those it gives. */
export function readUsage(raw: unknown): Usage {
  if (typeof raw !== "object" || raw === null) return {};
  const u = raw as Record<string, unknown>;
  const out: Usage = {};
  const prompt = count(u.prompt_tokens);
  const completion = count(u.completion_tokens);
  const total = count(u.total_tokens);
  if (prompt !== undefined) out.promptTokens = prompt;
  if (completion !== undefined) out.completionTokens = completion;
  if (total !== undefined) out.totalTokens = total;
  return out;
}

async function complete(
  provider: ResolvedProvider,
  messages: readonly ChatMessage[],
  options: ChainOptions,
): Promise<{ content: string; usage: Usage }> {
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;
  const res = await doFetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: provider.model, messages, temperature: 0 }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  });
  if (!res.ok) throw new HttpStatusError(res.status);
  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: unknown;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) throw new EmptyCompletionError();
  return { content, usage: readUsage(data.usage) };
}

/**
 * The messages a chain sends for each task; the shipped ones are `PROMPTS`
 * (`prompts.ts`). A task without one has no prompt: a driver over it fails
 * that task's calls, and the pipeline skips its step (`runModel`). Fetched
 * text goes into these tool-less calls only as data (invariant 6).
 */
export interface DriverPrompts {
  assign?(input: AssignInput): ChatMessage[];
  summarize?(input: SummarizeInput): ChatMessage[];
  /**
   * Each task's prompt version, recorded with every call and summary (ADR
   * 0005, #48). A task without one is recorded as unversioned (null).
   */
  versions?: { assign?: string; summarize?: string };
}

/** A `Validate` from a zod schema's `safeParse`; the error lists each issue's path. */
function contract<T>(
  safeParse: (
    raw: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
): Validate<T> {
  return (raw) => {
    const parsed = safeParse(raw);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : {
          ok: false,
          error: parsed.error.issues
            .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
            .join("; "),
        };
  };
}

const validAssign: Validate<AssignResult> = contract((raw) => AssignResultSchema.safeParse(raw));
const validSummarize: Validate<SummarizeResult> = contract((raw) =>
  SummarizeResultSchema.safeParse(raw),
);

/**
 * The chain as a `ModelDriver` (#42): every call goes through `callChain`
 * over these providers with the given prompts, and each answer is checked
 * against its model contract. Assign and summarize have separate chains
 * (ADR 0005), so a caller makes one driver per chain. An empty chain fails
 * every call (`ChainExhaustedError`); a caller that wants to skip a step
 * checks for an empty chain first.
 */
export function chainDriver(
  providers: readonly ResolvedProvider[],
  prompts: DriverPrompts,
  options: ChainOptions = {},
): ModelDriver {
  const versioned = (version: string | undefined): ChainOptions =>
    version === undefined ? options : { ...options, promptVersion: version };
  const missing = (task: string) => Promise.reject(new Error(`no ${task} prompt`));
  return {
    assign: (input) =>
      prompts.assign
        ? callChain(
            providers,
            prompts.assign(input),
            validAssign,
            versioned(prompts.versions?.assign),
          )
        : missing("assign"),
    summarize: (input) =>
      prompts.summarize
        ? callChain(
            providers,
            prompts.summarize(input),
            validSummarize,
            versioned(prompts.versions?.summarize),
          )
        : missing("summarize"),
  };
}

/** `Prompts` (one per task, each with its version) as a chain driver's prompts. */
export function driverPrompts(prompts: Prompts): DriverPrompts {
  const versions: NonNullable<DriverPrompts["versions"]> = {};
  const out: DriverPrompts = { versions };
  if (prompts.assign) {
    const p = prompts.assign;
    out.assign = (input) => p.messages(input);
    versions.assign = p.version;
  }
  if (prompts.summarize) {
    const p = prompts.summarize;
    out.summarize = (input) => p.messages(input);
    versions.summarize = p.version;
  }
  return out;
}

/** Accepts bare JSON or JSON wrapped in a Markdown code fence. */
export function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

export * from "./driver.ts";
export * from "./fake.ts";
export * from "./prompts.ts";
export * from "./summarize-prompt.ts";
