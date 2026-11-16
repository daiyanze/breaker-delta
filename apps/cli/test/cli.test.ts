// Integration tests for the breaker-delta CLI: every test spawns
// the compiled CLI (or the single-file bundle) against a sandbox
// data dir. No network: scan runs with all sources disabled,
// publish uses fixture editions whose sources are deliberately
// unmapped (no favicon fetch), MCP only calls radar_review.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "src", "cli.js");
const BUNDLE = path.resolve(HERE, "..", "breaker-delta.mjs");
const ROOT = path.resolve(HERE, "..", "..", "..", "..");

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(
  entry: string,
  args: string[],
  opts: { cwd?: string; input?: string; env?: Record<string, string | undefined> } = {},
): RunResult {
  const res = spawnSync(process.execPath, [entry, ...args], {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf-8",
    env: opts.env ?? process.env,
    timeout: 120_000,
  });
  if (res.error) throw res.error;
  return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bd-cli-"));
}

function makeDataDir(populate: (dir: string) => void = () => {}): string {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, "editions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state"), { recursive: true });
  populate(dir);
  return dir;
}

function writeStore(dir: string, topics: unknown[]): void {
  fs.writeFileSync(
    path.join(dir, "state", "seen-topics.json"),
    JSON.stringify({ topics }, null, 2),
    "utf-8",
  );
}

function readStore(dir: string): { topics: Record<string, any>[] } {
  return JSON.parse(fs.readFileSync(path.join(dir, "state", "seen-topics.json"), "utf-8"));
}

// ---------------------------------------------------------- fixtures

const ED1 = {
  date: "2026-11-12",
  slot: "morning",
  published_at: "2026-11-12T06:00:00+09:00",
  title: "热点雷达 · 早报",
  items: [
    {
      level: "must",
      title: "示例模型发布",
      body: "正文 with <brackets> & symbols。",
      action: "值得试。",
      sources: ["官方博客"],
      links: ["https://example.com/release"],
      is_new: true,
    },
    {
      level: "echo",
      title: "小回波",
      body: "单源，先记一笔。",
      action: "仅记录。",
      sources: ["小站"],
      links: [],
      is_new: true,
    },
  ],
  updates: [],
  missing: ["X 未直读"],
  pending_checks: [],
};

const ED2 = {
  date: "2026-11-12",
  slot: "evening",
  published_at: "2026-11-12T18:00:00+09:00",
  title: "热点雷达 · 晚报",
  items: [
    {
      level: "must",
      title: "示例模型发布",
      body: "晚间跟进。",
      action: "继续观察。",
      sources: ["官方博客", "小站"],
      links: ["https://example.com/release"],
      is_new: false,
    },
  ],
  updates: [],
  missing: [],
  pending_checks: [],
};

function writeEditions(dir: string): void {
  for (const ed of [ED1, ED2]) {
    fs.writeFileSync(
      path.join(dir, "editions", `${ed.date}-${ed.slot}.json`),
      JSON.stringify(ed),
      "utf-8",
    );
  }
}

/** Same synthetic ledger fixture as the publisher tests: 4 groups,
 *  24 entries, all results blank, first review 2026-11-25. */
function writeTrackRecord(dir: string): void {
  const groups: [string, string, string, number][] = [
    ["2026-11-11", "试点期", "2026-11-25", 7],
    ["2026-11-12", "早报", "2026-11-26", 6],
    ["2026-11-12", "晚报", "2026-11-26", 6],
    ["2026-11-13", "晚报", "2026-11-27", 5],
  ];
  const special = new Map<string, string>([
    ["0,0", "Anthropic IPO 定价区间出炉"],
    ["2,0", "Nvidia 董事会拟罢免黄仁勋"],
  ]);
  const lines = ["# 战绩台账 fixture", ""];
  let n = 0;
  groups.forEach(([date, label, review, count], gi) => {
    lines.push(`## ${date} ${label}（复核日 ${review}）`);
    lines.push("| 级别 | 话题 | 复核标准 | 结果 |");
    lines.push("|---|---|---|---|");
    for (let i = 0; i < count; i++) {
      n += 1;
      const topic = special.get(`${gi},${i}`) ?? `示例话题 ${n}`;
      const level = i === 0 ? "🔥" : "👀";
      lines.push(`| ${level} | ${topic} | 后续期次再现或有进展 | |`);
    }
    lines.push("");
  });
  fs.writeFileSync(path.join(dir, "track-record.md"), lines.join("\n"), "utf-8");
}

