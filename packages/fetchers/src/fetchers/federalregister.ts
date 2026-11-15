// Federal Register fetcher: US federal policy documents (L1).
// Ported from radar/fetchers/federalregister.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { cpSlice, g, pyQuotePlus } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "federal_register";
export const LAYER = 1;

export const API = "https://www.federalregister.gov/api/v1/documents.json";
export const FIELDS = ["title", "html_url", "abstract", "publication_date", "type"];

export function parse(payload: Record<string, unknown>, limit = 10): CandidateItem[] {
  const items: CandidateItem[] = [];
  const results = asArray(g(payload ?? {}, "results", []));
  for (const raw of results.slice(0, limit)) {
    const doc = asRecord(raw);
    const title = String(g(doc, "title") ?? "").trim();
    const url = (g(doc, "html_url") as string | null) || "";
    if (!title || !url) continue;
    items.push({
      source: SOURCE,
      name: title,
      url,
      metrics: {
        outlet: "Federal Register",
        published: g(doc, "publication_date"),
        type: g(doc, "type"),
      },
      detail: cpSlice((g(doc, "abstract") as string | null) || "", 0, 300),
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "federal_register");
  const term = (cfg["term"] as string | undefined) ?? "artificial intelligence";
  const limit = (cfg["limit"] as number | undefined) ?? 10;
  // urllib.parse.urlencode with quote_plus, fields appended verbatim
  // exactly as the Python code builds them.
  const query =
    `conditions%5Bterm%5D=${pyQuotePlus(term)}&per_page=${limit}&order=newest`;
  const fields = FIELDS.map((name) => `&fields%5B%5D=${name}`).join("");
  try {
    const payload = asRecord(await getJson(`${API}?${query}${fields}`));
    const items = parse(payload, limit);
    if (items.length === 0) {
      return missing(SOURCE, LAYER, `no documents matched '${term}'`);
    }
    return ok(SOURCE, LAYER, items);
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
