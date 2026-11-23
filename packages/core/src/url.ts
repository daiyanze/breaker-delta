/**
 * URL normalisation (M1-09). An echo is identified by its URL, so the same
 * resource must always yield the same string, whichever source listed it and
 * however it decorated the link. Pure: reads with the WHATWG URL parser and
 * nothing else.
 */

/**
 * Query parameters that only track the click, matched without regard to
 * case. `utm_` is a prefix. Names that also carry meaning on some sites
 * (`ref`, `source`, `si`) are not here: stripping one would merge
 * different resources.
 */
const TRACKING_PREFIXES = ["utm_"] as const;
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "_ga",
  "_gl",
  "_hsenc",
  "_hsmi",
  "dclid",
  "fbclid",
  "gbraid",
  "gclid",
  "gclsrc",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "msclkid",
  "ttclid",
  "twclid",
  "wbraid",
  "yclid",
]);

/** A query pair's name, decoded the way a form decoder reads it. */
function paramName(pair: string): string {
  const raw = pair.split("=", 1)[0] ?? "";
  try {
    return decodeURIComponent(raw.replaceAll("+", " "));
  } catch {
    return raw;
  }
}

/**
 * RFC 3986 6.2.2: an escaped unreserved character (letters, digits,
 * `-._~`) is decoded, and every other escape is written in upper case. A
 * `%` that starts no escape is escaped first, so a decoded digit can never
 * join it into a new escape on a second pass.
 */
function normaliseEscapes(s: string): string {
  return s
    .replace(/%(?![0-9a-fA-F]{2})/g, "%25")
    .replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => {
      const c = String.fromCharCode(Number.parseInt(hex, 16));
      return /[A-Za-z0-9\-._~]/.test(c) ? c : `%${hex.toUpperCase()}`;
    });
}

function isTracking(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * The normalised form of `raw`, or null when it is not an absolute http(s)
 * URL. Applying it twice gives the same result as once.
 *
 * - `http` becomes `https`, unless the URL names a port of its own.
 * - Host is lower case (IDN in punycode), without a trailing dot; default
 *   ports, credentials and the fragment are dropped.
 * - Escapes are normalised (RFC 3986 6.2.2): an escaped unreserved
 *   character is decoded, other escapes are upper case.
 * - Tracking parameters are removed; the rest keep their spelling apart
 *   from the escapes above (no other re-encoding, a bare name stays bare)
 *   and are sorted by name ignoring case (stable, so repeated names, and names
 *   that differ only in case, keep their order). An empty query is
 *   dropped.
 * - Trailing slashes are removed from the path, except the root `/`. Path
 *   case is kept: paths are case-sensitive.
 */
export function normaliseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.protocol === "http:" && url.port === "") url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.hash = "";

  const host = url.hostname.replace(/\.+$/, "");
  if (host !== "" && host !== url.hostname) url.hostname = host;

  const pairs = url.search
    .slice(1)
    .split("&")
    .filter((pair) => pair !== "")
    .map((raw) => {
      const pair = normaliseEscapes(raw);
      return { pair, name: paramName(pair), key: paramName(pair).toLowerCase() };
    })
    .filter((p) => !isTracking(p.name))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  url.search = pairs.length > 0 ? `?${pairs.map((p) => p.pair).join("&")}` : "";

  const path = normaliseEscapes(url.pathname);
  url.pathname = path === "/" ? path : path.replace(/\/+$/, "") || "/";
  return url.href;
}
