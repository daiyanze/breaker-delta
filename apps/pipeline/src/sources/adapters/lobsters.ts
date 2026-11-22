/**
 * Lobsters hottest (`lobsters` group): a JSON array of stories. The example
 * adapter for M1-04; the other groups follow it in M1-05 to M1-07.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, isWebUrl, parseDate, parseJson } from "../parse.ts";

const HOTTEST = "https://lobste.rs/hottest.json";

function story(v: unknown): SourceItem | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  // A text post has no link of its own; its discussion page is the item.
  const url = cleanText(s.url) || cleanText(s.comments_url);
  const title = cleanText(s.title);
  if (!isWebUrl(url) || title === "") return null;
  return {
    url,
    title,
    publishedAt: parseDate(s.created_at),
    heat: typeof s.score === "number" && Number.isFinite(s.score) ? s.score : null,
  };
}

export const lobsters: Adapter = {
  groupId: "lobsters",
  format: "json",
  urls: () => [HOTTEST],
  parse(body) {
    const data = parseJson(body);
    if (!Array.isArray(data)) throw new ParseError("lobsters: expected an array of stories");
    return data.map(story).filter((i): i is SourceItem => i !== null);
  },
};
