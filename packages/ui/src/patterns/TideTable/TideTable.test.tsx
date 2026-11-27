/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import {
  ABOVE,
  across,
  areaPath,
  BELOW,
  clock,
  HEIGHT,
  highWater,
  labelOffsets,
  PER_HOUR,
  seaY,
  surfacePath,
  swellAt,
  WATERLINE,
} from "./surface.ts";
import tideStates from "./TideTable.states.tsx";
import { TideTable, type TideTableProps } from "./TideTable.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

function state(name: string): TideTableProps {
  const props = tideStates.states[name];
  if (props === undefined) throw new Error(`the ${name} state`);
  return props;
}

const SWELLS = [
  { hour: 8, height: 151 },
  { hour: 9, height: 181 },
  { hour: 10, height: 171 },
  { hour: 11, height: 131 },
  { hour: 14, height: 126 },
];

/** Every point of a path, as numbers, command letters dropped. */
function points(d: string): [number, number][] {
  return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe("the sea surface", () => {
  test("each wave adds a bell at its hour: highest there, falling off on both sides", () => {
    const one = [{ hour: 10, height: 100 }];
    expect(swellAt(one, 10)).toBe(100);
    expect(swellAt(one, 9)).toBeCloseTo(100 * Math.exp(-1 / 2.6));
    expect(swellAt(one, 9)).toBeCloseTo(swellAt(one, 11));
    expect(swellAt(one, 4)).toBeLessThan(1);
    // Two close together sum: the sea rises where several formed.
    expect(swellAt([...one, { hour: 11, height: 100 }], 10.5)).toBeGreaterThan(100);
  });

  test("the sum is scaled to its highest point, which reaches the same height every day", () => {
    const high = highWater(SWELLS, 14);
    expect(high.hour).toBe(9.5);
    for (const scale of [0.5, 2]) {
      const scaled = SWELLS.map((s) => ({ ...s, height: s.height * scale }));
      const h = highWater(scaled, 14);
      expect(h.hour).toBe(high.hour);
      expect(seaY(scaled, h.level, h.hour)).toBe(seaY(SWELLS, high.level, high.hour));
    }
    // Board 01: the highest point rises 140 above the rest line at 220.
    expect(seaY(SWELLS, high.level, high.hour)).toBeCloseTo(220 - 140 - 3 * Math.sin(9.5 * 2.5), 0);
  });

  test("high water is only looked for up to now", () => {
    expect(highWater([{ hour: 20, height: 150 }, ...SWELLS.slice(0, 1)], 14).hour).toBe(8);
    expect(highWater([], 14)).toEqual({ hour: 14, level: 1 });
  });

  test("a smooth curve from midnight to now: Bézier segments only, x always moving right", () => {
    const d = surfacePath(SWELLS, highWater(SWELLS, 14).level, 14);
    expect(d).toMatch(/^M[\d.,-]+( C[\d.,-]+ [\d.,-]+ [\d.,-]+)+$/);
    expect(d).not.toMatch(/[LHVlhvZz]/);
    const p = points(d);
    expect(p[0]?.[0]).toBe(0);
    expect(p.at(-1)?.[0]).toBe(14 * PER_HOUR);
    for (let i = 1; i < p.length; i++) {
      expect((p[i] as [number, number])[0]).toBeGreaterThan((p[i - 1] as [number, number])[0]);
    }
  });

  test("no corners: at every joint the two tangents are one line", () => {
    const d = surfacePath(SWELLS, highWater(SWELLS, 14).level, 14);
    const segments = d.split(" C").slice(1).map(points);
    for (let i = 1; i < segments.length; i++) {
      const [, inControl, joint] = segments[i - 1] as [number, number][];
      const [outControl] = segments[i] as [number, number][];
      if (inControl === undefined || joint === undefined || outControl === undefined) {
        throw new Error("a segment");
      }
      // Catmull-Rom: the joint is halfway between the controls on either side.
      expect((inControl[0] + outControl[0]) / 2).toBeCloseTo(joint[0], 2);
      expect((inControl[1] + outControl[1]) / 2).toBeCloseTo(joint[1], 0);
    }
  });

  test("the sea under it closes on the waterline, inside the chart", () => {
    const surface = surfacePath(SWELLS, highWater(SWELLS, 14).level, 14);
    const area = areaPath(surface, 14);
    expect(area).toStartWith(surface);
    expect(area).toEndWith(` L560,${WATERLINE} L0,${WATERLINE} Z`);
    for (const [, y] of points(area)) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(WATERLINE);
    }
    expect(HEIGHT).toBe(270);
  });

  test("hours as a share of the width and as a clock", () => {
    expect(across(0)).toBe("0%");
    expect(across(6)).toBe("25%");
    expect(across(24)).toBe("100%");
    expect(clock(9.5)).toBe("09:30");
    expect(clock(0)).toBe("00:00");
    expect(clock(24)).toBe("24:00");
  });
});

describe("where each height goes", () => {
  test("above and below by turns while nothing is in the way", () => {
    const flat = [0, 1, 2, 3].map((i) => ({ hour: 4 + i * 4, y: 200 }));
    expect(labelOffsets(flat)).toEqual([ABOVE, BELOW, ABOVE, BELOW]);
  });

  test("the other side when the turn's side overlaps a label already placed", () => {
    // The second dot is 30 higher, an hour on: below it is where the first's label is.
    expect(
      labelOffsets([
        { hour: 8, y: 120 },
        { hour: 9, y: 85 },
      ]),
    ).toEqual([ABOVE, ABOVE]);
  });

  test("the other side when the turn's side covers another wave's dot", () => {
    // Two waves in the same hour, one 20 lower: below the upper dot is the lower one.
    expect(
      labelOffsets([
        { hour: 10, y: 160 },
        { hour: 10, y: 140 },
      ]),
    ).toEqual([BELOW, ABOVE]);
  });

  test("its turn when both sides are taken", () => {
    // Three in one hour, 13 apart: the middle one's label covers a dot either way.
    const crowd = [
      { hour: 10, y: 100 },
      { hour: 10, y: 113 },
      { hour: 10, y: 126 },
    ];
    expect(labelOffsets(crowd)[1]).toBe(BELOW);
  });
});

