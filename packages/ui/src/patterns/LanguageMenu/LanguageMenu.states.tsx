/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { type LanguageLink, LanguageMenu } from "./LanguageMenu.tsx";

const links = (current: string): LanguageLink[] =>
  [
    { href: "/", lang: "en", name: "English" },
    { href: "/zh/", lang: "zh", name: "中文" },
    { href: "/ja/", lang: "ja", name: "日本語" },
  ].map((l) => ({ ...l, current: l.lang === current }));

// One state per language: the button's label is in the page's language.
export default states(LanguageMenu, {
  en: { label: "Language: English", links: links("en") },
  zh: { label: "语言：中文", links: links("zh") },
  ja: { label: "言語：日本語", links: links("ja") },
});
