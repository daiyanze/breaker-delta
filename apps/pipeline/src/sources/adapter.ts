/**
 * Source adapters (M1-04). An adapter knows one fetch group's URLs and how
 * to read that group's responses. It does not fetch: the scan step fetches
 * with `fetchSource` (`http.ts`) and stores the raw bodies, and ingest calls
 * `parse` on them. So `parse` is pure (no IO, no clock) and is tested
 * against a fixture file.
 *
 * Fetched content is data (invariant 6): what `parse` returns is only ever
 * stored and passed to tool-less model calls.
 */
import type { LaunchGroup } from "./launch-groups.ts";

/** One item as a source lists it. Ingest normalises the URL with `normaliseUrl` from `@bd/core` (M1-09). */
export interface SourceItem {
  url: string;
  title: string;
  /** Epoch ms, or null when the source gives no usable date. */
  publishedAt: number | null;
  /** The source's own popularity count (points, score, stars), or null when it has none. */
  heat: number | null;
}

export interface Adapter {
  groupId: string;
  /** What `parse` reads, and how a recorded fixture is scrubbed. */
  format: "json" | "xml";
  /**
   * URLs to fetch in one scan. A bundle group returns one per member. `now`
   * (epoch ms) is the scan's time, for sources whose URL names a date.
   *
   * Each URL is fetched and parsed on its own, so one member of a bundle
   * that fails (a fetch error, or `parse` throwing) does not stop the rest:
   * its items are missing, the other members' are kept. The group is missing
   * from a scan only when every one of its URLs failed; when some failed,
   * the scan result names them in its error.
   */
  urls(group: LaunchGroup, now: number): readonly string[];
  /**
   * The items in one response body. Throws `ParseError` on a body it cannot
   * read at all; skips single items that lack a URL or a title.
   */
  parse(body: string, url: string): SourceItem[];
}

export class ParseError extends Error {
  override name = "ParseError";
}
