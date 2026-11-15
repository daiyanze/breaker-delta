// arXiv fetcher: newest papers in the configured categories (L1).
// Ported from radar/fetchers/arxiv.py.

import { FetchError, getText, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { pyQuote } from "../py.js";
import { find, findAll, findText, iter, parseXml, XmlParseError } from "../xml.js";
import { asArray, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "arxiv";
export const LAYER = 1;

const ATOM = "{http://www.w3.org/2005/Atom}";
const ARXIV = "{http://arxiv.org/schemas/atom}";

export function parse(xmlText: string): CandidateItem[] {
  const items: CandidateItem[] = [];
  const root = parseXml(xmlText);
  for (const entry of iter(root, `${ATOM}entry`)) {
    const title = (findText(entry, `${ATOM}title`) ?? "").replace(/\s+/g, " ").trim();
    const link = findText(entry, `${ATOM}id`) ?? "";
    if (!title || !link) continue;
    const primary = find(entry, `${ARXIV}primary_category`);
    const summary = (findText(entry, `${ATOM}summary`) ?? "").replace(/\s+/g, " ").trim();
    items.push({
      source: SOURCE,
      name: title,
      url: link,
      metrics: {
        published: findText(entry, `${ATOM}published`),
        category: primary ? (primary.attrs["term"] ?? null) : null,
        authors: findAll(entry, `${ATOM}author`).length,
      },
      detail: Array.from(summary).slice(0, 240).join(""),
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "arxiv");
  const cats = asArray(cfg["categories"] ?? ["cs.AI", "cs.CL", "cs.LG"]).map(String);
  const maxResults = cfg["max_results"] ?? 30;
  const query = pyQuote(cats.map((c) => `cat:${c}`).join(" OR "));
  const url =
    `https://export.arxiv.org/api/query?search_query=${query}` +
    `&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
  try {
    return ok(SOURCE, LAYER, parse(await getText(url)));
  } catch (err) {
    if (err instanceof FetchError || err instanceof XmlParseError) {
      return missing(SOURCE, LAYER, err.message);
    }
    throw err;
  }
};
