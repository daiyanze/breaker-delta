/**
 * Reachability probe for spike 2. Runs unchanged in a Worker and under Bun,
 * so the same targets can be tested from Workers egress and a home network.
 */

export interface ProbeTarget {
  groupId: string;
  url: string;
}

export interface ProbeResult {
  groupId: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  bytes: number;
  error: string | null;
}

const USER_AGENT = "BreakerDeltaProbe/0.1 (+https://breakerdelta.com)";

export async function probeOne(
  target: ProbeTarget,
  doFetch: typeof fetch = fetch,
): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await doFetch(target.url, {
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.arrayBuffer();
    return {
      groupId: target.groupId,
      url: target.url,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      bytes: body.byteLength,
      error: null,
    };
  } catch (err) {
    return {
      groupId: target.groupId,
      url: target.url,
      ok: false,
      status: null,
      ms: Date.now() - started,
      bytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function probeAll(
  targets: readonly ProbeTarget[],
  doFetch: typeof fetch = fetch,
): Promise<ProbeResult[]> {
  return Promise.all(targets.map((t) => probeOne(t, doFetch)));
}
