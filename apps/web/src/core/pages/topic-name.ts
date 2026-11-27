/** How a topic is named on a page, shared by the front page's bands. */
import type { Language, RankRow } from "@bd/contracts";

/** The model headline in `lang` when there is one, else the source's own headline. */
export function headline(row: Pick<RankRow, "headlines" | "sourceHeadline">, lang: Language) {
  return row.headlines.find((h) => h.lang === lang) ?? row.sourceHeadline;
}
