// Ports of tests/test_publish.py's nine tests, asserting the same
// facts against the Node publisher's output. Fixture sources are
// deliberately unmapped, so no favicon fetch happens (as upstream).

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { fileURLToPath } from "node:url";

import { parseTrackRecordFile } from "@breaker-delta/core";

import { buildSite, optionsFromEnv } from "../src/index.js";
import { pyQuote } from "../src/py.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "..",
);

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
      level: "seed",
      title: "小苗头",
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

function writeEditions(tmpdir: string): string {
  const editionsDir = path.join(tmpdir, "editions");
  fs.mkdirSync(editionsDir, { recursive: true });
  for (const ed of [ED1, ED2]) {
    fs.writeFileSync(
      path.join(editionsDir, `${ed.date}-${ed.slot}.json`),
      JSON.stringify(ed),
      "utf-8",
    );
  }
  return editionsDir;
}

/** Synthetic ledger fixture mirroring the real one's shape: 4 edition
 *  groups, 24 entries, all results blank, first review 2026-11-25. */
function writeTrackRecord(tmpdir: string): string {
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
  const p = path.join(tmpdir, "track-record.md");
  fs.writeFileSync(p, lines.join("\n"), "utf-8");
  return p;
}

interface Built {
  tmpdir: string;
  outDir: string;
}

async function buildFixture(
  extra: Record<string, unknown> = {},
): Promise<Built> {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-pub-test-"));
  const editionsDir = writeEditions(tmpdir);
  const outDir = path.join(tmpdir, "site");
  await buildSite({
    rootDir: ROOT,
    editionsDir,
    outDir,
    baseUrl: "https://example.com/triple-sigma",
    ...extra,
  });
  return { tmpdir, outDir };
}

function cleanup(b: Built): void {
  fs.rmSync(b.tmpdir, { recursive: true, force: true });
}

function read(outDir: string, name: string): string {
  return fs.readFileSync(path.join(outDir, name), "utf-8");
}

test("build writes all outputs", async () => {
  const b = await buildFixture();
  try {
    for (const name of [
      "index.html", "rising.html", "echoes.html", "categories.html",
      "sources.html", "archive.html", "about.html",
      "edition-2026-11-12-morning.html",
      "edition-2026-11-12-evening.html",
      "feed.xml", "atom.xml", "sitemap.xml", "robots.txt",
      "llms.txt", "favicon.svg", "og-image.png",
      "en/index.html", "ja/index.html",
      "示例模型发布.html", // topic page: title slug URL
      "topic-t01.html", // legacy redirect stub
      "level-must.html", "level-echo.html",
    ]) {
      assert.ok(fs.existsSync(path.join(b.outDir, name)), name);
    }
    assert.ok(
      fs.readdirSync(b.outDir).some((n) => n.startsWith("category-")),
      "category pages written",
    );
    const index = read(b.outDir, "index.html");
    assert.ok(index.includes("示例模型发布") && index.includes("浪尖雷达"));
    assert.ok(index.includes("https://example.com/triple-sigma/"));
    assert.ok(index.includes(pyQuote("示例模型发布.html")));
    const archive = read(b.outDir, "archive.html");
    assert.ok(archive.includes("2026-11-12")); // grouped by date
    const level = read(b.outDir, "level-must.html");
    assert.ok(level.includes("tagchip on")); // focused tag highlighted
    const sources = read(b.outDir, "sources.html");
    assert.ok(sources.includes("cfgpre") && sources.includes("per_feed"));
    assert.ok(fs.existsSync(path.join(b.outDir, "source-官方博客.html")));
    const rising = read(b.outDir, "rising.html");
    assert.ok(rising.includes("本期没有上涨")); // explicit empty state
  } finally {
    cleanup(b);
  }
});

test("feeds contain the fixture topic and slug links", async () => {
  const b = await buildFixture();
  try {
    const feed = read(b.outDir, "feed.xml");
    const atom = read(b.outDir, "atom.xml");
    assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(atom.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(feed.includes("示例模型发布"));
    assert.ok(feed.includes(pyQuote("示例模型发布.html")));
  } finally {
    cleanup(b);
  }
});

test("creator panel can be switched off", async () => {
  const b = await buildFixture({ creator: false });
  try {
    const main = read(b.outDir, "示例模型发布.html");
    assert.ok(!main.includes("创作参考"));
  } finally {
    cleanup(b);
  }
});

test("track record page matches ledger", async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-pub-test-"));
  const editionsDir = writeEditions(tmpdir);
  const outDir = path.join(tmpdir, "site");
  await buildSite({
    rootDir: ROOT,
    editionsDir,
    outDir,
    baseUrl: "https://example.com/triple-sigma",
    trackRecordPath: writeTrackRecord(tmpdir),
  });
  const b = { tmpdir, outDir };
  try {
    for (const langDir of ["", "en/", "ja/"]) {
      const tr = read(outDir, `${langDir}track-record.html`);
      assert.strictEqual(tr.split('class="tr-row"').length - 1, 24, langDir);
      assert.ok(tr.includes("2026-11-25"), langDir); // first review batch
      assert.ok(tr.includes("Anthropic IPO") && tr.includes("黄仁勋"), langDir);
    }
    const zh = read(outDir, "track-record.html");
    assert.ok(zh.includes("已登记") && zh.includes("24"));
    assert.ok(zh.includes("待复核")); // blank results render as pending
    assert.ok(zh.includes("首批复核 2026-11-25")); // no invented hit rate
    assert.ok(zh.includes("话题弧") && zh.includes("事实核查优先"));
    const index = read(outDir, "index.html");
    assert.ok(
      index.indexOf("sources.html") < index.indexOf("track-record.html") &&
        index.indexOf("track-record.html") < index.indexOf("archive.html"),
    );
    assert.ok(index.includes("🏆 战绩"));
  } finally {
    cleanup(b);
  }
});

