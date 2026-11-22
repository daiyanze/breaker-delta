/**
 * The Tide Paper design system as CSS (issue #104, ADR 0015). Every colour,
 * type size, spacing, radius, shadow and line width comes from
 * `design/system/tokens.json`; nothing here repeats a value from it.
 *
 * Themes: light by default, dark when the system asks for it, and
 * `<html data-theme="light|dark">` overrides the system either way (the
 * switch itself is UI-02).
 */
import tokens from "../../../../design/system/tokens.json" with { type: "json" };

type Theme = "light" | "dark";
type Themed = { light: string; dark: string };

/** One self-hosted font file. Served at `/fonts/<file>` by both adapters. */
export interface FontFile {
  file: string;
  family: "Fraunces" | "Instrument Sans";
  style: "normal" | "italic";
  weight: string;
  unicodeRange: string;
  /** Preloaded on every page: the Latin files the pages use from the first line. */
  preload: boolean;
}

// The subsets Google Fonts serves for these families (SIL Open Font License;
// the licences are next to the files in `apps/web/public/fonts`).
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

const fontUrl = (f: FontFile) => `/fonts/${f.file}`;

/**
 * `font-display: optional`: a font that is not ready within the short block
 * period is not swapped in later, so text never reflows while fonts load.
 * The preloads below make it ready on almost every load.
 */
const FONT_FACES = FONT_FILES.map(
  (f) =>
    `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};` +
    `font-display:optional;src:url(${fontUrl(f)}) format("woff2");unicode-range:${f.unicodeRange}}`,
).join("\n");

const decl = (name: string, value: string | number) => `--${name}:${value};`;

function themeVars(theme: Theme): string {
  const colors = tokens.color.tokens.map((t) => decl(t.name, (t.value as Themed)[theme]));
  const shadows = tokens.shadow.tokens.map((t) => decl(t.name, (t.value as Themed)[theme]));
  return `color-scheme:${theme};${colors.join("")}${shadows.join("")}`;
}

interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: number;
  fontWeight: number;
  fontStyle?: string;
  letterSpacing?: string;
}

const typeStyles = tokens.type.groups.flatMap((g) =>
  (g.styles as TypeStyle[]).map((s) => ({ ...s, family: g.family })),
);

function staticVars(): string {
  const out: string[] = [];
  for (const [name, stack] of Object.entries(tokens.type.families)) {
    out.push(decl(`font-${name}`, stack));
  }
  for (const s of typeStyles) {
    out.push(
      decl(`type-${s.name}-size`, s.fontSize),
      decl(`type-${s.name}-line`, s.lineHeight),
      decl(`type-${s.name}-weight`, s.fontWeight),
      decl(`type-${s.name}-style`, s.fontStyle ?? "normal"),
      decl(`type-${s.name}-tracking`, s.letterSpacing ?? "normal"),
    );
  }
  for (const group of [tokens.spacing, tokens.radius, tokens.rule]) {
    for (const t of group.tokens) out.push(decl(t.name, t.value));
  }
  return out.join("");
}

/** `.type-<name>` sets one type style from the scale: family, size, line, weight, style, tracking. */
const TYPE_CLASSES = typeStyles
  .map(
    (s) =>
      `.type-${s.name}{font-family:var(--font-${s.family});font-size:var(--type-${s.name}-size);` +
      `line-height:var(--type-${s.name}-line);font-weight:var(--type-${s.name}-weight);` +
      `font-style:var(--type-${s.name}-style);letter-spacing:var(--type-${s.name}-tracking)}`,
  )
  .join("\n");

/** CSS variables for every token, in both themes. */
export const TOKENS_CSS = [
  `:root{${staticVars()}${themeVars("light")}}`,
  `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${themeVars("dark")}}}`,
  `:root[data-theme="dark"]{${themeVars("dark")}}`,
].join("\n");

