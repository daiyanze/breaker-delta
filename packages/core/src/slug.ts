// Slugs and title keywords, ported from radar/publish.py
// (`slugify`, `RESERVED_FILES`, `topic_file`, `title_keywords`).

export const RESERVED_FILES: ReadonlySet<string> = new Set([
  "index", "rising", "seeds", "echoes", "categories", "sources",
  "archive", "about", "feed", "sitemap", "robots", "llms",
  "track-record", "submit", "data",
]);

/**
 * Lowercase; runs of characters outside [a-z0-9 CJK / kana / hangul]
 * become "-"; collapse, trim, truncate to 48 characters (code points,
 * like Python slicing), trim trailing "-" again; empty -> fallback.
 */
export function slugify(title: string | null | undefined, fallback: string): string {
  let s = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  s = [...s].slice(0, 48).join("");
  s = s.replace(/^-+|-+$/g, "");
  return s || fallback;
}

export function topicFile(t: { slug: string }): string {
  return `${t.slug}.html`;
}

const KEYWORD_STOP: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "from", "that", "this",
  "new", "its", "are", "was",
]);

/**
 * Distinctive match keywords derived from a topic title, for the
 * extension badge matcher (case-insensitive substring checks).
 * English words (len >= 3) plus adjacent bigrams, then CJK runs
 * (runs longer than 8 chars contribute their first 4), then the
 * full title; deduplicated, capped at 10.
 */
export function titleKeywords(title: string | null | undefined): string[] {
  const text = title ?? "";
  const words = [...text.matchAll(/[A-Za-z][A-Za-z0-9\-]{2,}/g)]
    .map((m) => m[0])
    .filter((w) => !KEYWORD_STOP.has(w.toLowerCase()));
  const kws: string[] = [];
  const add = (k: string | null | undefined): void => {
    const v = (k ?? "").trim();
    if (v && !kws.includes(v)) kws.push(v);
  };
  words.forEach((w, i) => {
    add(w);
    if (i + 1 < words.length) {
      add(`${words[i]} ${words[i + 1]}`);
      add(`${words[i]}-${words[i + 1]}`);
    }
  });
  for (const m of text.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const run = m[0];
    add([...run].length <= 8 ? run : [...run].slice(0, 4).join(""));
  }
  add(text);
  return kws.slice(0, 10);
}
