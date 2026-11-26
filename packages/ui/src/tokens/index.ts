/**
 * `@bd/ui/tokens` (ADR 0020, section 5): the Tide Paper tokens as values and
 * as CSS. The values are `tokens.gen.ts`, generated from
 * `design/system/tokens.json`, plus the few the design states only in prose
 * (`supplement.ts`). No JSX, no DOM and no runtime API, so emails and share
 * cards can import it.
 *
 * Themes: light by default, dark when the system asks for it, and
 * `<html data-theme="light|dark">` overrides the system either way.
 */
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
export { CONTROL, PHONE, TWO_COLUMNS_FROM } from "./supplement.ts";
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

function themeVars(theme: Theme): string {
  const colors = Object.entries(COLORS).map(([name, v]) => decl(name, v[theme]));
  const shadows = Object.entries(SHADOWS).map(([name, v]) => decl(name, v[theme]));
  return `color-scheme:${theme};${colors.join("")}${shadows.join("")}`;
}

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
  return out.join("");
}

/** CSS variables for every token, in both themes: one block per line. */
export function tokensCss(): string {
  return [
    `:root{${staticVars()}${themeVars("light")}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${themeVars("dark")}}}`,
    `:root[data-theme="dark"]{${themeVars("dark")}}`,
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
