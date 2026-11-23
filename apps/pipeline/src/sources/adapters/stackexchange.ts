/**
 * Stack Exchange hot questions (`stackexchange`): an Atom feed of the
 * network's hot questions. Each entry is dated by `published`, when the
 * question was asked; `updated` is its last activity. Heat is the entry's
 * `re:rank` (the Atom rank extension), the number Stack Exchange ranks the
 * question by.
 */
import type { Adapter } from "../adapter.ts";
import { parseFeed } from "../parse.ts";

export const stackExchange: Adapter = {
  groupId: "stackexchange",
  format: "xml",
  urls: () => ["https://stackexchange.com/feeds/questions"],
  parse: (body) => parseFeed(body, { heat: "re:rank" }),
};
