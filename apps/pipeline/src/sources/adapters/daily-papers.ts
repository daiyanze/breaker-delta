/**
 * Hugging Face Daily Papers (`daily_papers`): the papers featured today, each
 * with its arXiv ID. The item is the paper's page on Hugging Face, dated the
 * day it was featured.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, count, pageUrl, parseDate, parseJson, records } from "../parse.ts";

const HUB = "https://huggingface.co";

function entry(e: Record<string, unknown>): SourceItem | null {
  const paper = (typeof e.paper === "object" && e.paper !== null ? e.paper : {}) as Record<
    string,
    unknown
  >;
  const id = cleanText(paper.id);
  const url = id === "" ? "" : pageUrl(HUB, `/papers/${id}`);
  const title = cleanText(paper.title) || cleanText(e.title);
  if (url === "" || title === "") return null;
  return {
    url,
    title,
    // When it was featured on Daily Papers. The top-level `publishedAt` and
    // the paper's are its arXiv date, used only when that is missing.
    publishedAt:
      parseDate(paper.submittedOnDailyAt) ??
      parseDate(e.publishedAt) ??
      parseDate(paper.publishedAt),
    heat: count(paper.upvotes),
  };
}

export const dailyPapers: Adapter = {
  groupId: "daily_papers",
  format: "json",
  urls: () => [`${HUB}/api/daily_papers?limit=50`],
  parse(body) {
    const data = parseJson(body);
    if (!Array.isArray(data)) throw new ParseError("daily_papers: expected an array of papers");
    return records(data)
      .map(entry)
      .filter((i): i is SourceItem => i !== null);
  },
};
