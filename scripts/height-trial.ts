/**
 * `bun run height-trial`: compare wave heights under 2 to 4 parameter sets
 * on the local-mode database, so the owner can choose the height
 * coefficients (#28).
 *
 * !!! This prints fetched titles. It is for the owner's own terminal only.
 * !!! Do not paste its output into a coding agent session (invariant 6):
 * !!! share only topic ids and numbers. Agents never run it against real
 * !!! `.bd-data` or fetched data; its test seeds a temp database instead.
 *
 * Usage:
 *   bun run height-trial                    # top 20, last 7 days, 4 built-in sets
 *   bun run height-trial --top 40 --days 3
 *   bun run height-trial --sets sets.json   # your own sets, see SETS below
 *   bun run height-trial --collect          # first scan and ingest once (fetches the sources)
 *
 * What it does:
 * - Reads `<data dir>/content.db` read-only (`--data-dir`, else
 *   `BD_DATA_DIR`, else `.bd-data`, as `bun run local` does).
 * - Takes the echoes first seen in the `--days` days up to `--now`, each with the heat
 *   of its latest `echo_metrics` row at or before `--now` (0 when it has none).
 * - Groups them: by topic when assign placed the echo (following merges),
 *   otherwise by URL across groups. `echoes.url` is unique, so today every
 *   unassigned echo is a cluster of its own, from one source.
 * - Computes each cluster's height with `waveHeight` from `@bd/core` under
 *   each set. Under `heatNormalisation: "group"`, a group's reference heat is
 *   the set's `heatReferencePercentile` of that group's heats among the
 *   loaded echoes (`groupHeatReferences`).
 * - Prints the top `--top` clusters by the first set, with each other set's
 *   height and the cluster's rank there (and its move against the first set).
 *
 * SETS: a JSON array of 2 to 4 objects, each `{ "name": "...", ...settings }`
 * where the settings are any of `halfLifeHours`, `heightScale`,
 * `sourceBonus`, `maxEchoesPerGroup`, `heatNormalisation`,
 * `heatReferencePercentile`, `waveThreshold`. Each set starts from the
 * stored settings (or the defaults) and is validated by `SettingsSchema`.
 *
 * `--collect` runs the pipeline's scan and ingest steps once for the current
 * slot, with the local adapters (the SQLite file, blobs under
 * `<data dir>/blobs`), and nothing else: no assign, so it adds unassigned
 * echoes only. It records the slot as a run, so a later run in the same
 * slot does not start. No wrangler, no cloud.
 */
import { Database as SQLite } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Settings, SettingsSchema } from "../packages/contracts/src/index.ts";
import {
  type EchoLike,
  groupHeatReferences,
  type WaveParams,
  waveHeight,
} from "../packages/core/src/index.ts";

export const WARNING = [
  "This prints fetched titles. It is for your own terminal only.",
  "Do not paste its output into a coding agent session (invariant 6);",
  "share only topic ids and numbers.",
].join("\n");

export const HELP = `bun run height-trial [options]

Compare wave heights under 2 to 4 parameter sets on the local-mode database (#28).

${WARNING}

Options:
  --data-dir <dir>   local-mode data (default: BD_DATA_DIR, else .bd-data)
  --top <n>          clusters to show (default 20)
  --days <n>         echoes first seen in the last n days (default 7)
  --sets <file>      JSON array of 2 to 4 sets: { "name", ...height settings }
  --now <iso time>   score as of this time (default: now)
  --collect          run scan and ingest once first (fetches the sources)
  --help             this text
`;

/** The settings a set may change. */
const SET_KEYS = [
  "halfLifeHours",
  "heightScale",
  "sourceBonus",
  "maxEchoesPerGroup",
  "heatNormalisation",
  "heatReferencePercentile",
  "waveThreshold",
] as const;

export interface TrialSet {
  name: string;
  settings: Settings;
}

