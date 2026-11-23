/**
 * Reading response bodies: JSON, and RSS 2.0, RSS 1.0 (RDF) and Atom feeds
 * (M1-04). Feeds are read with an XML parser, not patterns (L14).
 */
import { XMLParser } from "fast-xml-parser";
import { ParseError, type SourceItem } from "./adapter.ts";

export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new ParseError("body is not JSON");
  }
}

/** The objects in a JSON list; anything else in it is dropped. Not a list: []. */
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v),
  );
}

/** Epoch ms from an ISO 8601 or RFC 822 date, or null. */
export function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value.trim());
  return Number.isNaN(ms) ? null : ms;
}

/** Collapses runs of whitespace; titles from feeds often carry newlines. */
export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Prefixes are kept, so `<atom:link>` or `<media:title>` never stands in
  // for the RSS element of the same local name.
  removeNSPrefix: false,
  // Numeric character references (`&#8217;`, `&#x2014;`) are decoded only
  // with this on; WordPress feeds write apostrophes and dashes that way.
  htmlEntities: true,
  // Keep every value a string: a title "2026" stays a title.
  parseTagValue: false,
  parseAttributeValue: false,
  // Trimming would cut the space in `A &amp; <![CDATA[B]]>`; `cleanText` trims.
  trimValues: false,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

/** The text of an element that may carry attributes (`<title type="html">`). */
function textOf(v: unknown): string {
  if (Array.isArray(v)) return textOf(v[0]);
  if (isNode(v)) return cleanText(v["#text"]);
  return cleanText(v);
}

function list(v: unknown): Node[] {
  return Array.isArray(v) ? v.filter(isNode) : [];
}

/** Only absolute http(s) URLs are items: not `javascript:`, bare guids or relative paths. */
export function isWebUrl(s: string): boolean {
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * A source's own count (points, likes, views) as a number, or null. Some APIs
 * send counts as decimal strings (Mastodon's `uses`).
 */
export function count(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * The page for a path the source names by ID (`org/model`), on the source's
 * own site, or "" when the path is empty or holds `//` or `\\`, which a URL
 * parser may read as another host.
 */
export function pageUrl(origin: string, path: string): string {
  if (path === "" || path.includes("//") || path.includes("\\")) return "";
  try {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, origin);
    return url.origin === origin ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * What one feed reads beyond the standard elements. Element names are as
 * written in the feed, prefix included (`re:rank`).
 */
export interface FeedFields {
  /** Read as the title when an item has no `<title>` (Bluesky posts have only a description). */
  titleFallback?: string;
  /** The element holding the source's own count, as a decimal number (Stack Exchange's `re:rank`). */
  heat?: string;
}

function item(n: Node, url: string, date: unknown, fields: FeedFields): SourceItem | null {
  let title = textOf(n.title);
  if (title === "" && fields.titleFallback) title = textOf(n[fields.titleFallback]);
  if (!isWebUrl(url) || title === "") return null;
  const heat = fields.heat ? count(textOf(n[fields.heat])) : null;
  return { url, title, publishedAt: parseDate(textOf(date)), heat };
}

function rssItem(n: Node, fields: FeedFields): SourceItem | null {
  let url = textOf(n.link);
  const guid = n.guid;
  if (url === "" && isNode(guid) && guid["@_isPermaLink"] !== "false") url = textOf(guid);
  if (url === "" && typeof guid === "string") url = cleanText(guid);
  return item(n, url, n.pubDate ?? n["dc:date"], fields);
}

function atomEntry(n: Node, fields: FeedFields): SourceItem | null {
  const links = list(n.link);
  // No fallback to another rel: an `enclosure` or `replies` link is not the entry.
  const link = links.find((l) => (l["@_rel"] ?? "alternate") === "alternate");
  const url = cleanText(link?.["@_href"]);
  return item(n, url, n.published ?? n.updated, fields);
}

/** Items of an RSS 2.0, RSS 1.0 or Atom feed. Throws `ParseError` on anything else. */
export function parseFeed(body: string, fields: FeedFields = {}): SourceItem[] {
  let doc: unknown;
  try {
    doc = xml.parse(body);
  } catch {
    throw new ParseError("body is not XML");
  }
  if (!isNode(doc)) throw new ParseError("body is not XML");
  let items: (SourceItem | null)[];
  if (isNode(doc.rss)) {
    const channel = doc.rss.channel;
    items = list(isNode(channel) ? channel.item : undefined).map((n) => rssItem(n, fields));
  } else if (isNode(doc["rdf:RDF"])) {
    items = list(doc["rdf:RDF"].item).map((n) => rssItem(n, fields));
  } else if (isNode(doc.feed)) {
    items = list(doc.feed.entry).map((n) => atomEntry(n, fields));
  } else if (doc.feed === "") {
    // `<feed></feed>`: an Atom feed with no entries.
    items = [];
  } else {
    throw new ParseError("not an RSS, RDF or Atom feed");
  }
  return items.filter((i): i is SourceItem => i !== null);
}
