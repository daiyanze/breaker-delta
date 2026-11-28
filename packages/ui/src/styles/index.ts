/// <reference path="./css.d.ts" />
/**
 * `@bd/ui/styles` (ADR 0020, section 4): the whole stylesheet as text. Each
 * `.css` file is written inside its layer and imported here as text; no
 * build step for CSS. `styles.test.ts` fails when a `.css` file under `src`
 * is missing from `CSS_FILES`. Every page links the result at
 * `/client/ui.css` (`@bd/ui/build`).
 */

import band from "../patterns/Band/Band.css" with { type: "text" };
import echoStack from "../patterns/EchoStack/EchoStack.css" with { type: "text" };
import footer from "../patterns/Footer/Footer.css" with { type: "text" };
import headline from "../patterns/Headline/Headline.css" with { type: "text" };
import languageMenu from "../patterns/LanguageMenu/LanguageMenu.css" with { type: "text" };
import stamp from "../patterns/Stamp/Stamp.css" with { type: "text" };
import ticketStub from "../patterns/TicketStub/TicketStub.css" with { type: "text" };
import ticketStubs from "../patterns/TicketStubs/TicketStubs.css" with { type: "text" };
import verdictMark from "../patterns/VerdictMark/VerdictMark.css" with { type: "text" };
import verdictMarks from "../patterns/VerdictMarks/VerdictMarks.css" with { type: "text" };
import themeSwitch from "../primitives/ThemeSwitch/ThemeSwitch.css" with { type: "text" };
import { fontFaceCss, tokensCss, typeClassesCss } from "../tokens/index.ts";
import base from "./base.css" with { type: "text" };

export { bandColumns, fontLoading, smallType, tabularFigures } from "./checks.ts";
export { type CssBlock, type CssRule, cssRules, cssValue, normalize, parseCss } from "./css.ts";

/** The cascade layers, first to last: a later layer wins over an earlier one. */
export const LAYERS = ["tokens", "base", "primitives", "patterns"] as const;
export type Layer = (typeof LAYERS)[number];

/** Where both adapters serve the font files (`apps/web/public/fonts`). */
export const FONTS = "/fonts";

/** Every `.css` file of the package, with its path under `src` and its layer, in layer order. */
export const CSS_FILES: readonly { path: string; layer: Layer; text: string }[] = [
  { path: "styles/base.css", layer: "base", text: base },
  { path: "primitives/ThemeSwitch/ThemeSwitch.css", layer: "primitives", text: themeSwitch },
  { path: "patterns/Band/Band.css", layer: "patterns", text: band },
  { path: "patterns/EchoStack/EchoStack.css", layer: "patterns", text: echoStack },
  { path: "patterns/Headline/Headline.css", layer: "patterns", text: headline },
  { path: "patterns/LanguageMenu/LanguageMenu.css", layer: "patterns", text: languageMenu },
  { path: "patterns/Footer/Footer.css", layer: "patterns", text: footer },
  { path: "patterns/Stamp/Stamp.css", layer: "patterns", text: stamp },
  { path: "patterns/TicketStub/TicketStub.css", layer: "patterns", text: ticketStub },
  { path: "patterns/TicketStubs/TicketStubs.css", layer: "patterns", text: ticketStubs },
  { path: "patterns/VerdictMark/VerdictMark.css", layer: "patterns", text: verdictMark },
  { path: "patterns/VerdictMarks/VerdictMarks.css", layer: "patterns", text: verdictMarks },
];

/**
 * The stylesheet: the layer order, the font faces (not in a layer: a
 * `@font-face` is not cascaded), the tokens, then every file in layer order.
 * The `.type-<name>` classes go in `base` after its rules, so on an element
 * they win over its default font as they did before the layers.
 */
export function uiCss(): string {
  const rank = (layer: Layer) => LAYERS.indexOf(layer);
  const files = [...CSS_FILES].sort((a, b) => rank(a.layer) - rank(b.layer));
  const at = (layer: Layer) => files.filter((f) => f.layer === layer).map((f) => f.text.trim());
  return [
    `@layer ${LAYERS.join(", ")};`,
    fontFaceCss(FONTS),
    `@layer tokens {\n${tokensCss()}\n}`,
    ...at("base"),
    `@layer base {\n${typeClassesCss()}\n}`,
    ...at("primitives"),
    ...at("patterns"),
    "",
  ].join("\n");
}
