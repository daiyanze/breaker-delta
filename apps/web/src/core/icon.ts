/**
 * The product icon (issue #108, board 25, design system `Icon`): a white,
 * red, white lighthouse with a Δ on the red band, two beams, and a wave
 * cresting toward it. One drawing, two colourings:
 *
 * - **Night**, the main icon: fixed colours that do not follow the theme.
 *   Favicons, app icons, share cards.
 * - **One ink**, the round mark: `ink` and `paper` only, as CSS variables,
 *   so it follows the page's theme.
 *
 * Three levels of detail, by the size the icon is shown at (`iconDetail`).
 * Every colour comes from `design/system/tokens.json` by name.
 */
import tokens from "../../../../design/system/tokens.json" with { type: "json" };

type Theme = "light" | "dark";

/** A token's value in one theme. Throws on a name tokens.json does not have. */
function token(name: string, theme: Theme): string {
  const t = tokens.color.tokens.find((c) => c.name === name);
  if (t === undefined) throw new Error(`no colour token "${name}"`);
  return t.value[theme];
}

/**
 * - `full`: 100px and up, every part.
 * - `medium`: 48 to 99px, no railing, thicker lines.
 * - `small`: below 48px, also no window bar and no Δ.
 */
export type IconDetail = "full" | "medium" | "small";

export function iconDetail(px: number): IconDetail {
  if (px >= 100) return "full";
  if (px >= 48) return "medium";
  return "small";
}

/** What each part is filled or stroked with. `none` leaves a part unfilled. */
interface Palette {
  ground: string;
  beam: string;
  beamLine?: string;
  rock: string;
  tower: string;
  towerLine?: string;
  band: string;
  delta: string;
  lantern: string;
  lanternLine: string;
  windowBar: string;
  railing: string;
  gallery: string;
  roof: string;
  spire: string;
  farWave: string;
  farWaveLine?: string;
  nearWave: string;
  deep: string;
  crest: string;
}

/**
 * Night as on board 25, with one change: the deep band at the bottom is
 * `solid`, as the design system's README says, where the board has `paper`'s
 * dark value. The board's other colours are token values already: the rock,
 * railing, gallery and spire are `ink-2`'s dark value, the far wave `sky`'s.
 */
const NIGHT: Palette = {
  ground: token("ink", "light"),
  beam: token("sun", "light"),
  rock: token("ink-2", "dark"),
  tower: token("paper", "light"),
  band: token("red", "light"),
  delta: token("paper", "light"),
  lantern: token("sun", "light"),
  lanternLine: token("ink", "light"),
  windowBar: token("ink", "light"),
  railing: token("ink-2", "dark"),
  gallery: token("ink-2", "dark"),
  roof: token("red", "light"),
  spire: token("ink-2", "dark"),
  farWave: token("sky", "dark"),
  nearWave: token("blue", "light"),
  deep: token("solid", "dark"),
  crest: token("paper", "light"),
};

const INK = "var(--ink)";
const PAPER = "var(--paper)";

const ONE_INK: Palette = {
  ground: PAPER,
  beam: "none",
  beamLine: INK,
  rock: INK,
  tower: PAPER,
  towerLine: INK,
  band: INK,
  delta: PAPER,
  lantern: PAPER,
  lanternLine: INK,
  windowBar: INK,
  railing: INK,
  gallery: INK,
  roof: INK,
  spire: INK,
  farWave: PAPER,
  farWaveLine: INK,
  nearWave: INK,
  deep: INK,
  crest: PAPER,
};

// The drawing, on a 512 grid. The sea runs past the edges and is clipped.
const TOWER = "190,380 214,168 298,168 322,380";
const FAR_WAVE_TOP =
  "M-20,372 C10,356 40,338 70,336 C110,334 150,356 190,384 C215,400 240,408 270,408 " +
  "C330,408 380,396 430,376 C470,360 500,352 532,350";
const CREST =
  "M-20,404 C24,394 62,362 92,326 C108,306 130,292 150,296 C164,299 168,312 158,320 " +
  "C146,330 140,348 146,366 C156,392 194,416 240,420 C300,424 340,440 396,438 " +
  "C450,436 492,404 532,372";
const TO_BOTTOM = " L532,532 L-20,532 Z";

