/**
 * The page skeleton every public page shares (issue #106, design system
 * "版式"): one page width, and content in bands. A band is a narrow left
 * rail with the italic section name and a right column with the content.
 * The styles are `@bd/ui`'s stylesheet, linked from every page (ADR 0020,
 * section 4): the band's in `packages/ui/src/patterns/Band/Band.css`.
 */
import { FONT_FILES } from "@bd/ui/tokens";
import { ICON_LINKS } from "./icon.ts";

/** Where both adapters serve the stylesheet and the font files (ADR 0020, section 11). */
export const CLIENT = { css: "/client/ui.css", fonts: "/fonts" } as const;

/**
 * The design system in a page's `<head>`: a preload for each font the first
 * line uses, so it is ready before the short block period ends (the faces
 * are `font-display: optional`), and the stylesheet.
 */
export const HEAD_STYLES = [
  ...FONT_FILES.filter((f) => f.preload).map(
    (f) =>
      `<link rel="preload" href="${CLIENT.fonts}/${f.file}" as="font" type="font/woff2" crossorigin>`,
  ),
  `<link rel="stylesheet" href="${CLIENT.css}">`,
].join("\n");

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** One section of a page. `content` is HTML the caller has already escaped. */
export interface Band {
  /** Unique on the page; the section name's element id is `band-<id>`. */
  id: string;
  /** The section name in the rail, plain text. */
  name: string;
  /** One sentence under the name, plain text. */
  note?: string;
  content: string;
}

export function renderBand(band: Band): string {
  const headingId = `band-${band.id}`;
  const note = band.note === undefined ? "" : `\n<p class="band-note">${escapeHtml(band.note)}</p>`;
  return `<section class="band" aria-labelledby="${escapeHtml(headingId)}">
<div class="band-rail">
<h2 id="${escapeHtml(headingId)}" class="band-name">${escapeHtml(band.name)}</h2>${note}
</div>
<div class="band-body">
${band.content}
</div>
</section>`;
}

export interface Page {
  lang: string;
  title: string;
  /** Plain text above the bands, until the masthead (UI-07) replaces it. */
  heading: string;
  bands: readonly Band[];
}

/** A whole document: head with the design system, the heading, then the bands. */
export function renderPage(page: Page): string {
  return `<!doctype html>
<html lang="${escapeHtml(page.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(page.title)}</title>
${ICON_LINKS}
${HEAD_STYLES}
</head>
<body>
<header class="page">
<h1>${escapeHtml(page.heading)}</h1>
</header>
<main class="page">
${page.bands.map(renderBand).join("\n")}
</main>
</body>
</html>`;
}
