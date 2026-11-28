/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import { FOOTER } from "../../tokens/index.ts";
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
    const id =
      /<label class="Footer-label" for="(footer-email-[^"]+)">One email a day, with the new waves.<\/label>/.exec(
        html,
      )?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`id="${id}" name="email" type="email" autocomplete="email"`);
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

  test("two footers on one page, as in the catalog, give their fields different ids", () => {
    const html = body(
      <>
        <Footer {...props} />
        <Footer {...state("zh")} />
      </>,
    );
    const ids = [...html.matchAll(/ id="(footer-email-[^"]+)"/g)].map((m) => m[1]);
    const fors = [...html.matchAll(/ for="(footer-email-[^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(fors).toEqual(ids);
  });

  test("every state renders a footer", () => {
    for (const state of Object.values(footerStates.states)) {
      expect(body(<Footer {...state} />)).toStartWith('<footer class="Footer">');
    }
  });
});

const css = await Bun.file(`${import.meta.dir}/Footer.css`).text();

/**
 * Where a wave layer leaves the view box (x 0 to 1440) bare at either end of
 * its drift, read from the markup (each layer's start, its periods of 240,
 * the offset of the group around it) and from the CSS (the drift).
 */
function gaps(svg: string, sheet: string): string[] {
  const drift = /translateX\(calc\((-?\d+) \/ 1440 \* 100%\)\)/.exec(sheet);
  if (drift === null) return ["no drift in the CSS"];
  const by = Number(drift[1]);
  const out: string[] = [];
  const layers = svg.matchAll(
    /(?:<g transform="translate\((-?\d+) 0\)">)?<g class="Footer-drift Footer-drift-(\w+)"><path class="[^"]*" d="M(-?\d+),([^"]*)"/g,
  );
  let count = 0;
  for (const m of layers) {
    count++;
    const name = m[2] ?? "";
    const periods = (m[4]?.match(/ t120,0/g) ?? []).length;
    const start = Number(m[3]) + Number(m[1] ?? 0);
    const end = start + periods * 240;
    // The drift runs between 0 and `by`, whichever way the layer goes.
    for (const shift of [0, by]) {
      const at = shift === 0 ? "start" : "end";
      if (start + shift > 0)
        out.push(`${name}: x 0 to ${start + shift} is bare at the ${at} of its drift`);
      if (end + shift < 1440)
        out.push(`${name}: x ${end + shift} to 1440 is bare at the ${at} of its drift`);
    }
  }
  if (count !== 3) out.push(`${count} wave layers, not 3`);
  return out;
}

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
  });

  test("every wave layer covers the view box at every point of its drift", () => {
    expect(svg).toContain('viewBox="0 -130 1440 510"');
    expect(gaps(svg, css)).toEqual([]);
  });

  test("the coverage check fails when a layer is moved so the view shows past its end", () => {
    const moved = svg.replace(
      '<g transform="translate(-90 0)">',
      '<g transform="translate(-800 0)">',
    );
    expect(moved).not.toBe(svg);
    expect(gaps(moved, css)).toEqual(["mid: x 1360 to 1440 is bare at the end of its drift"]);
    const far = css.replace(
      "translateX(calc(-240 / 1440 * 100%))",
      "translateX(calc(-1000 / 1440 * 100%))",
    );
    expect(gaps(svg, far)).toHaveLength(3);
  });

  test("the beam's sweep stays inside the view box's top, and its right end outside the view", () => {
    // Pivot 1132,92; the sweep turns between FOOTER.beamFrom and beamTo.
    const points = [...svg.matchAll(/<g class="Footer-beam">(.*?)<\/g>/g)][0]?.[1] ?? "";
    const corners = [...points.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(corners.length).toBe(6);
    for (const deg of [FOOTER.beamFrom, FOOTER.beamTo].map(Number.parseFloat)) {
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
