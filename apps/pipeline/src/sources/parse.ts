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
  // `dc:date` -> `date`, `rdf:RDF` -> `RDF`, `atom:link` -> `link`.
  removeNSPrefix: true,
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

function item(url: string, title: string, date: unknown): SourceItem | null {
  if (url === "" || title === "") return null;
  return { url, title, publishedAt: parseDate(textOf(date)), heat: null };
}

function rssItem(n: Node): SourceItem | null {
  let url = textOf(n.link);
  const guid = n.guid;
  if (url === "" && isNode(guid) && guid["@_isPermaLink"] !== "false") url = textOf(guid);
  if (url === "" && typeof guid === "string") url = cleanText(guid);
  return item(url, textOf(n.title), n.pubDate ?? n.date);
}

function atomEntry(n: Node): SourceItem | null {
  const links = list(n.link);
  const link = links.find((l) => (l["@_rel"] ?? "alternate") === "alternate") ?? links[0];
  const url = cleanText(link?.["@_href"]);
  return item(url, textOf(n.title), n.published ?? n.updated);
}

/** Items of an RSS 2.0, RSS 1.0 or Atom feed. Throws `ParseError` on anything else. */
export function parseFeed(body: string): SourceItem[] {
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
    items = list(isNode(channel) ? channel.item : undefined).map(rssItem);
  } else if (isNode(doc.RDF)) {
    items = list(doc.RDF.item).map(rssItem);
  } else if (isNode(doc.feed)) {
    items = list(doc.feed.entry).map(atomEntry);
  } else if (doc.feed === "") {
    // `<feed></feed>`: an Atom feed with no entries.
    items = [];
  } else {
    throw new ParseError("not an RSS, RDF or Atom feed");
  }
  return items.filter((i): i is SourceItem => i !== null);
}
