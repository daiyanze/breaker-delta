// breaker-delta — the Breaker Delta command line.
//
//   breaker-delta [--data-dir <dir>] [--config <path>] [--json]
//                 [--root-dir <dir>] <command> [command args]
//
// Commands: scan, review, record, publish, docs, preset, doctor, mcp.
// With no command, scan runs (the Python `python -m radar` one-command
// path). Exit codes: 0 success, 1 runtime error, 2 usage error.

import * as path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RuntimeError,
  UsageError,
  cmdDocs,
  cmdDoctor,
  cmdPresetInit,
  cmdPresetList,
  cmdPublish,
  cmdRecord,
  cmdRecordReview,
  cmdReview,
  cmdScan,
} from "./commands.js";
import {
  resolveDataDir,
  resolveRootDir,
  VERSION,
  type CliContext,
} from "./context.js";
import { runMcp } from "./mcp.js";

const HELP = `breaker-delta ${VERSION} — web hot-topic radar (scan / review / record / publish / docs / preset / doctor / mcp)

Usage:
  breaker-delta [--data-dir <dir>] [--config <path>] [--root-dir <dir>] [--json] <command> [args]

Global options (may appear before or after the command):
  --data-dir <dir>   Instance data dir: editions/, state/, track-record.md,
                     config.yaml|json (default: $BD_DATA_DIR or current dir)
  --config <path>    Config file (default: search the data dir, then the
                     engine root: config.yaml/.yml/.json, config.example.*)
  --root-dir <dir>   Engine root holding assets/, favicon-cache/ and
                     config.example.* (default: $BD_ROOT_DIR or auto-detected)
  --json             Machine-readable output: stdout carries one JSON document
  --help             This help

Commands:
  scan [--edition morning|evening]
                     Run the fetch layer for one edition, write
                     <data-dir>/state/candidates-<date>-<edition>.json and
                     print per-source status. Default edition: by local hour
                     (before noon = morning). No command at all = scan.
  review             List topics whose 14-day review is due.
  record <file|-> [--date YYYY-MM-DD]
                     Write agent-graded topics back to the store. Input is a
                     JSON array: [{name, sources: [...], grade}]. Use - to
                     read stdin. The store write is atomic.
  record review --name <topic> --result hit|miss
                     Record a 14-day review outcome for one topic.
  publish [--out <dir>] [--base-url <url>] [--data-repo <owner/repo>]
          [--langs zh,en,ja] [--creator | --no-creator]
                     Build the static site from the data dir. Flags override
                     the TS_* environment variables, which override defaults.
  docs [--out <dir>] [--docs-url <url>] [--main-url <url>]
       [--langs zh,en,ja]
                     Build the standalone documentation site
                     (docs.breakerdelta.com) from the engine root alone;
                     no data dir is read. TS_DOCS_URL / TS_MAIN_URL /
                     TS_DOCS_OUT set the same values by environment.
  preset list        List the presets bundled with the engine (categories,
                     feeds, brief), marking the one this instance selects.
  preset init <name> Copy a bundled preset's config + brief.md into the
                     data dir as your own editable copy. Refuses to
                     overwrite an existing config.
  doctor [--online]  Offline self-check of node, config, data dir and engine
                     root (including taxonomy integrity). --online also
                     spot-checks a sample of the config's feed URLs.
                     Exit 1 when any check fails.
  mcp                Run the stdio MCP server (tools: radar_scan, radar_review).
`;

interface Parsed {
  positionals: string[];
  flags: Map<string, string | true>;
}

const VALUE_FLAGS = new Set([
  "data-dir", "config", "root-dir",
  "edition", "date", "name", "result",
  "out", "base-url", "data-repo", "langs", "docs-url", "main-url",
]);
const BOOL_FLAGS = new Set(["json", "help", "creator", "no-creator", "online"]);

function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "-") {
      positionals.push(tok);
      continue;
    }
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      const name = eq >= 0 ? tok.slice(2, eq) : tok.slice(2);
      if (BOOL_FLAGS.has(name)) {
        if (eq >= 0) throw new UsageError(`--${name} takes no value`);
        flags.set(name, true);
        continue;
      }
      if (VALUE_FLAGS.has(name)) {
        if (eq >= 0) {
          flags.set(name, tok.slice(eq + 1));
          continue;
        }
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new UsageError(`--${name} requires a value`);
        }
        flags.set(name, value);
        i += 1;
        continue;
      }
      throw new UsageError(`unknown option: --${name}`);
    }
    if (tok.startsWith("-") && tok !== "-") {
      if (tok === "-h") {
        flags.set("help", true);
        continue;
      }
      throw new UsageError(`unknown option: ${tok}`);
    }
    positionals.push(tok);
  }
  return { positionals, flags };
}

