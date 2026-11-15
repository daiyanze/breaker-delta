// Hugging Face fetcher: trending models, flagging new faces.
// Ported from radar/fetchers/huggingface.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { daysBetween, g, parseIsoDateTime } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "huggingface";
export const LAYER = 1;
export const NEW_FACE_DAYS = 30;

export function parse(payload: unknown[], now: Date): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of payload) {
    const model = asRecord(raw);
    const createdRaw = g(model, "createdAt") as string | null;
    let newFace = false;
    if (createdRaw) {
      const created = parseIsoDateTime(String(createdRaw).replace("Z", "+00:00"));
      newFace = daysBetween(now, created) <= NEW_FACE_DAYS;
    }
    const id = String(g(model, "id"));
    items.push({
      source: SOURCE,
      name: id,
      url: `https://huggingface.co/${id}`,
      metrics: {
        likes: g(model, "likes"),
        downloads: g(model, "downloads"),
        new_face: newFace,
      },
      detail: "",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config, now) => {
  const when = now ?? new Date();
  const topN = sourceCfg(config, "huggingface")["top_n"] ?? 50;
  try {
    const payload = await getJson(
      `https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=${topN}`,
    );
    return ok(SOURCE, LAYER, parse(asArray(payload) as unknown[], when));
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