test("parse track record counts", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-pub-test-"));
  try {
    const data = parseTrackRecordFile(writeTrackRecord(tmpdir));
    assert.strictEqual(data.total, 24);
    assert.strictEqual(data.reviewed, 0);
    assert.strictEqual(data.first_review, "2026-11-25");
    assert.strictEqual(data.groups.length, 4);
    assert.strictEqual(
      data.groups.reduce((n, g) => n + g.entries.length, 0),
      24,
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("submit page and bookmarklet", async () => {
  const b = await buildFixture();
  try {
    for (const langDir of ["", "en/", "ja/"]) {
      const sub = read(b.outDir, `${langDir}submit.html`);
      assert.ok(
        sub.includes("github.com/daiyanze/breaker-delta/issues/new"),
        langDir,
      );
      assert.ok(sub.includes("template=echo.md"), langDir);
      assert.ok(
        sub.includes("javascript:") && sub.includes("encodeURIComponent"),
        langDir,
      );
      assert.ok(
        sub.includes('id="echotext"') && sub.includes("URLSearchParams"),
        langDir,
      );
      assert.ok(
        sub.includes("标题：") && sub.includes("链接：") && sub.includes("理由："),
        langDir,
      );
    }
    const seeds = read(b.outDir, "echoes.html");
    assert.ok(seeds.includes('href="submit.html"'));
    const about = read(b.outDir, "about.html");
    assert.ok(about.includes('href="submit.html"'));
  } finally {
    cleanup(b);
  }
});

test("base url and data repo env overrides", async () => {
  const opts = optionsFromEnv(
    {
      TS_BASE_URL: "https://daiyanze.github.io/breaker-delta-data/",
      TS_DATA_REPO: "daiyanze/breaker-delta-data",
    },
    ROOT,
  );
  assert.strictEqual(opts.baseUrl, "https://daiyanze.github.io/breaker-delta-data/");
  assert.strictEqual(opts.dataRepo, "daiyanze/breaker-delta-data");
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-pub-test-"));
  const outDir = path.join(tmpdir, "site");
  await buildSite({
    ...opts,
    editionsDir: writeEditions(tmpdir),
    outDir,
  });
  try {
    const index = read(outDir, "index.html");
    assert.ok(index.includes("https://daiyanze.github.io/breaker-delta-data/"));
    const sub = read(outDir, "submit.html");
    assert.ok(
      sub.includes("github.com/daiyanze/breaker-delta-data/issues/new"),
    );
    assert.ok(sub.includes("template=echo.md"));
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("data files structure and dedup", async () => {
  const b = await buildFixture();
  try {
    const topics = JSON.parse(read(b.outDir, "data/topics.json")) as {
      generated_at: string;
      topics: Record<string, unknown>[];
    };
    assert.ok(topics.generated_at);
    assert.strictEqual(topics.topics.length, 2); // merged example + one echo
    for (const t of topics.topics) {
      for (const key of [
        "slug", "title", "heat", "first_seen", "level",
        "url_patterns", "title_keywords",
      ]) {
        assert.ok(key in t, key);
      }
    }
    const ex = topics.topics.find((t) =>
      (t.slug as string).startsWith("示例"),
    ) as Record<string, unknown>;
    assert.strictEqual(ex.heat, 108);
    assert.strictEqual(ex.level, "must");
    assert.ok((ex.url_patterns as string[]).includes("example.com/release"));
    assert.strictEqual(ex.first_seen, "2026-11-12");
    assert.ok((ex.title_keywords as string[]).length > 0);
    const alerts = JSON.parse(read(b.outDir, "data/alerts.json")) as {
      alerts: Record<string, unknown>[];
    };
    const keys = alerts.alerts.map((a) => a.dedupe_key as string);
    assert.strictEqual(new Set(keys).size, keys.length, "dedupe keys unique");
    for (const a of alerts.alerts) {
      assert.ok(a.reason === "resonance" || a.reason === "surge");
      if (a.heat_before === 0) {
        assert.strictEqual(a.reason, "resonance"); // surge is existing only
      }
      assert.strictEqual(
        a.dedupe_key,
        `${a.topic_slug}:${a.reason}:2026-11-12-evening`,
      );
      for (const key of [
        "topic_slug", "title", "heat_before", "heat_after", "edition",
      ]) {
        assert.ok(key in a, key);
      }
    }
  } finally {
    cleanup(b);
  }
});

test("topic page has wave chart and visible nofollow links", async () => {
  const b = await buildFixture();
  try {
    const main = read(b.outDir, "示例模型发布.html");
    assert.ok(main.includes("海浪图"));
    assert.ok(main.includes("url(#wgrad)")); // area chart gradient fill
    assert.ok(main.includes('class="orig"') && !main.includes("<details>"));
    assert.ok(main.includes('rel="nofollow noopener"'));
    assert.ok(main.includes("https://example.com/release"));
    assert.ok(main.includes("Telegram")); // default share set
    assert.ok(main.includes('href="source-')); // history sources link out
    assert.ok(main.includes("创作参考") && main.includes("钩子三选一"));
    assert.ok(main.includes("Hormozi")); // long-form skeleton attribution
    assert.ok(main.includes('class="help"')); // wave-height explainer
  } finally {
    cleanup(b);
  }
});
