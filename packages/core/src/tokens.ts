// The engine has TWO different tokenisers (migration spec hard rule):
// scanTokens — radar/scan.py `tokens`: lowercase [a-z0-9.-] runs of
//   length >= 3, edges stripped of "." / "-", stopwords removed.
// publishTokens — radar/publish.py `tokens`: [A-Za-z0-9]+ runs plus
//   each individual CJK char (U+4E00–U+9FFF), over the lowercased text.

export const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "of", "for", "to", "in", "on", "with", "and",
  "launches", "launch", "releases", "release", "announces", "new",
  "ai", "llm", "model", "models", "using", "show", "hn",
  "how", "what", "why", "when", "where", "which", "who", "whom",
  "this", "that", "these", "those", "there", "here", "your",
  "you", "are", "was", "were", "has", "have", "had", "its",
  "it", "can", "could", "will", "would", "should", "may",
  "might", "must", "from", "into", "over", "under", "after",
  "before", "about", "than", "then", "now", "just", "more",
  "most", "other", "others", "some", "any", "all", "each",
  "get", "gets", "got", "make", "makes", "made", "build",
  "builds", "built", "building", "use", "uses", "used",
  "way", "ways", "thing", "things", "world", "today", "day",
  "week", "year", "years", "time", "people", "work", "works",
  "first", "one", "two", "three", "out", "off", "per",
  "via", "vs", "app", "apps", "tool", "tools", "free",
  "best", "top", "big", "yet", "still", "even", "also",
  "not", "no", "yes", "but", "if", "so", "as", "at", "by",
]);

export function scanTokens(name: string): Set<string> {
  const words = name.toLowerCase().match(/[a-z0-9][a-z0-9.\-]{2,}/g) ?? [];
  const out = new Set<string>();
  for (const w of words) {
    // Python checks the stopword list against the UNstripped token,
    // then strips "." / "-" from the edges — quirk preserved.
    if (!STOPWORDS.has(w)) out.add(w.replace(/^[.-]+|[.-]+$/g, ""));
  }
  return out;
}

export function publishTokens(s: string | null | undefined): Set<string> {
  return new Set((s ?? "").toLowerCase().match(/[A-Za-z0-9]+|[\u4e00-\u9fff]/g) ?? []);
}
