/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import { echoStackLayers } from "../EchoStack/EchoStack.tsx";
import headlineStates from "./Headline.states.tsx";
import {
  Headline,
  type HeadlineLead,
  type HeadlineStory,
  headlineSize,
  heightDigits,
  scaleHeight,
  trendPath,
} from "./Headline.tsx";

// The headlines' styles and their tests: `packages/ui/src/styles/styles.test.ts`.

function renderToString(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

const story = (over: Partial<HeadlineStory> = {}): HeadlineStory => ({
  href: "/topic/a",
  title: { lang: "en", text: "A headline" },
  height: 150,
  formedToday: false,
  fading: false,
  delta: "Up 3% in 24 hours.",
  meta: "4 independent sources, 9 echoes.",
  ...over,
});

const lead = (over: Partial<HeadlineLead> = {}): HeadlineLead => ({
  ...story({ href: "/topic/lead", height: 196 }),
  kicker: "Tallest wave right now",
  stackLabel: "Echoes, 12 layers",
  trend: [182, 196],
  trendLabel: "Wave height up to 14:00",
  ...over,
});

describe("the size formula (Headline README)", () => {
  test("lead: 44 + height ÷ 200 × 52 on desktop, 30 + height ÷ 200 × 18 on phones", () => {
    expect(headlineSize("lead", 0)).toBe(44);
    expect(headlineSize("lead", 100)).toBe(70);
    expect(headlineSize("lead", 196)).toBeCloseTo(44 + (196 / 200) * 52);
    expect(headlineSize("lead", 200)).toBe(96);
    expect(headlineSize("lead", 100, true)).toBe(39);
    expect(headlineSize("lead", 200, true)).toBe(48);
  });

  test("second tier: 22 + height ÷ 200 × 24, phones 19 + height ÷ 200 × 8", () => {
    expect(headlineSize("second", 100)).toBe(34);
    expect(headlineSize("second", 100, true)).toBe(23);
  });

  test("third tier: 17 + height ÷ 200 × 13, phones 16 + height ÷ 200 × 4", () => {
    expect(headlineSize("third", 100)).toBe(23.5);
    expect(headlineSize("third", 100, true)).toBe(18);
  });

  test("a wave taller than 200 stays at its tier's full size, as headline-lead's 96px cap says", () => {
    expect(headlineSize("lead", 420)).toBe(96);
    expect(headlineSize("second", 1000)).toBe(46);
    expect(headlineSize("third", Number.POSITIVE_INFINITY)).toBe(30);
    expect(headlineSize("lead", -5)).toBe(44);
  });

  test("data-height is the scale height in three digits", () => {
    expect(heightDigits(0)).toBe("000");
    expect(heightDigits(7.4)).toBe("007");
    expect(heightDigits(42)).toBe("042");
    expect(heightDigits(196)).toBe("196");
    expect(heightDigits(199.6)).toBe("200");
    expect(heightDigits(420)).toBe("200");
    expect(heightDigits(Number.NaN)).toBe("000");
    expect(scaleHeight(Number.POSITIVE_INFINITY)).toBe(200);
  });
});

describe("the tiers", () => {
  const html = renderToString(
    <Headline
      lead={lead()}
      second={[story({ href: "/topic/b", formedToday: true }), story({ href: "/topic/c" })]}
      third={[
        story({ href: "/topic/d", fading: true }),
        story({ href: "/topic/e" }),
        story({ href: "/topic/f" }),
      ]}
      note="Key."
    />,
  );

  test("one lead, two in the second tier, three in the third, then the key", () => {
    expect(html.match(/<article class="Headline-lead">/g)).toHaveLength(1);
    expect(html.match(/<article class="Headline-story Headline-second">/g)).toHaveLength(2);
    expect(html.match(/<article class="Headline-story Headline-third">/g)).toHaveLength(3);
    expect(html).toContain('<p class="Headline-key">Key.</p>');
    const order = ["lead", "b", "c", "d", "e", "f"].map((s) => html.indexOf(`/topic/${s}"`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("each title carries its height for the size, and its link", () => {
    expect(html).toContain(
      '<h3 class="Headline-title Headline-title-lead" data-height="196"><a class="Headline-link" href="/topic/lead" lang="en">A headline</a></h3>',
    );
    expect(html).toContain('<h3 class="Headline-title Headline-title-second" data-height="150">');
    expect(html).toContain(
      '<h3 class="Headline-title Headline-title-third Headline-fading" data-height="150">',
    );
    expect(html).not.toContain("style=");
  });

  test("a wave formed today has a red number; the lead's is always red", () => {
    expect(html).toContain(
      '<data class="Headline-number Headline-number-second Headline-new" value="150">150</data>',
    );
    expect(html).toContain('<data class="Headline-number Headline-number-second" value="150">');
    expect(html).toContain(
      '<data class="Headline-number Headline-number-lead Headline-new" value="196">196</data>',
    );
    expect(html).not.toContain("Headline-number-third Headline-new");
  });

  test("the second tier names sources and echoes, the third does not", () => {
    expect(
      html.match(/<span class="Headline-meta"> 4 independent sources, 9 echoes.<\/span>/g),
    ).toHaveLength(2);
    const third = html.slice(html.indexOf("Headline-columns-third"));
    expect(third).not.toContain("independent sources");
    expect(third).toContain('<p class="Headline-note">Up 3% in 24 hours.</p>');
  });

  test("the lead: kicker, headline, then the echo stack, its height and the trend line", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at('<p class="Headline-kicker">Tallest wave right now</p>')).toBeGreaterThan(-1);
    expect(at("Headline-kicker")).toBeLessThan(at("Headline-title-lead"));
    expect(at("Headline-title-lead")).toBeLessThan(at('<svg class="EchoStack"'));
    expect(at('<svg class="EchoStack"')).toBeLessThan(at("Headline-number-lead"));
    expect(at("Headline-number-lead")).toBeLessThan(at('<svg class="Headline-chart"'));
    expect(html).toContain('aria-label="Echoes, 12 layers"');
    expect(html.slice(at('<svg class="EchoStack"'), at("</svg>")).match(/<rect /g)).toHaveLength(
      echoStackLayers(196),
    );
    expect(html).toContain(
      '<svg class="Headline-chart" viewBox="0 0 520 110" role="img" aria-label="Wave height up to 14:00">',
    );
    expect(html).toContain(
      `<path class="Headline-chart-line" pathLength="1" d="${trendPath([182, 196])}">`,
    );
    expect(html).toContain(
      '<p class="Headline-lead-note"><strong>Up 3% in 24 hours.</strong> 4 independent sources, 9 echoes.</p>',
    );
  });

  test("empty tiers are left out", () => {
    const alone = renderToString(<Headline lead={lead()} second={[]} third={[]} />);
    expect(alone).not.toContain("Headline-columns");
    expect(alone).not.toContain("Headline-key");
  });

  test("text is text", () => {
    const out = renderToString(
      <Headline
        lead={lead({ title: { lang: "en", text: '<b>"x"</b>' }, kicker: "<i>" })}
        second={[]}
        third={[]}
      />,
    );
    expect(out).toContain("&lt;b>&quot;x&quot;&lt;/b>");
    expect(out).toContain("&lt;i>");
    expect(out).not.toContain("<b>");
  });
});

describe("the trend line", () => {
  test("the boards' geometry: x from 4 to 516, the tallest run at y 12, the floor at 85% of the lowest", () => {
    expect(trendPath([182, 180, 178, 176, 175, 190, 194, 196])).toBe(
      "M4,37 L77,41 L150,45 L223,48 L297,50 L370,23 L443,16 L516,12",
    );
    expect(trendPath([0, 100])).toBe("M4,98 L516,12");
  });

  test("one run, or none, is a level line; a level series sits at the top", () => {
    expect(trendPath([126])).toBe("M4,60 L516,60");
    expect(trendPath([])).toBe("M4,60 L516,60");
    expect(trendPath([74, 74, 74])).toBe("M4,12 L260,12 L516,12");
    expect(trendPath([0, 0])).toBe("M4,98 L516,98");
  });
});

describe("headline states", () => {
  test("every state renders, the lead first", () => {
    for (const props of Object.values(headlineStates.states)) {
      const html = renderToString(<Headline {...props} />);
      expect(html).toStartWith('<div class="Headline"><article class="Headline-lead">');
      expect(html).toContain(`data-height="${heightDigits(props.lead.height)}"`);
    }
  });

  test("the states hold the cases the rules name", () => {
    const s = headlineStates.states;
    expect(s.default?.lead.formedToday).toBe(false);
    expect(s.formed?.lead.formedToday).toBe(true);
    expect(s.fading?.lead.fading).toBe(true);
    expect(s.tallest?.lead.height).toBeGreaterThan(200);
    expect(s.zh?.lead.title.lang).toBe("zh");
    expect(s.ja?.lead.title.lang).toBe("ja");
  });
});
