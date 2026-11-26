/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { Band } from "./Band.tsx";

// The rail's name sets its width, so long text and each language's own
// text are states of their own (ADR 0020, section 12).
export default states(Band, {
  default: { id: "front", name: "Front page", children: <p>What the sea did today.</p> },
  note: {
    id: "tide",
    name: "Tide table",
    note: "What formed.",
    children: <p>Rising, falling, flat.</p>,
  },
  long: {
    id: "long",
    name: "Everything that formed, rose and went flat since the last edition",
    note: "A longer note under the name, which wraps onto a second line at every width the site is read at.",
    children: (
      <p>
        One paragraph long enough to wrap in the content column: the waves of this edition, the ones
        still rising from the last, and the ones that went flat, each with its sources.
      </p>
    ),
  },
  zh: {
    id: "zh",
    name: "头版",
    note: "今天成形的浪。",
    children: <p>海面今天发生了什么。</p>,
  },
  ja: {
    id: "ja",
    name: "一面",
    note: "今日できた波。",
    children: <p>今日の海のようす。</p>,
  },
});
