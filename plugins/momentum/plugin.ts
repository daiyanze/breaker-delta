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
