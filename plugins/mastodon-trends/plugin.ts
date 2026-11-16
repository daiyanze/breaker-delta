// Mastodon trending statuses as a candidate source (Plugin-P1
// fetcher slot reference implementation). Public API, no key.
// Config: plugins.mastodon-trends.config.limit (default 20).

interface TrendingStatus {
  content?: string;
  url?: string;
  reblogs_count?: number;
  favourites_count?: number;
  replies_count?: number;
  account?: { display_name?: string; username?: string };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchCandidates(ctx: {
  config: Record<string, unknown>;
  fetch: (url: string) => Promise<Response>;
}): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(Number(ctx.config.limit ?? 20) || 20, 1), 40);
  const res = await ctx.fetch(
    `https://mastodon.social/api/v1/trends/statuses?limit=${limit}`,
  );
  if (!res.ok) throw new Error(`mastodon trends: HTTP ${res.status}`);
  const data = (await res.json()) as TrendingStatus[];
  const items: Record<string, unknown>[] = [];
  for (const s of data) {
    const text = stripHtml(String(s.content ?? ""));
    const name = text.slice(0, 90) || String(s.account?.display_name ?? "");
    if (!name || !s.url) continue;
    items.push({
      name,
      url: s.url,
      detail: text.slice(0, 280),
      metrics: {
        reblogs: s.reblogs_count ?? 0,
        favourites: s.favourites_count ?? 0,
        replies: s.replies_count ?? 0,
      },
    });
  }
  return items;
}
