/**
 * Spike 2, home-network half: probe every target from this machine.
 * Usage: bun run probe            (table)
 *        bun run probe -- --json  (JSON, to diff against the Worker's /__probe)
 */
import { PROBE_TARGETS } from "../apps/pipeline/src/sources/probe-targets.ts";
import { probeAll } from "../apps/pipeline/src/sources/probe.ts";

const results = await probeAll(PROBE_TARGETS);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.table(
    results.map((r) => ({
      group: r.groupId,
      ok: r.ok,
      status: r.status ?? "-",
      ms: r.ms,
      bytes: r.bytes,
      error: r.error ?? "",
    })),
  );
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} reachable from this network.`);
}
