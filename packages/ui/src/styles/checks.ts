/**
 * Rules of the design system that the stylesheet must keep, read from its
 * rules rather than its text. Each returns what is wrong, or nothing. The
 * tests run them on `uiCss()` (and the site's page head) and plant one
 * violation each to show they report it.
 */
import { FONT_FILES, TWO_COLUMNS_FROM } from "../tokens/index.ts";
import { type CssRule, cssRules, cssValue, normalize, parseCss } from "./css.ts";

const rulesOf = (css: string) => cssRules(parseCss(css));

/**
 * Numbers use tabular figures on every page (design system README): the
 * root sets them and every element inherits them, so no rule sets other
 * figures and no `font` shorthand resets them.
 */
export function tabularFigures(css: string): string[] {
  const rules = rulesOf(css);
  const problems: string[] = [];
  const root = rules.filter((r) => r.selector === "html" && r.media.length === 0);
  if (!root.some((r) => /\btabular-nums\b/.test(cssValue(r, "font-variant-numeric") ?? ""))) {
    problems.push("html does not set font-variant-numeric: tabular-nums");
  }
  for (const r of rules) {
    for (const [p, v] of r.declarations) {
      if (p === "font-variant-numeric" && !/\btabular-nums\b/.test(v)) {
        problems.push(`${r.selector} sets font-variant-numeric: ${v}`);
      }
      if (p === "font" && !/^(inherit|unset|revert)$/.test(v)) {
        problems.push(`${r.selector} sets font: ${v}, which resets the figures`);
      }
    }
  }
  return problems;
}

/** No type under 13px (design system README): every font size and type-size variable in px. */
export function smallType(css: string): string[] {
  const problems: string[] = [];
  for (const r of rulesOf(css)) {
    for (const [p, v] of r.declarations) {
      const sized = p === "font-size" || p === "font" || /^--.*-size$/.test(p);
      if (!sized) continue;
      for (const m of v.matchAll(/(\d+(?:\.\d+)?)px/g)) {
        if (Number(m[1]) < 13) problems.push(`${r.selector} ${p}: ${v} is under 13px`);
      }
    }
  }
  return problems;
}

/**
 * Fonts are self-hosted, preloaded and never swapped in late: one
 * `@font-face` per file with `font-display: optional`, and the page head
 * preloads exactly the files marked `preload`. `preloads` are the `href`s of
 * the head's `<link rel="preload" as="font">` elements.
 */
export function fontLoading(css: string, preloads: readonly string[], base = "/fonts"): string[] {
  const problems: string[] = [];
  const faces = rulesOf(css).filter((r) => r.selector === "@font-face");
  if (faces.length !== FONT_FILES.length) {
    problems.push(`${faces.length} @font-face rules for ${FONT_FILES.length} font files`);
  }
  for (const f of FONT_FILES) {
    const url = `${base}/${f.file}`;
    const face = faces.find((r) => (cssValue(r, "src") ?? "").includes(`url(${url})`));
    if (face === undefined) problems.push(`no @font-face for ${url}`);
    else if (cssValue(face, "font-display") !== "optional") {
      problems.push(`${url} is not font-display: optional, so it can swap in late`);
    }
    if (f.preload && !preloads.includes(url)) problems.push(`${url} is not preloaded`);
    if (!f.preload && preloads.includes(url))
      problems.push(`${url} is preloaded but not used first`);
  }
  for (const href of preloads) {
    if (!href.startsWith(`${base}/`)) problems.push(`${href} is not a self-hosted font`);
  }
  return problems;
}

const WIDE = normalize(`(min-width: ${TWO_COLUMNS_FROM})`);

/**
 * The band: one column on phones with a static rail; two columns, the
 * `rail` width and the content, with a sticky rail from `TWO_COLUMNS_FROM`.
 */
export function bandColumns(css: string): string[] {
  const rules = rulesOf(css).filter((r) => r.layer === "patterns");
  const at = (selector: string, wide: boolean) =>
    rules.filter(
      (r: CssRule) =>
        r.selector === selector && (wide ? r.media.join() === WIDE : r.media.length === 0),
    );
  const value = (selector: string, wide: boolean, property: string) =>
    at(selector, wide)
      .map((r) => cssValue(r, property))
      .filter((v) => v !== undefined)
      .at(-1);
  const problems: string[] = [];
  const expect = (selector: string, wide: boolean, property: string, want: string) => {
    const got = value(selector, wide, property);
    if (got !== normalize(want)) {
      const where = wide ? ` from ${TWO_COLUMNS_FROM}` : "";
      problems.push(`${selector}${where}: ${property} is ${got ?? "unset"}, not ${want}`);
    }
  };
  expect(".band", false, "display", "grid");
  expect(".band", false, "grid-template-columns", "minmax(0, 1fr)");
  expect(".band", true, "grid-template-columns", "minmax(0, var(--rail)) minmax(0, 1fr)");
  expect(".band-rail", true, "position", "sticky");
  if (value(".band-rail", false, "position") === "sticky") {
    problems.push(".band-rail is sticky on phones");
  }
  for (const r of rules) {
    if (r.media.some((m) => m.includes("width") && m !== WIDE)) {
      problems.push(`${r.selector} sits in @media ${r.media.join(" and ")}, not ${WIDE}`);
    }
  }
  return problems;
}
