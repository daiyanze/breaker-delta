/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { VerdictMark } from "./VerdictMark.tsx";

// One state per kind (VerdictMark README). A mark has no text of its own on
// the page, only its accessible name, so there is no long or per-language
// state.
export default states(VerdictMark, {
  hit: { mark: "hit", label: "hit" },
  partial: { mark: "partial", label: "partial" },
  miss: { mark: "miss", label: "miss" },
  undetermined: { mark: "undetermined", label: "undecided" },
  under_review: { mark: "under_review", label: "under review" },
  waiting: { mark: "waiting", label: "waiting" },
});
