// Plugin-P3: `plugins add <url>` / `preset add <url>` against a
// local HTTP server (loopback http is allowed; the same server
// lives in this process, so the CLI runs via async spawn).

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

function runCliAsync(args: string[], input = ""): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {}) as unknown as {
      stdout: { on: (ev: string, fn: (c: Buffer) => void) => void };
      stderr: { on: (ev: string, fn: (c: Buffer) => void) => void };
      stdin: { end: (data: string) => void };
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
    child.stdin.end(input);
  });
}

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bd-add-"));
}

const DECL_MANIFEST = `id: declpack
api: 1
order: 30
name:
  zh: "声明式包"
  en: "Declarative Pack"
slots:
  - panel
`;
const DECL_PANEL = `head:
  title:
    zh: "测试面板"
    en: "Test Panel"
blocks:
  - type: "note"
    text:
      zh: "你好"
      en: "Hello"
`;
const CODE_MANIFEST = `id: codepack
api: 1
order: 30
name:
  zh: "代码包"
  en: "Code Pack"
slots:
  - score
entry: plugin.ts
permissions:
  network:
    - example.com
  secrets:
    - SOME_TOKEN
  write: false
score:
  min: 0
  max: 10
  label:
    zh: "测试分"
    en: "Test Score"
`;
const CODE_ENTRY = `export function scoreTopic() { return null; }
`;
const PRESET_CONFIG = `sources:
  hackernews:
    enabled: true
categories:
  fallback: 科技
  fallback_en: Tech
  rules:
    - name: 科技
      keywords: ["ai", "model"]
      en: Tech
`;
const PRESET_BRIEF = "# finance-x brief\n";

