import { describe, expect, test } from "bun:test";
import { colorOf, tokensCss } from "@bd/ui/tokens";
import {
  ICON_FILES,
  ICON_LINKS,
  iconDetail,
  nightIcon,
  oneInkMark,
  oneInkMarkFile,
} from "./icon.ts";
import { renderPage } from "./layout.ts";

const DELTA = 'points="256,240 290,308 222,308"';
const WINDOW_BAR = 'd="M256,104 V150"';
const RAILING = 'd="M202,146 H310';

// Every colour token's value in either theme, as the tokens layer writes them:
// `light-dark(<light>,<dark>)`, or one value when both themes share it.
const HEX = "#[0-9A-Fa-f]{6}";
const tokenValues = new Set(
  [
    ...tokensCss().matchAll(
      new RegExp(`--[\\w-]+:(?:light-dark\\((${HEX}),(${HEX})\\)|(${HEX}));`, "g"),
    ),
  ].flatMap((m) => m.slice(1).flatMap((v) => (v ? [v.toUpperCase()] : []))),
);
const hexes = (svg: string) => [...svg.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0]);

describe("level of detail by size", () => {
  test("the design system's steps: 100 and up, 48 to 99, below 48", () => {
    expect([512, 100, 99, 48, 47, 16].map(iconDetail)).toEqual([
      "full",
      "full",
      "medium",
      "medium",
      "small",
      "small",
    ]);
  });

  for (const draw of [nightIcon, oneInkMark]) {
    test(`${draw.name}: full has every part, medium drops the railing, small the bar and Δ`, () => {
      const full = draw({ size: 128 });
      const medium = draw({ size: 64 });
      const small = draw({ size: 32 });
      for (const part of [DELTA, WINDOW_BAR, RAILING]) expect(full).toContain(part);
      expect(medium).not.toContain(RAILING);
      expect(medium).toContain(DELTA);
      expect(medium).toContain(WINDOW_BAR);
      for (const part of [DELTA, WINDOW_BAR, RAILING]) expect(small).not.toContain(part);
    });

    test(`${draw.name}: lines thicken below 100px`, () => {
      expect(draw({ size: 128 })).toContain("stroke-width:12;stroke-linecap:round;stroke-linejoin");
      expect(draw({ size: 64 })).toContain("stroke-width:16;stroke-linecap:round;stroke-linejoin");
    });
  }

  test("an explicit detail wins over the size", () => {
    expect(nightIcon({ size: 16, detail: "full" })).toContain(RAILING);
  });
});

describe("colours", () => {
  test("Night uses token values only, and the same ones in either theme", () => {
    const used = hexes(nightIcon({ size: 512 }));
    expect(used.length).toBeGreaterThan(0);
    for (const hex of used) expect(tokenValues).toContain(hex.toUpperCase());
    expect(nightIcon({ size: 512 })).not.toContain("var(");
  });

  test("One ink inlined is drawn in ink and paper only, so it follows the page theme", () => {
    const svg = oneInkMark({ size: 512 });
    expect(hexes(svg)).toEqual([]);
    const colours = new Set(
      [...svg.matchAll(/(?:fill|stroke):([^;"]+)/g)].map((m) => m[1]).filter((c) => c !== "none"),
    );
    expect([...colours].sort()).toEqual(["var(--ink)", "var(--paper)"]);
  });

  test("the One ink file sets ink and paper for each colour scheme", () => {
    const svg = oneInkMarkFile({ size: 512 });
    const value = colorOf;
    expect(svg).toContain(
      `:root{--ink:${value("ink", "light")};--paper:${value("paper", "light")}}`,
    );
    expect(svg).toContain(
      `@media (prefers-color-scheme:dark){:root{--ink:${value("ink", "dark")};` +
        `--paper:${value("paper", "dark")}}}`,
    );
    expect(svg.replace(/<style>.*<\/style>/, "")).toBe(oneInkMark({ size: 512 }));
  });
});

describe("markup", () => {
  test("a label makes it an image with a name; no label hides it", () => {
    expect(nightIcon({ size: 32, label: 'A "b"' })).toContain(
      'role="img" aria-label="A &#34;b&#34;"',
    );
    expect(nightIcon({ size: 32 })).toContain('aria-hidden="true"');
  });

  test("the clip id can be set, so two inlined icons do not share one", () => {
    const svg = oneInkMark({ size: 40, id: "m2" });
    expect(svg).toContain('<clipPath id="m2">');
    expect(svg).toContain('clip-path="url(#m2)"');
    expect(svg).toContain('width="40" height="40"');
  });

  test("Night has rounded corners unless it is square", () => {
    expect(nightIcon({ size: 180 })).toContain('rx="114"');
    expect(nightIcon({ size: 180, square: true })).not.toContain("rx=");
  });
});

describe("files and links", () => {
  const byName = new Map(ICON_FILES.map((f) => [f.file, f]));

  test("favicons are the small drawing, app icons the full one", () => {
    for (const name of ["favicon.svg", "favicon-16.png", "favicon-32.png"]) {
      expect(byName.get(name)?.source).not.toContain(DELTA);
    }
    for (const name of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon.svg"]) {
      expect(byName.get(name)?.source).toContain(RAILING);
    }
    expect(byName.get("mark.svg")?.source).toContain("prefers-color-scheme:dark");
  });

  test("each PNG is drawn at its own size", () => {
    for (const f of ICON_FILES.filter((f) => f.file.endsWith(".png"))) {
      expect(f.size).toBeNumber();
      expect(f.source).toContain(`width="${f.size}" height="${f.size}"`);
    }
  });

  test("every link and manifest entry points at a file that exists, at its size", () => {
    const hrefs = [...ICON_LINKS.matchAll(/href="\/icons\/([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(hrefs.length).toBe(5);
    for (const h of hrefs) expect(byName.has(h)).toBeTrue();
    for (const m of ICON_LINKS.matchAll(/href="\/icons\/([^"]+)" sizes="(\d+)x\2"/g)) {
      expect(byName.get(m[1] ?? "")?.size).toBe(Number(m[2]));
    }
    const manifest = JSON.parse(byName.get("manifest.webmanifest")?.source ?? "");
    for (const icon of manifest.icons) {
      const file = byName.get(icon.src.replace("/icons/", ""));
      expect(icon.sizes).toBe(`${file?.size}x${file?.size}`);
    }
  });

  test("every page's head carries the links", () => {
    const html = renderPage({ lang: "en", title: "T", heading: "H", bands: [] });
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain(ICON_LINKS);
  });
});
