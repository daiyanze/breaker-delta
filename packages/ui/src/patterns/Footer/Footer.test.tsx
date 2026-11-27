/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import footerStates from "./Footer.states.tsx";
import { Footer, type FooterProps } from "./Footer.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

function state(name: string): FooterProps {
  const s = footerStates.states[name];
  if (s === undefined) throw new Error(`no state ${name}`);
  return s;
}

const props = state("default");
// The footer's CSS (the drift of one period, the beam's pivot and turn, the
// phone crop, reduced motion) is checked in `styles/styles.test.ts`.

describe("footer markup", () => {
  test("a footer landmark: the form, the named links, the drawing, the notes", () => {
    const html = body(<Footer {...props} />);
    expect(html).toStartWith('<footer class="Footer">');
    expect(html).toContain('<form class="Footer-form" method="post" action="/subscribe">');
    expect(html).toContain(
      '<label class="Footer-label" for="footer-email">One email a day, with the new waves.</label>',
    );
    expect(html).toContain('id="footer-email" name="email" type="email" autocomplete="email"');
    expect(html).toContain('<button class="Footer-submit" type="submit">Subscribe</button>');
    expect(html).toContain('<nav class="Footer-nav" aria-label="Footer">');
    expect(html).toContain(
      'role="img" aria-label="A lighthouse on a rock sweeps its beam over rolling waves and a small sailboat"',
    );
    expect(html).toContain('<span class="Footer-note">Breaker Delta is open source.</span>');
  });

  test("a link with a short label has both, one shown per width; one without has its label alone", () => {
    const html = body(<Footer {...props} />);
    expect(html).toContain(
      '<a class="Footer-link" href="/about#height"><span class="Footer-long">How wave height is scored</span><span class="Footer-short">How it is scored</span></a>',
    );
    expect(html).toContain(
      '<a class="Footer-link" href="https://github.com/daiyanze/breaker-delta">GitHub</a>',
    );
  });

  test("no subscribe prop, no form", () => {
    const html = body(<Footer {...state("no-form")} />);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).toContain('<nav class="Footer-nav"');
  });

  test("text is text", () => {
    const html = body(<Footer {...props} notes={["<b>&"]} art={'"x"'} />);
    expect(html).toContain('<span class="Footer-note">&lt;b>&amp;</span>');
    expect(html).toContain('aria-label="&quot;x&quot;"');
  });

  test("every state renders a footer", () => {
    for (const state of Object.values(footerStates.states)) {
      expect(body(<Footer {...state} />)).toStartWith('<footer class="Footer">');
    }
  });
});

describe("the drawing", () => {
  const svg = body(<Footer {...props} />);
  const paths = [...svg.matchAll(/<path class="Footer-(?:sky|blue|solid|hatch)"[^>]* d="([^"]+)"/g)]
    .map((m) => m[1] ?? "")
    .filter((d) => d.startsWith("M-480"));

  test("each wave layer is 12 periods of 240 from x = -480, so one period of drift loops", () => {
    expect(paths.length).toBe(4);
    for (const d of paths) {
      const periods = d.match(/ q60,-?\d+ 120,0 t120,0/g) ?? [];
      expect(periods.length).toBe(12);
    }
    // The view box is 1440 wide from x = 0. Drifted by up to one period each
    // way (the middle layer sits 90 further left), every layer still covers it.
    const left = -480 - 90;
    const right = -480 + 12 * 240 - 240;
    expect(left).toBeLessThanOrEqual(-240);
    expect(right).toBeGreaterThanOrEqual(1440);
    expect(svg).toContain('viewBox="0 -130 1440 510"');
  });

  test("the beam's sweep stays inside the view box's top, and its right end outside the view", () => {
    // Pivot 1132,92; the sweep turns from -4 to 6 degrees (Footer.css).
    const points = [...svg.matchAll(/<g class="Footer-beam">(.*?)<\/g>/g)][0]?.[1] ?? "";
    const corners = [...points.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(corners.length).toBe(6);
    for (const deg of [-4, 6]) {
      const a = (deg * Math.PI) / 180;
      for (const [x, y] of corners as [number, number][]) {
        const dx = x - 1132;
        const dy = y - 92;
        const ry = 92 + dx * Math.sin(a) + dy * Math.cos(a);
        const rx = 1132 + dx * Math.cos(a) - dy * Math.sin(a);
        expect(ry).toBeGreaterThan(-130);
        // A corner of the right beam is past the view's right edge, so its
        // end is never drawn inside the view.
        if (x > 1132) expect(rx).toBeGreaterThan(1440);
      }
    }
  });
});
