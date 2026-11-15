// HF Daily Papers fetcher: community-curated papers (L1).
// Ported from radar/fetchers/dailypapers.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { cpSlice, g } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "daily_papers";
export const LAYER = 1;

export function parse(payload: unknown[]): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of payload) {
    const entry = asRecord(raw);
    const paper = asRecord(g(entry, "paper") ?? {});
    const title = (
      (g(paper, "title") as string | null) || (g(entry, "title") as string | null) || ""
    ).replace(/\s+/g, " ").trim();
    const paperId = g(paper, "id") as string | null;
    if (!title || !paperId) continue;
    items.push({
      source: SOURCE,
      name: title,
      url: `https://huggingface.co/papers/${paperId}`,
      metrics: {
        upvotes: g(paper, "upvotes"),
        comments: g(entry, "numComments"),
        authors: asArray(g(paper, "authors") ?? []).length,
        github_repo: g(paper, "githubRepo"),
      },
      detail: cpSlice(
        ((g(paper, "summary") as string | null) || "").replace(/\s+/g, " "),
        0,
        240,
      ),
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const limit = sourceCfg(config, "daily_papers")["limit"] ?? 30;
  try {
    const payload = await getJson(`https://huggingface.co/api/daily_papers?limit=${limit}`);
    return ok(SOURCE, LAYER, parse(asArray(payload)));
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
