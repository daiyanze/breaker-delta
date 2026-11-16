// Generic webhook exit plugin (Plugin-P1 exit slot reference
// implementation). Fires once per new edition from publish /
// `plugins exit` / serve pushes.
//
// Config: plugins.webhook.config.url (required). The Bearer token
// comes from the BREAKER_DELTA_WEBHOOK_TOKEN env var when set.

interface TopicLike {
  name: string;
  slug: string;
  apps: { edition: number; heat?: number; level?: string | null }[];
}

export async function onEdition(
  ctx: {
    config: Record<string, unknown>;
    env: (name: string) => string | undefined;
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    log: (msg: string) => void;
  },
  payload: {
    file: string;
    edition: { date?: string; slot?: string | null; title?: string };
    topics: TopicLike[];
  },
): Promise<void> {
  const url = ctx.config.url;
  if (typeof url !== "string" || url === "") {
    throw new Error("webhook plugin: config.url is required (plugins.webhook.config.url)");
  }
  const topics = payload.topics.map((t) => {
    const latest = t.apps[t.apps.length - 1];
    return {
      name: t.name,
      slug: t.slug,
      heat: latest?.heat ?? null,
      level: latest?.level ?? null,
    };
  });
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = ctx.env("BREAKER_DELTA_WEBHOOK_TOKEN");
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await ctx.fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event: "edition",
      file: payload.file,
      edition: {
        date: payload.edition.date ?? null,
        slot: payload.edition.slot ?? null,
        title: payload.edition.title ?? null,
      },
      topics,
    }),
  });
  if (!res.ok) throw new Error(`webhook POST ${url}: HTTP ${res.status}`);
  ctx.log(`webhook delivered ${payload.file} (${topics.length} topics)`);
}
