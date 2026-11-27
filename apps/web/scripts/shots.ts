/**
 * What the screenshot run (`screens.ts`, #258) takes and how it reports,
 * with no browser: shot names, the threshold, and the report that names
 * the components a change touched. `shots.test.ts` covers it in `check`.
 */

/** The widths every state is captured at (#258): desktop and phone. */
export const WIDTHS = { desktop: 1440, phone: 390 } as const;
export type Width = keyof typeof WIDTHS;

/** Hover and focus are not states: the run moves the pointer and the focus (ADR 0020, section 12). */
export type Pose = "rest" | "hover" | "focus";

export interface Shot {
  component: string;
  state: string;
  theme: string;
  lang: string;
  width: Width;
  pose: Pose;
}

/**
 * Where a shot is stored under the baseline folder:
 * `Band/note.dark.ja.phone.png`, `ThemeSwitch/default.light.en.desktop.hover.png`.
 */
export function shotPath(s: Shot): string {
  const pose = s.pose === "rest" ? "" : `.${s.pose}`;
  return `${s.component}/${s.state}.${s.theme}.${s.lang}.${s.width}${pose}.png`;
}

/** A box on the page, in CSS pixels from the document's top left. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const empty = (b: Box) => b.width <= 0 || b.height <= 0;

/**
 * The area a state paints: the union of its wrapper's box and every
 * descendant's. A child that is positioned out of the wrapper (an open
 * menu's absolutely positioned list) is then inside the shot; clipping to
 * the wrapper alone left it out (#258, review round 3). Boxes with no area
 * (`display: none`, a closed `<details>`'s content) are skipped. The first
 * box is the wrapper's, so a state that paints inside it keeps exactly that
 * box.
 */
export function paintedBox(boxes: readonly Box[]): Box {
  const drawn = boxes.filter((b) => !empty(b));
  const first = drawn[0] ?? boxes[0];
  if (first === undefined) throw new Error("a shot needs at least its wrapper's box");
  let [x0, y0, x1, y1] = [first.x, first.y, first.x + first.width, first.y + first.height];
  for (const b of drawn) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The boxes with area that reach outside `clip`: what a shot of `clip` would miss. */
export function outside(clip: Box, boxes: readonly Box[]): Box[] {
  return boxes.filter(
    (b) =>
      !empty(b) &&
      (b.x < clip.x ||
        b.y < clip.y ||
        b.x + b.width > clip.x + clip.width ||
        b.y + b.height > clip.y + clip.height),
  );
}

/** The component a stored shot belongs to: its folder. */
export function componentOf(path: string): string {
  return path.split("/", 1)[0] ?? path;
}

/**
 * A pixel counts as changed when one of its channels moved by more than
 * `channel` (of 255); a shot fails when more than `ratio` of its pixels
 * changed, or its size did. A one-pixel rule or a colour that moves by more
 * than 8 in a channel fails; anti-aliasing noise on one machine does not.
 * `shots.test.ts` pins both edges.
 */
export const THRESHOLD = { channel: 8, ratio: 0.0001 } as const;

/**
 * Counts the pixels of two RGBA buffers of one size that differ by more
 * than `channel` in a channel, and writes an image into `out`: changed
 * pixels red, the rest a faint copy of `expected`. Self-contained, because
 * `screens.ts` runs its source in the browser, where the PNGs are decoded.
 */
export function markChanges(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  channel: number,
  out: { [i: number]: number },
): number {
  let changed = 0;
  for (let i = 0; i < actual.length; i += 4) {
    let moved = false;
    for (let c = 0; c < 4; c++) {
      if (Math.abs((actual[i + c] ?? 0) - (expected[i + c] ?? 0)) > channel) moved = true;
    }
    if (moved) changed++;
    for (let c = 0; c < 3; c++) {
      const faint = 255 - ((255 - (expected[i + c] ?? 0)) >> 3);
      out[i + c] = moved ? (c === 0 ? 255 : 0) : faint;
    }
    out[i + 3] = 255;
  }
  return changed;
}

/** Whether `changed` of `total` pixels is more than the threshold allows. */
export function overThreshold(changed: number, total: number): boolean {
  return changed / total > THRESHOLD.ratio;
}

export type Outcome =
  | { path: string; kind: "same" }
  | { path: string; kind: "changed"; ratio: number; sizes?: string }
  | { path: string; kind: "new" }
  | { path: string; kind: "gone" };

/** Whether a comparison fails the run: changed above the threshold, new, or gone. */
export function fails(o: Outcome): boolean {
  return o.kind !== "same";
}

/** The report, naming the components that changed first (#258). */
export function report(outcomes: readonly Outcome[], baselines: string, out: string): string {
  const failed = outcomes.filter(fails);
  const count = (kind: Outcome["kind"]) => outcomes.filter((o) => o.kind === kind).length;
  const taken = outcomes.length - count("gone");
  if (failed.length === 0) {
    return `ui screenshots: ${taken} shots match the baselines in ${baselines}`;
  }
  const components = [...new Set(failed.map((o) => componentOf(o.path)))].sort();
  const lines = [
    `ui screenshots: ${count("changed")} changed, ${count("new")} new, ${count("gone")} gone, of ${taken} shots (baselines: ${baselines})`,
    `components affected: ${components.join(", ")}`,
  ];
  for (const o of failed) {
    if (o.kind === "changed") {
      const what = o.sizes ?? `${(o.ratio * 100).toFixed(2)}% of pixels`;
      lines.push(`  changed  ${o.path}  ${what}`);
    } else if (o.kind === "new") {
      lines.push(`  new      ${o.path}  (no baseline)`);
    } else {
      lines.push(`  gone     ${o.path}  (a baseline no shot matches)`);
    }
  }
  lines.push(
    `Every shot of this run is in ${out}/actual, the baselines of the changed ones in ${out}/expected, and a diff in ${out}/diff where the size did not change.`,
    `If the change is intended: bun run ui:baseline, then commit ${baselines}.`,
  );
  return lines.join("\n");
}
