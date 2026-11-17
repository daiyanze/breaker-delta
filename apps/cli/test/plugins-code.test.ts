// Plugin-P1 code plugin tests: the three slots (fetcher / exit /
// score), the permission surface on the plugin ctx, the exit
// watermark, the shipped webhook plugin end-to-end against a
// local server, and the shipped momentum plugin's math. Fixture
// plugins live in the sandbox data dir (data-dir packs), the
// webhook/momentum packs are the real engine ones.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "src", "cli.js");
const ROOT = path.resolve(HERE, "..", "..", "..", "..");

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined> } = {},
): RunResult {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd,
    encoding: "utf-8",
    env: opts.env ?? process.env,
    timeout: 120_000,
  });
  if (res.error) throw res.error;
  return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

/** Async variant: the webhook test's HTTP server lives in this
 *  process, so a blocking spawnSync would deadlock it. */
function runCliAsync(
  args: string[],
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: opts.env ?? process.env,
    }) as unknown as {
      stdout: { on: (ev: string, fn: (c: Buffer) => void) => void };
      stderr: { on: (ev: string, fn: (c: Buffer) => void) => void };
      on: (ev: string, fn: (arg?: number | Error) => void) => void;
    };
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (err) => reject(err as Error));
    child.on("close", (code) =>
      resolve({ status: typeof code === "number" ? code : -1, stdout, stderr }),
    );
  });
}

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bd-plugins-"));
}

function makeDataDir(populate: (dir: string) => void = () => {}): string {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, "editions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state"), { recursive: true });
  populate(dir);
  return dir;
}

