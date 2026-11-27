/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { type LanguageLink, LanguageMenu } from "./LanguageMenu.tsx";

const NAMES = [
  { href: "/", lang: "en", name: "English" },
  { href: "/zh/", lang: "zh", name: "中文" },
  { href: "/ja/", lang: "ja", name: "日本語" },
];

const links = (current: string, names = NAMES): LanguageLink[] =>
  names.map((l) => ({ ...l, current: l.lang === current }));

// The button shows the current language's name, so its width depends on the
// text: a long state, and a state per language labelled in that language
// (ADR 0020, section 12). The list opens by a click, so the open state is a
// starting prop; the long one is open too, so its list is in the shot.
export default states(LanguageMenu, {
  default: { label: "Language: English", links: links("en") },
  open: { label: "Language: English", links: links("en"), open: true },
  long: {
    label: "Choose the language this page is shown in: English (United Kingdom)",
    links: links("en", [
      { href: "/", lang: "en", name: "English (United Kingdom)" },
      { href: "/zh/", lang: "zh", name: "中文（中华人民共和国）" },
      { href: "/ja/", lang: "ja", name: "日本語（日本国）" },
    ]),
    open: true,
  },
  zh: { label: "语言：中文", links: links("zh") },
  ja: { label: "言語：日本語", links: links("ja") },
});
