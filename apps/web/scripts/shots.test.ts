import { describe, expect, test } from "bun:test";
import {
  componentOf,
  markChanges,
  type Outcome,
  overThreshold,
  report,
  shotPath,
  THRESHOLD,
} from "./shots.ts";

describe("the pixel comparison and its threshold (#258)", () => {
  /** An RGBA buffer of `n` opaque pixels of one grey. */
  const grey = (n: number, v: number) =>
    new Uint8ClampedArray(n * 4).map((_, i) => (i % 4 === 3 ? 255 : v));

  test("a channel moved by 8 is noise; by 9 it is a change, and the pixel is marked red", () => {
    const out = new Uint8ClampedArray(8);
    const a = grey(2, 100);
    const b = grey(2, 100);
    b[0] = 108;
    expect(markChanges(a, b, THRESHOLD.channel, out)).toBe(0);
    b[0] = 109;
    expect(markChanges(a, b, THRESHOLD.channel, out)).toBe(1);
    expect([...out.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(out[4]).not.toBe(255);
  });

  test("a shot fails above one pixel in ten thousand", () => {
    expect(overThreshold(1, 10_000)).toBe(false);
    expect(overThreshold(2, 10_000)).toBe(true);
    // A one-pixel line across a 1280x200 shot fails.
    expect(overThreshold(1280, 1280 * 200)).toBe(true);
  });
});

describe("screenshot names (#258)", () => {
  test("a shot is stored under its component, with its state, theme, language, width and pose", () => {
    const base = {
      component: "Band",
      state: "note",
      theme: "dark",
      lang: "ja",
      width: "phone",
    } as const;
    expect(shotPath({ ...base, pose: "rest" })).toBe("Band/note.dark.ja.phone.png");
    expect(shotPath({ ...base, pose: "hover" })).toBe("Band/note.dark.ja.phone.hover.png");
    expect(componentOf("ThemeSwitch/default.light.en.desktop.focus.png")).toBe("ThemeSwitch");
  });
});

describe("the screenshot report (#258)", () => {
  test("names the components a change touched, and each shot", () => {
    const outcomes: Outcome[] = [
      { path: "Band/default.light.en.desktop.png", kind: "changed", ratio: 0.0231 },
      {
        path: "Band/note.light.en.phone.png",
        kind: "changed",
        ratio: 0,
        sizes: "390x200, was 390x180",
      },
      { path: "ThemeSwitch/default.light.en.desktop.png", kind: "same" },
      { path: "Gull/default.light.en.desktop.png", kind: "new" },
      { path: "Old/default.light.en.desktop.png", kind: "gone" },
    ];
    const text = report(outcomes, "apps/web/screenshots/linux", ".ui-screens");
    expect(text).toContain("2 changed, 1 new, 1 gone, of 4 shots");
    expect(text).toContain("components affected: Band, Gull, Old");
    expect(text).not.toContain("components affected: Band, Gull, Old, ThemeSwitch");
    expect(text).toContain("changed  Band/default.light.en.desktop.png  2.31% of pixels");
    expect(text).toContain("changed  Band/note.light.en.phone.png  390x200, was 390x180");
    expect(text).toContain("bun run ui:baseline");
  });

  test("says so when every shot matches", () => {
    const outcomes: Outcome[] = [{ path: "Band/default.light.en.desktop.png", kind: "same" }];
    expect(report(outcomes, "b", "o")).toBe("ui screenshots: 1 shots match the baselines in b");
  });
});
