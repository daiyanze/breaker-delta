/** @jsxImportSource preact */
import ThemeSwitch from "../../primitives/ThemeSwitch/ThemeSwitch.island.tsx";
import { states } from "../../runtime/index.ts";
import { LanguageMenu } from "../LanguageMenu/LanguageMenu.tsx";
import { Masthead, type MastheadLink } from "./Masthead.tsx";

const PATHS = ["/", "/changes", "/echoes", "/record", "/sources", "/about"];

const nav = (labels: readonly string[], current = 0): MastheadLink[] =>
  labels.map((label, i) => ({ href: PATHS[i] ?? "/", label, current: i === current }));

const EN = ["Front page", "Changes", "Echoes", "Track record", "Sources", "About"];
// Board 35's navigation in each language.
const ZH = ["头版", "变化", "回波", "战绩", "来源", "关于"];
const JA = ["一面", "変更", "エコー", "的中記録", "ソース", "概要"];

const en = { home: "/", name: "Breaker Delta", navLabel: "Main", sectionsLabel: "Sections" };

// The navigation's width depends on its text, so a long state and a state
// per language (ADR 0020, section 12). The phone disclosure opens by a
// click, so its open state is a starting prop; the long one is open too, so
// its list is in the phone shot. `tools` shows the row above the wordmark
// as the pages fill it.
export default states(Masthead, {
  default: { ...en, links: nav(EN) },
  current: { ...en, links: nav(EN, 3) },
  open: { ...en, links: nav(EN), open: true },
  tools: {
    ...en,
    links: nav(EN),
    tools: (
      <>
        <LanguageMenu
          label="Language: English"
          links={[
            { href: "/", lang: "en", name: "English", current: true },
            { href: "/zh/", lang: "zh", name: "中文", current: false },
            { href: "/ja/", lang: "ja", name: "日本語", current: false },
          ]}
        />
        <ThemeSwitch toDark="Switch to dark mode" toLight="Switch to light mode" />
      </>
    ),
  },
  long: {
    ...en,
    sectionsLabel: "All the sections of this paper",
    links: nav(
      [
        "The front page of this edition",
        "Every change since the last run",
        "All the echoes we read",
        "The track record of our calls",
        "Every source we scan",
        "About this paper and how it works",
      ],
      5,
    ),
    open: true,
  },
  zh: {
    home: "/zh/",
    name: "Breaker Delta",
    navLabel: "主导航",
    sectionsLabel: "栏目",
    links: nav(ZH),
  },
  ja: {
    home: "/ja/",
    name: "Breaker Delta",
    navLabel: "メイン",
    sectionsLabel: "セクション",
    links: nav(JA),
  },
});