/** Sets tried when `--sets` is not given: the stored settings and three alternatives. */
export function builtInSets(base: Settings): TrialSet[] {
  const make = (name: string, change: Partial<Settings>) => ({
    name,
    settings: SettingsSchema.parse({ ...base, ...change }),
  });
  return [
    make("current", {}),
    make("cap3", { maxEchoesPerGroup: 3 }),
    make("group", { heatNormalisation: "group" }),
    make("cap3+group+bonus1", {
      maxEchoesPerGroup: 3,
      heatNormalisation: "group",
      sourceBonus: 1,
    }),
  ];
}

export function parseSets(value: unknown, base: Settings): TrialSet[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
    throw new Error("sets: a JSON array of 2 to 4 objects");
  }
  return value.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) throw new Error(`sets[${i}]: not an object`);
    const { name, ...rest } = raw as Record<string, unknown>;
    const unknown = Object.keys(rest).filter((k) => !(SET_KEYS as readonly string[]).includes(k));
    if (unknown.length > 0) throw new Error(`sets[${i}]: unknown keys ${unknown.join(", ")}`);
    const parsed = SettingsSchema.safeParse({ ...base, ...rest });
    if (!parsed.success) {
      throw new Error(`sets[${i}]: ${parsed.error.issues.map((x) => x.path.join(".")).join(", ")}`);
    }
    return { name: typeof name === "string" && name ? name : `set${i + 1}`, settings: parsed.data };
  });
}

interface EchoRow {
  id: string;
  url: string;
  groupId: string;
  title: string;
  firstSeenAt: number;
  topicId: string | null;
  heat: number | null;
}

export interface Cluster {
  /** The topic id, or the first echo's id for a cluster no topic holds. */
  id: string;
  kind: "topic" | "url";
  /** Title of the cluster's first-seen echo. Fetched text: terminal only. */
  title: string;
  echoes: EchoLike[];
  sources: number;
}

