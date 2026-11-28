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
  "verdicts.name": "Were we right?",
  "verdicts.note":
    "Every wave gets one test, locked the moment it forms and checked 14 days later against outside reporting.",
  "verdicts.note.before":
    "Every wave gets one test, locked the moment it forms and checked 14 days later against outside reporting. No verdicts yet. When they land, each stub gets stamped.",
  "verdicts.link": "Open the track record",
  "verdicts.firstDue": "The first test comes due on {date}.",
  "verdicts.noneRegistered": "No wave has formed yet, so no test is locked.",
  "verdicts.noneDue": "No test is due right now. Every verdict so far is in the track record.",
  "stamp.due": "Due {date}",
  "stamp.under_review": "Under review",
  "stamp.hit": "Hit",
  "stamp.partial": "Partial",
  "stamp.miss": "Miss",
  "stamp.undetermined": "Undecided",
  "stub.day": "Day {day} of {days}",
  "stub.confirmed": "Confirmed {date}",
  "stub.revised": "Revised {date}",
  "classifieds.name": "Classifieds",
  "fixture.note": "Fixture data.",
  "sea.flat": "flat",
  "sea.calm": "calm",
  "sea.moderate": "moderate",
  "sea.choppy": "choppy",
  "language.menu": "Language: {language}",
  "theme.toDark": "Switch to dark mode",
  "theme.toLight": "Switch to light mode",
  "echoStack.label": "Echoes stacking into a wave, {layers} layers high",
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
