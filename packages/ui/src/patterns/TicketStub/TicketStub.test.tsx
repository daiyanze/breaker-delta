/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import stubsStates from "../TicketStubs/TicketStubs.states.tsx";
import { TicketStubs } from "../TicketStubs/TicketStubs.tsx";
import stubStates from "./TicketStub.states.tsx";
import { TicketStub } from "./TicketStub.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

const state = (name: string) => {
  const s = stubStates.states[name];
  if (s === undefined) throw new Error(`no state ${name}`);
  return s;
};

describe("ticket stub", () => {
  test("small: the stamp, the test in its language, the wave and the day", () => {
    const html = body(<TicketStub {...state("default")} />);
    expect(html).toStartWith(
      '<article class="TicketStub" data-size="small"><span class="Stamp" data-kind="due" data-loud>Due Nov 26</span>',
    );
    expect(html).toContain('<p class="TicketStub-criterion" lang="en">Mainstream outlets');
    expect(html).toContain(
      '<a class="TicketStub-topic" href="/topic/chipmaker" lang="en">Chipmaker board ousts its founder CEO</a>',
    );
    expect(html).toContain('<p class="TicketStub-small">Day 7 of 14</p>');
    expect(html).not.toContain("<svg");
  });

  test("large: a tick per day, the days gone filled, the day in bold before the note", () => {
    const html = body(<TicketStub {...state("large")} />);
    expect(html).toContain('data-size="large"');
    expect(html).toContain(
      '<svg class="TicketStub-ticks" viewBox="0 0 312 30" role="img" aria-label="Day 7 of 14.">',
    );
    expect(html.match(/<rect /g)?.length).toBe(14);
    expect(html.match(/TicketStub-tick--gone/g)?.length).toBe(7);
    expect(html).toContain(
      '<p class="TicketStub-day"><strong>Day 7 of 14.</strong> Code locked this test',
    );
    expect(html).toContain('<p class="TicketStub-small">Test hash 3f9a…c21e');
  });

  test("a stamped stub has no day, only its note", () => {
    const html = body(<TicketStub {...state("stamped")} />);
    expect(html).toContain('data-kind="hit"');
    expect(html).toContain('<p class="TicketStub-small">Confirmed Nov 26</p>');
    expect(html).not.toContain("Day ");
  });

  test("text is text", () => {
    const html = body(
      <TicketStub
        stamp={{ kind: "miss", label: "<i>" }}
        criterion={{ text: "<script>", lang: "en" }}
        topic={{ text: "&", lang: "en", href: "/t?a=1&b=2" }}
      />,
    );
    expect(html).toContain(">&lt;script></p>");
    expect(html).toContain('href="/t?a=1&amp;b=2"');
    expect(html).not.toContain("<script>");
  });

  test("its states: default, stamped, large, long, zh, ja", () => {
    expect(Object.keys(stubStates.states)).toEqual([
      "default",
      "stamped",
      "large",
      "long",
      "zh",
      "ja",
    ]);
  });
});

describe("ticket stubs", () => {
  test("a list of small stubs, one item each", () => {
    const row = stubsStates.states.default;
    if (row === undefined) throw new Error("the default state");
    const html = body(<TicketStubs {...row} />);
    expect(html).toStartWith('<ul class="TicketStubs"><li class="TicketStubs-item">');
    expect(html.match(/<li /g)?.length).toBe(3);
    expect(html.match(/data-size="small"/g)?.length).toBe(3);
  });
});