/** Load echoes and group them into clusters (see the header). */
export function loadClusters(sqlite: SQLite, sinceMs: number, untilMs: number): Cluster[] {
  const rows = sqlite
    .query(
      `SELECT e.id, e.url, e.group_id AS groupId, e.title, e.first_seen_at AS firstSeenAt,
              e.topic_id AS topicId,
              (SELECT m.heat FROM echo_metrics m WHERE m.echo_id = e.id AND m.seen_at <= ?2
                 ORDER BY m.slot DESC LIMIT 1) AS heat
         FROM echoes e WHERE e.first_seen_at >= ?1 AND e.first_seen_at <= ?2
        ORDER BY e.first_seen_at, e.id`,
    )
    .all(sinceMs, untilMs) as EchoRow[];
  const mergedInto = new Map(
    (
      sqlite.query("SELECT id, merged_into AS m FROM topics").all() as {
        id: string;
        m: string | null;
      }[]
    ).map((t) => [t.id, t.m]),
  );
  const finalTopic = (id: string) => {
    let cur = id;
    for (let hops = 0; hops < 100; hops++) {
      const next = mergedInto.get(cur);
      if (!next) return cur;
      cur = next;
    }
    return cur;
  };

  const byKey = new Map<string, { cluster: Cluster; rows: EchoRow[] }>();
  for (const r of rows) {
    const key = r.topicId ? `topic:${finalTopic(r.topicId)}` : `url:${r.url}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        cluster: {
          id: r.topicId ? finalTopic(r.topicId) : r.id,
          kind: r.topicId ? "topic" : "url",
          title: r.title,
          echoes: [],
          sources: 0,
        },
        rows: [],
      };
      byKey.set(key, entry);
    }
    entry.rows.push(r);
    entry.cluster.echoes.push({
      id: r.id,
      groupId: r.groupId,
      firstSeenAt: r.firstSeenAt,
      heat: r.heat ?? 0,
    });
  }
  return [...byKey.values()].map(({ cluster }) => ({
    ...cluster,
    sources: new Set(cluster.echoes.map((e) => e.groupId)).size,
  }));
}

function waveParams(s: Settings): WaveParams {
  return {
    waveThreshold: s.waveThreshold,
    halfLifeHours: s.halfLifeHours,
    heightScale: s.heightScale,
    sourceBonus: s.sourceBonus,
    maxEchoesPerGroup: s.maxEchoesPerGroup,
    heatNormalisation: s.heatNormalisation,
  };
}

export interface TrialRow {
  cluster: Cluster;
  /** Per set, in set order. */
  heights: number[];
  /** Per set, 1-based rank of the cluster in that set. */
  ranks: number[];
}

/** Heights and ranks of every cluster under every set; sorted by the first set. */
export function score(clusters: readonly Cluster[], sets: readonly TrialSet[], nowMs: number) {
  const all = clusters.flatMap((c) => c.echoes);
  const heights = clusters.map(() => [] as number[]);
  const ranks = clusters.map(() => [] as number[]);
  sets.forEach((set, si) => {
    const params = waveParams(set.settings);
    const ref = groupHeatReferences(all, set.settings.heatReferencePercentile);
    clusters.forEach((c, ci) => {
      (heights[ci] as number[])[si] = waveHeight(c.echoes, nowMs, params, ref);
    });
    const order = clusters
      .map((_, ci) => ci)
      .sort(
        (a, b) =>
          ((heights[b] as number[])[si] as number) - ((heights[a] as number[])[si] as number) ||
          (clusters[a] as Cluster).id.localeCompare((clusters[b] as Cluster).id),
      );
    order.forEach((ci, rank) => {
      (ranks[ci] as number[])[si] = rank + 1;
    });
  });
  const rows: TrialRow[] = clusters.map((cluster, ci) => ({
    cluster,
    heights: heights[ci] as number[],
    ranks: ranks[ci] as number[],
  }));
  return rows.sort((a, b) => (a.ranks[0] as number) - (b.ranks[0] as number));
}

/** Fetched titles reach a terminal: no control characters, one line, bounded. */
export function cleanTitle(title: string, width = 50): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
  const one = title.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, " ");
  const flat = one.replace(/\s+/g, " ").trim();
  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat;
}

function move(base: number, other: number): string {
  if (other === base) return "=";
  return other < base ? `+${base - other}` : `-${other - base}`;
}

export function render(rows: readonly TrialRow[], sets: readonly TrialSet[], top: number): string {
  const shown = rows.slice(0, top);
  const header = [
    "rank",
    "id",
    "src",
    "echoes",
    ...sets.map((s, i) => (i === 0 ? s.name : `${s.name} (rank, move)`)),
    "title",
  ];
  const body = shown.map((r) => [
    String(r.ranks[0]),
    r.cluster.id.slice(0, 16),
    String(r.cluster.sources),
    String(r.cluster.echoes.length),
    ...sets.map((_, i) => {
      const h = (r.heights[i] as number).toFixed(1);
      if (i === 0) return h;
      const rank = r.ranks[i] as number;
      return `${h} (${rank}, ${move(r.ranks[0] as number, rank)})`;
    }),
    cleanTitle(r.cluster.title),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((row) => (row[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] as number))).join("  ");
  const out = [line(header), ...body.map(line)];
  const inTop = new Set(shown.map((r) => r.cluster.id));
  sets.slice(1).forEach((s, k) => {
    const entered = rows.filter(
      (r) => (r.ranks[k + 1] as number) <= top && !inTop.has(r.cluster.id),
    );
    if (entered.length > 0) {
      out.push(
        `${s.name}: also in its top ${top}: ${entered.map((r) => `${r.cluster.id.slice(0, 16)} (#${r.ranks[k + 1]})`).join(", ")}`,
      );
    }
  });
  return out.join("\n");
}

function storedSettings(sqlite: SQLite): Settings {
  const row = sqlite.query("SELECT json FROM settings WHERE id = 1").get() as {
    json: string;
  } | null;
  return SettingsSchema.parse(row ? JSON.parse(row.json) : {});
}

export interface TrialOptions {
  dataDir: string;
  top: number;
  days: number;
  nowMs: number;
  /** Parsed `--sets` file, if any. */
  sets?: unknown;
}

/** The whole trial on a data directory, read-only. Returns the text to print. */
export function trial(options: TrialOptions): string {
  const path = join(options.dataDir, "content.db");
  if (!existsSync(path)) {
    throw new Error(`no database at ${path}: run \`bun run local\`, or pass --collect`);
  }
  const sqlite = new SQLite(path, { readonly: true });
  try {
    const base = storedSettings(sqlite);
    const sets = options.sets === undefined ? builtInSets(base) : parseSets(options.sets, base);
    const clusters = loadClusters(sqlite, options.nowMs - options.days * 86_400_000, options.nowMs);
    const rows = score(clusters, sets, options.nowMs);
    const head = [
      `${clusters.length} clusters from ${rows.reduce((n, r) => n + r.cluster.echoes.length, 0)} echoes, ` +
        `last ${options.days} days, as of ${new Date(options.nowMs).toISOString()}`,
      ...sets.map((s) => {
        const p = s.settings;
        return (
          `  ${s.name}: halfLifeHours=${p.halfLifeHours} heightScale=${p.heightScale} ` +
          `sourceBonus=${p.sourceBonus} maxEchoesPerGroup=${p.maxEchoesPerGroup} ` +
          `heatNormalisation=${p.heatNormalisation} heatReferencePercentile=${p.heatReferencePercentile}`
        );
      }),
      "",
    ];
    return [...head, render(rows, sets, options.top)].join("\n");
  } finally {
    sqlite.close();
  }
}

