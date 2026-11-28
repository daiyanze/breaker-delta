/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { type FilterItem, Filters } from "./Filters.tsx";

const items = (base: string, labels: readonly string[], current = 0): FilterItem[] =>
  labels.map((label, i) => ({
    href: i === 0 ? base : `${base}?filter=${i}`,
    label,
    current: i === current,
  }));

// The items' text sets the row's width and where it wraps: the Changes
// board's eight (it wraps on phones), the search board's counts, a long
// state and a state per language (ADR 0020, section 12).
export default states(Filters, {
  default: {
    label: "Filter",
    items: items("/changes", [
      "Everything",
      "New waves",
      "Rising",
      "Summaries",
      "Corrections",
      "Withdrawn",
      "Verdicts",
      "Went flat",
    ]),
  },
  counts: {
    label: "Filter",
    items: items("/search?q=chipmaker", ["Everything", "Waves, 3", "Echoes, 31", "Sources, 1"], 2),
  },
  long: {
    label: "Filter the changes by what kind of change they are",
    items: items("/changes", [
      "Everything that changed since the last scan",
      "Summaries that were rewritten after a new source came in",
      "Corrections",
    ]),
  },
  zh: {
    label: "筛选",
    items: items("/zh/changes", [
      "全部",
      "新成的浪",
      "上涨",
      "摘要",
      "更正",
      "撤回",
      "判定",
      "退潮",
    ]),
  },
  ja: {
    label: "絞り込み",
    items: items("/ja/changes", [
      "すべて",
      "新しい波",
      "上昇",
      "要約",
      "訂正",
      "撤回",
      "判定",
      "凪",
    ]),
  },
});
