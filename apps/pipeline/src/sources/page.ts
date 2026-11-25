/**
 * One evidence page for the enrich step (#45): fetch an echo's URL once,
 * read at most `maxBytes` of its body, and keep at most `maxChars` of its
 * visible text. The budgets are parameters; the step reads them from
 * settings (invariant 9).
 *
 * Echo URLs are links third parties chose, and local mode runs on the
 * owner's machine, so only public hosts are fetched (`isPublicHost`):
 * no localhost or single-label names, no `.local`, `.internal`, `.lan` or
 * `.home.arpa`, and no loopback, private, link-local, shared, multicast or
 * unspecified IP literal. Redirects are followed here, not by `fetch`, so
 * every hop is checked before it is fetched, at most `MAX_REDIRECTS` of
 * them. Not covered: a public name whose DNS answer is a private address
 * (no portable resolver in both runtimes).
 *
 * The text is for a tool-less model call only (invariant 6). It never
 * throws, and a failure is described in this file's own words (a status, an
 * error class, a media type), never with text from the response.
 *
 * HTML is read with a small scanner, not a parser: the result is plain text
 * for a model, so markup it misreads costs a few stray words, not a wrong
 * decision. It runs in linear time, drops the head, scripts, styles,
 * comments, navigation, asides and footers, puts block elements on lines of
 * their own and decodes character references. A comment, tag or skipped
 * element that is never closed ends the text. The head's text is dropped
 * until `</head>` or a `<body>` tag; its scripts, styles and title are
 * skipped as elements first, so a `<body>` written inside them does not end
 * it. The charset is the one the
 * `content-type` header names, else UTF-8; a `<meta charset>` is not read.
 */
import { USER_AGENT } from "./http.ts";
import { isWebUrl } from "./parse.ts";

export interface PageOptions {
  /** Milliseconds for the one attempt, reading the body included. */
  timeoutMs: number;
  /** Bytes of the body read at most; the rest is not downloaded. */
  maxBytes: number;
  /** Characters of text kept at most. */
  maxChars: number;
  fetch?: typeof fetch;
}

export type PageResult = { ok: true; text: string } | { ok: false; error: string };

/** Elements whose content is not the page's text. */
const SKIP = new Set([
  "title",
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "object",
  "canvas",
  "nav",
  "aside",
  "footer",
]);

/** Elements that start a new line. */
const BLOCK = new Set([
  "address",
  "article",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  middot: "·",
  bull: "•",
};

function codePoint(n: number): string {
  const ok = n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff);
  return ok ? String.fromCodePoint(n) : "�";
}

/** Decodes numeric references and the common named ones; an unknown name stays as written. */
function decode(text: string): string {
  return text.replace(
    /&(#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,8}|[a-zA-Z]{2,8});/g,
    (all, ref: string) => {
      if (ref.startsWith("#x") || ref.startsWith("#X"))
        return codePoint(Number.parseInt(ref.slice(2), 16));
      if (ref.startsWith("#")) return codePoint(Number.parseInt(ref.slice(1), 10));
      return NAMED[ref] ?? all;
    },
  );
}

/** Trims each line, collapses spaces, drops empty lines. */
function tidy(text: string): string {
  return text
    .split(/\r?\n|\r/)
    .map((line) => line.replace(/[\s ]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

/** The index of `</name` from `from`, any case, or -1. */
function closingTag(html: string, name: string, from: number): number {
  const re = new RegExp(`</${name}(?=[\\s/>])`, "gi");
  re.lastIndex = from;
  return re.exec(html)?.index ?? -1;
}

/**
 * The index just past the `>` ending the tag that starts at `from`, skipping
 * quoted values; -1 when unclosed. A quote opens a value only right after
 * `=` (spaces allowed), so `alt=it's` does not.
 */
function tagEnd(html: string, from: number): number {
  let quote = "";
  let afterEquals = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i] ?? "";
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === ">") return i + 1;
    if ((c === '"' || c === "'") && afterEquals) quote = c;
    if (c === "=") afterEquals = true;
    else if (!/\s/.test(c)) afterEquals = false;
  }
  return -1;
}

/** The visible text of an HTML document, one block per line. */
export function htmlText(html: string): string {
  const out: string[] = [];
  let text = "";
  const flush = (newline: boolean) => {
    if (text) out.push(decode(text));
    text = "";
    if (newline) out.push("\n");
  };
  // Inside the head, text is dropped; `</head>` may be left out (HTML), so a
  // `<body>` tag ends it too.
  let inHead = false;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      if (!inHead) text += html.slice(i);
      break;
    }
    if (!inHead) text += html.slice(i, lt);
    const next = html[lt + 1] ?? "";
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    if (!/[a-zA-Z/!?]/.test(next)) {
      if (!inHead) text += "<";
      i = lt + 1;
      continue;
    }
    const end = tagEnd(html, lt + 1);
    if (end === -1) break;
    const closing = next === "/";
    const name = (
      /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40))?.[1] ?? ""
    ).toLowerCase();
    i = end;
    if (name === "head") inHead = !closing;
    else if (name === "body" && !closing) inHead = false;
    if (!closing && SKIP.has(name) && html[end - 2] !== "/") {
      const close = closingTag(html, name, end);
      if (close === -1) break;
      const after = tagEnd(html, close + 1);
      if (after === -1) break;
      i = after;
      flush(true);
      continue;
    }
    if (BLOCK.has(name)) flush(true);
  }
  flush(false);
  return tidy(out.join(""));
}

/** `type/subtype` of a content-type header, lower-case, or null. */
function mediaType(contentType: string | null): string | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) ? type : null;
}

