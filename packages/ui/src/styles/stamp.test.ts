import { describe, expect, test } from "bun:test";
import stampCss from "../patterns/Stamp/Stamp.css" with { type: "text" };
import stubCss from "../patterns/TicketStub/TicketStub.css" with { type: "text" };
import { STAMP } from "../tokens/index.ts";
import { type CssBlock, parseCss } from "./css.ts";

// The stamp's styles (#115, TicketStub README): how the six kinds differ
// besides their colour, and the hover wobble. Its markup and text:
// `patterns/Stamp/Stamp.test.tsx`.

/** Every block of a sheet, nested ones included, with the at-rules around it. */
function blocks(root: CssBlock, within: readonly string[] = []): { at: string[]; b: CssBlock }[] {
  return root.children.flatMap((b) => {
    const at = b.prelude.startsWith("@") ? [...within, b.prelude] : [...within];
    return [{ at, b }, ...blocks(b, at)];
  });
}
const sheet = blocks(parseCss(stampCss));

const COLOUR = new Set(["color", "border-color", "background"]);

/** What a stamp of `kind` declares beyond the base rule, colour left out. */
function frame(kind: string, loud = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { b } of sheet) {
    const applies =
      b.prelude === `.Stamp[data-kind="${kind}"]` || (loud && b.prelude === ".Stamp[data-loud]");
    if (!applies) continue;
    for (const [p, v] of b.declarations) if (!COLOUR.has(p)) out[p] = v;
    if (b.declarations.some(([p]) => p === "background")) out.filled = "yes";
  }
  return out;
}

const REDUCED = ["@layer patterns", "@media (prefers-reduced-motion: no-preference)"];
const WOBBLE: CssBlock["declarations"] = [
  ["animation", "Stamp-wobble var(--stamp-wobble) ease-in-out"],
];

describe("stamp styles", () => {
  test("each kind has the frame the README gives it, not only a colour", () => {
    // Due: dashed and upright. Under review: thin and upright. Hit: filled.
    // Undecided: dashed and turned. Partial and miss: the verdict frame,
    // turned -4°, told apart by their text.
    expect(frame("due")).toEqual({
      "--stamp-turn": "0deg",
      "border-width": "var(--rule-dashed)",
      "border-style": "dashed",
    });
    expect(frame("under_review")).toEqual({
      "--stamp-turn": "0deg",
      "border-width": "var(--rule-dashed)",
    });
    expect(frame("hit")).toEqual({ filled: "yes" });
    expect(frame("undetermined")).toEqual({ "border-style": "dashed" });
    expect(frame("partial")).toEqual({});
    expect(frame("miss")).toEqual({});
    expect(frame("due", true)).toMatchObject({
      "--stamp-turn": "var(--stamp-due-tilt)",
      "border-width": "var(--stamp-border)",
      "border-style": "solid",
    });
    const base = sheet.find(({ b }) => b.prelude === ".Stamp")?.b.declarations ?? [];
    expect(base).toContainEqual(["--stamp-turn", "var(--stamp-tilt)"]);
    expect(base).toContainEqual(["rotate", "var(--stamp-turn)"]);
    expect(base).toContainEqual(["border", "var(--stamp-border) solid var(--ink)"]);
  });

  test("hovered, a stamp wobbles once for 0.2 seconds, unless motion is reduced", () => {
    expect(STAMP.wobble).toBe("0.2s");
    const hover = sheet.find(({ b }) => b.prelude === ".Stamp:hover");
    expect(hover?.at).toEqual(REDUCED);
    expect(hover?.b.declarations).toEqual(WOBBLE);
    const swing = sheet.find(({ b }) => b.prelude === "@keyframes Stamp-wobble")?.b.children;
    expect(swing?.map((k) => [k.prelude, k.declarations])).toEqual([
      [
        "50%",
        [
          ["rotate", "var(--stamp-swing)"],
          ["scale", "var(--stamp-swing-scale)"],
        ],
      ],
    ]);
  });

  test("a hovered stub wobbles its stamp the same way", () => {
    const hover = blocks(parseCss(stubCss)).find(
      ({ b }) => b.prelude === ".TicketStub:hover > .Stamp",
    );
    expect(hover?.at).toEqual(REDUCED);
    expect(hover?.b.declarations).toEqual(WOBBLE);
  });
});
