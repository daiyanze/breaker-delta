// Small Python-semantics helpers shared by the fetcher ports. Each
// one exists because the Python original leans on a behaviour JS does
// not share; they are kept together so the quirks stay visible.

/** dict.get(key, default): present-but-null stays null, like Python. */
export function g(obj: Record<string, unknown> | null | undefined, key: string, def: unknown = null): unknown {
  if (obj === null || obj === undefined) return def;
  const v = obj[key];
  return v === undefined ? def : v;
}

/** String slice by Unicode code points (Python str slicing). */
export function cpSlice(s: string, start: number, end?: number): string {
  const chars = Array.from(s);
  return chars.slice(start, end).join("");
}

/** Python round(x, ndigits): round-half-even on the exact binary
 *  value. JS toFixed also rounds the exact binary value (ties away
 *  from zero only on exact .5 decimal ties, which for ndigits=1 means
 *  values like 2.25 whose binary form is exact — Python gives 2.2,
 *  toFixed gives "2.3"). Handle the exact-tie case explicitly. */
export function pyRound(x: number, ndigits: number): number {
  const factor = 10 ** ndigits;
  const scaled = x * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (Math.abs(diff - 0.5) < 1e-12) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded / factor;
}

/** Python int(value) for the shapes mastodon's _accounts meets:
 *  numbers truncate, digit strings parse, anything else raises
 *  (here: returns null, matching the caller's except-branch). */
export function pyInt(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.trunc(value);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const t = value.trim();
    if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
    return null;
  }
  return null;
}

/** datetime.fromisoformat after "Z" -> "+00:00"; naive read as UTC
 *  only where the caller applies .replace(tzinfo=utc) itself — here
 *  naive values are returned as UTC instants (every Python fetcher
 *  that compares against `now` either does that replacement or the
 *  API always sends Z-suffixed values). Throws on garbage, like
 *  Python's ValueError. */
export function parseIsoDateTime(raw: string): Date {
  const iso = raw.replace("Z", "+00:00");
  // Normalise a space separator and missing seconds for Date.parse.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid isoformat string: ${raw}`);
  return d;
}

/** timedelta.days: whole days, floored (toward -inf), like Python. */
export function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

/** date().isoformat() for a UTC instant. */
export function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** urllib.parse.quote with Python's default safe='/'. */
export function pyQuote(s: string): string {
  // encodeURIComponent escapes everything quote does except A-Za-z0-9
  // and "_.-~" plus (in JS) !'()* — Python quote leaves "_.-~" and,
  // by default, "/". Replicate: encode, then restore "/".
  return encodeURIComponent(s)
    .replace(/%2F/g, "/")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

/** urllib.parse.quote_plus (form encoding: space -> '+'). */
export function pyQuotePlus(s: string): string {
  return pyQuote(s).replace(/%20/g, "+").replace(/\//g, "%2F");
}

/** Python datetime.isoformat() for a UTC instant (for candidates
 *  files): "+00:00" suffix, fractional seconds only when nonzero
 *  (JS gives millis; Python gives micros — dual-run comparisons use
 *  parsed values, not this string). */
export function pyIsoformat(d: Date): string {
  const iso = d.toISOString();
  const trimmed = iso.endsWith(".000Z") ? iso.slice(0, -5) + "Z" : iso;
  return trimmed.replace("Z", "+00:00");
}
