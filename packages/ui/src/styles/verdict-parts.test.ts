import { describe, expect, test } from "bun:test";
import stampCss from "../patterns/Stamp/Stamp.css" with { type: "text" };
import stubCss from "../patterns/TicketStub/TicketStub.css" with { type: "text" };
import stubsCss from "../patterns/TicketStubs/TicketStubs.css" with { type: "text" };
import markCss from "../patterns/VerdictMark/VerdictMark.css" with { type: "text" };
import marksCss from "../patterns/VerdictMarks/VerdictMarks.css" with { type: "text" };
import { PHONE, size } from "../tokens/index.ts";
import { type CssBlock, parseCss } from "./css.ts";

// The values of the stamp, stub and verdict mark styles (#115) that their
// markup tests cannot see: frames, colours, sizes and grid columns, each
// as the README or board gives it. The stamp's frames by kind and its
// wobble: `stamp.test.ts`.

/** Every block of a sheet, nested ones included, with the at-rules around it. */
function blocks(root: CssBlock, within: readonly string[] = []): { at: string[]; b: CssBlock }[] {
  return root.children.flatMap((b) => {
    const at = b.prelude.startsWith("@") ? [...within, b.prelude] : [...within];
    return [{ at, b }, ...blocks(b, at)];
  });
}

/** The declarations of the block `prelude` in `css`, inside exactly the at-rules `at` after the layer. */
function rule(css: string, prelude: string, at: readonly string[] = []): Record<string, string> {
  const found = blocks(parseCss(css)).find(
    (x) => x.b.prelude === prelude && x.at.join("|") === ["@layer patterns", ...at].join("|"),
  );
  if (found === undefined) throw new Error(`no rule ${prelude} in ${at.join(" ") || "the layer"}`);
  return Object.fromEntries(found.b.declarations);
}

const DESKTOP = ["@media (min-width: 960px)"];

describe("stamp", () => {
  test("a 3px frame with the stamp radius, bold text", () => {
    expect(rule(stampCss, ".Stamp")).toMatchObject({
      border: "var(--stamp-border) solid var(--ink)",
      "border-radius": "var(--radius-stamp)",
      "font-weight": "bold",
    });
  });

  test("the loud due stamp is red, frame and text", () => {
    expect(rule(stampCss, ".Stamp[data-loud]")).toMatchObject({
      "border-color": "var(--red)",
      color: "var(--red)",
    });
  });

  test("each verdict's colours (README)", () => {
    expect(rule(stampCss, '.Stamp[data-kind="hit"]')).toEqual({
      background: "var(--ink)",
      color: "var(--paper)",
    });
    expect(rule(stampCss, '.Stamp[data-kind="partial"]')).toMatchObject({ color: "var(--blue)" });
    expect(rule(stampCss, '.Stamp[data-kind="miss"]')).toMatchObject({ color: "var(--red)" });
    expect(rule(stampCss, '.Stamp[data-kind="undetermined"]')).toMatchObject({
      color: "var(--ink-2)",
    });
    expect(rule(stampCss, '.Stamp[data-kind="under_review"]')).toMatchObject({
      color: "var(--ink-2)",
    });
  });
});

describe("ticket stub", () => {
  test("a 2px dashed ink frame with square corners", () => {
    expect(rule(stubCss, ".TicketStub")).toMatchObject({
      border: "var(--rule-dashed) dashed var(--ink)",
      "border-radius": "var(--radius-none)",
    });
  });

  test("the days gone are filled with ink, the rest are outlines", () => {
    expect(rule(stubCss, ".TicketStub-tick")).toEqual({ fill: "none", stroke: "var(--ink)" });
    expect(rule(stubCss, ".TicketStub-tick--gone")).toEqual({ fill: "var(--ink)" });
  });

  test("a row's columns are at least two thirds of the rail, or the whole width", () => {
    expect(rule(stubsCss, ".TicketStubs")["grid-template-columns"]).toBe(
      "repeat(auto-fill,minmax(min(100%,calc(var(--rail) * 2 / 3)),1fr))",
    );
  });
});

describe("verdict marks", () => {
  test("a mark is 26px across, in ink unless its kind says otherwise", () => {
    expect(rule(markCss, ".VerdictMark")).toMatchObject({
      "--mark-ink": "var(--ink)",
      width: "var(--mark-size)",
      height: "var(--mark-size)",
    });
    expect(rule(markCss, ".VerdictMark-fill")).toEqual({ fill: "var(--mark-ink)" });
    expect(rule(markCss, ".VerdictMark-line")).toEqual({
      fill: "none",
      stroke: "var(--mark-ink)",
    });
  });

  test("each kind's colours (README)", () => {
    expect(rule(markCss, '.VerdictMark[data-mark="miss"]')).toEqual({ "--mark-ink": "var(--red)" });
    expect(rule(markCss, '.VerdictMark[data-mark="undetermined"]')).toEqual({
      "--mark-ink": "var(--ink-2)",
    });
    expect(rule(markCss, '.VerdictMark[data-mark="waiting"]')).toEqual({
      "--mark-ink": "var(--hair)",
    });
    // Under review: sun inside an ink ring.
    expect(rule(markCss, ".VerdictMark-filled")).toEqual({ fill: "var(--sun)" });
  });

  test("ten to a row on phones and fourteen on desktop, 8px apart", () => {
    const list = rule(marksCss, ".VerdictMarks-list");
    expect(list["grid-template-columns"]).toBe("repeat(10,minmax(0,var(--mark-size)))");
    expect(list.gap).toBe("var(--space-2)");
    // The media query is nested in the list's rule.
    expect(rule(marksCss, DESKTOP[0] as string, DESKTOP)["grid-template-columns"]).toBe(
      "repeat(14,minmax(0,var(--mark-size)))",
    );
  });

  test("the marks shrink with their columns, so ten fit a 320px phone", () => {
    // The columns are `minmax(0, …)` and each mark fills its cell, square, so
    // the row needs only its nine gaps: far less than a 320px phone's
    // content column. Ten marks at full size would need 332px.
    expect(rule(marksCss, "& > li")).toEqual({ "min-width": "0" });
    expect(rule(marksCss, "& .VerdictMark")).toEqual({
      width: "100%",
      height: "auto",
      "aspect-ratio": "1",
    });
    const px = (v: string) => Number.parseFloat(v);
    const column = 320 - 2 * px(PHONE.gutter.value);
    expect(9 * px(size("space-2"))).toBeLessThan(column);
    expect(10 * 26 + 9 * px(size("space-2"))).toBeGreaterThan(column);
  });
});
