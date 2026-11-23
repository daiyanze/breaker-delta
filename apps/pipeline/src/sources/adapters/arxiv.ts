/**
 * arXiv cs.AI, cs.CL and cs.LG (`arxiv`): the newest submissions from the
 * arXiv API, an Atom feed. An entry is the paper's abstract page, dated by
 * `published` (its first version), not `updated` (its latest), so a revised
 * old paper is not news again.
 */
import { type Adapter, ParseError } from "../adapter.ts";
import { parseFeed } from "../parse.ts";

const QUERY =
  "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=100";

/** The API answers a bad query with HTTP 200 and one entry linking here. */
const API_ERROR = /^https?:\/\/arxiv\.org\/api\/errors/i;

export const arxiv: Adapter = {
  groupId: "arxiv",
  format: "xml",
  urls: () => [QUERY],
  parse(body) {
    const items = parseFeed(body);
    if (items.some((i) => API_ERROR.test(i.url)))
      throw new ParseError("arxiv: the API sent an error");
    return items;
  },
};
