/**
 * Wikipedia pageviews (`wikipedia_pageviews`): daily views of one English
 * Wikipedia article, from the Wikimedia pageviews API's per-article
 * endpoint. It is the attention evidence for the 14-day review (Google
 * Trends has no free official API, #24). Only views by people are asked
 * for (`agent=user`), not crawlers or automated traffic.
 *
 * Not the `wikipedia` discovery adapter, which reads the daily most-read
 * list and yields echoes; this one yields evidence only.
 */
import { ParseError } from "../adapter.ts";
import { articleUrl } from "../adapters/wikipedia.ts";
import { cleanText, count, parseJson, records } from "../parse.ts";
import type { Evidence, VerificationAdapter } from "../verification.ts";

export interface PageviewsEvidence extends Evidence {
  kind: "pageviews";
  /** The article as the API names it, with underscores for spaces. */
  article: string;
  /** The article's page on English Wikipedia. */
  url: string;
  /** The UTC day the views were counted, epoch ms at 00:00. */
  day: number;
  views: number;
}

const API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia";

/** `20261123` for a time on 2026-11-23 UTC. */
const yyyymmdd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");

/** `2026112300` (the API's daily timestamp) as epoch ms, or null. */
function dayOf(value: unknown): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})00$/.exec(cleanText(value));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  // Refuses `20261132` rather than rolling it over into December.
  return new Date(ms).getUTCDate() === d ? ms : null;
}

function entry(e: Record<string, unknown>): PageviewsEvidence | null {
  if (e.granularity !== "daily") return null;
  const article = cleanText(e.article);
  const day = dayOf(e.timestamp);
  const views = count(e.views);
  if (article === "" || day === null || views === null) return null;
  const url = articleUrl(article);
  if (url === "") return null;
  return { kind: "pageviews", article, url, day, views };
}

export const wikipediaPageviews: VerificationAdapter<PageviewsEvidence> = {
  sourceId: "wikipedia_pageviews",
  format: "json",
  urls({ subject, from, to }) {
    const article = subject.trim().replaceAll(" ", "_");
    if (article === "" || !Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
    // The title is one path segment: `/` is escaped too (`AC%2FDC`).
    const title = encodeURIComponent(article);
    return [`${API}/all-access/user/${title}/daily/${yyyymmdd(from)}/${yyyymmdd(to)}`];
  },
  parse(body) {
    const data = parseJson(body) as Record<string, unknown> | null;
    if (!Array.isArray(data?.items)) {
      throw new ParseError("wikipedia_pageviews: expected { items: [...] }");
    }
    return records(data.items)
      .map(entry)
      .filter((e): e is PageviewsEvidence => e !== null);
  },
};
