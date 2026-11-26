/** @jsxImportSource preact */
/**
 * The whole HTML document every page is (ADR 0020, sections 1 and 3): the
 * head with the design system, then the page's content. HTML text is
 * produced in one place, `renderDocument`, so escaping is the renderer's,
 * not the caller's: a page passes plain strings and never builds markup.
 */
import type { ComponentChildren, VNode } from "preact";
import { renderToString } from "preact-render-to-string";
import { FONT_FILES, type Theme } from "../tokens/index.ts";

/** Where both adapters serve the client files and the fonts (ADR 0020, section 11). */
export const CLIENT = {
  css: "/client/ui.css",
  loader: "/client/loader.js",
  fonts: "/fonts",
} as const;

export interface DocumentProps {
  lang: string;
  title: string;
  /** Sets `<html data-theme>`; without it the page follows the system. */
  theme?: Theme;
  /** More of the `<head>`, after the stylesheet: icons, robots. */
  head?: ComponentChildren;
  children: ComponentChildren;
}

/**
 * A preload for each font the first line uses, so it is ready before the
 * short block period ends (the faces are `font-display: optional`), and
 * the stylesheet.
 */
export function Document(props: DocumentProps): VNode {
  return (
    <html lang={props.lang} {...(props.theme === undefined ? {} : { "data-theme": props.theme })}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        {FONT_FILES.filter((f) => f.preload).map((f) => (
          <link
            key={f.file}
            rel="preload"
            href={`${CLIENT.fonts}/${f.file}`}
            as="font"
            type="font/woff2"
            crossorigin="anonymous"
          />
        ))}
        <link rel="stylesheet" href={CLIENT.css} />
        {props.head}
      </head>
      <body>{props.children}</body>
    </html>
  );
}

/** The document as HTML text, with its doctype. The only place HTML text is made. */
export function renderDocument(document: VNode): string {
  return `<!doctype html>${renderToString(document)}`;
}