describe("tide table", () => {
  test("one image with a summary, a dot and a height per wave, high water and now", () => {
    const html = body(<TideTable {...state("default")} />);
    expect(html).toStartWith('<div class="TideTable"><div class="TideTable-chart">');
    expect(html).toContain(
      '<svg class="TideTable-svg" role="img" aria-label="5 stories became waves today, between 08:00 and 14:00.">',
    );
    expect(html).toContain(
      '<svg class="TideTable-sea" viewBox="0 0 960 270" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">',
    );
    expect(html.match(/<circle class="TideTable-dot"/g)?.length).toBe(5);
    expect(html).toContain('<circle class="TideTable-dot" cx="37.5%"');
    expect(html.match(/<text class="TideTable-height"/g)?.length).toBe(5);
    expect(html).toContain(">high water, 09:30</text>");
    expect(html).toContain('<text class="TideTable-nowLabel" x="58.333%" y="22">now</text>');
    expect(html).toContain(">still to come</text>");
    expect(html.match(/class="TideTable-hour[ "]/g)?.length).toBe(9);
    expect(html.match(/class="TideTable-tick"/g)?.length).toBe(25);
    expect(html).not.toContain("style=");
    expect(html).not.toContain("<script");
  });

  test("each height is drawn where labelOffsets puts it, in the order the waves formed", () => {
    const html = body(<TideTable {...state("default")} />);
    const dots = [...html.matchAll(/<circle class="TideTable-dot" cx="([\d.]+)%" cy="([\d.]+)"/g)];
    const heights = [
      ...html.matchAll(/<text class="TideTable-height" x="([\d.]+)%" y="([\d.]+)"/g),
    ];
    expect(dots.map((m) => m[1])).toEqual(["33.333", "37.5", "41.667", "45.833", "58.333"]);
    const offsets = dots.map((m, i) => Math.round(Number(heights[i]?.[2]) - Number(m[2])));
    const want = labelOffsets(dots.map((m) => ({ hour: Number(m[1]) * 0.24, y: Number(m[2]) })));
    expect(offsets).toEqual(want);
    // 09:00 is just above 08:00: its height goes above too, clear of 08:00's.
    expect(offsets).toEqual([ABOVE, ABOVE, BELOW, BELOW, ABOVE]);
  });

  test("the list holds the same waves, latest first, each a link to its topic", () => {
    const html = body(<TideTable {...state("default")} />);
    const list = html.slice(html.indexOf('<ol class="TideTable-list">'));
    const items = [...list.matchAll(/<a class="TideTable-link" href="([^"]+)">(.*?)<\/a>/g)];
    expect(items.map((m) => m[1])).toEqual([
      "/topic/open-weights-quarter-price",
      "/topic/decoy-discounts",
      "/topic/six-banks-offline",
      "/topic/ai-lab-sued-over-agents",
      "/topic/ai-hacking-tool-warning",
    ]);
    expect(items[0]?.[2]).toBe(
      '<span class="TideTable-at">14:00</span><span class="TideTable-title" lang="en">Open-weights model released with pricing at 25% of flagship</span><span class="TideTable-wave">126</span>',
    );
  });

  test("text is text", () => {
    const html = body(
      <TideTable
        waves={[
          { href: "/t?a=1&b=2", hour: 3, at: "03:00", title: "<i>", lang: "en", height: 99.6 },
        ]}
        now={5}
        summary={'"><b>'}
        nowLabel="<now>"
        laterLabel="later"
        highWaterLabel={(t) => `<${t}>`}
      />,
    );
    expect(html).toContain('aria-label="&quot;>&lt;b>"');
    expect(html).toContain('href="/t?a=1&amp;b=2"');
    expect(html).toContain(">&lt;i></span>");
    expect(html).toContain(">&lt;now></text>");
    expect(html).toContain(">&lt;03:00></text>");
    expect(html).toContain('<span class="TideTable-wave">100</span>');
  });

  test("late in the day, no room for what is still to come", () => {
    expect(body(<TideTable {...state("late")} />)).not.toContain("TideTable-later");
  });

  test("a wave given an hour after now is drawn at now, not past the surface", () => {
    const html = body(
      <TideTable
        {...state("two")}
        waves={[{ ...(state("two").waves[0] as TideTableProps["waves"][number]), hour: 12 }]}
      />,
    );
    expect(html).toContain('<circle class="TideTable-dot" cx="37.5%"');
  });

  test("its states: default, two, late, long, zh, ja", () => {
    expect(Object.keys(tideStates.states)).toEqual(["default", "two", "late", "long", "zh", "ja"]);
  });

  test("the surface rises once over 1.2 seconds, and stands still with reduced motion", async () => {
    const css = await Bun.file(`${import.meta.dir}/TideTable.css`).text();
    const crest = css.slice(css.indexOf(".TideTable-crest {"));
    expect(crest).toMatch(/^\.TideTable-crest \{[^}]*animation: TideTable-rise 1\.2s [^;]* both;/);
    expect(crest).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*animation: none;\s*\}/);
    expect(css).toContain("vector-effect: non-scaling-stroke;");
  });
});
