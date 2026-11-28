/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import buttonStates from "./Button.states.tsx";
import { Button } from "./Button.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

describe("button (issue 112)", () => {
  test("a <button>, type button unless it submits, the variant as data-variant", () => {
    expect(body(<Button>Copy</Button>)).toBe('<button type="button" class="Button">Copy</button>');
    expect(
      body(
        <Button variant="solid" type="submit">
          Subscribe
        </Button>,
      ),
    ).toBe('<button type="submit" class="Button" data-variant="solid">Subscribe</button>');
    expect(body(<Button variant="default">Read</Button>)).toBe(
      '<button type="button" class="Button">Read</button>',
    );
  });

  test("with href, a link with the same class", () => {
    expect(
      body(
        <Button variant="secondary" href="/a?b=1&c=2">
          Copy link
        </Button>,
      ),
    ).toBe('<a class="Button" href="/a?b=1&amp;c=2" data-variant="secondary">Copy link</a>');
  });

  test("its text is text", () => {
    expect(body(<Button>{"<b>"}</Button>)).toContain(">&lt;b></button>");
  });

  test("its states: the three variants, a link, long, zh, ja", () => {
    expect(Object.keys(buttonStates.states)).toEqual([
      "default",
      "solid",
      "secondary",
      "link",
      "long",
      "zh",
      "ja",
    ]);
  });
});
