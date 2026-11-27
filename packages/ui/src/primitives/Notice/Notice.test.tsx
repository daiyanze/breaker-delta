/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import noticeStates from "./Notice.states.tsx";
import { Notice, rippleAmplitude, ripplePath } from "./Notice.tsx";

/** What the notice renders to, through the one renderer the site uses. */
function html(node: VNode): string {
  const page = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return page.slice(page.indexOf("<body>") + 6, page.indexOf("</body>"));
}

describe("the ripple's amplitude: height ÷ 200 × 16, at least 2", () => {
  test("follows the height", () => {
    expect(rippleAmplitude(200)).toBe(16);
    expect(rippleAmplitude(100)).toBe(8);
    expect(rippleAmplitude(144)).toBeCloseTo(11.52);
  });

  test("is never under 2, so a nearly flat wave still ripples", () => {
    expect(rippleAmplitude(0)).toBe(2);
    expect(rippleAmplitude(25)).toBe(2);
    expect(rippleAmplitude(26)).toBeCloseTo(2.08);
  });

  test("stops where the line would leave its board", () => {
    expect(rippleAmplitude(400)).toBe(32);
    expect(rippleAmplitude(10_000)).toBe(34);
  });
});

describe("the ripple's path", () => {
  test("starts a board to the left and runs two boards to the right, so it drifts without a seam", () => {
    const d = ripplePath(8);
    expect(d).toStartWith("M-240,20 q15,-8 30,0 t30,0");
    // 12 periods of 60: from -240 to 480.
    expect(d.match(/ q/g)?.length).toBe(12);
  });

  test("its amplitude is the curves' control offset", () => {
    expect(ripplePath(11.52)).toContain(" q15,-11.52 30,0 t30,0");
  });
});

describe("notice", () => {
  test("a framed article: the ripple, the linked title, the sentence, the height now", () => {
    const props = noticeStates.states.default;
    if (props === undefined) throw new Error("the default state");
    const out = html(<Notice {...props} />);
    expect(out).toStartWith(
      '<article class="Notice"><svg class="Notice-ripple" viewBox="0 0 240 40" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A wave line flattening, now at 144">',
    );
    expect(out).toContain(`<path class="Notice-ripple-line" d="${ripplePath(11.52)}"></path>`);
    expect(out).toContain(
      '<h3 class="Notice-title"><a class="Notice-link" href="/topic/frontier-model-backlash" lang="en">New frontier model keeps drawing benchmarks and backlash</a></h3>',
    );
    expect(out).toContain(
      '<p class="Notice-text">A wave since Nov 13. Peaked at 188. Survived by 22 echoes.</p>',
    );
    expect(out).toEndWith('<p class="Notice-now">Now 144, down 18% in 24 hours</p></article>');
    expect(out).not.toContain("style=");
  });

  test("its text is text", () => {
    const out = html(
      <Notice
        title={{ text: "<b>x</b>", lang: "en" }}
        href="/topic/a?b=1&c=2"
        text="<i>"
        now="&"
        ripple={{ height: 1, label: '">' }}
      />,
    );
    expect(out).toContain('aria-label="&quot;>"');
    expect(out).toContain('href="/topic/a?b=1&amp;c=2"');
    expect(out).toContain(">&lt;b>x&lt;/b></a>");
    expect(out).toContain(">&lt;i></p>");
    expect(out).toContain(">&amp;</p>");
  });

  test("its states: default, low, tall, long, zh, ja", () => {
    expect(Object.keys(noticeStates.states)).toEqual([
      "default",
      "low",
      "tall",
      "long",
      "zh",
      "ja",
    ]);
  });

  test("the low state's ripple is the floor, the tall one's the tallest", () => {
    const { low, tall } = noticeStates.states;
    if (low === undefined || tall === undefined) throw new Error("the low and tall states");
    expect(rippleAmplitude(low.ripple.height)).toBe(2);
    expect(rippleAmplitude(tall.ripple.height)).toBeGreaterThan(15);
  });
});
