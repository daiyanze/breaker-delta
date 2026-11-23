/**
 * OpenRouter models (`openrouter`): the whole model list, each with the time
 * it was added. Which ones are new is decided downstream by that time.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, pageUrl, parseJson, records } from "../parse.ts";

const SITE = "https://openrouter.ai";

function model(m: Record<string, unknown>): SourceItem | null {
  const id = cleanText(m.id);
  const url = id === "" ? "" : pageUrl(SITE, `/${id}`);
  const title = cleanText(m.name) || id;
  if (url === "" || title === "") return null;
  // `created` is Unix seconds.
  const created = typeof m.created === "number" && Number.isFinite(m.created) ? m.created : null;
  return { url, title, publishedAt: created === null ? null : created * 1000, heat: null };
}

export const openrouter: Adapter = {
  groupId: "openrouter",
  format: "json",
  urls: () => [`${SITE}/api/v1/models`],
  parse(body) {
    const data = parseJson(body) as Record<string, unknown> | null;
    if (!Array.isArray(data?.data)) throw new ParseError("openrouter: expected { data: [...] }");
    return records(data.data)
      .map(model)
      .filter((i): i is SourceItem => i !== null);
  },
};
