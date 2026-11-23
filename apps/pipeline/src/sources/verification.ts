/**
 * Verification-layer adapters (M1-08): sources read only to gather evidence
 * for a wave's 14-day review, never to find stories. They are the layer 3
 * of `source_groups` ("verification only, never yields echoes").
 *
 * By type they cannot produce echoes. What a verification adapter returns is
 * `Evidence`, which is not a `SourceItem`, and the adapter is not an
 * `Adapter`, so it cannot be put in `ADAPTERS` or handed to ingest. Each
 * guard is a field typed `never`: a value cannot fill a required field of
 * the other type with it, and adding that field with a real type later is a
 * compile error here. `verification.test.ts` proves both with
 * `@ts-expect-error`.
 *
 * Like an `Adapter`, it does not fetch: `urls` says what to fetch with
 * `fetchSource` (`http.ts`) and `parse` reads one body, pure and tested
 * against a fixture. Fetched content is data (invariant 6).
 */

/** What a review looks up, and over which days. */
export interface EvidenceQuery {
  /** The subject as the source names it: a Wikipedia article title. */
  subject: string;
  /** Epoch ms. The first and last UTC day are both included. */
  from: number;
  to: number;
}

/** The evidence kinds of `EvidenceSchema` (`@bd/contracts` desk.ts). */
export type EvidenceKind = "news" | "pageviews";

export interface Evidence {
  kind: EvidenceKind;
  /** Never an echo: `SourceItem.heat` is required, so `Evidence` is not one. */
  heat?: never;
}

export interface VerificationAdapter<E extends Evidence = Evidence> {
  /** Names the source in evidence records. Not a fetch group id. */
  sourceId: string;
  /** Never a fetch group: `Adapter.groupId` is required, so this is not an `Adapter`. */
  groupId?: never;
  format: "json" | "xml";
  urls(query: EvidenceQuery): readonly string[];
  /**
   * The evidence in one response body. Throws `ParseError` on a body it
   * cannot read at all; skips single entries it cannot use.
   */
  parse(body: string, url: string): E[];
}
