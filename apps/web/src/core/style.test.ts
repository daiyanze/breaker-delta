import { describe, expect, test } from "bun:test";
import { FONT_FILES, tokensCss } from "@bd/ui/tokens";
import { headStyles } from "./style.ts";

// The tokens' own tests are in `packages/ui/src/tokens/tokens.test.ts`.
describe("the design system in the page head", () => {
  test("the tokens and the type classes are in the styles", () => {
    expect(headStyles()).toContain(tokensCss());
    expect(headStyles()).toContain(".type-label{font-family:var(--font-body);");
  });

  test("the smallest type size is 13px", () => {
    const sizes = [...tokensCss().matchAll(/--type-[\w-]+-size:(\d+(?:\.\d+)?)px;/g)].map((m) =>
      Number(m[1]),
    );
    expect(Math.min(...sizes)).toBe(13);
    const literal = [...headStyles().matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(literal.every((px) => px >= 13)).toBe(true);
  });

  test("numbers use tabular figures on every page", () => {
    expect(headStyles()).toMatch(/html\{[^}]*font-variant-numeric:tabular-nums/);
  });

  test("fonts are self-hosted, preloaded, and never swapped in late", () => {
    const head = headStyles();
    for (const f of FONT_FILES) {
      expect(head).toContain(`src:url(/fonts/${f.file}) format("woff2")`);
      const preload = `<link rel="preload" href="/fonts/${f.file}" as="font" type="font/woff2" crossorigin>`;
      expect(head.includes(preload)).toBe(f.preload);
    }
    expect(head.match(/@font-face/g)?.length).toBe(FONT_FILES.length);
    expect(head.match(/font-display:optional/g)?.length).toBe(FONT_FILES.length);
    expect(head).not.toContain("fonts.googleapis.com");
  });
});
