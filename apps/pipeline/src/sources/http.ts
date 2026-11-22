/**
 * The one way adapters' URLs are fetched (M1-04): a user agent, a timeout
 * per attempt, and retries with backoff on errors that may pass (network
 * errors, timeouts, 429 and 5xx). Other statuses fail at once.
 *
 * It never throws: every outcome is a `FetchResult`, so one failing URL
 * cannot stop a scan. The budgets are parameters; the scan step reads them
 * from settings (invariant 9).
 */

export const USER_AGENT = "BreakerDelta/0.1 (+https://breakerdelta.com)";

export interface FetchOptions {
  /** Milliseconds per attempt, including reading the body. */
  timeoutMs: number;
  /** Attempts after the first one. 0 = no retry. */
  retries: number;
  /** Wait before the first retry; doubled before each next one. */
  retryDelayMs: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export type FetchResult =
  | {
      ok: true;
      url: string;
      status: number;
      contentType: string | null;
      body: string;
      attempts: number;
    }
  | { ok: false; url: string; status: number | null; error: string; attempts: number };

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Worth another attempt: the source may answer next time. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchSource(url: string, opts: FetchOptions): Promise<FetchResult> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? sleepFor;
  let attempts = 0;
  let last: { status: number | null; error: string } = { status: null, error: "not fetched" };
  while (attempts <= opts.retries) {
    if (attempts > 0) await sleep(opts.retryDelayMs * 2 ** (attempts - 1));
    attempts++;
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "*/*" },
        signal: AbortSignal.timeout(opts.timeoutMs),
        redirect: "follow",
      });
      const body = await res.text();
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        return { ok: true, url, status: res.status, contentType, body, attempts };
      }
      last = { status: res.status, error: `HTTP ${res.status}` };
      if (!retryable(res.status)) break;
    } catch (err) {
      last = { status: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: false, url, ...last, attempts };
}