interface Stroke {
  line: string;
  width: number;
  cap?: "round";
  join?: "round";
}

function paint(area: string | undefined, stroke?: Stroke): string {
  const style: string[] = [];
  if (area !== undefined) style.push(`fill:${area}`);
  if (stroke !== undefined) {
    style.push(`stroke:${stroke.line}`, `stroke-width:${stroke.width}`);
    if (stroke.cap) style.push(`stroke-linecap:${stroke.cap}`);
    if (stroke.join) style.push(`stroke-linejoin:${stroke.join}`);
  }
  return `style="${style.join(";")}"`;
}

/** The parts inside the clip, back to front. */
function drawing(p: Palette, detail: IconDetail): string {
  const bold = detail !== "full";
  const out: string[] = [`<rect x="0" y="0" width="512" height="512" ${paint(p.ground)}/>`];
  const beamLine: Stroke | undefined =
    p.beamLine === undefined ? undefined : { line: p.beamLine, width: 8, join: "round" };
  out.push(
    `<path d="M256,124 L-20,62 L-20,194 Z M256,124 L532,62 L532,194 Z" ${paint(p.beam, beamLine)}/>`,
    `<polygon points="178,376 334,376 368,436 144,436" ${paint(p.rock)}/>`,
    `<polygon points="${TOWER}" ${paint(p.tower)}/>`,
    `<polygon points="207.9,222 304.1,222 315.9,326 196.1,326" ${paint(p.band)}/>`,
  );
  if (detail !== "small") {
    out.push(
      `<polygon points="256,240 290,308 222,308" ` +
        `${paint("none", { line: p.delta, width: bold ? 11 : 8, join: "round" })}/>`,
    );
  }
  if (p.towerLine) {
    out.push(
      `<polygon points="${TOWER}" ${paint("none", { line: p.towerLine, width: 8, join: "round" })}/>`,
    );
  }
  out.push(
    `<rect x="222" y="104" width="68" height="46" ` +
      `${paint(p.lantern, { line: p.lanternLine, width: bold ? 10 : 8 })}/>`,
  );
  if (detail !== "small") {
    out.push(`<path d="M256,104 V150" ${paint(undefined, { line: p.windowBar, width: 7 })}/>`);
  }
  if (detail === "full") {
    out.push(
      `<path d="M202,146 H310 M202,146 V160 M229,146 V160 M256,146 V160 M283,146 V160 M310,146 V160" ` +
        `${paint("none", { line: p.railing, width: 6, cap: "round" })}/>`,
    );
  }
  out.push(
    `<rect x="196" y="156" width="120" height="14" ${paint(p.gallery)}/>`,
    `<polygon points="202,106 256,60 310,106" ${paint(p.roof)}/>`,
    `<path d="M256,62 V36" ${paint(undefined, { line: p.spire, width: 9, cap: "round" })}/>`,
    `<path d="${FAR_WAVE_TOP}${TO_BOTTOM}" ${paint(p.farWave)}/>`,
  );
  if (p.farWaveLine) {
    out.push(
      `<path d="${FAR_WAVE_TOP}" ${paint("none", { line: p.farWaveLine, width: 8, cap: "round" })}/>`,
    );
  }
  out.push(
    `<path d="${CREST}${TO_BOTTOM}" ${paint(p.nearWave)}/>`,
    `<path d="M-20,478 C50,468 110,488 190,494 C290,502 400,500 532,456${TO_BOTTOM}" ${paint(p.deep)}/>`,
    `<path d="${CREST}" ` +
      `${paint("none", { line: p.crest, width: bold ? 16 : 12, cap: "round", join: "round" })}/>`,
  );
  return out.join("");
}

export interface IconOptions {
  /** Shown size in CSS pixels; sets `width`, `height` and the level of detail. */
  size: number;
  /** The clip path's id. Unique on the page when several icons are inlined. */
  id?: string;
  /** Level of detail; defaults to the one for `size`. */
  detail?: IconDetail;
  /** Text for screen readers; empty marks the icon decorative. */
  label?: string;
}

/** `head` goes before the clipped drawing, `rim` after it, unclipped. */
interface Frame {
  clip: string;
  head?: string;
  rim?: string;
}

