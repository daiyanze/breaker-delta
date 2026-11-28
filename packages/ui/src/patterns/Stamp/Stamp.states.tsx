/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { Stamp } from "./Stamp.tsx";

// One state per kind (TicketStub README), the loud due stamp of the front
// and topic pages, and the stamp's width with long text and in each
// language: it never wraps, so its text sets its width.
export default states(Stamp, {
  due: { kind: "due", label: "Due Nov 26" },
  loud: { kind: "due", label: "Due Nov 26", loud: true },
  under_review: { kind: "under_review", label: "Under review" },
  hit: { kind: "hit", label: "Hit" },
  partial: { kind: "partial", label: "Partial" },
  miss: { kind: "miss", label: "Miss" },
  undetermined: { kind: "undetermined", label: "Undecided" },
  long: { kind: "under_review", label: "Under review since Wednesday, December 2" },
  zh: { kind: "partial", label: "部分命中" },
  ja: { kind: "due", label: "11月26日 期限", loud: true },
});