const FILES: Record<string, string> = {
  "/packs/declpack/plugin.yaml": DECL_MANIFEST,
  "/packs/declpack/panel.yaml": DECL_PANEL,
  "/packs/codepack/plugin.yaml": CODE_MANIFEST,
  "/packs/codepack/plugin.ts": CODE_ENTRY,
  "/presets/finance-x/config.yaml": PRESET_CONFIG,
  "/presets/finance-x/brief.md": PRESET_BRIEF,
};

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/packs/redir/plugin.yaml") {
      res.writeHead(302, { location: "http://example.com/plugin.yaml" });
      res.end();
      return;
    }
    const body = FILES[url];
    if (body === undefined) {
      res.writeHead(404);
      res.end("nope");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("plugins add: declarative pack installs directly and doctor verifies it", async () => {
  await withServer(async (base) => {
    const dir = tmpdir();
    const r = await runCliAsync([
      "--data-dir", dir, "plugins", "add", `${base}/packs/declpack/plugin.yaml`,
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /installed plugin "declpack"/);
    assert.ok(fs.existsSync(path.join(dir, "plugins", "declpack", "plugin.yaml")));
    assert.ok(fs.existsSync(path.join(dir, "plugins", "declpack", "panel.yaml")));
    const installs = JSON.parse(
      fs.readFileSync(path.join(dir, "state", "installs.json"), "utf-8"),
    );
    assert.match(installs.plugins.declpack.files["plugin.yaml"], /^[0-9a-f]{64}$/);

    // Reinstall without --replace refuses.
    const again = await runCliAsync([
      "--data-dir", dir, "plugins", "add", `${base}/packs/declpack/plugin.yaml`,
    ]);
    assert.notEqual(again.status, 0);
    assert.match(again.stderr + again.stdout, /already exists/);

    // Doctor verifies the recorded hashes.
    fs.writeFileSync(path.join(dir, "config.yaml"), "plugins: {}\n", "utf-8");
    const doc = await runCliAsync(["--data-dir", dir, "doctor"]);
    assert.match(doc.stdout, /install plugin declpack/);
    assert.match(doc.stdout, /match the install hashes/);

    // Drift is reported as a warning.
    fs.appendFileSync(path.join(dir, "plugins", "declpack", "panel.yaml"), "\n# edited\n", "utf-8");
    const doc2 = await runCliAsync(["--data-dir", dir, "doctor"]);
    assert.match(doc2.stdout, /panel\.yaml changed/);
  });
});

test("plugins add: code plugin needs --yes after printing permissions and hashes", async () => {
  await withServer(async (base) => {
    const dir = tmpdir();
    const refused = await runCliAsync([
      "--data-dir", dir, "plugins", "add", `${base}/packs/codepack/plugin.yaml`,
    ]);
    assert.notEqual(refused.status, 0);
    const text = refused.stderr + refused.stdout;
    assert.match(text, /CODE plugin/);
    assert.match(text, /example\.com/);
    assert.match(text, /SOME_TOKEN/);
    assert.match(text, /[0-9a-f]{64}/);
    assert.match(text, /--yes/);
    assert.ok(!fs.existsSync(path.join(dir, "plugins", "codepack")));

    const ok = await runCliAsync([
      "--data-dir", dir, "plugins", "add", `${base}/packs/codepack/plugin.yaml`, "--yes",
    ]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(fs.existsSync(path.join(dir, "plugins", "codepack", "plugin.ts")));
  });
});

test("preset add: installs into the data dir and config resolution finds it", async () => {
  await withServer(async (base) => {
    const dir = tmpdir();
    const r = await runCliAsync([
      "--data-dir", dir, "preset", "add", `${base}/presets/finance-x/config.yaml`,
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /installed preset "finance-x"/);
    assert.ok(fs.existsSync(path.join(dir, "presets", "finance-x", "config.yaml")));
    assert.ok(fs.existsSync(path.join(dir, "presets", "finance-x", "brief.md")));

    const list = await runCliAsync(["--data-dir", dir, "preset", "list"]);
    assert.match(list.stdout, /finance-x/);

    // An instance config naming the data-dir preset resolves:
    // doctor must not report the preset as missing, and its install
    // record verifies. (Unrelated checks may warn on the bare
    // fixture dir, so no exit-code assertion here.)
    fs.writeFileSync(path.join(dir, "config.yaml"), "preset: finance-x\n", "utf-8");
    fs.mkdirSync(path.join(dir, "editions"), { recursive: true });
    const doc = await runCliAsync(["--data-dir", dir, "doctor"]);
    assert.doesNotMatch(doc.stdout + doc.stderr, /names preset "finance-x" but no/);
    assert.match(doc.stdout, /install preset finance-x/);
    assert.match(doc.stdout, /match the install hashes/);
  });
});

test("add: refuses non-loopback http and cross-host redirects", async () => {
  const plain = await runCliAsync([
    "--data-dir", tmpdir(), "plugins", "add", "http://example.com/packs/x/plugin.yaml",
  ]);
  assert.notEqual(plain.status, 0);
  assert.match(plain.stderr + plain.stdout, /only https/);

  await withServer(async (base) => {
    const redir = await runCliAsync([
      "--data-dir", tmpdir(), "plugins", "add", `${base}/packs/redir/plugin.yaml`,
    ]);
    assert.notEqual(redir.status, 0);
    assert.match(redir.stderr + redir.stdout, /redirect leaves the original host/);
  });
});

test("doctor reports language packs: valid pack ok, unknown key fails", async () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, "langpacks", "ko"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "langpacks", "ko", "pack.json"),
    JSON.stringify({ code: "ko", name: "한국어", base: "en", strings: { wave: "파도 높이" } }),
    "utf-8",
  );
  fs.writeFileSync(path.join(dir, "config.yaml"), "plugins: {}\n", "utf-8");
  const ok = await runCliAsync(["--data-dir", dir, "doctor"]);
  assert.match(ok.stdout, /language packs/);
  assert.match(ok.stdout, /ko \(new, base en, 1 strings\)/);

  fs.writeFileSync(
    path.join(dir, "langpacks", "ko", "pack.json"),
    JSON.stringify({ code: "ko", strings: { nope_key: "x" } }),
    "utf-8",
  );
  const bad = await runCliAsync(["--data-dir", dir, "doctor"]);
  assert.match(bad.stdout, /unknown string key "nope_key"/);
});
