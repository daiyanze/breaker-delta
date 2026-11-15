// Python-semantics helpers for the publisher port. Each one exists
// because radar/publish.py leans on a behaviour JS does not share;
// they are kept together so the quirks stay visible (same approach as
// @breaker-delta/fetchers' py.ts, duplicated here so this package
// only depends on @breaker-delta/core).

/** Code points of a string, as a Python str iterates them. */
export function cps(s: string): string[] {
  return Array.from(s);
}

/** Python len(str): number of code points. */
export function cpLen(s: string): number {
  return Array.from(s).length;
}

/** String slice by Unicode code points (Python str slicing). */
export function cpSlice(s: string, start: number, end?: number): string {
  return Array.from(s).slice(start, end).join("");
}

/**
 * html.escape(s, quote=True): & first, then < and >, then the two
 * quote characters — " becomes &quot; and ' becomes &#x27;.
 */
export function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

const QUOTE_ALWAYS_SAFE = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~".split(""),
);

/**
 * urllib.parse.quote(s, safe): UTF-8 bytes, percent-encoded except
 * ASCII letters/digits and `_.-~` (always safe) plus the caller's
 * safe set. Hex digits are uppercase, like Python's.
 */
export function pyQuote(s: string, safe = "/"): string {
  const safeSet = new Set(safe.split(""));
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    if (b < 0x80 && (QUOTE_ALWAYS_SAFE.has(ch) || safeSet.has(ch))) {
      out += ch;
    } else {
      out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/** str.format with named fields only (all publish.py templates). */
export function pyFormat(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

function zeroPaddedInt(r: number, digits: number): string {
  const neg = r < 0;
  let s = String(Math.abs(r));
  if (digits > 0) {
    s = s.padStart(digits + 1, "0");
    s = s.slice(0, -digits) + "." + s.slice(-digits);
  }
  return (neg ? "-" : "") + s;
}

/**
 * Python format(x, '.Nf'): round-half-even on the exact binary value.
 * JS toFixed rounds the exact value too but breaks exact decimal ties
 * away from zero (13.25 -> "13.3" where Python gives "13.2"), so the
 * exact-tie case (scaled value landing precisely on .5, which happens
 * for dyadic chart coordinates) is handled explicitly.
 */
export function pyFixed(x: number, digits: number): string {
  const factor = 10 ** digits;
  const scaled = x * factor;
  const fl = Math.floor(scaled);
  if (scaled - fl === 0.5) {
    const r = fl % 2 === 0 ? fl : fl + 1;
    if (r === 0) return (x < 0 ? "-" : "") + zeroPaddedInt(0, digits);
    return zeroPaddedInt(r, digits);
  }
  return x.toFixed(digits);
}

/** Python repr of a float inside json.dumps (shortest round-trip). */
function pyJsonNumber(n: number): string {
  if (Number.isInteger(n)) {
    // Python prints ints plainly; JS String() switches to exponent
    // form at 1e21, Python int printing never does — irrelevant for
    // this site's data (heats, counts), kept simple.
    return String(n);
  }
  return JSON.stringify(n);
}

function pyJsonString(s: string): string {
  // JSON.stringify matches Python's ensure_ascii=False escaping for
  // the strings this engine handles (control chars, quotes, backslash;
  // non-ASCII passes through raw in both).
  return JSON.stringify(s);
}

/**
 * json.dumps(value, ensure_ascii=False[, indent=N]).
 * Without indent, Python's separators are (', ', ': ') — note the
 * spaces, unlike JSON.stringify. With indent, items are separated by
 * ',\n', keys by ': ', and empty containers stay inline ('{}'/'[]').
 */
export function pyJsonDumps(value: unknown, indent?: number): string {
  if (indent === undefined) return dumpCompact(value);
  return dumpPretty(value, indent, 0);
}

function dumpCompact(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return pyJsonNumber(value);
  if (typeof value === "string") return pyJsonString(value);
  if (Array.isArray(value)) {
    return "[" + value.map(dumpCompact).join(", ") + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    "{" +
    entries.map(([k, v]) => pyJsonString(k) + ": " + dumpCompact(v)).join(", ") +
    "}"
  );
}

function dumpPretty(value: unknown, indent: number, level: number): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return pyJsonNumber(value);
  if (typeof value === "string") return pyJsonString(value);
  const padIn = " ".repeat(indent * (level + 1));
  const padOut = " ".repeat(indent * level);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => padIn + dumpPretty(v, indent, level + 1));
    return "[\n" + items.join(",\n") + "\n" + padOut + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  const items = entries.map(
    ([k, v]) => padIn + pyJsonString(k) + ": " + dumpPretty(v, indent, level + 1),
  );
  return "{\n" + items.join(",\n") + "\n" + padOut + "}";
}

/** sum(ord(c) for c in s) — full code points, like Python. */
/**
 * Python string comparison: lexicographic by code point. (JS's
 * default string sort compares UTF-16 code units, which differs
 * outside the BMP.)
 */
export function cpCompare(a: string, b: string): number {
  const ai = Array.from(a);
  const bi = Array.from(b);
  const n = Math.min(ai.length, bi.length);
  for (let i = 0; i < n; i++) {
    const d = (ai[i].codePointAt(0) as number) - (bi[i].codePointAt(0) as number);
    if (d !== 0) return d;
  }
  return ai.length - bi.length;
}

export function sumOrd(s: string): number {
  let total = 0;
  for (const c of s) total += c.codePointAt(0) as number;
  return total;
}

const ALNUM_RE = /^[\p{L}\p{N}]$/u;

/**
 * next((c for c in s if c.isalnum()), s[:1]) — Python str.isalnum is
 * Unicode-aware (CJK characters count as alphanumeric); approximated
 * with the Unicode Letter/Number property classes.
 */
export function firstAlnum(s: string): string {
  for (const c of s) if (ALNUM_RE.test(c)) return c;
  const chars = Array.from(s);
  return chars.length > 0 ? chars[0] : "";
}

/**
 * urllib.parse.urlparse(u).netloc: the authority component when the
 * URL has one (`scheme://netloc/...` or `//netloc/...`), else "".
 * Case is preserved; userinfo and port ride along.
 */
export function urlNetloc(u: string): string {
  const cleaned = u.replace(/[\t\r\n]/g, "").replace(/^[\x00-\x20]+/, "");
  let rest: string | null = null;
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.exec(cleaned);
  if (scheme) {
    const after = cleaned.slice(scheme[0].length);
    if (after.startsWith("//")) rest = after.slice(2);
  } else if (cleaned.startsWith("//")) {
    rest = cleaned.slice(2);
  }
  if (rest === null) return "";
  const end = rest.search(/[/?#]/);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Python read_text(): universal-newline translation to \n. */
export function universalNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface IsoParts {
  /** Absolute instant in ms (naive values read as if UTC). */
  ms: number;
  /** True when an explicit UTC offset (or Z) was present. */
  aware: boolean;
  /** Offset minutes east of UTC; null when naive. */
  offsetMinutes: number | null;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?(?::?\d{2})?)?)?$/;

function daysInMonth(y: number, m: number): number {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/**
 * datetime.fromisoformat for the shapes edition timestamps take.
 * Returns null where Python raises ValueError. Fractional seconds
 * beyond microseconds are truncated, like Python.
 */
export function parseIso(s: string): IsoParts | null {
  const m = ISO_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  let fracMs = 0;
  if (m[7] !== undefined) {
    const micros = (m[7] + "000000").slice(0, 6);
    fracMs = Math.floor(Number(micros) / 1000);
  }
  let offsetMinutes: number | null = null;
  if (m[8] !== undefined) {
    if (m[8] === "Z") {
      offsetMinutes = 0;
    } else {
      const sign = m[8].startsWith("-") ? -1 : 1;
      const body = m[8].slice(1).replace(/:/g, "");
      const oh = Number(body.slice(0, 2));
      const om = body.length >= 4 ? Number(body.slice(2, 4)) : 0;
      const os = body.length >= 6 ? Number(body.slice(4, 6)) : 0;
      offsetMinutes = sign * (oh * 60 + om + os / 60);
    }
  }
  const wallMs = Date.UTC(year, month - 1, day, hour, minute, second, fracMs);
  const ms = offsetMinutes === null ? wallMs : wallMs - offsetMinutes * 60000;
  return {
    ms,
    aware: offsetMinutes !== null,
    offsetMinutes,
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}

const RFC_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RFC_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * email.utils.format_datetime(dt): RFC 2822 with the datetime's own
 * wall-clock components and offset; naive datetimes get "-0000",
 * aware ones "+HHMM"/"-HHMM" (Z reads as +0000). Fractional seconds
 * are dropped.
 */
export function formatRfc2822(p: IsoParts): string {
  const dow = RFC_DAYS[(new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7];
  const dd = String(p.day).padStart(2, "0");
  const yyyy = String(p.year).padStart(4, "0");
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  const ss = String(p.second).padStart(2, "0");
  let zone = "-0000";
  if (p.offsetMinutes !== null) {
    const sign = p.offsetMinutes < 0 ? "-" : "+";
    const abs = Math.abs(p.offsetMinutes);
    const oh = String(Math.floor(abs / 60)).padStart(2, "0");
    const om = String(Math.floor(abs % 60)).padStart(2, "0");
    zone = `${sign}${oh}${om}`;
  }
  return `${dow}, ${dd} ${RFC_MONTHS[p.month - 1]} ${yyyy} ${hh}:${mm}:${ss} ${zone}`;
}
