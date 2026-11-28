/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { SourceTile } from "./SourceTile.tsx";

const STARTED = "Source where the story started";
const LATER = "Source that picked it up later";

// One state per fill and per generic icon, a favicon that loads and one
// that fails, the classifieds' small tile, and the name's wrapping in long
// text and in each language (ADR 0020, section 12). The favicons are the
// site's own icon files, served by the local site, so the shots fetch
// nothing outside it; `/icons/missing.png` is a 404 there.
export default states(SourceTile, {
  solid: { name: "Hacker News", fill: "solid", kind: "forum", label: STARTED },
  outline: { name: "Tech press group", fill: "outline", kind: "press", label: LATER },
  account: { name: "X key accounts", fill: "solid", kind: "account", label: STARTED },
  search: { name: "News search", fill: "outline", kind: "search", label: LATER },
  mail: { name: "Newsletter group", fill: "outline", kind: "mail", label: LATER },
  code: { name: "GitHub trending", fill: "outline", kind: "code", label: LATER },
  favicon: {
    name: "Breaker Delta",
    fill: "outline",
    kind: "press",
    favicon: "/icons/favicon.svg",
    label: LATER,
  },
  "favicon-solid": {
    name: "Breaker Delta",
    fill: "solid",
    kind: "press",
    favicon: "/icons/favicon.svg",
    label: STARTED,
  },
  "favicon-failed": {
    name: "Reddit",
    fill: "solid",
    kind: "forum",
    favicon: "/icons/missing.png",
    label: STARTED,
  },
  small: { name: "Hacker News, 13:42", fill: "outline", kind: "forum", size: "small" },
  long: {
    name: "Official blogs of the model labs, research groups and their engineering teams",
    fill: "outline",
    kind: "press",
    label: LATER,
  },
  zh: { name: "科技媒体组", fill: "solid", kind: "press", label: "故事开始的来源" },
  ja: { name: "テック系メディア", fill: "outline", kind: "press", label: "後から取り上げた情報源" },
});