// Own escape, not layout's: layout imports this module for the head links.
const attr = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function svg(o: IconOptions, frame: Frame, body: string): string {
  const label = o.label ?? "";
  const a11y = label === "" ? 'aria-hidden="true"' : `role="img" aria-label="${attr(label)}"`;
  const id = attr(o.id ?? "bd-icon");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" ` +
    `width="${o.size}" height="${o.size}" ${a11y}>${frame.head ?? ""}` +
    `<defs><clipPath id="${id}">${frame.clip}</clipPath></defs>` +
    `<g clip-path="url(#${id})">${body}</g>${frame.rim ?? ""}</svg>`
  );
}

export interface NightIconOptions extends IconOptions {
  /** A full square instead of rounded corners: for iOS, which rounds the icon itself. */
  square?: boolean;
}

/** The Night icon. Its colours are the same in both themes. */
export function nightIcon(o: NightIconOptions): string {
  const clip = `<rect x="0" y="0" width="512" height="512"${o.square ? "" : ' rx="114"'}/>`;
  return svg(o, { clip }, drawing(NIGHT, o.detail ?? iconDetail(o.size)));
}

const MARK_CLIP = `<circle cx="256" cy="256" r="236"/>`;
const MARK_RIM = `<circle cx="256" cy="256" r="240" ${paint("none", { line: INK, width: 12 })}/>`;

/**
 * The One ink round mark, drawn with `var(--ink)` and `var(--paper)`: inlined
 * in a page it follows the page's theme, including `data-theme`.
 */
export function oneInkMark(o: IconOptions): string {
  const body = drawing(ONE_INK, o.detail ?? iconDetail(o.size));
  return svg(o, { clip: MARK_CLIP, rim: MARK_RIM }, body);
}

/**
 * The One ink mark as a file of its own, which cannot read the page's
 * variables: it defines `--ink` and `--paper` itself, from the system's
 * colour scheme.
 */
export function oneInkMarkFile(o: IconOptions): string {
  const vars = (theme: Theme) => `--ink:${token("ink", theme)};--paper:${token("paper", theme)}`;
  const head =
    `<style>:root{${vars("light")}}` +
    `@media (prefers-color-scheme:dark){:root{${vars("dark")}}}</style>`;
  const body = drawing(ONE_INK, o.detail ?? iconDetail(o.size));
  return svg(o, { clip: MARK_CLIP, head, rim: MARK_RIM }, body);
}

/** One file under `/icons/`. A `.png` is `source` (an SVG) rendered at its size. */
export interface IconFile {
  file: string;
  source: string;
  /** Pixel size of a `.png`. */
  size?: number;
}

const LABEL = "Breaker Delta";

const png = (file: string, size: number, square = false): IconFile => ({
  file,
  size,
  source: nightIcon({ size, square, label: LABEL }),
});

/**
 * Every icon file the site serves. `bun run icons` writes them to
 * `apps/web/public/icons`; a test checks the folder matches.
 */
export const ICON_FILES: readonly IconFile[] = [
  // Shown in a tab at 16 to 32px, so it is the small drawing.
  { file: "favicon.svg", source: nightIcon({ size: 32, label: LABEL }) },
  png("favicon-16.png", 16),
  png("favicon-32.png", 32),
  // iOS rounds the corners itself and fills transparent ones with black.
  png("apple-touch-icon.png", 180, true),
  png("icon-192.png", 192),
  png("icon-512.png", 512),
  // Full detail, for share cards and anything shown large.
  { file: "icon.svg", source: nightIcon({ size: 512, label: LABEL }) },
  { file: "mark.svg", source: oneInkMarkFile({ size: 512, label: LABEL }) },
  {
    file: "manifest.webmanifest",
    source: `${JSON.stringify(
      {
        icons: [192, 512].map((s) => ({
          src: `/icons/icon-${s}.png`,
          sizes: `${s}x${s}`,
          type: "image/png",
        })),
      },
      null,
      2,
    )}\n`,
  },
];

/** The `<head>` links that point browsers and home screens at the icons. */
export const ICON_LINKS = [
  '<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">',
  '<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">',
  '<link rel="icon" href="/icons/favicon-16.png" sizes="16x16" type="image/png">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  '<link rel="manifest" href="/icons/manifest.webmanifest">',
].join("\n");
