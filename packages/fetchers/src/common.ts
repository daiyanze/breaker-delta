// Shared HTTP helpers for fetchers, ported from
// radar/fetchers/common.py.
//
// Every fetcher returns {source, layer, status, items, note}; a
// candidate is {source, name, url, metrics, detail}. Fetchers never
// throw at their callers: failures become status "missing" (scan.ts
// also guards, like Python's run_scan).
//
// One forced difference from Python: fetch is async, so getJson /
// getText / fetchFeedBundle (and every fetcher's fetch) return
// Promises here.

import { gunzipSync } from "node:zlib";
import type { CandidateItem, SourceResult } from "@breaker-delta/core";
import { findPath, findText, findAll, iter, parseXml, XmlParseError } from "./xml.js";

export type { CandidateItem, SourceResult };
export { XmlParseError };

export const USER_AGENT = "triple-sigma/0.5.1 (+https://github.com/daiyanze/triple-sigma)";
export const TIMEOUT = 25; // seconds, as in Python
const TIMEOUT_MS = TIMEOUT * 1000;

export const ATOM = "{http://www.w3.org/2005/Atom}";

export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchError";
  }
}

async function readBodyBytes(resp: FetchResponse): Promise<Uint8Array> {
  const buf = new Uint8Array(await resp.arrayBuffer());
  // Node fetch transparently decodes a *labelled* gzip/deflate body.
  // Python also decodes when the server sends gzip bytes without (or
  // despite) the header — DeepMind's blog does this — so check the
  // magic bytes on whatever arrived, like _read_body does.
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return gunzipSync(buf);
    } catch {
      return buf;
    }
  }
  return buf;
}

async function fetchBytes(url: string, headers?: Record<string, string>): Promise<Uint8Array> {
  let resp: FetchResponse;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...(headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!resp.ok) {
    // urllib raises HTTPError for non-2xx; mirror that as FetchError.
    // The body must be drained first: leaving an unread body on a
    // keep-alive socket makes undici's parser assert and kills the
    // process (seen live against Reddit's 403 pages). Python reads
    // the error body as part of raising, so draining is also the
    // faithful behaviour.
    try {
      await resp.arrayBuffer();
    } catch {
      // A truncated error body is still an HTTP error, not a new one.
    }
    throw new FetchError(`${url}: HTTP ${resp.status}`);
  }
  try {
    return await readBodyBytes(resp);
  } catch (err) {
    throw new FetchError(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const bytes = await fetchBytes(url, headers);
  try {
    // Python decodes utf-8 strictly here; a decode failure is a
    // FetchError ("missing"), not mojibake.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** POST a JSON body and parse the JSON response (Product Hunt's
 *  GraphQL route builds its request by hand in the Python code;
 *  this is the shared equivalent). Raises FetchError on any failure. */
export async function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<unknown> {
  let resp: FetchResponse;
  try {
    resp = await fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "User-Agent": USER_AGENT, ...(headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!resp.ok) throw new FetchError(`${url}: HTTP ${resp.status}`);
  try {
    const bytes = await readBodyBytes(resp);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (err) {
    throw new FetchError(`${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getText(url: string): Promise<string> {
  const bytes = await fetchBytes(url);
  // Python: decode("utf-8", errors="replace").
  return new TextDecoder("utf-8").decode(bytes);
}

export interface FeedDef {
  name?: string;
  url: string;
  [key: string]: unknown;
}

/**
 * Parse an RSS 2.0 or Atom feed into normalized candidates
 * (common.parse_feed). Raises XmlParseError on bad XML.
 */
export function parseFeed(
  xmlText: string,
  source: string,
  outlet: string,
  limit = 5,
): CandidateItem[] {
  const items: CandidateItem[] = [];
  const root = parseXml(xmlText);
  const nodes = findPath(root, "channel", "item");
  if (nodes.length > 0) {
    for (const node of nodes.slice(0, limit)) {
      const title = (findText(node, "title") ?? "").trim();
      const link = (findText(node, "link") ?? "").trim();
      if (!title || !link) continue;
      items.push({
        source,
        name: title,
        url: link,
        metrics: { outlet, published: findText(node, "pubDate") },
        detail: "",
      });
    }
    return items;
  }
  for (const node of iter(root, `${ATOM}entry`)) {
    const title = (findText(node, `${ATOM}title`) ?? "").trim();
    let link = "";
    for (const linkEl of findAll(node, `${ATOM}link`)) {
      const rel = linkEl.attrs["rel"] ?? null;
      if (rel === null || rel === "alternate") {
        link = linkEl.attrs["href"] ?? "";
        break;
      }
    }
    if (!title || !link) continue;
    const published = findText(node, `${ATOM}published`) || findText(node, `${ATOM}updated`);
    items.push({
      source,
      name: title,
      url: link,
      metrics: { outlet, published },
      detail: "",
    });
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * Fetch a configured list of RSS/Atom feeds as ONE source
 * (common.fetch_feed_bundle). Per-feed failures are reported in the
 * note, never hidden.
 */
export async function fetchFeedBundle(
  source: string,
  layer: number,
  feeds: FeedDef[],
  perFeed = 5,
): Promise<SourceResult> {
  const items: CandidateItem[] = [];
  const failed: string[] = [];
  for (const feed of feeds) {
    try {
      const text = await getText(feed.url);
      items.push(...parseFeed(text, source, feed.name ?? feed.url, perFeed));
    } catch (err) {
      if (err instanceof FetchError || err instanceof XmlParseError) {
        failed.push(feed.name ?? feed.url);
      } else {
        throw err;
      }
    }
  }
  if (items.length === 0) {
    return missing(source, layer, `all feeds failed: ${failed.join(", ")}`);
  }
  const note = failed.length > 0 ? `failed feeds: ${failed.join(", ")}` : "";
  return ok(source, layer, items, note);
}

export function missing(source: string, layer: number, note: string): SourceResult {
  return { source, layer, status: "missing", items: [], note };
}

export function ok(
  source: string,
  layer: number,
  items: CandidateItem[],
  note = "",
): SourceResult {
  return { source, layer, status: "ok", items, note };
}
