import { describe, expect, test } from "bun:test";
import { Masthead } from "@bd/ui/patterns";
import { Document, renderDocument } from "@bd/ui/runtime";
import { colorOf, tokensCss } from "@bd/ui/tokens";
import { h } from "preact";
import {
  ICON_FILES,
  ICON_LINKS,
  iconDetail,
  nightIcon,
  oneInkMark,
  oneInkMarkFile,
} from "./icon.ts";

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
    expect(ICON_LINKS.length).toBe(5);
    for (const link of ICON_LINKS) {
      expect(link.href).toStartWith("/icons/");
      const file = byName.get(link.href.replace("/icons/", ""));
      expect(file).toBeDefined();
      if (link.sizes !== undefined) expect(link.sizes).toBe(`${file?.size}x${file?.size}`);
    }
    const manifest = JSON.parse(byName.get("manifest.webmanifest")?.source ?? "");
    for (const icon of manifest.icons) {
      const file = byName.get(icon.src.replace("/icons/", ""));
      expect(icon.sizes).toBe(`${file?.size}x${file?.size}`);
    }
  });
});

// #110: the masthead draws the One ink mark itself, in Preact, with classes
// for its colours. Its shapes are this module's, compared part by part.
describe("the masthead's mark is the One ink mark", () => {
  const GEOMETRY = ["x", "y", "width", "height", "cx", "cy", "r", "points", "d"];
  const PAINT = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"];
  // The masthead's classes, with the paint `Masthead.css` gives them.
  const CLASSES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    "Masthead-paper": { fill: "var(--paper)" },
    "Masthead-ink": { fill: "var(--ink)" },
    "Masthead-line": { fill: "none", stroke: "var(--ink)" },
    "Masthead-crest": { fill: "none", stroke: "var(--paper)" },
    "Masthead-edge": { stroke: "var(--ink)" },
  };

  interface Part {
    shape: string;
    detail: boolean;
  }

  /** Each shape of an SVG with its geometry and paint, in order. */
  function parts(svg: string): Part[] {
    return [...svg.matchAll(/<(rect|path|polygon|circle)\b([^>]*?)\/?>/g)].map((m) => {
      const attrs: Record<string, string> = Object.fromEntries(
        [...(m[2] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1] ?? "", a[2] ?? ""]),
      );
      const paint: Record<string, string> = {};
      for (const decl of (attrs.style ?? "").split(";").filter(Boolean)) {
        const [p = "", v = ""] = decl.split(":");
        paint[p] = v;
      }
      const classes = (attrs.class ?? "").split(" ").filter(Boolean);
      for (const c of classes) Object.assign(paint, CLASSES[c]);
      for (const p of PAINT) if (attrs[p] !== undefined) paint[p] = attrs[p];
      // A line with no fill has no area to fill: the same as `none`.
      paint.fill ??= "none";
      const shape = [m[1], ...GEOMETRY.map((g) => attrs[g] ?? ""), ...PAINT.map((p) => paint[p])];
      return { shape: shape.join("|"), detail: classes.includes("Masthead-detail") };
    });
  }

  const html = renderDocument(
    h(
      Document,
      { lang: "en", title: "T" },
      h(Masthead, {
        home: "/",
        name: "Breaker Delta",
        links: [],
        navLabel: "Main",
        sectionsLabel: "Sections",
      }),
    ),
  );
  const mark = /<svg class="Masthead-mark"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? "";

  test("on desktop, every shape of the medium drawing, in order", () => {
    const medium = parts(oneInkMark({ size: 64, detail: "medium" })).map((p) => p.shape);
    expect(medium.length).toBeGreaterThan(15);
    expect(parts(mark).map((p) => p.shape)).toEqual(medium);
  });

  test("on phones, without its two detail parts, the small drawing", () => {
    const small = parts(oneInkMark({ size: 34, detail: "small" })).map((p) => p.shape);
    expect(
      parts(mark)
        .filter((p) => !p.detail)
        .map((p) => p.shape),
    ).toEqual(small);
    expect(parts(mark).filter((p) => p.detail)).toHaveLength(2);
  });
});