const ALL_SOURCES = [
  "x", "official_blogs", "github", "hackernews", "show_hn", "huggingface",
  "hf_spaces", "openrouter", "civitai", "arxiv", "daily_papers", "bluesky",
  "producthunt", "gh_releases", "federal_register", "reddit", "tech_media",
  "devto", "lobsters", "stackexchange", "mastodon", "wikipedia", "sitemaps",
  "app_store", "google_news",
];

function writeDisabledConfig(dir: string): void {
  const lines = ["sources:"];
  for (const s of ALL_SOURCES) {
    lines.push(`  ${s}:`, "    enabled: false");
  }
  fs.writeFileSync(path.join(dir, "config.yaml"), lines.join("\n") + "\n", "utf-8");
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out.push(path.relative(root, p));
    }
  };
  walk(root);
  return out;
}

// ---------------------------------------------------------- record / review

test("record -> review flow, with record review and json output", () => {
  const dir = makeDataDir();
  const entries = path.join(dir, "entries.json");
  fs.writeFileSync(
    entries,
    JSON.stringify([{ name: "Old Thing", sources: ["github", "hackernews"], grade: "关注" }]),
    "utf-8",
  );

  let r = runCli(CLI, ["--data-dir", dir, "record", entries, "--date", "2020-01-01"]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /created: Old Thing/);
  assert.match(r.stdout, /topics total: 1/);
  let store = readStore(dir);
  assert.strictEqual(store.topics[0].first_seen, "2020-01-01");
  assert.strictEqual(store.topics[0].history.length, 1);

  // The 2020 first_seen is long past the 14-day review window.
  r = runCli(CLI, ["--data-dir", dir, "review"]);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(
    r.stdout.trim(),
    "- Old Thing (first seen 2020-01-01, sources: github, hackernews)",
  );

  // Recording the same topic again updates it; first_seen never moves.
  r = runCli(CLI, ["--data-dir", dir, "record", entries, "--date", "2020-01-02"]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /updated: Old Thing/);
  store = readStore(dir);
  assert.strictEqual(store.topics[0].first_seen, "2020-01-01");
  assert.strictEqual(store.topics[0].last_seen, "2020-01-02");
  assert.strictEqual(store.topics[0].history.length, 2);

  // record from stdin, json output.
  r = runCli(CLI, ["--data-dir", dir, "--json", "record", "-"], {
    input: JSON.stringify([{ name: "New Thing", sources: ["reddit"], grade: "回波" }]),
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), { created: 1, updated: 0, total: 2 });

  // record review: bad result and unknown topic are runtime errors.
  r = runCli(CLI, ["--data-dir", dir, "record", "review", "--name", "Old Thing", "--result", "bogus"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /result must be 'hit' or 'miss'/);
  r = runCli(CLI, ["--data-dir", dir, "record", "review", "--name", "Ghost", "--result", "hit"]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /topic not found: Ghost/);

  r = runCli(CLI, ["--data-dir", dir, "record", "review", "--name", "Old Thing", "--result", "hit"]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /recorded review: Old Thing -> hit/);
  store = readStore(dir);
  assert.strictEqual(store.topics[0].review.result, "hit");

  r = runCli(CLI, ["--data-dir", dir, "review"]);
  assert.strictEqual(r.stdout.trim(), "No topics due for review.");
  r = runCli(CLI, ["--data-dir", dir, "--json", "review"]);
  assert.deepStrictEqual(JSON.parse(r.stdout), []);
});

// ---------------------------------------------------------- doctor

test("doctor passes a healthy data dir and fails a bare one", () => {
  const good = makeDataDir((dir) => {
    writeEditions(dir);
    writeTrackRecord(dir);
    writeStore(dir, []);
    fs.writeFileSync(path.join(dir, "config.yaml"), "grading:\n  max_items_per_report: 8\n", "utf-8");
  });
  let r = runCli(CLI, ["--data-dir", good, "--root-dir", ROOT, "doctor"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+editions: 2 edition files/);
  assert.match(r.stdout, /doctor: \d+ ok, \d+ warn, 0 fail/);

  r = runCli(CLI, ["--data-dir", good, "--root-dir", ROOT, "--json", "doctor"]);
  assert.strictEqual(r.status, 0);
  const doc = JSON.parse(r.stdout);
  assert.strictEqual(doc.ok, true);
  assert.ok(doc.checks.some((c: any) => c.name === "config" && c.status === "ok"));

  const bare = tmpdir(); // no editions/, no state/, root without assets
  r = runCli(CLI, ["--data-dir", bare, "--root-dir", bare, "--json", "doctor"]);
  assert.strictEqual(r.status, 1);
  const bad = JSON.parse(r.stdout);
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.checks.some((c: any) => c.name === "editions" && c.status === "fail"));
  assert.ok(bad.checks.some((c: any) => c.name === "assets" && c.status === "fail"));
  assert.ok(bad.checks.some((c: any) => c.name === "track-record" && c.status === "warn"));
});

// ---------------------------------------------------------- publish

test("publish builds the fixture site; json mode keeps stdout clean", async () => {
  const dir = makeDataDir((d) => {
    writeEditions(d);
    writeTrackRecord(d);
  });
  const site = path.join(dir, "site");
  const r = runCli(CLI, [
    "--data-dir", dir, "--root-dir", ROOT,
    "publish", "--out", site, "--base-url", "https://example.com/triple-sigma",
  ]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /pages: 22 \| topics: 2 \| latest top heat: 108/);
  assert.ok(fs.existsSync(path.join(site, "index.html")));
  assert.ok(fs.existsSync(path.join(site, "data", "topics.json")));
  const tr = fs.readFileSync(path.join(site, "track-record.html"), "utf-8");
  assert.strictEqual(tr.split('class="tr-row"').length - 1, 24);
  assert.ok(tr.includes("Anthropic IPO"));

  const site2 = path.join(dir, "site2");
  const r2 = runCli(CLI, [
    "--data-dir", dir, "--root-dir", ROOT, "--json",
    "publish", "--out", site2, "--base-url", "https://example.com/triple-sigma",
  ]);
  assert.strictEqual(r2.status, 0, r2.stderr);
  const doc = JSON.parse(r2.stdout); // stdout is exactly one JSON document
  assert.strictEqual(doc.pages, 66); // +3: seeds.html redirect stubs (one per language) since the 0.22.0 echo rename; docs pages left the main build in the docs-site split
  assert.strictEqual(doc.outDir, site2);
  assert.ok(!r2.stdout.includes("pages:"), "build logs must not pollute json stdout");
  assert.match(r2.stderr, /pages: 22 \| topics: 2/); // they went to stderr instead
  assert.deepStrictEqual(listFiles(site2), listFiles(site));
});

// ---------------------------------------------------------- scan (offline)

test("scan with every source disabled is deterministic and offline", () => {
  const dir = makeDataDir((d) => writeDisabledConfig(d));
  const r = runCli(CLI, ["--data-dir", dir, "--json", "scan", "--edition", "morning"]);
  assert.strictEqual(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.strictEqual(report.sources.length, 25);
  assert.ok(report.sources.every((s: any) => s.status === "disabled"));
  assert.deepStrictEqual(report.disabled.length, 25);
  assert.strictEqual(report.resonance.length, 0);
  assert.ok(fs.existsSync(report._file));
  assert.ok(report._file.startsWith(path.join(dir, "state")));

  const human = runCli(CLI, ["--data-dir", dir, "scan", "--edition", "evening"]);
  assert.strictEqual(human.status, 0);
  assert.match(human.stdout, /scan evening @ .* -> /);
  assert.match(human.stdout, /候选文件：/);
  assert.match(human.stdout, /skills\/breaker-delta\/SKILL\.md/);
});

// ---------------------------------------------------------- mcp

test("mcp stdio session matches the Python server's protocol", () => {
  const dir = makeDataDir((d) => {
    writeStore(d, [
      {
        name: "Due Topic",
        first_seen: "2020-01-01",
        last_seen: "2020-01-01",
        sources: ["github"],
        history: [{ date: "2020-01-01", grade: "关注" }],
        review: { due: null, result: null, checked_on: null, _first_seen: "2020-01-01" },
      },
    ]);
  });
  const input = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "radar_review", arguments: {} } },
    { jsonrpc: "2.0", id: 4, method: "ping" },
    { jsonrpc: "2.0", id: 5, method: "bogus/method" },
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope", arguments: {} } },
  ].map((m) => JSON.stringify(m)).join("\n") + "\n";
  const r = runCli(CLI, ["--data-dir", dir, "mcp"], { input });
  assert.strictEqual(r.status, 0, r.stderr);
  const responses = r.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.strictEqual(responses.length, 6); // the notification gets no reply

  const init = responses.find((m) => m.id === 1);
  assert.strictEqual(init.result.protocolVersion, "2024-11-05");
  assert.deepStrictEqual(init.result.serverInfo, { name: "breaker-delta", version: "0.22.0" });

  const list = responses.find((m) => m.id === 2);
  assert.deepStrictEqual(list.result.tools.map((t: any) => t.name), ["radar_scan", "radar_review"]);
  assert.deepStrictEqual(list.result.tools[0].inputSchema.required, ["edition"]);

  const call = responses.find((m) => m.id === 3);
  assert.strictEqual(call.result.isError, false);
  assert.strictEqual(call.result.content[0].text, "- Due Topic (first seen 2020-01-01)");

  const bogus = responses.find((m) => m.id === 5);
  assert.strictEqual(bogus.error.code, -32601);
  assert.strictEqual(bogus.error.message, "method not found: bogus/method");

  const badTool = responses.find((m) => m.id === 6);
  assert.strictEqual(badTool.result.isError, true);
  assert.match(badTool.result.content[0].text, /unknown tool: nope/);
});

