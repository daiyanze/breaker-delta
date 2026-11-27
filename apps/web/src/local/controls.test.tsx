/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { CATALOG } from "@bd/ui/catalog";
import { Document, renderDocument } from "@bd/ui/runtime";
import { controlHeights, uiCss } from "@bd/ui/styles";

// "No control is shorter than 44px" (issue 112): the controls are read from what
// every catalog state renders, so a component added later is held to it too.
// Here, since only an app may join the catalog and the stylesheet.

/** A link, a button, a menu button or a field, and its first class. */
const CONTROL = /<(a|button|summary|input|select|textarea)\b[^>]*?\sclass="([\w-]+)/g;

function controlClasses(): string[] {
  const found = new Set<string>();
  for (const entry of CATALOG) {
    for (const state of entry.states) {
      const html = renderDocument(
        <Document lang="en" title="T">
          {entry.render(state)}
        </Document>,
      );
      const body = html.slice(html.indexOf("<body>"));
      for (const m of body.matchAll(CONTROL)) found.add(m[2] as string);
    }
  }
  return [...found].sort();
}

describe("no control is shorter than 44px (issue 112)", () => {
  test("every control the catalog shows has a control height", () => {
    const classes = controlClasses();
    expect(classes).toEqual([
      "Button",
      "Filters-item",
      "LanguageMenu-button",
      "LanguageMenu-link",
      "ThemeSwitch",
    ]);
    expect(controlHeights(uiCss(), classes)).toEqual([]);
  });

  test("a control without one, or with a smaller one, is reported", () => {
    const css = [
      "@layer primitives {",
      ".A { min-height: var(--control-height); }",
      ".A:hover { min-height: var(--space-6); }",
      ".B { padding: var(--space-2); }",
      "}",
    ].join("\n");
    expect(controlHeights(css, ["A", "B"])).toEqual([
      ".B is given no control height",
      ".A:hover sets min-height: var(--space-6), not a control height",
    ]);
  });
});
