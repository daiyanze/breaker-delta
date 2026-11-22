/**
 * Record a test fixture for one fetch group's adapter (M1-04).
 *
 * Usage: bun run record-fixture <groupId>
 *
 * Fetches the adapter's first URL, scrubs the body (`scrub.ts`: shape kept,
 * words replaced) and writes `apps/pipeline/src/sources/fixtures/<groupId>.<json|xml>`.
 * It prints the path, sizes and how many items the adapter reads from the
 * fixture, never the content: fetched text stays out of a coding session
 * (invariant 6). Read the scrubbed file before committing it.
 */
import { join } from "node:path";
import { ADAPTERS } from "../apps/pipeline/src/sources/adapters/index.ts";
import { fetchSource } from "../apps/pipeline/src/sources/http.ts";
import { LAUNCH_GROUPS } from "../apps/pipeline/src/sources/launch-groups.ts";
import { scrubJson, scrubXml } from "../apps/pipeline/src/sources/scrub.ts";

const MAX_ITEMS = 5;

const groupId = process.argv[2];
const adapter = groupId ? ADAPTERS[groupId] : undefined;
const group = LAUNCH_GROUPS.find((g) => g.id === groupId);
if (!adapter || !group) {
  console.error(`usage: bun run record-fixture <groupId>; groups with an adapter:`);
  console.error(Object.keys(ADAPTERS).join(", "));
  process.exit(2);
}

const [url] = adapter.urls(group);
if (!url) {
  console.error(`${groupId}: the adapter lists no URL`);
  process.exit(1);
}
const res = await fetchSource(url, { timeoutMs: 15_000, retries: 2, retryDelayMs: 1_000 });
if (!res.ok) {
  console.error(`${groupId}: fetch failed after ${res.attempts} attempt(s): ${res.error}`);
  process.exit(1);
}

const scrubbed =
  adapter.format === "json" ? scrubJson(res.body, MAX_ITEMS) : scrubXml(res.body, MAX_ITEMS);
const items = adapter.parse(scrubbed, url);
const path = join(
  import.meta.dir,
  "../apps/pipeline/src/sources/fixtures",
  `${groupId}.${adapter.format}`,
);
await Bun.write(path, scrubbed);
console.log(
  `${path}: ${res.body.length} chars fetched, ${scrubbed.length} written, ${items.length} item(s) parsed`,
);