/**
 * Page defaults. Numbers use tabular figures everywhere (inherited); form
 * controls inherit the page font instead of the browser's.
 */
const BASE_CSS = [
  "*,*::before,*::after{box-sizing:border-box}",
  "html{background:var(--paper);color:var(--ink);font-family:var(--font-body);" +
    "font-size:var(--type-body-size);line-height:var(--type-body-line);" +
    "font-variant-numeric:tabular-nums;-webkit-text-size-adjust:100%;text-size-adjust:100%}",
  "body{margin:0;overflow-wrap:break-word}",
  "button,input,select,textarea{font:inherit;color:inherit}",
  "h1,h2,h3{font-family:var(--font-display)}",
  "a{color:var(--blue)}",
  "img,svg{max-width:100%}",
].join("\n");

/**
 * The two phone values the design system states only in prose, in the
 * `usage` of the token they replace on phones (`tokens.json`). `layout.test.ts`
 * checks that each usage still says so.
 */
export const PHONE = {
  /** Page side margin: `space-6` "手机用 20px". */
  gutter: { value: "20px", token: "space-6" },
  /** Section name in the rail: `section` "手机 32px". */
  sectionSize: { value: "32px", token: "section" },
} as const;

/**
 * Below this width a band is one column: the rail becomes a heading above
 * the content. The design system names no breakpoint; this is the agent's
 * choice (#106): the narrowest width where the rail at its full `rail` width,
 * the `space-8` gap and a content column of about 480px still fit.
 */
export const TWO_COLUMNS_FROM = "960px";

/**
 * The page width and the band (design system "版式"). Phone values first;
 * from `TWO_COLUMNS_FROM` the desktop values, the two columns and the
 * sticky rail. Nothing here is wider than the viewport, so no page scrolls
 * sideways.
 */
const LAYOUT_CSS = [
  `:root{--page-gutter:${PHONE.gutter.value};--band-space:var(--space-7);` +
    `--band-name-size:${PHONE.sectionSize.value}}`,
  `@media (min-width:${TWO_COLUMNS_FROM}){:root{--page-gutter:var(--space-6);` +
    "--band-space:var(--space-8);--band-name-size:var(--type-section-size)}}",
  ".page{box-sizing:content-box;max-width:var(--content);margin-inline:auto;" +
    "padding-inline:var(--page-gutter)}",
  ".band{display:grid;grid-template-columns:minmax(0,1fr);row-gap:var(--space-5);" +
    "padding-block:var(--band-space);border-top:var(--rule-thin) solid var(--ink)}",
  ".band-rail{display:flex;flex-direction:column;gap:var(--space-3);min-width:0}",
  ".band-name{margin:0;font-family:var(--font-display);font-size:var(--band-name-size);" +
    "line-height:var(--type-section-line);font-weight:var(--type-section-weight);" +
    "font-style:var(--type-section-style);letter-spacing:var(--type-section-tracking)}",
  ".band-note{margin:0;color:var(--ink-2)}",
  ".band-body{min-width:0}",
  // The content's first line lines up with the section name.
  ".band-body>:first-child{margin-top:0}",
  `@media (min-width:${TWO_COLUMNS_FROM}){` +
    ".band{grid-template-columns:minmax(0,var(--rail)) minmax(0,1fr);column-gap:var(--space-8)}" +
    ".band-rail{position:sticky;top:var(--space-5);align-self:start}}",
].join("\n");

/** Everything a page's `<head>` needs for the design system: font preloads and the styles. */
export function headStyles(): string {
  const preloads = FONT_FILES.filter((f) => f.preload).map(
    (f) => `<link rel="preload" href="${fontUrl(f)}" as="font" type="font/woff2" crossorigin>`,
  );
  return `${preloads.join("\n")}
<style>
${FONT_FACES}
${TOKENS_CSS}
${TYPE_CLASSES}
${BASE_CSS}
${LAYOUT_CSS}
</style>`;
}
