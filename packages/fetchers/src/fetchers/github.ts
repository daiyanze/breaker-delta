// GitHub fetcher: breakout repos via the Search API + Trending page.
// Ported from radar/fetchers/github.py.

import { FetchError, getJson, getText, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { daysBetween, g, isoDateUTC, parseIsoDateTime, pyQuote, pyRound } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "github";
export const LAYER = 1;

export function parseSearch(
  payload: Record<string, unknown>,
  now: Date,
  cfg: Record<string, unknown>,
): CandidateItem[] {
  const maxAge = (cfg["max_age_days"] as number | undefined) ?? 14;
  const minPerDay = (cfg["min_stars_per_day"] as number | undefined) ?? 200;
  const minDelta = (cfg["min_stars_delta"] as number | undefined) ?? 400;
  const items: CandidateItem[] = [];
  for (const raw of asArray(g(payload, "items", []))) {
    const repo = asRecord(raw);
    const created = parseIsoDateTime(String(g(repo, "created_at")).replace("Z", "+00:00"));
    const ageDays = Math.max(daysBetween(now, created), 0);
    const stars = (g(repo, "stargazers_count", 0) as number) ?? 0;
    const perDay = stars / Math.max(ageDays, 1);
    const breakout = ageDays <= maxAge && (perDay >= minPerDay || stars >= minDelta);
    items.push({
      source: SOURCE,
      name: String(g(repo, "full_name")),
      url: String(g(repo, "html_url")),
      metrics: {
        stars,
        age_days: ageDays,
        stars_per_day: pyRound(perDay, 1),
        breakout,
      },
      detail: (g(repo, "description") as string | null) || "",
    });
  }
  return items;
}

export function parseTrending(html: string): CandidateItem[] {
  const items: CandidateItem[] = [];
  const blocks = html.match(/<article class="Box-row"[\s\S]*?<\/article>/g) ?? [];
  for (const block of blocks) {
    const m = /href="\/([^"\/]+\/[^"\/]+)"/.exec(block);
    if (!m) continue;
    const starsToday = /([\d,]+) stars today/.exec(block);
    const total = /href="\/[^"]+\/stargazers"[^>]*>\s*([\d,]+)/.exec(block);
    items.push({
      source: SOURCE,
      name: m[1],
      url: `https://github.com/${m[1]}`,
      metrics: {
        stars_today: starsToday ? parseInt(starsToday[1].replace(/,/g, ""), 10) : null,
        stars: total ? parseInt(total[1].replace(/,/g, ""), 10) : null,
        trending: true,
      },
      detail: "",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config, now) => {
  const when = now ?? new Date();
  const cfg = sourceCfg(config, "github");
  const maxAgeDays = (cfg["max_age_days"] as number | undefined) ?? 14;
  const since = isoDateUTC(new Date(when.getTime() - maxAgeDays * 86_400_000));
  const query = pyQuote(`created:>=${since} stars:>=50`);
  const url =
    `https://api.github.com/search/repositories?q=${query}` +
    "&sort=stars&order=desc&per_page=30";
  let items: CandidateItem[];
  try {
    const payload = asRecord(
      await getJson(url, { Accept: "application/vnd.github+json" }),
    );
    items = parseSearch(payload, when, cfg);
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
  let note = "";
  try {
    const trending = parseTrending(await getText("https://github.com/trending?since=daily"));
    const known = new Set(items.map((i) => i.name));
    items.push(...trending.filter((t) => !known.has(t.name)));
  } catch (err) {
    if (err instanceof FetchError) {
      note = `trending page unavailable (${err.message}); search signal only`;
    } else {
      throw err;
    }
  }
  return ok(SOURCE, LAYER, items, note);
};
