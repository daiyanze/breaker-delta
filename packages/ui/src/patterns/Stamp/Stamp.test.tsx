/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import stampStates from "./Stamp.states.tsx";
import { STAMP_KINDS, Stamp } from "./Stamp.tsx";

// The stamp's styles, frames and wobble: `packages/ui/src/styles/stamp.test.ts`.

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

describe("stamp", () => {
  test("its kind and label, as text", () => {
    expect(body(<Stamp kind="hit" label="Hit" />)).toBe(
      '<span class="Stamp" data-kind="hit">Hit</span>',
    );
    expect(body(<Stamp kind="miss" label="<b>&" />)).toContain(">&lt;b>&amp;</span>");
  });

  test("only a due stamp is loud", () => {
    expect(body(<Stamp kind="due" label="Due" loud />)).toContain("data-loud");
    expect(body(<Stamp kind="hit" label="Hit" loud />)).not.toContain("data-loud");
  });

  test("the six kinds have six texts", () => {
    const declared = Object.values(stampStates.states);
    const labels = STAMP_KINDS.map(
      (k) => declared.find((s) => s.kind === k && s.loud !== true)?.label,
    );
    expect(labels.every((l) => l !== undefined)).toBe(true);
    expect(new Set(labels).size).toBe(6);
  });

  test("its states: every kind, loud, long, zh, ja", () => {
    expect(Object.keys(stampStates.states)).toEqual([
      "due",
      "loud",
      "under_review",
      "hit",
      "partial",
      "miss",
      "undetermined",
      "long",
      "zh",
      "ja",
    ]);
  });
});
