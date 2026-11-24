/**
 * Fixture sources (#36): a `fetch` that answers each fetch group's first URL
 * with that group's recorded fixture (`src/sources/fixtures/<group>.<format>`,
 * scrubbed when recorded, so no fetched text) and every other URL with 404.
 * verify-local runs the pipeline on it, so driving local mode fetches
 * nothing real (invariant 6) and works offline.
 *
 * A 404 is not retried (`fetchSource`), so a bundle's other members fail at
 * once and the group still counts as fetched through its first URL.
 *
 * Reading the files is the adapter's part: `read` is given the fixture's
 * file name and returns its text, or null when there is none.
 */
import type { Adapter } from "../sources/adapter.ts";
import { ADAPTERS } from "../sources/adapters/index.ts";
import { LAUNCH_GROUPS, type LaunchGroup } from "../sources/launch-groups.ts";

export function fixtureFetch(
  read: (file: string) => string | null,
  now: () => number,
  groups: readonly LaunchGroup[] = LAUNCH_GROUPS,
  adapters: Readonly<Record<string, Adapter>> = ADAPTERS,
): typeof fetch {
  const answer = async (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    for (const group of groups) {
      const adapter = adapters[group.id];
      if (!adapter || adapter.urls(group, now())[0] !== url) continue;
      const body = read(`${group.id}.${adapter.format}`);
      if (body === null) break;
      const type = adapter.format === "json" ? "application/json" : "application/xml";
      return new Response(body, { status: 200, headers: { "content-type": type } });
    }
    return new Response("no fixture", { status: 404 });
  };
  return answer as typeof fetch;
}