function isHtml(type: string | null): boolean {
  return type === null || type === "text/html" || type === "application/xhtml+xml";
}

/** Cuts `text` to `max` UTF-16 units without leaving half a surrogate pair. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

/**
 * The text of a body by its content type, at most `maxChars`: HTML (or no
 * type) through `htmlText`, `text/plain` tidied. Null for any other type, or
 * when there is no text.
 */
export function pageText(
  body: string,
  contentType: string | null,
  maxChars: number,
): string | null {
  const type = mediaType(contentType);
  let text: string;
  if (isHtml(type)) text = htmlText(body);
  else if (type === "text/plain") text = tidy(body);
  else return null;
  text = cut(text, maxChars).trim();
  return text === "" ? null : text;
}

function decoder(contentType: string | null): TextDecoder {
  const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? "")?.[1];
  try {
    // Bun's types list a few labels; the runtimes accept every WHATWG one.
    return new TextDecoder((charset ?? "utf-8") as "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

/** The first `maxBytes` of a body; the rest is cancelled, not downloaded. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.byteLength;
  }
  if (total >= maxBytes) await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let at = 0;
  for (const part of parts) {
    const take = part.subarray(0, bytes.length - at);
    bytes.set(take, at);
    at += take.length;
    if (at >= bytes.length) break;
  }
  return bytes;
}

/** Redirect hops followed at most: a protocol limit, like `fetch`'s own, not a budget. */
const MAX_REDIRECTS = 5;

/** `a.b.c.d` as four numbers, or null. The URL parser has already normalised other IPv4 forms. */
function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return m ? m.slice(1).map(Number) : null;
}

function publicIpv4([a = 0, b = 0]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this net, private, loopback, multicast, reserved
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // shared (carrier NAT)
  return true;
}

/** An IPv6 literal (without brackets) as eight 16-bit groups, or null. */
function ipv6(host: string): number[] | null {
  let text = host;
  // A dotted IPv4 tail (`::ffff:1.2.3.4`) becomes two groups.
  const tail = /:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail?.[1]) {
    const v4 = ipv4(tail[1]);
    if (!v4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    text = `${text.slice(0, tail.index)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string | undefined) =>
    part ? part.split(":").map((g) => Number.parseInt(g, 16)) : [];
  const head = parse(halves[0]);
  const rest = parse(halves[1]);
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const groups = [...head, ...Array<number>(Math.max(0, fill)).fill(0), ...rest];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

function publicIpv6(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, , g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // Forms that embed an IPv4 address, refused outright rather than read:
  if (zero(0, 6)) return false; // ::/96: ::, ::1 and IPv4-compatible ::a.b.c.d
  if (zero(0, 4) && g4 === 0xffff && g5 === 0) return false; // IPv4-translated ::ffff:0:a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && (g2 === 1 || zero(2, 6))) return false; // NAT64 /96, local-use /48
  if ((g0 & 0xffc0) === 0xfec0) return false; // deprecated site-local
  if ((g0 & 0xfe00) === 0xfc00) return false; // unique local
  if ((g0 & 0xffc0) === 0xfe80) return false; // link-local
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  if (g.slice(0, 5).every((x) => x === 0) && g5 === 0xffff) {
    return publicIpv4([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]); // IPv4-mapped
  }
  return true;
}

/** Names that only mean something on the local machine or network. */
const LOCAL_NAME = /(^|\.)(localhost|local|internal|lan|home\.arpa)$/;

/** Whether a URL's host is one enrich may fetch: a public name or address. */
export function isPublicHost(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) {
    const groups = ipv6(host.slice(1, -1));
    return groups !== null && publicIpv6(groups);
  }
  const v4 = ipv4(host);
  if (v4) return publicIpv4(v4);
  if (!host.includes(".") || LOCAL_NAME.test(host)) return false;
  return true;
}

/** Why a URL may not be fetched, or null when it may. */
function refusal(url: string): string | null {
  if (!isWebUrl(url)) return "not a web URL";
  return isPublicHost(new URL(url)) ? null : "not a public host";
}

function errorName(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

export async function fetchPage(url: string, opts: PageOptions): Promise<PageResult> {
  const doFetch = opts.fetch ?? fetch;
  // One timeout for the whole chain of hops, the body included.
  const signal = AbortSignal.timeout(opts.timeoutMs);
  try {
    let current = url;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const refused = refusal(current);
      if (refused) return { ok: false, error: refused };
      const answer = await doFetch(current, {
        headers: { "user-agent": USER_AGENT, accept: "text/html, text/plain;q=0.9" },
        signal,
        redirect: "manual",
      });
      if (![301, 302, 303, 307, 308].includes(answer.status)) {
        res = answer;
        break;
      }
      await answer.body?.cancel().catch(() => {});
      const location = answer.headers.get("location");
      if (!location) return { ok: false, error: "redirect without a location" };
      try {
        current = new URL(location, current).href;
      } catch {
        return { ok: false, error: "not a web URL" };
      }
    }
    if (!res) return { ok: false, error: "too many redirects" };
    const contentType = res.headers.get("content-type");
    const type = mediaType(contentType);
    if (!res.ok || !(isHtml(type) || type === "text/plain")) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, error: res.ok ? `no text (${type ?? "other"})` : `HTTP ${res.status}` };
    }
    const body = decoder(contentType).decode(await readCapped(res, opts.maxBytes));
    const text = pageText(body, contentType, opts.maxChars);
    return text === null ? { ok: false, error: "no text" } : { ok: true, text };
  } catch (err) {
    return { ok: false, error: errorName(err) };
  }
}
