import { describe, expect, test } from "bun:test";
import {
  type Box,
  componentOf,
  inkBox,
  markChanges,
  type Outcome,
  overThreshold,
  paintedBox,
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

describe("what a shot covers (#258)", () => {
  // LanguageMenu's open state at desktop width: the wrapper holds the button;
  // the list is `position: absolute` below it, outside the wrapper's box.
  const wrapper = { x: 80, y: 40, width: 1280, height: 68 };
  const button = { x: 1200, y: 40, width: 160, height: 68 };
  const list = { x: 1180, y: 116, width: 180, height: 132 };
  const hidden = { x: 0, y: 0, width: 0, height: 0 };

  /** Whether `inner` lies wholly inside `outer`. */
  const contains = (outer: Box, inner: Box) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

  test("an absolutely positioned child outside the wrapper is inside the shot", () => {
    const clip = paintedBox([wrapper, button, list, hidden]);
    expect(contains(clip, list)).toBe(true);
    expect(contains(wrapper, list)).toBe(false);
    expect(clip).toEqual({ x: 80, y: 40, width: 1280, height: 208 });
  });

  // Paint outside every element's box, on a page of the background colour: a
  // 40x30 screenshot, with a 25x6 wrapper whose button is flush with its
  // right edge (as LanguageMenu's and ThemeSwitch's are).
  const W = 40;
  const H = 30;
  const shotWrapper = { x: 5, y: 10, width: 25, height: 6 };
  const shotButton = { x: 20, y: 10, width: 10, height: 6 };
  const PAPER = [238, 232, 220, 255];
  const [R, G, B] = [238, 232, 220];
  const RED = [200, 40, 30, 255];
  function page(paint: (put: (x: number, y: number) => void) => void): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(W * H * 4).map((_, i) => PAPER[i % 4] ?? 0);
    paint((x, y) => rgba.set(RED, (y * W + x) * 4));
    return rgba;
  }
  /** The clip `screens.ts` takes: element boxes plus the page's ink. */
  function clipOf(rgba: Uint8ClampedArray): Box {
    const ink = inkBox(rgba, W, H, THRESHOLD.channel);
    return paintedBox(ink === null ? [shotWrapper, shotButton] : [shotWrapper, shotButton, ink]);
  }
  const fill = (put: (x: number, y: number) => void, b: Box) => {
    for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) put(x, y);
  };

  test("an outline outside the box (a focus ring) is inside the shot", () => {
    // `outline: 2px solid; outline-offset: 2px` on the button: a ring 4px out.
    const ring = { x: 16, y: 6, width: 18, height: 14 };
    const rgba = page((put) => {
      for (let x = ring.x; x < ring.x + ring.width; x++) {
        for (const y of [6, 7, 18, 19]) put(x, y);
      }
      for (let y = ring.y; y < ring.y + ring.height; y++) {
        for (const x of [16, 17, 32, 33]) put(x, y);
      }
    });
    expect(contains(clipOf(rgba), ring)).toBe(true);
    expect(contains(paintedBox([shotWrapper, shotButton]), ring)).toBe(false);
  });

  test("an outer box-shadow outside the box is inside the shot", () => {
    // `box-shadow: 4px 0 0 red` on the button: a band right of its box.
    const shadow = { x: 30, y: 10, width: 4, height: 6 };
    const rgba = page((put) => fill(put, shadow));
    expect(contains(clipOf(rgba), shadow)).toBe(true);
    expect(contains(paintedBox([shotWrapper, shotButton]), shadow)).toBe(false);
  });

  test("a positioned ::after outside the box is inside the shot", () => {
    // `::after { position: absolute; top: calc(100% + 4px) }`: no element box.
    const after = { x: 22, y: 20, width: 4, height: 3 };
    const rgba = page((put) => fill(put, after));
    expect(contains(clipOf(rgba), after)).toBe(true);
    expect(contains(paintedBox([shotWrapper, shotButton]), after)).toBe(false);
  });

  test("ink is what differs from the background by more than the noise level", () => {
    expect(
      inkBox(
        page(() => {}),
        W,
        H,
        THRESHOLD.channel,
      ),
    ).toBeNull();
    const faint = page(() => {});
    faint.set([R - 8, G, B, 255], (3 * W + 3) * 4);
    expect(inkBox(faint, W, H, THRESHOLD.channel)).toBeNull();
    faint.set([R - 9, G, B, 255], (3 * W + 3) * 4);
    expect(inkBox(faint, W, H, THRESHOLD.channel)).toEqual({ x: 3, y: 3, width: 1, height: 1 });
    // Nothing on the page: the clip is the element boxes.
    expect(clipOf(page(() => {}))).toEqual({ x: 5, y: 10, width: 25, height: 6 });
  });

  test("a state that paints inside its wrapper keeps the wrapper's box exactly", () => {
    expect(paintedBox([wrapper, button, hidden])).toEqual(wrapper);
    expect(paintedBox([wrapper])).toEqual(wrapper);
  });

  test("a fractional box is rounded out to whole pixels, never cut", () => {
    const band = { x: 80, y: 40.25, width: 1280, height: 188.5 };
    expect(paintedBox([band])).toEqual({ x: 80, y: 40, width: 1280, height: 189 });
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
