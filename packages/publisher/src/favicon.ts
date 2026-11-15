// Favicon fetching and the on-disk cache, ported from
// radar/publish.py (`_fetch_one`, `_img_ok`, `fetch_favicons`).
// The cache directory (meta.json + one file per domain) is injected
// via Ctx; behaviour — conditional revalidation, Google favicon
// service fallback, sha256 change detection — mirrors Python's,
// including its stats accounting ("hit-offline" counts as "hit").

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { Ctx } from "./ctx.js";
import { pyJsonDumps } from "./py.js";

export interface FavEntry {
  file?: string;
  sha256?: string;
  etag?: string | null;
  last_modified?: string | null;
  [key: string]: unknown;
}

const UA = "Mozilla/5.0 (triple-sigma build)";
const TIMEOUT_MS = 6000;

function imgOk(data: Uint8Array, ctype: string): boolean {
  if (ctype.startsWith("image")) return true;
  if (data.length >= 4) {
    if (data[0] === 0x00 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0x00) return true;
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return true;
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return true;
  }
  const head = data.slice(0, 200);
  for (let i = 0; i + 4 <= head.length; i++) {
    if (head[i] === 0x3c && head[i + 1] === 0x73 && head[i + 2] === 0x76 && head[i + 3] === 0x67) {
      return true; // b"<svg" in data[:200]
    }
  }
  return false;
}

/** email.message get_content_type(): lowercased type/subtype without
 *  parameters, defaulting to "text/plain" when the header is absent. */
function contentTypeOf(resp: FetchResponse): string {
  const raw = resp.headers.get("content-type");
  if (!raw) return "text/plain";
  const main = raw.split(";")[0].trim().toLowerCase();
  return main === "" ? "text/plain" : main;
}

type FetchOneResult = [string, FavEntry | null, string];

async function fetchOne(
  domain: string,
  meta: Map<string, FavEntry>,
  cacheDir: string,
): Promise<FetchOneResult> {
  const entry: FavEntry = meta.get(domain) ?? {};
  const cachedFile = entry.file ? path.join(cacheDir, entry.file) : null;
  const cachedExists = cachedFile !== null && fs.existsSync(cachedFile);
  const headers: Record<string, string> = { "User-Agent": UA };
  if (cachedExists) {
    if (entry.etag) headers["If-None-Match"] = String(entry.etag);
    if (entry.last_modified) headers["If-Modified-Since"] = String(entry.last_modified);
  }
  let data: Uint8Array | null = null;
  let ctype = "";
  let etag: string | null = null;
  let lm: string | null = null;
  try {
    const resp = await fetch(`https://${domain}/favicon.ico`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 304) {
      // urllib raises HTTPError for 304; the cached copy wins.
      await resp.arrayBuffer().catch(() => undefined);
      if (cachedExists) return [domain, entry, "hit"];
    } else if (resp.status < 200 || resp.status >= 300) {
      // urllib raises HTTPError for the rest; drain before falling
      // back (an unread error body can kill undici's connection).
      await resp.arrayBuffer().catch(() => undefined);
    } else {
      const buf = new Uint8Array(await resp.arrayBuffer());
      const ct = contentTypeOf(resp);
      const e = resp.headers.get("etag");
      const l = resp.headers.get("last-modified");
      if (!imgOk(buf, ct)) throw new Error("not an image");
      data = buf;
      ctype = ct;
      etag = e;
      lm = l;
    }
  } catch {
    data = null;
  }
  if (data === null) {
    // fallback: Google favicon service, hash-compared like a direct hit
    try {
      const resp = await fetch(
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (resp.status < 200 || resp.status >= 300) {
        await resp.arrayBuffer().catch(() => undefined);
        throw new Error(`http ${resp.status}`);
      }
      data = new Uint8Array(await resp.arrayBuffer());
      ctype = "image/png";
      etag = null;
      lm = null;
    } catch {
      if (cachedExists) return [domain, entry, "hit-offline"];
      return [domain, null, "miss"];
    }
  }
  const sha = createHash("sha256").update(data).digest("hex");
  if (entry.sha256 === sha && cachedExists) return [domain, entry, "hit"];
  const ext = ctype.includes("png") ? ".png" : ctype.includes("svg") ? ".svg" : ".ico";
  const fname = domain + ext;
  fs.writeFileSync(path.join(cacheDir, fname), data);
  return [domain, { file: fname, sha256: sha, etag, last_modified: lm }, "updated"];
}

/** Promise pool preserving input order (ThreadPoolExecutor.map). */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

function statsRepr(stats: Map<string, number>): string {
  const parts = [...stats.entries()].map(([k, v]) => `'${k}': ${v}`);
  return `{${parts.join(", ")}}`;
}

/**
 * publish.py `fetch_favicons`: refresh the cache for the given
 * domains (at most 8 in flight), fill ctx.favFiles in domain order,
 * persist meta.json (json indent=1), and log the stats line.
 */
export async function fetchFavicons(
  ctx: Ctx,
  domains: string[],
): Promise<Map<string, string>> {
  fs.mkdirSync(ctx.faviconCacheDir, { recursive: true });
  const metaPath = path.join(ctx.faviconCacheDir, "meta.json");
  const meta = new Map<string, FavEntry>();
  if (fs.existsSync(metaPath)) {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Record<
      string,
      FavEntry
    >;
    for (const [k, v] of Object.entries(parsed)) meta.set(k, v);
  }
  const stats = new Map<string, number>([
    ["hit", 0],
    ["updated", 0],
    ["miss", 0],
  ]);
  const results = await mapPool(domains, 8, (d) =>
    fetchOne(d, meta, ctx.faviconCacheDir),
  );
  for (const [domain, entry, how] of results) {
    const key = how.split("-")[0];
    stats.set(key, (stats.get(key) ?? 0) + 1);
    if (entry) {
      meta.set(domain, entry);
      ctx.favFiles.set(domain, entry.file as string);
    }
  }
  const metaObj: Record<string, unknown> = {};
  for (const [k, v] of meta) metaObj[k] = v;
  fs.writeFileSync(metaPath, pyJsonDumps(metaObj, 1), "utf-8");
  console.log(`favicons: ${statsRepr(stats)}`);
  return ctx.favFiles;
}
