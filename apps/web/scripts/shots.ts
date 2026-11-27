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
