/**
 * Cloudflare adapter for bd-web (ADR 0018). With `READ_SOURCE=fixtures` the
 * front page reads from `@bd/fixtures` (issue #162), with no database;
 * `?set=` picks a fixture set. The database query layer arrives with #57.
 */
import { createFixtureReadQueries, DEFAULT_FIXTURE_SET, isFixtureSetName } from "@bd/fixtures";
import { createSite } from "../core/site.ts";

export interface Env {
  /** "fixtures" reads from `@bd/fixtures`. */
  READ_SOURCE?: string;
  /** Fixture set used when `?set=` is not given. */
  FIXTURE_SET?: string;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (env.READ_SOURCE !== "fixtures") return createSite(() => null).fetch(request);
    const set = new URL(request.url).searchParams.get("set") ?? env.FIXTURE_SET;
    const name = set ?? DEFAULT_FIXTURE_SET;
    if (!isFixtureSetName(name)) {
      return Promise.resolve(new Response("unknown fixture set", { status: 404 }));
    }
    return createSite(() => createFixtureReadQueries(name)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
