/**
 * Smoke test for the compiled executable (#270): build it with
 * `bun run build:local`, start it from an empty temporary folder, and fetch
 * pages from its site.
 *
 *   bun scripts/exe-smoke.ts <path>[=<text>] ...
 *
 * Each argument is a path, or `<path>=<text>` split at the first `=`: the
 * path must answer 200, and the body must hold the text. What to look for is
 * always in the arguments, so later issues reuse the script unchanged.
 *
 * The executable gets the environment `scripts/verify-local.ts` gives an
 * instance: fixture sources, the fake model and the `busy` fixture set, so
 * it fetches nothing real and calls no provider (invariant 6), and port 0
 * for each server, so it runs beside a `bun run local` on the default ports.
 * Its data folder is inside the temporary folder, which is deleted after.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStartLine } from "./verify-local.ts";

export interface Expectation {
  path: string;
  text: string | null;
}

/** `<path>=<text>` split at the first `=`; a bare path expects only a 200. */
export function parseExpectation(arg: string): Expectation {
  const at = arg.indexOf("=");
  return at === -1
    ? { path: arg, text: null }
    : { path: arg.slice(0, at), text: arg.slice(at + 1) };
}

/** What is wrong with one answer, or null. */
export function judge(want: Expectation, status: number, body: string): string | null {
  if (status !== 200) return `answered ${status}, not 200`;
  if (want.text !== null && !body.includes(want.text)) return `does not hold "${want.text}"`;
  return null;
}

export const ENV = {
  BD_PORT: "0",
  BD_WEB_PORT: "0",
  BD_BRIDGE_PORT: "0",
  BD_TICK_SECONDS: "86400",
  BD_SOURCES: "fixtures",
  MODEL_DRIVER: "fake",
  READ_SOURCE: "fixtures",
  FIXTURE_SET: "busy",
} as const;

const root = join(import.meta.dir, "..");
const exe = join(root, "dist", `breaker-delta${process.platform === "win32" ? ".exe" : ""}`);

async function main(args: string[]): Promise<number> {
  if (args.length === 0) {
    console.error("usage: bun scripts/exe-smoke.ts <path>[=<text>] ...");
    return 2;
  }
  const expectations = args.map(parseExpectation);

  console.log("[exe-smoke] bun run build:local");
  const build = Bun.spawn(["bun", "run", "build:local"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await build.exited) !== 0) {
    console.error("[exe-smoke] FAIL the build");
    return 1;
  }

  const dir = mkdtempSync(join(tmpdir(), "bd-exe-smoke-"));
  console.log(`[exe-smoke] starting ${exe} in ${dir}`);
  const proc = Bun.spawn([exe], {
    cwd: dir,
    env: { ...process.env, ...ENV },
    stdout: "pipe",
    stderr: "pipe",
  });
  let log = "";
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) log += decoder.decode(chunk);
  };
  void read(proc.stdout);
  void read(proc.stderr);

  let failures = 0;
  try {
    let urls: ReturnType<typeof parseStartLine> = null;
    for (let i = 0; i < 120 && urls === null && proc.exitCode === null; i++) {
      await Bun.sleep(250);
      urls = parseStartLine(log);
    }
    if (urls === null) {
      console.error(`[exe-smoke] FAIL the executable did not start:\n${log}`);
      return 1;
    }
    console.log(`[exe-smoke] site ${urls.siteUrl}`);
    for (const want of expectations) {
      const res = await fetch(new URL(want.path, urls.siteUrl));
      const body = await res.text();
      const problem = judge(want, res.status, body);
      const what = want.text === null ? want.path : `${want.path} holds "${want.text}"`;
      console.log(
        `[exe-smoke] ${problem === null ? "PASS" : "FAIL"} ${what}: ${res.status}${problem ? `, ${problem}` : ""}`,
      );
      if (problem !== null) failures += 1;
    }
  } finally {
    proc.kill();
    await proc.exited;
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`[exe-smoke] ${failures === 0 ? "all checks passed" : `${failures} failed`}`);
  return failures === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