/** `--collect`: scan and ingest once for the current slot, with the local adapters. */
async function collect(dataDir: string): Promise<string> {
  const { mkdirSync } = await import("node:fs");
  const { sqliteDatabase } = await import("../apps/pipeline/src/local/database.ts");
  const { migrate } = await import("../apps/pipeline/src/local/migrate.ts");
  const { directoryBlobs } = await import("../apps/pipeline/src/local/blobs.ts");
  const { createPipeline, pipelineConfig } = await import("../apps/pipeline/src/core/app.ts");
  const { scanStep } = await import("../apps/pipeline/src/core/scan.ts");
  const { ingestStep } = await import("../apps/pipeline/src/core/ingest.ts");
  const { ADAPTERS } = await import("../apps/pipeline/src/sources/adapters/index.ts");
  const { LAUNCH_GROUPS } = await import("../apps/pipeline/src/sources/launch-groups.ts");
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new SQLite(join(dataDir, "content.db"), { create: true });
  try {
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA busy_timeout = 5000");
    migrate(sqlite);
    const blobs = directoryBlobs(join(dataDir, "blobs"));
    const steps = [
      scanStep({ blobs, fetch, groups: LAUNCH_GROUPS, adapters: ADAPTERS }),
      ingestStep({ blobs, adapters: ADAPTERS }),
    ];
    const pipeline = createPipeline(
      { db: sqliteDatabase(sqlite), clock: { now: () => Date.now() } },
      pipelineConfig({}),
      steps,
    );
    // The tick result holds the slot and a status, never fetched text.
    return JSON.stringify(await pipeline.tick());
  } finally {
    sqlite.close();
  }
}

async function main(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "data-dir": { type: "string" },
      top: { type: "string", default: "20" },
      days: { type: "string", default: "7" },
      sets: { type: "string" },
      now: { type: "string" },
      collect: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const dataDir = resolve(values["data-dir"] ?? process.env.BD_DATA_DIR ?? ".bd-data");
  const top = Number(values.top);
  const days = Number(values.days);
  const givenNow = values.now === undefined ? undefined : Date.parse(values.now);
  if (!Number.isInteger(top) || top < 1) throw new Error("--top: a whole number of at least 1");
  if (!(days > 0)) throw new Error("--days: a positive number");
  if (Number.isNaN(givenNow)) throw new Error("--now: an ISO time");
  const sets = values.sets === undefined ? undefined : await Bun.file(values.sets).json();

  console.log(`${WARNING}\n`);
  if (values.collect) console.log(`[height-trial] collect: ${await collect(dataDir)}\n`);
  // Read the clock after collecting: echoes are stamped with the fetch time,
  // and an earlier "now" would leave out everything just collected.
  const nowMs = givenNow ?? Date.now();
  console.log(trial({ dataDir, top, days, nowMs, sets }));
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`[height-trial] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
