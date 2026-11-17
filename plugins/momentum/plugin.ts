// Momentum sub-score (Plugin-P1 score slot reference
// implementation). Pure computation over the built topic — no
// network, no storage. Three components, 100 points total:
//
//   appearances  up to 30  (5+ appearances saturate)
//   heat trend   up to 40  (first -> latest heat, ±60 saturates;
//                           a single appearance scores a neutral 20)
//   source breadth up to 30 (6+ distinct sources saturate)
//
// The result is stored as plugins.momentum.score on the topic's
// latest appearance and rendered next to the heat. It never feeds
// back into the heat itself (engine invariant).

interface TopicAppLike {
  heat?: number;
  sources?: string[];
}

export function scoreTopic(
  _ctx: unknown,
  topic: { apps: TopicAppLike[] },
): { value: number } | null {
  const apps = topic.apps ?? [];
  if (apps.length === 0) return null;
  const appearancePts = (Math.min(apps.length, 5) / 5) * 30;
  let trendPts = 20;
  if (apps.length >= 2) {
    const delta = (apps[apps.length - 1].heat ?? 0) - (apps[0].heat ?? 0);
    const clamped = Math.max(-60, Math.min(60, delta));
    trendPts = ((clamped + 60) / 120) * 40;
  }
  const sources = new Set<string>();
  for (const a of apps) for (const s of a.sources ?? []) sources.add(s);
  const breadthPts = (Math.min(sources.size, 6) / 6) * 30;
  return { value: Math.round(appearancePts + trendPts + breadthPts) };
}

// ------------------------------------------------------------ page slot (Plugin-P2)

// The momentum board: every topic ranked by its stored momentum
// score. Page content is structured blocks (the panel block
// model) — the renderers draw them; this function only computes.
// Baked dynamic text is escaped here: block strings are trusted
// author content at render time, so the plugin owns escaping
// whatever it interpolates.

interface PageTopicLike {
  name: string;
  apps: (TopicAppLike & {
    plugins?: Record<string, Record<string, unknown>>;
  })[];
}

const PAGE_TEXT = {
  head: {
    zh: "按动量分排序（出现次数 + 浪高走势 + 来源广度）",
    en: "Ranked by momentum (appearances + heat trend + source breadth)",
    ja: "勢いスコア順（出現回数 + 浪高の推移 + ソースの広がり）",
  },
  stat: { zh: "动量", en: "Momentum", ja: "勢い" },
  wave: { zh: "浪高", en: "heat", ja: "浪高" },
  empty: {
    zh: "暂无动量数据：先运行一次打分（publish 会自动跑，或 breaker-delta plugins score）。",
    en: "No momentum data yet: run the score pass first (publish does it automatically, or breaker-delta plugins score).",
    ja: "勢いデータはまだありません：先にスコア計算を実行してください（publish で自動、または breaker-delta plugins score）。",
  },
} as const;

function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildPage(
  _ctx: unknown,
  site: { topics: PageTopicLike[] },
): Record<string, unknown>[] {
  const rows: { name: string; score: number; heat: number }[] = [];
  for (const t of site.topics) {
    const last = t.apps[t.apps.length - 1];
    const score = last?.plugins?.momentum?.score;
    if (typeof score !== "number") continue;
    rows.push({ name: t.name, score, heat: last.heat ?? 0 });
  }
  rows.sort((a, b) => b.score - a.score || b.heat - a.heat);
  if (rows.length === 0) {
    return [{ type: "note", text: PAGE_TEXT.empty }];
  }
  const stat = PAGE_TEXT.stat;
  const wave = PAGE_TEXT.wave;
  return [
    { type: "subh", text: PAGE_TEXT.head },
    {
      type: "olist",
      items: rows.slice(0, 20).map((r, i) => ({
        label: { zh: `#${i + 1} ${escText(r.name)}`, en: `#${i + 1} ${escText(r.name)}`, ja: `#${i + 1} ${escText(r.name)}` },
        format: {
          zh: `${stat.zh} ${r.score} · ${wave.zh} ${r.heat}`,
          en: `${stat.en} ${r.score} · ${wave.en} ${r.heat}`,
          ja: `${stat.ja} ${r.score} · ${wave.ja} ${r.heat}`,
        },
      })),
    },
  ];
}

// ------------------------------------------------------------ tools slot (Plugin-P3)

/** MCP tool registration: one read-only tool, `top`, exposed by the
 *  host as momentum__top. Ranks topics by the momentum score stored
 *  on their latest appearance — the same numbers the board page
 *  shows; it computes nothing new. */
export function pluginTools(): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>, site: { topics: PageTopicLike[] }) => string;
}[] {
  return [
    {
      name: "top",
      description:
        "Top topics by momentum score (0-100: appearance count + heat trend + source breadth), " +
        "as stored by the momentum score pass. Optional limit (default 10, max 50).",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
      call: (args, site) => {
        const limit = Math.min(
          Math.max(typeof args.limit === "number" ? args.limit : 10, 1),
          50,
        );
        const rows: { name: string; score: number; heat: number }[] = [];
        for (const t of site.topics) {
          const last = t.apps[t.apps.length - 1];
          const score = last?.plugins?.momentum?.score;
          if (typeof score !== "number") continue;
          rows.push({ name: t.name, score, heat: last.heat ?? 0 });
        }
        rows.sort((a, b) => b.score - a.score || b.heat - a.heat);
        if (rows.length === 0) {
          return "No momentum data yet: run the score pass first (breaker-delta plugins score).";
        }
        return rows
          .slice(0, limit)
          .map((r, i) => `#${i + 1} ${r.name} — momentum ${r.score} · heat ${r.heat}`)
          .join("\n");
      },
    },
  ];
}