function writePlugin(
  dataDir: string,
  id: string,
  manifest: string,
  code: string,
): void {
  const dir = path.join(dataDir, "plugins", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.yaml"), manifest, "utf-8");
  fs.writeFileSync(path.join(dir, "plugin.ts"), code, "utf-8");
}

function writeConfig(dataDir: string, text: string): void {
  fs.writeFileSync(path.join(dataDir, "config.yaml"), text, "utf-8");
}

const ED1 = {
  date: "2026-11-12",
  slot: "morning",
  published_at: "2026-11-12T06:00:00+09:00",
  title: "热点雷达 · 早报",
  items: [
    {
      level: "must",
      title: "示例模型发布",
      body: "正文。",
      action: "值得试。",
      sources: ["官方博客"],
      links: ["https://example.com/release"],
      is_new: true,
    },
    {
      level: "echo",
      title: "小回波",
      body: "单源。",
      action: "仅记录。",
      sources: ["小站"],
      links: [],
      is_new: true,
    },
  ],
  updates: [],
  missing: [],
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

function writeEditions(dir: string, eds: [string, unknown][]): void {
  for (const [name, ed] of eds) {
    fs.writeFileSync(path.join(dir, "editions", name), JSON.stringify(ed, null, 2), "utf-8");
  }
  fs.writeFileSync(
    path.join(dir, "state", "seen-topics.json"),
    JSON.stringify(
      {
        topics: [
          { name: "示例模型发布", sources: ["官方博客"], grade: "关注", first_seen: "2026-11-12" },
          { name: "小回波", sources: ["小站"], grade: "回波", first_seen: "2026-11-12" },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );
}

const ALL_SOURCES = [
  "x", "official_blogs", "github", "hackernews", "show_hn", "huggingface",
  "hf_spaces", "openrouter", "civitai", "arxiv", "daily_papers", "bluesky",
  "producthunt", "gh_releases", "federal_register", "reddit", "tech_media",
  "devto", "lobsters", "stackexchange", "mastodon", "wikipedia", "sitemaps",
  "app_store", "google_news",
];

function disabledSourcesYaml(): string {
  const lines = ["sources:"];
  for (const s of ALL_SOURCES) lines.push(`  ${s}:`, "    enabled: false");
  return lines.join("\n") + "\n";
}

// ------------------------------------------------------------ fetcher slot

test("fetcher plugin merges into the scan candidates", () => {
  const dir = makeDataDir();
  writePlugin(
    dir,
    "fxfetch",
    ["id: fxfetch", "api: 1", "slots:", "  - fetcher", "entry: plugin.ts", "layer: 1", ""].join("\n"),
    `export async function fetchCandidates() {
       return [
         { name: "插件候选甲", url: "https://example.com/a", detail: "甲" },
         { name: "插件候选乙", url: "https://example.com/b" },
         { name: "", url: "https://example.com/dropped" },
       ];
     }`,
  );
  writeConfig(dir, disabledSourcesYaml() + "plugins:\n  fxfetch:\n    enabled: true\n");
  const res = runCli(["--data-dir", dir, "scan", "--edition", "morning"]);
  assert.equal(res.status, 0, res.stderr);
  const candFiles = fs
    .readdirSync(path.join(dir, "state"))
    .filter((f) => f.startsWith("candidates-"));
  assert.equal(candFiles.length, 1);
  const report = JSON.parse(
    fs.readFileSync(path.join(dir, "state", candFiles[0]), "utf-8"),
  ) as { sources: { source: string; status: string; items: { name: string }[] }[] };
  const mine = report.sources.find((s) => s.source === "fxfetch");
  assert.ok(mine, "plugin source present in candidates");
  assert.equal(mine!.status, "ok");
  assert.deepEqual(
    mine!.items.map((i) => i.name),
    ["插件候选甲", "插件候选乙"],
  );
});

test("fetcher plugin fetch is denied for undeclared hosts", () => {
  const dir = makeDataDir();
  writePlugin(
    dir,
    "fxnet",
    [
      "id: fxnet",
      "api: 1",
      "slots:",
      "  - fetcher",
      "entry: plugin.ts",
      "permissions:",
      "  network:",
      "    - example.com",
      "",
    ].join("\n"),
    `export async function fetchCandidates(ctx) {
       const res = await ctx.fetch("http://127.0.0.1:9/never");
       return [{ name: "x", url: String(res.status) }];
     }`,
  );
  writeConfig(dir, disabledSourcesYaml() + "plugins:\n  fxnet:\n    enabled: true\n");
  const res = runCli(["--data-dir", dir, "scan", "--edition", "morning"]);
  assert.equal(res.status, 0, res.stderr);
  const candFile = fs
    .readdirSync(path.join(dir, "state"))
    .find((f) => f.startsWith("candidates-")) as string;
  const report = JSON.parse(fs.readFileSync(path.join(dir, "state", candFile), "utf-8")) as {
    sources: { source: string; status: string; note?: string }[];
  };
  const mine = report.sources.find((s) => s.source === "fxnet");
  assert.ok(mine);
  assert.equal(mine!.status, "missing");
  assert.match(mine!.note ?? "", /not in permissions\.network/);
});

// ------------------------------------------------------------ score slot

test("score pass stamps the latest appearance only, without _heat", () => {
  const dir = makeDataDir();
  writeEditions(dir, [
    ["2026-11-12-morning.json", ED1],
    ["2026-11-12-evening.json", ED2],
  ]);
  writePlugin(
    dir,
    "fxscore",
    [
      "id: fxscore",
      "api: 1",
      "slots:",
      "  - score",
      "entry: plugin.ts",
      "score:",
      "  min: 0",
      "  max: 100",
      "  label:",
      '    zh: "测试分"',
      "",
    ].join("\n"),
    `export function scoreTopic() { return { value: 42 }; }`,
  );
  writeConfig(dir, "plugins:\n  fxscore:\n    enabled: true\n");
  const res = runCli(["--data-dir", dir, "plugins", "score"]);
  assert.equal(res.status, 0, res.stderr);
  const ed1 = JSON.parse(fs.readFileSync(path.join(dir, "editions", "2026-11-12-morning.json"), "utf-8"));
  const ed2 = JSON.parse(fs.readFileSync(path.join(dir, "editions", "2026-11-12-evening.json"), "utf-8"));
  // 示例模型发布's latest appearance is the evening edition.
  assert.equal(ed2.items[0].plugins.fxscore.score, 42);
  assert.equal(ed1.items[0].plugins, undefined);
  // 小回波 only appears in the morning edition — that IS its latest.
  assert.equal(ed1.items[1].plugins.fxscore.score, 42);
  // In-memory heat fields never persist.
  assert.equal(ed2.items[0]._heat, undefined);
  assert.equal(ed2.slot, undefined);
});

test("score plugin reading an undeclared env var fails loudly", () => {
  const dir = makeDataDir();
  writeEditions(dir, [["2026-11-12-morning.json", ED1]]);
  writePlugin(
    dir,
    "fxenv",
    ["id: fxenv", "api: 1", "slots:", "  - score", "entry: plugin.ts", ""].join("\n"),
    `export function scoreTopic(ctx) { ctx.env("UNDECLARED"); return { value: 1 }; }`,
  );
  writeConfig(dir, "plugins:\n  fxenv:\n    enabled: true\n");
  const res = runCli(["--data-dir", dir, "plugins", "score"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /not declared in permissions\.secrets/);
});

// ------------------------------------------------------------ exit slot

test("exit pass watermark: each edition fires once, in order", () => {
  const dir = makeDataDir();
  writeEditions(dir, [["2026-11-12-morning.json", ED1]]);
  writePlugin(
    dir,
    "fxexit",
    [
      "id: fxexit",
      "api: 1",
      "slots:",
      "  - exit",
      "entry: plugin.ts",
      "permissions:",
      "  write: true",
      "",
    ].join("\n"),
    `export function onEdition(ctx, payload) {
       const prev = ctx.readData("seen.txt") ?? "";
       ctx.writeData("seen.txt", prev + payload.file + "\\n");
     }`,
  );
  writeConfig(dir, "plugins:\n  fxexit:\n    enabled: true\n");
  const seenFile = path.join(dir, "plugins-data", "fxexit", "seen.txt");
  let res = runCli(["--data-dir", dir, "plugins", "exit"]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(fs.readFileSync(seenFile, "utf-8"), "2026-11-12-morning.json\n");
  res = runCli(["--data-dir", dir, "plugins", "exit"]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(fs.readFileSync(seenFile, "utf-8"), "2026-11-12-morning.json\n");
  writeEditions(dir, [["2026-11-12-evening.json", ED2]]);
  res = runCli(["--data-dir", dir, "plugins", "exit"]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(
    fs.readFileSync(seenFile, "utf-8"),
    "2026-11-12-morning.json\n2026-11-12-evening.json\n",
  );
});

// ------------------------------------------------------------ shipped plugins

test("shipped webhook plugin delivers with the env token, once per edition", async () => {
  const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const dir = makeDataDir();
    writeEditions(dir, [["2026-11-12-morning.json", ED1]]);
    writeConfig(
      dir,
      `plugins:\n  webhook:\n    enabled: true\n    config:\n      url: "http://127.0.0.1:${port}/hook"\n`,
    );
    const env = { ...process.env, BREAKER_DELTA_WEBHOOK_TOKEN: "sekrit" };
    const res = await runCliAsync(["--data-dir", dir, "plugins", "exit"], { env });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(received.length, 1);
    assert.equal(received[0].headers.authorization, "Bearer sekrit");
    const body = JSON.parse(received[0].body) as {
      event: string;
      topics: { name: string; heat: number }[];
    };
    assert.equal(body.event, "edition");
    assert.equal(body.topics.length, 2);
    assert.ok(body.topics.every((t) => typeof t.heat === "number"));
    const again = await runCliAsync(["--data-dir", dir, "plugins", "exit"], { env });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(received.length, 1, "watermark prevents a second delivery");
  } finally {
    server.close();
  }
});

test("entities pass: tickers extracted into the plugins namespace, chips + topics.json follow", () => {
  const dir = makeDataDir();
  const item = {
    level: "watch",
    title: "AI 芯片大单",
    body: "英伟达发布新一代芯片，$NVDA 大涨；特斯拉 Tesla 宣布采用，微软 Microsoft 跟进评估。",
    action: "关注。",
    sources: ["github"],
    links: ["https://github.com/x/y"],
    is_new: true,
  };
  writeEditions(dir, [
    ["2026-11-12-morning.json", { ...ED1, items: [item] }],
  ]);
  // The store written by writeEditions names other topics; the
  // entities pass keys off edition items, so an empty store is fine.
  fs.writeFileSync(
    path.join(dir, "state", "seen-topics.json"),
    JSON.stringify({ topics: [] }),
    "utf-8",
  );
  writeConfig(dir, "plugins:\n  tickers:\n    enabled: true\n");
  const res = runCli(["--data-dir", dir, "plugins", "entities"]);
  assert.equal(res.status, 0, res.stderr);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "editions", "2026-11-12-morning.json"), "utf-8"),
  ) as { items: { plugins: { tickers: { entities: { name: string }[] } } }[] };
  const names = saved.items[0].plugins.tickers.entities.map((e) => e.name);
  assert.ok(names.includes("NVDA"), JSON.stringify(names));
  assert.ok(names.includes("TSLA"), JSON.stringify(names));
  assert.ok(names.includes("MSFT"), JSON.stringify(names));
  // publish renders the entity chips on the topic page and carries
  // the plugins namespace into data/topics.json.
  const outDir = path.join(dir, "site");
  const pub = runCli(["--data-dir", dir, "publish", "--out", outDir]);
  assert.equal(pub.status, 0, pub.stderr);
  const topicPage = fs.readFileSync(path.join(outDir, "ai-芯片大单.html"), "utf-8");
  assert.ok(topicPage.includes("NVDA"));
  const topicsJson = JSON.parse(
    fs.readFileSync(path.join(outDir, "data", "topics.json"), "utf-8"),
  ) as { topics: { plugins: { tickers: { entities: unknown[] } } }[] };
  assert.ok(topicsJson.topics[0].plugins.tickers.entities.length >= 3);
});

test("review pass: heat-review verdicts land in the store (hit + miss)", () => {
  const dir = makeDataDir();
  const ed3 = {
    ...ED2,
    date: "2026-11-13",
    slot: "morning",
    published_at: "2026-11-13T06:00:00+09:00",
  };
  writeEditions(dir, [
    ["2026-11-12-morning.json", ED1],
    ["2026-11-12-evening.json", ED2],
    ["2026-11-13-morning.json", ed3],
  ]);
  // Age both topics past the 14-day review horizon.
  const storePath = path.join(dir, "state", "seen-topics.json");
  const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as {
    topics: { name: string; first_seen: string }[];
  };
  for (const t of store.topics) t.first_seen = "2026-10-01";
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
  writeConfig(dir, "plugins:\n  heat-review:\n    enabled: true\n");
  const res = runCli(["--data-dir", dir, "plugins", "review"]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /2 due, 2 verdict\(s\) recorded/);
  const after = JSON.parse(fs.readFileSync(storePath, "utf-8")) as {
    topics: { name: string; review?: { result: string } }[];
  };
  const byName = new Map(after.topics.map((t) => [t.name, t]));
  // 示例模型发布 appears in all three editions -> hit; 小回波 once -> miss.
  assert.equal(byName.get("示例模型发布")?.review?.result, "hit");
  assert.equal(byName.get("小回波")?.review?.result, "miss");
  const again = runCli(["--data-dir", dir, "plugins", "review"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /0 due, 0 verdict\(s\) recorded/);
});

test("page pass: momentum board stored as blocks and rendered as a tabbed page", () => {
  const dir = makeDataDir();
  writeEditions(dir, [
    ["2026-11-12-morning.json", ED1],
    ["2026-11-12-evening.json", ED2],
  ]);
  writeConfig(dir, "plugins:\n  momentum:\n    enabled: true\n");
  const outDir = path.join(dir, "site");
  const pub = runCli(["--data-dir", dir, "publish", "--out", outDir]);
  assert.equal(pub.status, 0, pub.stderr);
  const pageFile = path.join(dir, "state", "plugin-pages", "momentum.json");
  assert.ok(fs.existsSync(pageFile), "page data stored");
  const pageData = JSON.parse(fs.readFileSync(pageFile, "utf-8")) as {
    slug: string;
    langs: { zh: { blocks: unknown[] } };
  };
  assert.equal(pageData.slug, "momentum");
  assert.ok(Array.isArray(pageData.langs.zh.blocks));
  const html = fs.readFileSync(path.join(outDir, "plugin-momentum.html"), "utf-8");
  assert.ok(html.includes("动量榜"), "page title rendered");
  assert.ok(html.includes("示例模型发布"), "ranked topic rendered");
  const board = fs.readFileSync(path.join(outDir, "index.html"), "utf-8");
  assert.ok(board.includes('href="plugin-momentum.html"'), "tab links to the plugin page");
});

test("shipped momentum plugin math", async () => {
  const mod = (await import(
    path.join(ROOT, "plugins", "momentum", "plugin.ts")
  )) as { scoreTopic: (ctx: unknown, topic: { apps: unknown[] }) => { value: number } | null };
  const single = mod.scoreTopic(null, {
    apps: [{ heat: 100, sources: ["a"] }],
  });
  assert.equal(single?.value, 31); // 6 + 20 + 5
  const rising = mod.scoreTopic(null, {
    apps: [40, 55, 70, 85, 100].map((heat, i) => ({
      heat,
      sources: [`s${i}`, "shared"],
    })),
  });
  assert.equal(rising?.value, 100); // 30 + 40 + 30 (6 distinct sources)
  const falling = mod.scoreTopic(null, {
    apps: [
      { heat: 100, sources: ["a"] },
      { heat: 40, sources: ["b"] },
    ],
  });
  assert.equal(falling?.value, 22); // 12 + 0 + 10
  assert.equal(mod.scoreTopic(null, { apps: [] }), null);
});

test("mcp: plugin tools register next to the engine tools and answer calls", () => {
  const dir = makeDataDir((d) => {
    writeEditions(d, [
      ["2026-11-12-morning.json", ED1],
      ["2026-11-12-evening.json", ED2],
    ]);
    writeConfig(d, "plugins:\n  momentum:\n    enabled: true\n");
  });
  const scored = runCli(["--data-dir", dir, "plugins", "score"]);
  assert.equal(scored.status, 0, scored.stderr);

  const input =
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "momentum__top", arguments: {} } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "radar_board", arguments: {} } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "radar_topic", arguments: { query: "示例模型" } } },
    ]
      .map((m) => JSON.stringify(m))
      .join("\n") + "\n";
  const res = spawnSync(process.execPath, [CLI, "--data-dir", dir, "mcp"], {
    input,
    encoding: "utf-8",
    timeout: 120_000,
  });
  assert.equal(res.status, 0, res.stderr);
  const responses = (res.stdout as string)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  const list = responses.find((m) => m.id === 2);
  const names = list.result.tools.map((t: { name: string }) => t.name);
  assert.ok(names.includes("momentum__top"), `tools/list missing momentum__top: ${names}`);
  assert.ok(names.includes("radar_board") && names.includes("radar_topic") && names.includes("radar_editions"));

  const top = responses.find((m) => m.id === 3);
  assert.equal(top.result.isError, false);
  assert.match(top.result.content[0].text, /示例模型发布 — momentum \d+ · heat \d+/);

  const board = responses.find((m) => m.id === 4);
  assert.equal(board.result.isError, false);
  assert.match(board.result.content[0].text, /示例模型发布 — heat \d+ · must/);
  assert.match(board.result.content[0].text, /momentum \d+/);

  const topic = responses.find((m) => m.id === 5);
  assert.equal(topic.result.isError, false);
  assert.match(topic.result.content[0].text, /appearances: 2/);
});
