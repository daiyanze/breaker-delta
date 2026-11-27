/**
 * `@bd/ui/tokens` (ADR 0020, section 5): the Tide Paper tokens as values and
 * as CSS. The values are `tokens.gen.ts`, generated from
 * `design/system/tokens.json`, plus the few the design states only in prose
 * (`supplement.ts`). No JSX, no DOM and no runtime API, so emails and share
 * cards can import it.
 *
 * Themes: the system's choice by default, and `<html data-theme="light|dark">`
 * overrides it either way.
 */
import { CONTROL, ICON, MASTHEAD, PHONE } from "./supplement.ts";
import {
  COLORS,
  type ColorToken,
  FAMILIES,
  RADII,
  type RadiusToken,
  RULES,
  type RuleToken,
  SHADOWS,
  SPACING,
  type SpaceToken,
  TYPE_STYLES,
  type TypeStyle,
} from "./tokens.gen.ts";

export { FONT_FILES, type FontFile, fontFaceCss } from "./fonts.ts";
export { CONTROL, ICON, MASTHEAD, PHONE, TWO_COLUMNS_FROM } from "./supplement.ts";
export type {
  ColorToken,
  FontFamily,
  RadiusToken,
  RuleToken,
  ShadowToken,
  SpaceToken,
  TypeStyle,
} from "./tokens.gen.ts";

export type Theme = "light" | "dark";

/** A colour token's value in one theme. Not `color(`: `scripts/check-colors.ts` reads that as a CSS colour function. */
export function colorOf(name: ColorToken, theme: Theme): string {
  return COLORS[name][theme];
}

/** A spacing, radius or line-width token's value. */
export function size(name: SpaceToken | RadiusToken | RuleToken): string {
  const all: Readonly<Record<string, string>> = { ...SPACING, ...RADII, ...RULES };
  return all[name] as string;
}

/** One type style with its family resolved to the font stack. */
export interface TypeValues {
  family: string;
  size: string;
  lineHeight: number;
  weight: number;
  style: string;
  tracking: string;
}

export function typeStyle(name: TypeStyle): TypeValues {
  const s = TYPE_STYLES[name];
  return {
    family: FAMILIES[s.family],
    size: s.fontSize,
    lineHeight: s.lineHeight,
    weight: s.fontWeight,
    style: s.fontStyle ?? "normal",
    tracking: s.letterSpacing ?? "normal",
  };
}

const decl = (name: string, value: string | number) => `--${name}:${value};`;

/**
 * Each themed colour once, as `light-dark()`, which picks by the element's
 * `color-scheme`. A colour that is the same in both themes is written plain.
 */
function colorVars(): string {
  return Object.entries(COLORS)
    .map(([name, v]) =>
      decl(name, v.light === v.dark ? v.light : `light-dark(${v.light},${v.dark})`),
    )
    .join("");
}

/** `light-dark()` takes colours only, so each shadow keeps one value per theme block. */
function shadowVars(theme: Theme): string {
  return Object.entries(SHADOWS)
    .map(([name, v]) => decl(name, v[theme]))
    .join("");
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function staticVars(): string {
  const out: string[] = [];
  for (const [name, stack] of Object.entries(FAMILIES)) out.push(decl(`font-${name}`, stack));
  for (const [name, s] of Object.entries(TYPE_STYLES)) {
    out.push(
      decl(`type-${name}-size`, s.fontSize),
      decl(`type-${name}-line`, s.lineHeight),
      decl(`type-${name}-weight`, s.fontWeight),
      decl(`type-${name}-style`, s.fontStyle ?? "normal"),
      decl(`type-${name}-tracking`, s.letterSpacing ?? "normal"),
    );
  }
  for (const group of [SPACING, RADII, RULES]) {
    for (const [name, value] of Object.entries(group)) out.push(decl(name, value));
  }
  // The values of `supplement.ts`, for the components' CSS files.
  for (const [name, v] of Object.entries(PHONE)) out.push(decl(`phone-${kebab(name)}`, v.value));
  for (const [name, v] of Object.entries(CONTROL)) out.push(decl(`control-${kebab(name)}`, v));
  for (const [name, v] of Object.entries(ICON)) out.push(decl(`icon-${kebab(name)}`, v));
  for (const [name, v] of Object.entries(MASTHEAD)) out.push(decl(`masthead-${kebab(name)}`, v));
  return out.join("");
}

/**
 * CSS variables for every token, one block per line. The page takes the
 * system's theme (`color-scheme: light dark`) unless `<html data-theme>`
 * picks one. The shadows have three blocks: the root (light), dark from
 * the system, dark by choice.
 */
export function tokensCss(): string {
  return [
    `:root{${staticVars()}color-scheme:light dark;${colorVars()}${shadowVars("light")}}`,
    `:root[data-theme="light"]{color-scheme:light}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${shadowVars("dark")}}}`,
    `:root[data-theme="dark"]{color-scheme:dark;${shadowVars("dark")}}`,
  ].join("\n");
}

/** `.type-<name>` sets one type style from the scale: family, size, line, weight, style, tracking. */
export function typeClassesCss(): string {
  return Object.entries(TYPE_STYLES)
    .map(
      ([name, s]) =>
        `.type-${name}{font-family:var(--font-${s.family});font-size:var(--type-${name}-size);` +
        `line-height:var(--type-${name}-line);font-weight:var(--type-${name}-weight);` +
        `font-style:var(--type-${name}-style);letter-spacing:var(--type-${name}-tracking)}`,
    )
    .join("\n");
}