// ---------------------------------------------------------- docs

test("docs builds the standalone docs site without a data dir", () => {
  const out = path.join(tmpdir(), "docs-site");
  const r = runCli(CLI, ["--json", "docs", "--out", out]);
  assert.strictEqual(r.status, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.strictEqual(doc.pages, 27); // 8 pages x 3 langs + 3 index stubs
  assert.strictEqual(doc.outDir, out);
  assert.strictEqual(doc.docsUrl, "https://docs.breakerdelta.com/");
  assert.ok(fs.existsSync(path.join(out, "docs.html")));
  assert.ok(fs.existsSync(path.join(out, "en", "docs-cli.html")));
  assert.ok(fs.existsSync(path.join(out, "ja", "docs.html")));
  const hub = fs.readFileSync(path.join(out, "docs.html"), "utf-8");
  assert.ok(hub.includes("https://breakerdelta.com/index.html"));
});

// ---------------------------------------------------------- usage / help

test("usage errors exit 2; --help exits 0", () => {
  let r = runCli(CLI, ["frobnicate"]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /unknown command: frobnicate/);

  r = runCli(CLI, ["scan", "--edition", "noon"]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /--edition must be morning or evening/);

  r = runCli(CLI, ["record"]);
  assert.strictEqual(r.status, 2);

  r = runCli(CLI, ["--bogus"]);
  assert.strictEqual(r.status, 2);

  r = runCli(CLI, ["--help"]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /breaker-delta 0\.22\.0/);
  assert.match(r.stdout, /record <file\|->/);
  assert.match(r.stdout, /docs \[--out <dir>\]/);
});

// ---------------------------------------------------------- bundle

test("the single-file bundle runs standalone from a lonely directory", () => {
  assert.ok(fs.existsSync(BUNDLE), "dist/breaker-delta.mjs exists (npm run bundle)");
  const lonely = tmpdir();
  const copy = path.join(lonely, "breaker-delta.mjs");
  fs.copyFileSync(BUNDLE, copy);

  const dir = makeDataDir((d) => {
    writeEditions(d);
    writeTrackRecord(d);
  });
  // doctor / record / review: offline commands, run with cwd = lonely.
  let r = runCli(copy, ["--data-dir", dir, "--root-dir", ROOT, "doctor"], { cwd: lonely });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);

  const entries = path.join(dir, "entries.json");
  fs.writeFileSync(entries, JSON.stringify([{ name: "Bundle Topic", sources: ["github"], grade: "关注" }]), "utf-8");
  r = runCli(copy, ["--data-dir", dir, "record", entries, "--date", "2020-06-01"], { cwd: lonely });
  assert.strictEqual(r.status, 0, r.stderr);
  r = runCli(copy, ["--data-dir", dir, "review"], { cwd: lonely });
  assert.match(r.stdout, /- Bundle Topic \(first seen 2020-06-01, sources: github\)/);

  // publish via the bundle matches the packaged CLI's output tree.
  const siteA = path.join(dir, "site-a");
  const siteB = path.join(dir, "site-b");
  const args = ["--data-dir", dir, "--root-dir", ROOT, "publish", "--base-url", "https://example.com/triple-sigma"];
  r = runCli(CLI, [...args, "--out", siteA]);
  assert.strictEqual(r.status, 0, r.stderr);
  r = runCli(copy, [...args, "--out", siteB], { cwd: lonely });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(listFiles(siteB), listFiles(siteA));
  assert.strictEqual(
    fs.readFileSync(path.join(siteB, "index.html"), "utf-8"),
    fs.readFileSync(path.join(siteA, "index.html"), "utf-8"),
  );
});