function flagStr(flags: Map<string, string | true>, name: string): string | undefined {
  const v = flags.get(name);
  return typeof v === "string" ? v : undefined;
}

export async function main(argv: string[]): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`breaker-delta: ${err.message}\nTry 'breaker-delta --help'.\n`);
      return 2;
    }
    throw err;
  }
  const { positionals, flags } = parsed;
  if (flags.get("help") === true) {
    process.stdout.write(HELP);
    return 0;
  }
  const ctx: CliContext = {
    dataDir: resolveDataDir(flagStr(flags, "data-dir")),
    rootDir: resolveRootDir(flagStr(flags, "root-dir")),
    configPath: flagStr(flags, "config"),
    json: flags.get("json") === true,
  };
  const command = positionals[0] ?? "scan";
  try {
    switch (command) {
      case "scan": {
        const edition = flagStr(flags, "edition");
        if (edition !== undefined && edition !== "morning" && edition !== "evening") {
          throw new UsageError(`--edition must be morning or evening: ${edition}`);
        }
        if (positionals.length > 1) throw new UsageError(`scan: unexpected argument: ${positionals[1]}`);
        return await cmdScan(ctx, edition);
      }
      case "review": {
        if (positionals.length > 1) throw new UsageError(`review: unexpected argument: ${positionals[1]}`);
        return cmdReview(ctx);
      }
      case "record": {
        if (positionals[1] === "review") {
          return cmdRecordReview(ctx, flagStr(flags, "name"), flagStr(flags, "result"));
        }
        const file = positionals[1];
        if (!file) throw new UsageError("record: an input file (or - for stdin) is required");
        if (positionals.length > 2) throw new UsageError(`record: unexpected argument: ${positionals[2]}`);
        return await cmdRecord(ctx, file, flagStr(flags, "date"));
      }
      case "publish": {
        if (positionals.length > 1) throw new UsageError(`publish: unexpected argument: ${positionals[1]}`);
        const creatorFlag = flags.get("creator") === true
          ? true
          : flags.get("no-creator") === true
            ? false
            : undefined;
        return await cmdPublish(ctx, {
          out: flagStr(flags, "out"),
          baseUrl: flagStr(flags, "base-url"),
          dataRepo: flagStr(flags, "data-repo"),
          langs: flagStr(flags, "langs"),
          creator: creatorFlag,
        });
      }
      case "docs": {
        if (positionals.length > 1) throw new UsageError(`docs: unexpected argument: ${positionals[1]}`);
        return cmdDocs(ctx, {
          out: flagStr(flags, "out"),
          docsUrl: flagStr(flags, "docs-url"),
          mainUrl: flagStr(flags, "main-url"),
          langs: flagStr(flags, "langs"),
        });
      }
      case "preset": {
        const sub = positionals[1];
        if (sub === "list") {
          if (positionals.length > 2) throw new UsageError(`preset list: unexpected argument: ${positionals[2]}`);
          return cmdPresetList(ctx);
        }
        if (sub === "init") {
          if (positionals.length > 3) throw new UsageError(`preset init: unexpected argument: ${positionals[3]}`);
          return cmdPresetInit(ctx, positionals[2]);
        }
        throw new UsageError(`preset: expected "list" or "init <name>", got: ${sub ?? "(nothing)"}`);
      }
      case "doctor": {
        if (positionals.length > 1) throw new UsageError(`doctor: unexpected argument: ${positionals[1]}`);
        return await cmdDoctor(ctx, { online: flags.get("online") === true });
      }
      case "mcp": {
        if (positionals.length > 1) throw new UsageError(`mcp: unexpected argument: ${positionals[1]}`);
        return await runMcp(ctx);
      }
      default:
        throw new UsageError(`unknown command: ${command}`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`breaker-delta: ${err.message}\nTry 'breaker-delta --help'.\n`);
      return 2;
    }
    if (err instanceof RuntimeError) {
      process.stderr.write(`breaker-delta: ${err.message}\n`);
      return 1;
    }
    process.stderr.write(
      `breaker-delta: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}

const invoked = process.argv[1];
if (invoked && import.meta.url === pathToFileURL(path.resolve(invoked)).href) {
  // A downstream pipe closing early (e.g. `| head`) is not an error.
  process.stdout.on("error", (err) => {
    if (err.code === "EPIPE") process.exit(0);
  });
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`breaker-delta: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    },
  );
}
