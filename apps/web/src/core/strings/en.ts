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
  "language.menu": "Language: {language}",
  "theme.toDark": "Switch to dark mode",
  "theme.toLight": "Switch to light mode",
  "echoStack.label": "Echoes stacking into a wave, {layers} layers high",
  "headline.kicker.tallest": "Tallest wave right now",
  "headline.kicker.formed": "Formed today, already the tallest",
  "headline.new": "New today.",
  "headline.newYesterday": "Formed yesterday.",
  "headline.again": "Up again after going flat.",
  "headline.up": "Up {percent}% in 24 hours.",
  "headline.down": "Down {percent}% in 24 hours.",
  "headline.level": "Level over 24 hours.",
  "headline.meta": "{sources} independent sources, {echoes} echoes.",
  "headline.trend": "Wave height of the tallest story up to {time}",
  "headline.key": "Headline size follows wave height. Red formed today. Lighter ink is fading.",
  "footer.subscribe": "One email a day, with the new waves.",
  "footer.email": "you@example.com",
  "footer.submit": "Subscribe",
  "footer.nav": "Footer",
  "footer.scoring": "How wave height is scored",
  "footer.scoring.short": "How it is scored",
  "footer.own": "Run your own radar",
  "footer.own.short": "Run your own",
  "footer.data": "Atom feed, API and open data",
  "footer.data.short": "Feed, API, data",
  "footer.github": "GitHub",
  "footer.art": "A lighthouse on a rock sweeps its beam over rolling waves and a small sailboat",
  "footer.open": "Breaker Delta is open source.",
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
