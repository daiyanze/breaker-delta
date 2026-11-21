/**
 * Which query layer the site reads, from configuration. Shared by the
 * Cloudflare and the local adapter so both behave the same. With
 * `READ_SOURCE=fixtures` the site reads `@bd/fixtures` (issue #162) and
 * `?set=` picks a set; otherwise it serves the placeholder. The database
 * query layer arrives with #57.
 */
import { createFixtureReadQueries, DEFAULT_FIXTURE_SET, isFixtureSetName } from "@bd/fixtures";
import { createSite } from "./core/site.ts";

export interface SiteVars {
  /** "fixtures" reads from `@bd/fixtures`. */
  READ_SOURCE?: string | undefined;
  /** Fixture set used when `?set=` is not given. */
  FIXTURE_SET?: string | undefined;
}

export function handle(request: Request, vars: SiteVars): Promise<Response> {
  if (vars.READ_SOURCE !== "fixtures") return createSite(() => null).fetch(request);
  const set = new URL(request.url).searchParams.get("set") ?? vars.FIXTURE_SET;
  const name = set ?? DEFAULT_FIXTURE_SET;
  if (!isFixtureSetName(name)) {
    return Promise.resolve(new Response("unknown fixture set", { status: 404 }));
  }
  return createSite(() => createFixtureReadQueries(name)).fetch(request);
}
