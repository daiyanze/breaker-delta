/**
 * The screenshot check (#258, ADR 0020 section 12): every state on
 * `/_catalog`, in each theme, language and width, at rest, under the
 * pointer and with the focus, compared with the committed baselines.
 *
 *   bun run ui:screens     compare; exit 1 and name the components that changed
 *   bun run ui:baseline    write the baselines from this run
 *
 * It starts the local site in process (no Cloudflare tooling) and drives
 * headless Chromium with Playwright's library on Bun. The browser is not
 * part of `bun install`: `bun run ui:browser` downloads it once. Baselines
 * are per OS (`screenshots/<platform>`), since text renders differently on
 * each; the CI job `screenshots` runs on Linux, so `screenshots/linux` is
 * the one committed. The pixels are compared in the browser (a canvas), so
 * no image library is needed.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { CATALOG, THEMES } from "@bd/ui/catalog";
import { type Browser, chromium, type Page } from "playwright-core";
import { catalogHref, LANGUAGES } from "../src/local/catalog.tsx";
import { startSite } from "../src/local/index.ts";
import {
  type Outcome,
  type Pose,
  report,
  type Shot,
  shotPath,
  THRESHOLD,
  WIDTHS,
  type Width,
} from "./shots.ts";

const ROOT = join(import.meta.dir, "../../..");
const BASELINES = join(import.meta.dir, "..", "screenshots", process.platform);
const OUT = join(ROOT, ".ui-screens");
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

/** Load twice so the fonts (`font-display: optional`) come from the cache, then let islands hydrate. */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    await new Promise((done) => setTimeout(done, 50));
  });
  const fonts = await page.evaluate(() =>
    ['16px "Instrument Sans"', '38px "Fraunces"', 'italic 38px "Fraunces"'].filter(
      (f) => !document.fonts.check(f),
    ),
  );
  if (fonts.length > 0) throw new Error(`fonts not loaded on ${url}: ${fonts.join(", ")}`);
}

