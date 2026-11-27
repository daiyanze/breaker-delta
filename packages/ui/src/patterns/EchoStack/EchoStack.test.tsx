/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import css from "./EchoStack.css" with { type: "text" };
import echoStackStates from "./EchoStack.states.tsx";
import { EchoStack, echoStackLayers, MAX_LAYERS, MIN_LAYERS, sheet } from "./EchoStack.tsx";

// The stack's styles and their tests: `packages/ui/src/styles/styles.test.ts`.

function renderToString(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

const sheets = (html: string) => [...html.matchAll(/<rect [^>]*>/g)].map((m) => m[0]);

describe("number of sheets", () => {
  test("height ÷ 200 × 12, rounded", () => {
    expect(echoStackLayers(200)).toBe(12);
    expect(echoStackLayers(196)).toBe(12);
    expect(echoStackLayers(100)).toBe(6);
    expect(echoStackLayers(108)).toBe(6);
    expect(echoStackLayers(109)).toBe(7);
  });

  test("at least 3, however low the wave", () => {
    expect(echoStackLayers(0)).toBe(MIN_LAYERS);
    expect(echoStackLayers(40)).toBe(MIN_LAYERS);
    expect(echoStackLayers(60)).toBe(4);
  });

  test("at most what the frame holds", () => {
    expect(echoStackLayers(250)).toBe(MAX_LAYERS);
    expect(echoStackLayers(10_000)).toBe(MAX_LAYERS);
    expect(echoStackLayers(Number.POSITIVE_INFINITY)).toBe(MAX_LAYERS);
    // The top sheet stays inside the 220-unit viewBox, and one more would not.
    expect(sheet(MAX_LAYERS - 1).y).toBeGreaterThanOrEqual(0);
    expect(sheet(MAX_LAYERS).y).toBeLessThan(0);
    expect(sheet(MAX_LAYERS - 1).width).toBeGreaterThan(0);
  });

  test("the drawing has one rect per sheet", () => {
    for (const height of [0, 33, 100, 196, 240, 999]) {
      const html = renderToString(<EchoStack height={height} label="x" />);
      expect(sheets(html)).toHaveLength(echoStackLayers(height));
    }
  });
});

describe("the drawing", () => {
  const html = renderToString(<EchoStack height={196} label="Echoes, 12 layers" />);

  test("is one image, named by its label", () => {
    expect(html).toStartWith(
      '<svg class="EchoStack" viewBox="0 0 120 220" role="img" aria-label="Echoes, 12 layers">',
    );
  });

  test("the boards' sheets: blue and sky by turns, red on top", () => {
    const all = sheets(html);
    expect(all[0]).toBe(
      '<rect class="EchoStack-sheet EchoStack-blue" x="4" y="199" width="100" height="11" rx="5.5">',
    );
    expect(all[1]).toContain('class="EchoStack-sheet EchoStack-sky"');
    expect(all[11]).toContain('class="EchoStack-sheet EchoStack-top"');
    expect(html).not.toContain("style=");
    // Board 03's top sheet: w = round(100 - 11 × 5.6), x = round((54 + 11 × 1.6 - w / 2) × 10) / 10.
    expect(all[11]).toContain('x="52.6" y="45" width="38"');
  });

  test("nothing is drawn on top: sheets and the baseline only", () => {
    const shapes = [...html.matchAll(/<(\w+)[ >]/g)].map((m) => m[1]);
    expect(new Set(shapes)).toEqual(new Set(["svg", "rect", "path"]));
    expect(html.match(/<path /g)).toHaveLength(1);
    expect(html).toContain('<path class="EchoStack-base" d="M2,214 H118"></path>');
  });

  test("the label is text", () => {
    expect(renderToString(<EchoStack height={1} label={'<b>"'} />)).toContain(
      'aria-label="&lt;b>&quot;"',
    );
  });
});

describe("the sheets' delays", () => {
  test("EchoStack.css places every sheet up to MAX_LAYERS, and no more", () => {
    for (let k = 2; k <= MAX_LAYERS; k++) {
      expect(css).toContain(`.EchoStack-sheet:nth-of-type(${k}) {\n    --echo-stack-k: ${k - 1};`);
    }
    expect(css).not.toContain(`nth-of-type(${MAX_LAYERS + 1})`);
  });
});

describe("echo stack states", () => {
  test("every state renders a stack whose label names its sheets", () => {
    for (const props of Object.values(echoStackStates.states)) {
      const html = renderToString(<EchoStack {...props} />);
      expect(html).toContain(`${echoStackLayers(props.height)} layers high`);
      expect(sheets(html)).toHaveLength(echoStackLayers(props.height));
    }
  });
});
