// Civitai fetcher: newest community models (L1).
// Ported from radar/fetchers/civitai.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "civitai";
export const LAYER = 1;

export function parse(payload: Record<string, unknown>): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of asArray(g(payload, "items", []))) {
    const model = asRecord(raw);
    const stats = asRecord(g(model, "stats") ?? {});
    if (!g(model, "name")) continue;
    const versions = asArray(g(model, "modelVersions") ?? []).slice(0, 1);
    items.push({
      source: SOURCE,
      name: String(g(model, "name")),
      url: `https://civitai.com/models/${g(model, "id")}`,
      metrics: {
        downloads: g(stats, "downloadCount"),
        thumbs_up: g(stats, "thumbsUpCount"),
        type: g(model, "type"),
        base_models: versions.map((v) => g(asRecord(v), "baseModel")),
      },
      detail: "",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const limit = sourceCfg(config, "civitai")["limit"] ?? 20;
  try {
    const payload = asRecord(
      await getJson(`https://civitai.com/api/v1/models?limit=${limit}&sort=Newest&nsfw=false`),
    );
    return ok(SOURCE, LAYER, parse(payload));
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
