/**
 * Hugging Face trending models (`huggingface`) and trending Spaces
 * (`hf_spaces`): the Hub API lists repos by trending score. An entry names
 * its repo by ID (`org/name`); the page URL is built from it.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, count, pageUrl, parseDate, parseJson, records } from "../parse.ts";

const HUB = "https://huggingface.co";

function hubAdapter(groupId: string, kind: "models" | "spaces"): Adapter {
  const prefix = kind === "spaces" ? "/spaces/" : "/";
  const repo = (r: Record<string, unknown>): SourceItem | null => {
    const id = cleanText(r.id);
    const url = id === "" ? "" : pageUrl(HUB, `${prefix}${id}`);
    if (url === "") return null;
    return { url, title: id, publishedAt: parseDate(r.createdAt), heat: count(r.likes) };
  };
  return {
    groupId,
    format: "json",
    urls: () => [`${HUB}/api/${kind}?sort=trendingScore&direction=-1&limit=30`],
    parse(body) {
      const data = parseJson(body);
      if (!Array.isArray(data)) throw new ParseError(`${groupId}: expected an array of ${kind}`);
      return records(data)
        .map(repo)
        .filter((i): i is SourceItem => i !== null);
    },
  };
}

export const huggingface = hubAdapter("huggingface", "models");
export const hfSpaces = hubAdapter("hf_spaces", "spaces");
