import { describe, expect, test } from "bun:test";
import tokens from "../../../../design/system/tokens.json" with { type: "json" };
import { FONT_FILES, headStyles, TOKENS_CSS } from "./style.ts";

const [root = "", systemDark = "", forcedDark = ""] = TOKENS_CSS.split("\n");

describe("design tokens as CSS", () => {
  test("every colour and shadow token is a variable in both themes", () => {
    for (const t of [...tokens.color.tokens, ...tokens.shadow.tokens]) {
      expect(root).toContain(`--${t.name}:${t.value.light};`);
      expect(systemDark).toContain(`--${t.name}:${t.value.dark};`);
      expect(forcedDark).toContain(`--${t.name}:${t.value.dark};`);
    }
  });

  test("dark follows the system unless the page picks light, and a page can pick dark", () => {
    expect(systemDark).toStartWith(
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;',
    );
    expect(forcedDark).toStartWith(':root[data-theme="dark"]{color-scheme:dark;');
    expect(root).toContain("color-scheme:light;");
  });

  test("sun is the same in both themes", () => {
    const sun = tokens.color.tokens.find((t) => t.name === "sun");
    expect(sun?.value.light).toBe(sun?.value.dark as string);
  });

  test("spacing, radius, line widths and type are variables", () => {
    for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.rule.tokens]) {
      expect(root).toContain(`--${t.name}:${t.value};`);
    }
    expect(root).toContain(`--font-display:${tokens.type.families.display};`);
    expect(root).toContain(`--font-body:${tokens.type.families.body};`);
    expect(root).toContain("--type-section-style:italic;");
    expect(root).toContain("--type-masthead-tracking:-0.045em;");
    expect(headStyles()).toContain(".type-label{font-family:var(--font-body);");
  });

  test("the smallest type size is 13px", () => {
    const sizes = tokens.type.groups.flatMap((g) =>
      g.styles.map((s) => Number.parseFloat(s.fontSize)),
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
