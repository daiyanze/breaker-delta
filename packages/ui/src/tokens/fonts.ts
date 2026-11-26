/**
 * The self-hosted font files and their `@font-face` rules. The files are in
 * `apps/web/public/fonts`, with their licences.
 */

/** One self-hosted font file. Served at `<base>/<file>` by both adapters. */
export interface FontFile {
  file: string;
  family: "Fraunces" | "Instrument Sans";
  style: "normal" | "italic";
  weight: string;
  unicodeRange: string;
  /** Preloaded on every page: the Latin files the pages use from the first line. */
  preload: boolean;
}

// The subsets Google Fonts serves for these families (SIL Open Font License).
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, " +
  "U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, " +
  "U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, " +
  "U+2C60-2C7F, U+A720-A7FF";

export const FONT_FILES: readonly FontFile[] = [
  {
    file: "fraunces-latin.woff2",
    family: "Fraunces",
    style: "normal",
    weight: "400 900",
    unicodeRange: LATIN,
    preload: true,
  },
  {
    file: "fraunces-latin-ext.woff2",
    family: "Fraunces",
    style: "normal",
    weight: "400 900",
    unicodeRange: LATIN_EXT,
    preload: false,
  },
  {
    file: "fraunces-italic-latin.woff2",
    family: "Fraunces",
    style: "italic",
    weight: "400 900",
    unicodeRange: LATIN,
    preload: true,
  },
  {
    file: "fraunces-italic-latin-ext.woff2",
    family: "Fraunces",
    style: "italic",
    weight: "400 900",
    unicodeRange: LATIN_EXT,
    preload: false,
  },
  {
    file: "instrument-sans-latin.woff2",
    family: "Instrument Sans",
    style: "normal",
    weight: "400 700",
    unicodeRange: LATIN,
    preload: true,
  },
  {
    file: "instrument-sans-latin-ext.woff2",
    family: "Instrument Sans",
    style: "normal",
    weight: "400 700",
    unicodeRange: LATIN_EXT,
    preload: false,
  },
];

/**
 * One `@font-face` per file, with the files at `<base>/<file>`.
 * `font-display: optional`: a font that is not ready within the short block
 * period is not swapped in later, so text never reflows while fonts load.
 * The page's preloads make it ready on almost every load.
 */
export function fontFaceCss(base: string): string {
  return FONT_FILES.map(
    (f) =>
      `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};` +
      `font-display:optional;src:url(${base}/${f.file}) format("woff2");unicode-range:${f.unicodeRange}}`,
  ).join("\n");
}
