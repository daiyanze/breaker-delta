/**
 * One evidence page for the enrich step (#45): fetch an echo's URL once,
 * read at most `maxBytes` of its body, and keep at most `maxChars` of its
 * visible text. The budgets are parameters; the step reads them from
 * settings (invariant 9).
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
 * element that is never closed ends the text. The charset is the one the
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
  "head",
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

/** The index just past the `>` ending the tag that starts at `from`, skipping quoted values; -1 when unclosed. */
function tagEnd(html: string, from: number): number {
  let quote = "";
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i + 1;
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
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, lt);
    const next = html[lt + 1] ?? "";
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    if (!/[a-zA-Z/!?]/.test(next)) {
      text += "<";
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
    if (!closing && SKIP.has(name) && html[end - 2] !== "/") {
      const close = closingTag(html, name, end);
      if (close === -1) break;
      const after = tagEnd(html, close + 2);
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

function errorName(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

export async function fetchPage(url: string, opts: PageOptions): Promise<PageResult> {
  if (!isWebUrl(url)) return { ok: false, error: "not a web URL" };
  const doFetch = opts.fetch ?? fetch;
  try {
    const res = await doFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html, text/plain;q=0.9" },
      signal: AbortSignal.timeout(opts.timeoutMs),
      redirect: "follow",
    });
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
