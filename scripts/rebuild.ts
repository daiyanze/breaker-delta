/**
 * `bun run rebuild`: recompute every wave point and topic state from the
 * echoes, heat, assignments and settings in the local-mode database, and
 * compare with what is stored (#37). Exits 0 when they match; otherwise
 * prints one line per difference and exits 1.
 *
 * Usage:
 *   bun run rebuild                  # <BD_DATA_DIR or .bd-data>/content.db
 *   bun run rebuild --data-dir path  # <path>/content.db
 *
 * The database is opened read-only and replayed on an in-memory copy
 * (`apps/pipeline/src/local/rebuild.ts`). The output holds slot and topic
 * ids and numbers only, never fetched text. Inputs that changed after a slot
 * ran (a late assignment, retention, a topic edit) show as differences:
 * see `apps/pipeline/src/core/rebuild.ts`.
 *
 * CI runs the same replay in `apps/pipeline/test/rebuild.test.ts`, on a
 * database built by the compute step from synthetic rows.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatDifference } from "../apps/pipeline/src/core/rebuild.ts";
import { rebuildFile } from "../apps/pipeline/src/local/rebuild.ts";

export interface Io {
  out(line: string): void;
  env: Record<string, string | undefined>;
}

const defaultIo: Io = { out: (line) => console.log(line), env: process.env };

/** Runs the command; resolves to the exit code. */
export async function main(argv: readonly string[], io: Io = defaultIo): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { "data-dir": { type: "string" }, help: { type: "boolean" } },
  });
  if (values.help) {
    io.out("usage: bun run rebuild [--data-dir <dir>]");
    return 0;
  }
  const dir = resolve(values["data-dir"] ?? io.env.BD_DATA_DIR ?? ".bd-data");
  const path = join(dir, "content.db");
  if (!existsSync(path)) {
    io.out(`no database at ${path}`);
    return 2;
  }
  const result = await rebuildFile(path);
  const summary = `${result.slots.length} slots, ${result.points} points, ${result.topics} topics`;
  if (result.differences.length === 0) {
    io.out(`rebuild matches: ${summary}`);
    return 0;
  }
  io.out(`rebuild differs: ${result.differences.length} differences (${summary})`);
  for (const d of result.differences) io.out(formatDifference(d));
  return 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
