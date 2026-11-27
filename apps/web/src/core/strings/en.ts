/**
 * The site's interface strings in English, the reference language (design
 * system "文字"). Its keys are every key: `zh.ts` and `ja.ts` are typed
 * `Table`, so a key missing there, or one this file does not have, fails
 * the type check, and `strings.test.ts` fails on it as well (#107).
 *
 * `{name}` is a value the page fills in; each language uses the same names.
 */
export const en = {
  "front.name": "Front page",
  "front.edition": "The {label} edition. Sea state: {sea}. {waves} waves up, {formed} new today.",
  "front.flat.name": "The sea is flat.",
  "front.flat.text": "Nothing has been scanned yet. Next scan: {next}.",
  "classifieds.name": "Classifieds",
  "fixture.note": "Fixture data.",
  "sea.flat": "flat",
  "sea.calm": "calm",
  "sea.moderate": "moderate",
  "sea.choppy": "choppy",
  "strip.date": "{weekday}, {month} {day}, {year}",
  "month.1": "January",
  "month.2": "February",
  "month.3": "March",
  "month.4": "April",
  "month.5": "May",
  "month.6": "June",
  "month.7": "July",
  "month.8": "August",
  "month.9": "September",
  "month.10": "October",
  "month.11": "November",
  "month.12": "December",
  "month.short.1": "Jan",
  "month.short.2": "Feb",
  "month.short.3": "Mar",
  "month.short.4": "Apr",
  "month.short.5": "May",
  "month.short.6": "Jun",
  "month.short.7": "Jul",
  "month.short.8": "Aug",
  "month.short.9": "Sep",
  "month.short.10": "Oct",
  "month.short.11": "Nov",
  "month.short.12": "Dec",
  "weekday.0": "Sunday",
  "weekday.1": "Monday",
  "weekday.2": "Tuesday",
  "weekday.3": "Wednesday",
  "weekday.4": "Thursday",
  "weekday.5": "Friday",
  "weekday.6": "Saturday",
  "strip.line": "No. {number}. Sea state: {sea}.",
  "strip.count.one": "{count} wave up",
  "strip.count.other": "{count} waves up",
  "strip.note": "{formed} new today, scanned {time}",
  "strip.short": "{formed} new today",
  "strip.first": "first scan at {time}",
  "search.name": "Search",
  "language.menu": "Language: {language}",
  "theme.toDark": "Switch to dark mode",
  "theme.toLight": "Switch to light mode",
  "scaffold.name": "Scaffold",
  "scaffold.text": "2.0 scaffold. The site arrives in milestone M3.",
  "catalog.name": "Catalog",
  "catalog.summary":
    "{components} components, {themes} themes, {languages} languages. This page: {theme}, {language}.",
  "catalog.states": "{layer}, {count} states",
  "catalog.theme.light": "light",
  "catalog.theme.dark": "dark",
} as const;

export type StringKey = keyof typeof en;

/** One language's table: every key, each a string. */
export type Table = { readonly [K in StringKey]: string };
