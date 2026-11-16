// P1d built-in LLM grading tests: a local stub stands in for the
// OpenAI-compatible endpoint. The happy path lands an edition +
// ledger record through the same write paths the agent flow uses;
// the failure paths (no key, invalid model output) write nothing.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "src", "cli.js");

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

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

const GRADED = {
  items: [
    {
      level: "watch",
      title: "新模型发布",
      body: "两个独立来源都报道了新模型发布，性能提升明显。",
      action: "试用新模型并对比现有工作流。",
      i18n: {
        en: { title: "New model released", body: "Two independent sources report the release.", action: "Try it." },
        ja: { title: "新モデル公開", body: "2つの独立した情報源が報じた。", action: "試す。" },
      },
      sources: ["github", "hackernews"],
      links: ["https://example.com/release"],
      is_new: true,
    },
    {
      level: "echo",
      title: "小工具走红",
      body: "单个来源提到的小工具，尚待更多验证。",
      action: "先收藏观察。",
      sources: ["github"],
      links: [],
      is_new: true,
    },
  ],
};

function makeDataDir(baseUrl: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-grade-"));
  fs.mkdirSync(path.join(dir, "editions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "state", "seen-topics.json"),
    JSON.stringify({ topics: [] }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "state", "candidates-20261116-morning.json"),
    JSON.stringify({
      edition: "morning",
      scanned_at: "2026-11-16T06:00:00+09:00",
      sources: [
        {
          source: "github",
          layer: 1,
          status: "ok",
          items: [{ name: "新模型发布", url: "https://example.com/release", detail: "性能提升", metrics: { stars: 500 } }],
        },
        {
          source: "hackernews",
          layer: 1,
          status: "ok",
          items: [{ name: "New model discussion", url: "https://example.com/hn", detail: "热议" }],
        },
      ],
      resonance: [],
      keyword_alerts: [],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "config.yaml"),
    `grading:\n  model: test-model\n  base_url: ${baseUrl}\n`,
    "utf-8",
  );
  return dir;
}

function stubServer(content: string): Promise<{ url: string; seen: () => { auth: string; body: string }; close: () => void }> {
  return new Promise((resolve) => {
    let auth = "";
    let body = "";
    const server = http.createServer((req0, res0) => {
      const req = req0 as unknown as {
        headers: Record<string, unknown>;
        on: (ev: string, fn: (c?: Buffer) => void) => void;
      };
      const res = res0 as unknown as {
        writeHead: (code: number, h: Record<string, string>) => void;
        end: (b: string) => void;
      };
      auth = String(req.headers.authorization ?? "");
      req.on("data", (c?: Buffer) => (body += c ?? ""));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/v1`,
        seen: () => ({ auth, body }),
        close: () => server.close(),
      });
    });
  });
}

test("grade: stub LLM output lands an edition + ledger record", async () => {
  const stub = await stubServer(JSON.stringify(GRADED));
  try {
    const dir = makeDataDir(stub.url);
    const res = await runCliAsync(["--data-dir", dir, "grade", "--edition", "morning"], {
      env: { ...process.env, BREAKER_DELTA_LLM_API_KEY: "test-key" },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /graded with test-model: 2 item\(s\)/);
    const edition = JSON.parse(
      fs.readFileSync(path.join(dir, "editions", "2026-11-16-morning.json"), "utf-8"),
    ) as { items: { title: string; level: string; i18n?: { en?: { title?: string } } }[] };
    assert.equal(edition.items.length, 2);
    assert.equal(edition.items[0].title, "新模型发布");
    assert.equal(edition.items[0].i18n?.en?.title, "New model released");
    const store = JSON.parse(
      fs.readFileSync(path.join(dir, "state", "seen-topics.json"), "utf-8"),
    ) as { topics: { name: string }[] };
    assert.deepEqual(
      store.topics.map((t) => t.name).sort(),
      ["小工具走红", "新模型发布"],
    );
    // The request carried the key and the methodology prompt.
    const seen = stub.seen();
    assert.equal(seen.auth, "Bearer test-key");
    assert.match(seen.body, /at least 2 independent sources/);
    assert.match(seen.body, /test-model/);
    // A second run refuses to overwrite without --replace.
    const again = await runCliAsync(["--data-dir", dir, "grade", "--edition", "morning"], {
      env: { ...process.env, BREAKER_DELTA_LLM_API_KEY: "test-key" },
    });
    assert.notEqual(again.status, 0);
    assert.match(again.stderr + again.stdout, /already exists/);
  } finally {
    stub.close();
  }
});

test("grade: missing API key env fails before any write", async () => {
  const stub = await stubServer(JSON.stringify(GRADED));
  try {
    const dir = makeDataDir(stub.url);
    const env = { ...process.env };
    delete env.BREAKER_DELTA_LLM_API_KEY;
    const res = await runCliAsync(["--data-dir", dir, "grade", "--edition", "morning"], { env });
    assert.notEqual(res.status, 0);
    assert.match(res.stderr + res.stdout, /BREAKER_DELTA_LLM_API_KEY is not set/);
    assert.equal(fs.existsSync(path.join(dir, "editions", "2026-11-16-morning.json")), false);
  } finally {
    stub.close();
  }
});

test("grade: invalid model output writes nothing", async () => {
  const stub = await stubServer("this is not json at all");
  try {
    const dir = makeDataDir(stub.url);
    const res = await runCliAsync(["--data-dir", dir, "grade", "--edition", "morning"], {
      env: { ...process.env, BREAKER_DELTA_LLM_API_KEY: "test-key" },
    });
    assert.notEqual(res.status, 0);
    assert.match(res.stderr + res.stdout, /not valid JSON/);
    assert.equal(fs.existsSync(path.join(dir, "editions", "2026-11-16-morning.json")), false);
    const store = JSON.parse(
      fs.readFileSync(path.join(dir, "state", "seen-topics.json"), "utf-8"),
    ) as { topics: unknown[] };
    assert.equal(store.topics.length, 0);
  } finally {
    stub.close();
  }
});
