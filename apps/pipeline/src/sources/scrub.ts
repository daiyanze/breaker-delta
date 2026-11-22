/**
 * Scrubbing a recorded response into a test fixture (M1-04).
 *
 * Fixtures never hold fetched text (AGENTS.md), so a recording keeps a
 * response's shape and replaces its words: every string becomes a
 * placeholder unless it is a date or a number, URLs become example URLs,
 * and long lists are cut to `maxItems`. Keys, tag and attribute names, and
 * numbers are kept: they are what an adapter reads.
 */
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { ParseError } from "./adapter.ts";
import { parseJson } from "./parse.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const RFC822_DATE =
  /^([A-Z][a-z]{2}, )?\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}(:\d{2})? ([A-Z]{1,4}|[+-]\d{4})$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
// No dots: a host name (`domain="news.example.org"`) is not vocabulary.
const TOKEN = /^[A-Za-z][\w/+-]{0,39}$/;

/** Numbers the placeholders, so each scrubbed string is distinct and stable. */
class Scrubber {
  private n = 0;
  constructor(private readonly maxItems: number) {}

  string(s: string): string {
    const t = s.trim();
    if (t === "" || ISO_DATE.test(t) || RFC822_DATE.test(t) || NUMBER.test(t)) return s;
    if (t === "true" || t === "false") return s;
    this.n++;
    return /^https?:\/\//.test(t) ? `https://example.com/item/${this.n}` : `text ${this.n}`;
  }

  /**
   * Attribute values are mostly vocabulary an adapter reads (`rel="alternate"`,
   * `type="html"`, `isPermaLink="false"`), so a single token is kept. URLs and
   * anything with spaces are scrubbed; namespace URIs are kept.
   */
  attr(name: string, value: string): string {
    if (name.startsWith("@_xmlns")) return value;
    return TOKEN.test(value) ? value : this.string(value);
  }

  json(v: unknown): unknown {
    if (typeof v === "string") return this.string(v);
    if (Array.isArray(v)) return v.slice(0, this.maxItems).map((x) => this.json(x));
    if (typeof v === "object" && v !== null) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.json(x)]));
    }
    return v;
  }

  /** One `preserveOrder` children list: at most `maxItems` elements per tag name. */
  xml(children: unknown[]): unknown[] {
    const seen = new Map<string, number>();
    const out: unknown[] = [];
    for (const child of children) {
      if (typeof child !== "object" || child === null) continue;
      const entry: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(child)) {
        if (key === ":@") {
          const attrs = value as Record<string, unknown>;
          entry[key] = Object.fromEntries(
            Object.entries(attrs).map(([a, x]) => [a, typeof x === "string" ? this.attr(a, x) : x]),
          );
        } else if (key === "#text") {
          entry[key] = typeof value === "string" ? this.string(value) : value;
        } else if (key.startsWith("?")) {
          entry[key] = value; // processing instruction: `<?xml ...?>`
        } else {
          const count = (seen.get(key) ?? 0) + 1;
          seen.set(key, count);
          if (count > this.maxItems) break;
          entry[key] = Array.isArray(value) ? this.xml(value) : value;
        }
      }
      if (Object.keys(entry).some((k) => k !== ":@")) out.push(entry);
    }
    return out;
  }
}

export function scrubJson(body: string, maxItems: number): string {
  const scrubbed = new Scrubber(maxItems).json(parseJson(body));
  return `${JSON.stringify(scrubbed, null, 2)}\n`;
}

const ORDERED = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  // Kept as text, so the builder writes it back escaped instead of as CDATA.
  cdataPropName: false,
  commentPropName: false,
  trimValues: true,
} as const;

export function scrubXml(body: string, maxItems: number): string {
  let doc: unknown;
  try {
    doc = new XMLParser(ORDERED).parse(body);
  } catch {
    throw new ParseError("body is not XML");
  }
  const isElement = (n: unknown) =>
    typeof n === "object" && n !== null && Object.keys(n).some((k) => !k.startsWith("?"));
  if (!Array.isArray(doc) || !doc.some(isElement)) throw new ParseError("body is not XML");
  const scrubbed = new Scrubber(maxItems).xml(doc);
  const built: string = new XMLBuilder({ ...ORDERED, format: true, indentBy: "  " }).build(
    scrubbed,
  );
  return built.endsWith("\n") ? built : `${built}\n`;
}
