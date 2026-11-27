/** @jsxImportSource preact */
import ThemeSwitch from "../../primitives/ThemeSwitch/ThemeSwitch.island.tsx";
import { states } from "../../runtime/index.ts";
import { LanguageMenu } from "../LanguageMenu/LanguageMenu.tsx";
import { DateStrip } from "./DateStrip.tsx";

const LANGUAGES = [
  { href: "/", lang: "en", name: "English" },
  { href: "/zh/", lang: "zh", name: "中文" },
  { href: "/ja/", lang: "ja", name: "日本語" },
];

/** The controls a page puts in the strip: its language menu and the theme switch. */
const controls = (lang: string, label: string, toDark: string, toLight: string) => (
  <>
    <LanguageMenu
      label={label}
      links={LANGUAGES.map((l) => ({ ...l, current: l.lang === lang }))}
    />
    <ThemeSwitch toDark={toDark} toLight={toLight} />
  </>
);

const en = controls("en", "Language: English", "Switch to dark mode", "Switch to light mode");

const DAY = {
  month: "Nov",
  day: "19",
  date: "Thursday, November 19, 2026",
  dateTime: "2026-11-19",
  search: { href: "/search", label: "Search" },
};

// The date, the tag's lines and the controls' labels set the row's width,
// so long text and each language's own text are states (ADR 0020, section
// 12). `calm` and `flat` are the strip on a quiet day and before the first
// scan (boards 19 and 17); `choppy` is board 01's.
export default states(DateStrip, {
  default: {
    ...DAY,
    line: "No. 323. Sea state: choppy.",
    count: "16 waves up",
    note: "5 new today, scanned 14:00",
    shortNote: "5 new today",
    children: en,
  },
  calm: {
    ...DAY,
    line: "No. 323. Sea state: calm.",
    count: "2 waves up",
    note: "1 new today, scanned 14:00",
    shortNote: "1 new today",
    children: en,
  },
  flat: {
    ...DAY,
    line: "No. 323. Sea state: flat.",
    count: "0 waves up",
    note: "first scan at 15:00",
    shortNote: "first scan at 15:00",
    children: en,
  },
  long: {
    ...DAY,
    month: "September",
    day: "30",
    date: "Wednesday, September 30, 2026",
    dateTime: "2026-09-30",
    line: "No. 273. Sea state: moderate, with a long swell from the south.",
    count: "1,284 waves up across every source",
    note: "1,036 new today, scanned 23:30 after a long run",
    shortNote: "1,036 new today",
    search: { href: "/search", label: "Search every topic and echo" },
    children: controls(
      "en",
      "Choose the language this page is shown in: English",
      "Switch every page of the site to the dark theme",
      "Switch every page of the site to the light theme",
    ),
  },
  zh: {
    month: "11月",
    day: "19",
    date: "2026年11月19日 星期四",
    dateTime: "2026-11-19",
    line: "第 323 期。海况：有浪。",
    count: "16 个浪",
    note: "今天新成 5 个，14:00 扫描",
    shortNote: "今天新成 5 个",
    search: { href: "/zh/search", label: "搜索" },
    children: controls("zh", "语言：中文", "切换到深色模式", "切换到浅色模式"),
  },
  ja: {
    month: "11月",
    day: "19",
    date: "2026年11月19日（木）",
    dateTime: "2026-11-19",
    line: "第323号。海況：波あり。",
    count: "波は16",
    note: "きょう新たに5、14:00 スキャン",
    shortNote: "きょう新たに5",
    search: { href: "/ja/search", label: "検索" },
    children: controls(
      "ja",
      "言語：日本語",
      "ダークモードに切り替える",
      "ライトモードに切り替える",
    ),
  },
});
