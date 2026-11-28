/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import type { MarkKind } from "../VerdictMark/VerdictMark.tsx";
import { VerdictMarks } from "./VerdictMarks.tsx";

/** Board 07's 41 waves: the decided ones first, then one under review and nine waiting. */
const DECIDED = "hhphmuhhphmhhuphmhhphmhhuphmhhp".split("");
const KIND: Readonly<Record<string, MarkKind>> = {
  h: "hit",
  p: "partial",
  m: "miss",
  u: "undetermined",
};
const marks = (kinds: readonly MarkKind[]) => kinds.map((mark, i) => ({ id: `p${i}`, mark }));
const board07 = marks([
  ...DECIDED.map((c) => KIND[c] ?? "waiting"),
  "under_review",
  ...Array<MarkKind>(9).fill("waiting"),
]);

const en = {
  hit: "hit",
  partial: "partial",
  miss: "miss",
  undetermined: "undecided",
  under_review: "under review",
  waiting: "waiting",
};

// Board 07 with verdicts, board 06 before any (every mark empty), and the
// legend's text, which wraps, in a long version and in each language.
export default states(VerdictMarks, {
  default: { label: "41 waves, oldest first", marks: board07, legend: en },
  none: {
    label: "41 waves, oldest first",
    marks: marks(Array<MarkKind>(41).fill("waiting")),
    legend: en,
  },
  long: {
    label: "41 waves, oldest first",
    marks: board07,
    legend: {
      hit: "hit: the test held up",
      partial: "partial: half of it held up, counted as half",
      miss: "miss: the test failed, and it stays on the record",
      undetermined: "undecided: the evidence was too thin, left out of the rate",
      under_review: "under review: waiting for a person to confirm",
      waiting: "waiting: not due yet",
    },
  },
  zh: {
    label: "41 个浪，按时间排列",
    marks: board07,
    legend: {
      hit: "命中",
      partial: "部分命中",
      miss: "未命中",
      undetermined: "无法判定",
      under_review: "复核中",
      waiting: "还没到期",
    },
  },
  ja: {
    label: "41 の波、古い順",
    marks: board07,
    legend: {
      hit: "的中",
      partial: "部分的中",
      miss: "外れ",
      undetermined: "判定不能",
      under_review: "検証中",
      waiting: "期限前",
    },
  },
});