/** Every shot on one catalog page, with its PNG. */
async function capture(page: Page, theme: string, lang: string, width: Width) {
  const out: { shot: Shot; png: Uint8Array }[] = [];
  for (const entry of CATALOG) {
    for (const state of entry.states) {
      const element = page.locator(`[data-shot="${entry.name}/${state}"]`);
      const target = element.locator(FOCUSABLE).first();
      const poses: Pose[] = (await target.count()) > 0 ? ["rest", "hover", "focus"] : ["rest"];
      for (const pose of poses) {
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        if (pose === "hover") await target.hover();
        if (pose === "focus") await target.focus();
        const png = await element.screenshot({
          animations: "disabled",
          caret: "hide",
          scale: "css",
        });
        out.push({ shot: { component: entry.name, state, theme, lang, width, pose }, png });
      }
    }
  }
  return out;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Pixels compared in the browser: the share that changed, and an image marking them. */
async function compare(page: Page, actual: Uint8Array, expected: Uint8Array) {
  return page.evaluate(
    async ({ a, e, channel }) => {
      const decode = async (data: string) => {
        const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
        const image = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
        ctx.drawImage(image, 0, 0);
        return {
          w: image.width,
          h: image.height,
          data: ctx.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const [x, y] = [await decode(a), await decode(e)];
      if (x.w !== y.w || x.h !== y.h) {
        return { ratio: 1, sizes: `${x.w}x${x.h}, was ${y.w}x${y.h}`, diff: null };
      }
      const canvas = new OffscreenCanvas(x.w, x.h);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      const marked = ctx.createImageData(x.w, x.h);
      let changed = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        let moved = false;
        for (let c = 0; c < 4; c++) {
          if (Math.abs((x.data[i + c] ?? 0) - (y.data[i + c] ?? 0)) > channel) moved = true;
        }
        if (moved) changed++;
        // Changed pixels red, the rest a faint copy of the baseline.
        marked.data[i] = moved ? 255 : 255 - ((255 - (y.data[i] ?? 0)) >> 3);
        marked.data[i + 1] = moved ? 0 : 255 - ((255 - (y.data[i + 1] ?? 0)) >> 3);
        marked.data[i + 2] = moved ? 0 : 255 - ((255 - (y.data[i + 2] ?? 0)) >> 3);
        marked.data[i + 3] = 255;
      }
      if (changed === 0) return { ratio: 0, sizes: null, diff: null };
      ctx.putImageData(marked, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      for (const byte of bytes) text += String.fromCharCode(byte);
      return { ratio: changed / (x.w * x.h), sizes: null, diff: btoa(text) };
    },
    { a: b64(actual), e: b64(expected), channel: THRESHOLD.channel },
  );
}

/** Every `.png` under the baseline folder, relative to it. */
function storedShots(): string[] {
  if (!existsSync(BASELINES)) return [];
  return [...new Bun.Glob("**/*.png").scanSync({ cwd: BASELINES })]
    .map((p) => p.replaceAll("\\", "/"))
    .sort();
}

function write(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist")) {
      throw new Error("no headless Chromium: run `bun run ui:browser` once, then try again");
    }
    throw error;
  }
}

async function main(update: boolean): Promise<number> {
  const site = startSite({ port: 0, vars: {}, log: () => {} });
  const browser = await launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: "reduce" });
    const shots: { shot: Shot; png: Uint8Array }[] = [];
    for (const [width, px] of Object.entries(WIDTHS) as [Width, number][]) {
      const page = await context.newPage();
      await page.setViewportSize({ width: px, height: 1200 });
      for (const theme of THEMES) {
        for (const lang of LANGUAGES) {
          await open(page, `${site.url}${catalogHref(theme, lang)}`);
          shots.push(...(await capture(page, theme, lang, width)));
        }
      }
      await page.close();
    }
    const where = relative(ROOT, BASELINES);
    if (update) {
      rmSync(BASELINES, { recursive: true, force: true });
      for (const { shot, png } of shots) write(join(BASELINES, shotPath(shot)), png);
      console.log(`ui screenshots: wrote ${shots.length} baselines to ${where}`);
      return 0;
    }
    rmSync(OUT, { recursive: true, force: true });
    const page = await context.newPage();
    const outcomes: Outcome[] = [];
    const taken = new Set<string>();
    for (const { shot, png } of shots) {
      const path = shotPath(shot);
      taken.add(path);
      const stored = join(BASELINES, path);
      if (!existsSync(stored)) {
        outcomes.push({ path, kind: "new" });
        continue;
      }
      const expected = new Uint8Array(readFileSync(stored));
      if (Buffer.from(expected).equals(Buffer.from(png))) {
        outcomes.push({ path, kind: "same" });
        continue;
      }
      const result = await compare(page, png, expected);
      if (result.sizes !== null) {
        outcomes.push({ path, kind: "changed", ratio: 1, sizes: result.sizes });
      } else if (result.ratio > THRESHOLD.ratio) {
        outcomes.push({ path, kind: "changed", ratio: result.ratio });
      } else {
        outcomes.push({ path, kind: "same" });
      }
      if (result.diff !== null && result.ratio > THRESHOLD.ratio) {
        write(join(OUT, "diff", path), Buffer.from(result.diff, "base64"));
        write(join(OUT, "expected", path), expected);
      }
    }
    for (const path of storedShots()) {
      if (!taken.has(path)) outcomes.push({ path, kind: "gone" });
    }
    const failed = outcomes.some((o) => o.kind !== "same");
    if (failed) for (const { shot, png } of shots) write(join(OUT, "actual", shotPath(shot)), png);
    if (storedShots().length === 0) {
      console.error(
        `ui screenshots: no baselines for ${process.platform} in ${where}. Run \`bun run ui:baseline\` to make them; only the CI job's (linux) are committed.`,
      );
    }
    console[failed ? "error" : "log"](report(outcomes, where, relative(ROOT, OUT)));
    return failed ? 1 : 0;
  } finally {
    await browser.close();
    await site.stop();
  }
}

process.exit(await main(process.argv.includes("--update")));
