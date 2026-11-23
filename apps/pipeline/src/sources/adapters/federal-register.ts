/**
 * US Federal Register (`federal_register`): the newest documents that mention
 * artificial intelligence, from the public documents API.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, isWebUrl, parseDate, parseJson, records } from "../parse.ts";

const SEARCH =
  "https://www.federalregister.gov/api/v1/documents.json" +
  "?per_page=20&order=newest&conditions%5Bterm%5D=%22artificial%20intelligence%22";

function document(d: Record<string, unknown>): SourceItem | null {
  const url = cleanText(d.html_url);
  const title = cleanText(d.title);
  if (!isWebUrl(url) || title === "") return null;
  // `publication_date` is a calendar day (`2026-11-20`), read as UTC midnight.
  return { url, title, publishedAt: parseDate(d.publication_date), heat: null };
}

export const federalRegister: Adapter = {
  groupId: "federal_register",
  format: "json",
  urls: () => [SEARCH],
  parse(body) {
    const data = parseJson(body) as Record<string, unknown> | null;
    // No match at all: the API leaves `results` out.
    if (data !== null && typeof data === "object" && !Array.isArray(data) && "count" in data) {
      return records(data.results)
        .map(document)
        .filter((i): i is SourceItem => i !== null);
    }
    throw new ParseError("federal_register: expected { count, results: [...] }");
  },
};
