// OpenRouter fetcher: the newest models on the routing platform (L1).
// Ported from radar/fetchers/openrouter.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { cpSlice, daysBetween, g, isoDateUTC } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "openrouter";
export const LAYER = 1;
export const NEW_DAYS = 14;

export function parse(
  payload: Record<string, unknown>,
  now: Date,
  newDays: number = NEW_DAYS,
  limit = 30,
): CandidateItem[] {
  const models: { createdDt: Date; model: Record<string, unknown> }[] = [];
  for (const raw of asArray(g(payload, "data", []))) {
    const model = asRecord(raw);
    const created = g(model, "created") as number | null;
    if (!g(model, "id") || !created) continue;
    models.push({ createdDt: new Date(created * 1000), model });
  }
  models.sort((a, b) => b.createdDt.getTime() - a.createdDt.getTime());
  const items: CandidateItem[] = [];
  for (const { createdDt, model } of models.slice(0, limit)) {
    const pricing = asRecord(g(model, "pricing") ?? {});
    const id = String(g(model, "id"));
    items.push({
      source: SOURCE,
      name: (g(model, "name") as string | null) || id,
      url: `https://openrouter.ai/${id}`,
      metrics: {
        model_id: id,
        created: isoDateUTC(createdDt),
        is_new: daysBetween(now, createdDt) <= newDays,
        context_length: g(model, "context_length"),
        prompt_price: g(pricing, "prompt"),
      },
      detail: cpSlice((g(model, "description") as string | null) || "", 0, 240),
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config, now) => {
  const when = now ?? new Date();
  const cfg = sourceCfg(config, "openrouter");
  try {
    const payload = asRecord(await getJson("https://openrouter.ai/api/v1/models"));
    return ok(
      SOURCE,
      LAYER,
      parse(payload, when, (cfg["new_days"] as number | undefined) ?? NEW_DAYS,
        (cfg["limit"] as number | undefined) ?? 30),
    );
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
