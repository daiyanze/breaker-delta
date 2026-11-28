/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import marksStates from "../VerdictMarks/VerdictMarks.states.tsx";
import { VerdictMarks } from "../VerdictMarks/VerdictMarks.tsx";
import markStates from "./VerdictMark.states.tsx";
import { MARK_KINDS, VerdictMark } from "./VerdictMark.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

/** The drawing with its kind and colours taken out: only the shapes are left. */
const shape = (html: string) =>
  html
    .replace(/ data-mark="[^"]*"/, "")
    .replace(/ (role|aria-label|aria-hidden)="[^"]*"/g, "")
    .replace(/VerdictMark-filled/g, "filled");

describe("verdict mark", () => {
  test("the six kinds are six shapes: none needs its colour to be told apart", () => {
    const shapes = MARK_KINDS.map((mark) => shape(body(<VerdictMark mark={mark} />)));
    expect(new Set(shapes).size).toBe(6);
  });

  test("with a label it is an image; without one, decoration", () => {
    expect(body(<VerdictMark mark="hit" label="hit" />)).toStartWith(
      '<svg class="VerdictMark" data-mark="hit" viewBox="0 0 26 26" role="img" aria-label="hit">',
    );
    expect(body(<VerdictMark mark="hit" />)).toContain('aria-hidden="true"');
  });

  test("its states: one per kind", () => {
    expect(Object.keys(markStates.states)).toEqual([...MARK_KINDS]);
  });
});

describe("verdict marks", () => {
  const legend = {
    hit: "hit",
    partial: "partial",
    miss: "miss",
    undetermined: "undecided",
    under_review: "under review",
    waiting: "waiting",
  };

  test("one named mark per wave, in order, then a legend of every kind", () => {
    const html = body(
      <VerdictMarks
        label="3 waves"
        marks={[
          { id: "a", mark: "miss" },
          { id: "b", mark: "hit" },
          { id: "c", mark: "miss" },
        ]}
        legend={legend}
      />,
    );
    expect(html).toStartWith(
      '<div class="VerdictMarks"><ol class="VerdictMarks-list" aria-label="3 waves">',
    );
    const list = html.slice(0, html.indexOf("</ol>"));
    expect([...list.matchAll(/aria-label="([^"]+)">/g)].map((m) => m[1])).toEqual([
      "3 waves",
      "miss",
      "hit",
      "miss",
    ]);
    const key = html.slice(html.indexOf('<ul class="VerdictMarks-legend">'));
    expect(key.match(/<li /g)?.length).toBe(6);
    expect(key).not.toContain('role="img"');
    for (const name of Object.values(legend)) expect(key).toContain(`</svg>${name}</li>`);
  });

  test("before any verdict every mark is empty", () => {
    const none = marksStates.states.none;
    expect(none?.marks.every((m) => m.mark === "waiting")).toBe(true);
  });

  test("its states: default, none, long, zh, ja", () => {
    expect(Object.keys(marksStates.states)).toEqual(["default", "none", "long", "zh", "ja"]);
    expect(marksStates.states.default?.marks.length).toBe(41);
  });
});
