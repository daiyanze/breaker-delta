/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { SearchEntry } from "./SearchEntry.tsx";

// From the breakpoint the label shows, so its width depends on the text: a
// long state and a state per language (ADR 0020, section 12).
export default states(SearchEntry, {
  default: { href: "/search", label: "Search" },
  long: { href: "/search", label: "Search headlines, summaries and source names" },
  zh: { href: "/zh/search", label: "搜索" },
  ja: { href: "/ja/search", label: "検索" },
});
