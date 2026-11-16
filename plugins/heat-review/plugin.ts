// Heat-based review metric (Plugin-P2 review slot reference
// implementation). The verdict uses only what the engine already
// recorded — appearances and heat across editions — so it is
// fully reproducible from the data repo.

interface TopicLike {
  apps: { heat?: number }[];
}

export function reviewTopic(
  _ctx: unknown,
  topic: TopicLike,
): { result: "hit" | "miss"; evidence: string } | null {
  const apps = topic.apps ?? [];
  if (apps.length === 0) return null;
  if (apps.length >= 3) {
    return { result: "hit", evidence: `appeared ${apps.length} times within the window` };
  }
  if (apps.length === 2) {
    const first = apps[0].heat ?? 0;
    const last = apps[apps.length - 1].heat ?? 0;
    return last >= first
      ? { result: "hit", evidence: `reappeared, heat ${first} -> ${last}` }
      : { result: "miss", evidence: `reappeared once but heat fell ${first} -> ${last}` };
  }
  return { result: "miss", evidence: "never reappeared after the first sighting" };
}
