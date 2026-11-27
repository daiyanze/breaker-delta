/**
 * The Tide Paper design system as CSS (issue #104, ADR 0015). Every colour,
 * type size, spacing, radius, shadow and line width comes from
 * `@bd/ui/tokens`; nothing here repeats a value from it.
 *
 * Themes: light by default, dark when the system asks for it, and
 * `<html data-theme="light|dark">` overrides the system either way (the
 * switch itself is UI-02).
 */
import {
  FONT_FILES,
  fontFaceCss,
  PHONE,
  TWO_COLUMNS_FROM,
  tokensCss,
  typeClassesCss,
} from "@bd/ui/tokens";

/** Where both adapters serve the font files. */
const FONTS = "/fonts";

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
    (f) => `<link rel="preload" href="${FONTS}/${f.file}" as="font" type="font/woff2" crossorigin>`,
  );
  return `${preloads.join("\n")}
<style>
${fontFaceCss(FONTS)}
${tokensCss()}
${typeClassesCss()}
${BASE_CSS}
${LAYOUT_CSS}
</style>`;
}
