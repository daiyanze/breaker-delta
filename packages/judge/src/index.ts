/**
 * Model provider chain. One protocol: OpenAI-compatible chat completions.
 * Calls have no tools. Output is JSON that the caller validates.
 * See docs/adr/0005-model-provider-chain.md.
 */

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

export interface ChainResult<T> {
  value: T;
  provider: string;
  model: string;
  /** True when the first answer was invalid and the retry succeeded. */
  repaired: boolean;
}

export interface Attempt {
  provider: string;
  error: string;
}

export class ChainExhaustedError extends Error {
  readonly attempts: Attempt[];
  constructor(attempts: Attempt[]) {
    super(`all providers failed: ${attempts.map((a) => `${a.provider}: ${a.error}`).join("; ")}`);
    this.name = "ChainExhaustedError";
    this.attempts = attempts;
  }
}

export interface ChainOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
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
  for (const provider of providers) {
    try {
      const first = await complete(provider, messages, options);
      const v1 = validate(parseJson(first));
      if (v1.ok) {
        return { value: v1.value, provider: provider.name, model: provider.model, repaired: false };
      }
      const retry: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: first },
        {
          role: "user",
          content: `Your previous output was invalid: ${v1.error}\nReturn only the corrected JSON.`,
        },
      ];
      const second = await complete(provider, retry, options);
      const v2 = validate(parseJson(second));
      if (v2.ok) {
        return { value: v2.value, provider: provider.name, model: provider.model, repaired: true };
      }
      attempts.push({ provider: provider.name, error: `invalid after repair: ${v2.error}` });
    } catch (err) {
      attempts.push({
        provider: provider.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw new ChainExhaustedError(attempts);
}

async function complete(
  provider: ResolvedProvider,
  messages: readonly ChatMessage[],
  options: ChainOptions,
): Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;
  const res = await doFetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: provider.model, messages, temperature: 0 }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) throw new Error("empty completion");
  return content;
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
