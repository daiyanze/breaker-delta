import { describe, expect, test } from "bun:test";
import tokens from "../../../../design/system/tokens.json" with { type: "json" };
import { type ColorToken, colorOf, type Theme, tokensCss } from "./index.ts";

/*
 * WCAG 2.2 AA contrast (#105, success criteria 1.4.3 and 1.4.11), computed
 * from the tokens for every text and background pair the design uses, in
 * both themes. Checked against the values of `tokens.json` through
 * `colorOf`, which `tokens.test.ts` ties to the file.
 */

/** Relative luminance of an sRGB colour written `#rrggbb` (WCAG 2.2, "relative luminance"). */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`${hex} is not #rrggbb`);
  const [r, g, b] = m.slice(1).map((h) => {
    const c = Number.parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours, from 1 to 21 (WCAG 2.2, "contrast ratio"). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour: a token in the theme being checked, or a token's value fixed to one theme. */
type Paint = ColorToken | { token: ColorToken; theme: Theme };
const paint = (p: Paint, theme: Theme) =>
  typeof p === "string" ? colorOf(p, theme) : colorOf(p.token, p.theme);

/** Normal-size text needs 4.5:1 (1.4.3); a control's outline and its icon 3:1 (1.4.11). */
const TEXT = 4.5;
const NON_TEXT = 3;

/**
 * Every pair the design puts text on, with where it says so. Every pair is
 * held to the normal-text ratio, even where the design's text is large.
 */
const TEXT_PAIRS: readonly { text: Paint; on: ColorToken; where: string }[] = [
  { text: "ink", on: "paper", where: "body text and headlines (README, 颜色: paper, ink)" },
  { text: "ink-2", on: "paper", where: "secondary text (`ink-2` usage: on paper and tint only)" },
  { text: "ink-2", on: "tint", where: "secondary text (`ink-2` usage: on paper and tint only)" },
  { text: "ink", on: "tint", where: "text in a tint panel (boards 09, 51)" },
  {
    text: "red",
    on: "paper",
    where: "wave numbers, correction titles, a hovered link (`red` usage)",
  },
  { text: "blue", on: "paper", where: "links (`blue` usage)" },
  { text: "on-sun", on: "sun", where: "the waves-up label (`on-sun` usage)" },
  { text: "paper", on: "ink", where: "a hovered button and the solid button (Button README)" },
  { text: "paper", on: "red", where: "the calendar page's month, 13px (board 01)" },
  {
    // Board 01 writes the footer's text as `#F2EFE4`, the light paper, in both themes.
    text: { token: "paper", theme: "light" },
    on: "solid",
    where: "the footer (board 01)",
  },
];

/** The theme switch's outline and icon, at rest and hovered (#105). */
const CONTROL_PAIRS: readonly { mark: ColorToken; on: ColorToken; where: string }[] = [
  { mark: "ink", on: "paper", where: "the secondary button's outline and icon" },
  { mark: "paper", on: "ink", where: "the hovered button's icon" },
  { mark: "blue", on: "paper", where: "the keyboard focus ring, outside every control (#112)" },
];

/**
 * The colours never used for text: the README's colour table ("不要用在哪:
 * 文字" for `hair`, `sky`, `solid`), the surfaces text sits on (`tint`,
 * `sun`) and the mascots' own colours (`cat`, `gull-line`, `gull-wing`).
 */
const NOT_TEXT: readonly ColorToken[] = [
  "hair",
  "sky",
  "solid",
  "tint",
  "sun",
  "cat",
  "gull-line",
  "gull-wing",
];

const THEMES: readonly Theme[] = ["light", "dark"];

describe("contrast", () => {
  test("the ratio matches WCAG's reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrast("#ffffff", "#777777")).toBe(contrast("#777777", "#ffffff"));
  });

  test("a pair under the ratio is reported", () => {
    // `ink` on `sun` is not a pair the design uses: it is why `on-sun` exists.
    expect(contrast(colorOf("ink", "dark"), colorOf("sun", "dark"))).toBeLessThan(TEXT);
  });

  for (const theme of THEMES) {
    test(`text on its background meets AA in the ${theme} theme`, () => {
      const short = TEXT_PAIRS.map((p) => ({
        pair: `${JSON.stringify(p.text)} on ${p.on}: ${p.where}`,
        ratio: contrast(paint(p.text, theme), colorOf(p.on, theme)),
      })).filter((p) => p.ratio < TEXT);
      expect(short).toEqual([]);
    });

    test(`the theme switch's outline and icon meet AA in the ${theme} theme`, () => {
      for (const p of CONTROL_PAIRS) {
        const ratio = contrast(colorOf(p.mark, theme), colorOf(p.on, theme));
        expect({ pair: `${p.mark} on ${p.on}`, ok: ratio >= NON_TEXT }).toEqual({
          pair: `${p.mark} on ${p.on}`,
          ok: true,
        });
      }
    });
  }

  test("every colour token is text in a pair, or a colour the design keeps off text", () => {
    const asText = TEXT_PAIRS.map((p) => (typeof p.text === "string" ? p.text : p.text.token));
    const classified = new Set<string>([...asText, ...NOT_TEXT]);
    // A token added to the design fails here until it is placed.
    expect(tokens.color.tokens.map((t) => t.name).filter((n) => !classified.has(n))).toEqual([]);
  });
});

describe("sun", () => {
  test("is the same colour in both themes, in the tokens and in the stylesheet", () => {
    const sun = tokens.color.tokens.find((t) => t.name === "sun");
    expect(colorOf("sun", "light")).toBe(colorOf("sun", "dark"));
    expect(colorOf("sun", "light")).toBe(sun?.value.dark as string);
    // A plain value, not `light-dark()`: no theme block changes it.
    expect(tokensCss()).toContain(`--sun:${colorOf("sun", "light")};`);
    expect(tokensCss().match(/--sun:/g)).toHaveLength(1);
  });
});
