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
import type { Language } from "@bd/contracts";
import { CATALOG, THEMES } from "@bd/ui/catalog";
import type { Theme } from "@bd/ui/tokens";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import { catalogHref, LANGUAGES } from "../src/local/catalog.tsx";
import { startSite } from "../src/local/index.ts";
import {
  fails,
  markChanges,
  type Outcome,
  overThreshold,
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

/** Pages whose browser cache holds the fonts already. */
const warm = new WeakSet<Page>();

/**
 * Load a page, twice the first time so the fonts (`font-display:
 * optional`) come from the cache, then let islands hydrate.
 */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle" });
  if (!warm.has(page)) {
    await page.reload({ waitUntil: "networkidle" });
    warm.add(page);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    await new Promise((done) => setTimeout(done, 50));
  });
  // Both families must be declared (`fonts.check` alone is true for a family
  // no `@font-face` declares), and no face the page asked for may still be
  // loading or have failed. A face the page does not use stays unloaded.
  const fonts = await page.evaluate(() => {
    const faces = [...document.fonts];
    const missing = ["Instrument Sans", "Fraunces"].filter(
      (family) => !faces.some((f) => f.family.replaceAll('"', "") === family),
    );
    const bad = faces
      .filter((f) => f.status === "loading" || f.status === "error")
      .map((f) => `${f.family} ${f.style} (${f.status})`);
    return [...missing.map((family) => `${family} (not declared)`), ...bad];
  });
  if (fonts.length > 0) throw new Error(`fonts not ready on ${url}: ${fonts.join(", ")}`);
}

/**
 * Every shot for one theme, language and width, with its PNG. Each state is
 * loaded on a page of its own (`&shot=`), so its shot does not depend on
 * what else the catalog holds.
 */
async function capture(page: Page, site: string, theme: Theme, lang: Language, width: Width) {
  const out: { shot: Shot; png: Uint8Array }[] = [];
  for (const entry of CATALOG) {
    for (const state of entry.states) {
      await open(page, `${site}${catalogHref(theme, lang, `${entry.name}/${state}`)}`);
      const element = page.locator("[data-shot]");
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

/**
 * Pixels compared in the browser, where the PNGs are decoded (a canvas):
 * how many changed (`markChanges`, which `comparePage` puts in the page),
 * of how many, and an image marking them; or the two sizes when they differ.
 */
async function compare(page: Page, actual: Uint8Array, expected: Uint8Array) {
  return page.evaluate(
    async ({ a, e, channel }) => {
      const { markChanges } = globalThis as unknown as {
        markChanges: (
          x: Uint8ClampedArray,
          y: Uint8ClampedArray,
          channel: number,
          out: Uint8ClampedArray,
        ) => number;
      };
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
        return { changed: 0, total: 0, sizes: `${x.w}x${x.h}, was ${y.w}x${y.h}`, diff: null };
      }
      const canvas = new OffscreenCanvas(x.w, x.h);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      const marked = ctx.createImageData(x.w, x.h);
      const changed = markChanges(x.data, y.data, channel, marked.data);
      const total = x.w * x.h;
      if (changed === 0) return { changed, total, sizes: null, diff: null };
      ctx.putImageData(marked, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      for (const byte of bytes) text += String.fromCharCode(byte);
      return { changed, total, sizes: null, diff: btoa(text) };
    },
    { a: b64(actual), e: b64(expected), channel: THRESHOLD.channel },
  );
}

/** A blank page holding `markChanges` (the tested one, from `shots.ts`), for `compare`. */
async function comparePage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.addScriptTag({ content: `globalThis.markChanges = ${markChanges.toString()};` });
  return page;
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
          shots.push(...(await capture(page, site.url, theme, lang, width)));
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
    const page = await comparePage(context);
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
        write(join(OUT, "expected", path), expected);
      } else if (overThreshold(result.changed, result.total)) {
        outcomes.push({ path, kind: "changed", ratio: result.changed / result.total });
        write(join(OUT, "expected", path), expected);
        if (result.diff !== null)
          write(join(OUT, "diff", path), Buffer.from(result.diff, "base64"));
      } else {
        outcomes.push({ path, kind: "same" });
      }
    }
    for (const path of storedShots()) {
      if (!taken.has(path)) outcomes.push({ path, kind: "gone" });
    }
    const failed = outcomes.some(fails);
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
