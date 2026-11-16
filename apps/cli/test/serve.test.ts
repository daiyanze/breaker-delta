// Integration test for `serve` (P1): spawns the compiled CLI as a
// server on a scratch data dir and drives it over HTTP — render,
// health, the token-gated push API, and the re-render on push.
// No network: the fixture edition's sources are unmapped, so no
// favicon fetch happens.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "src", "cli.js");

const EDITION = {
  date: "2026-11-12",
  slot: "morning",
  published_at: "2026-11-12T06:00:00+09:00",
  title: "热点雷达 · 早报",
  items: [
    {
      level: "must",
      title: "服务夹具话题",
      body: "夹具正文。",
      action: "仅记录。",
      sources: ["无名小站"],
      links: [],
      is_new: true,
    },
  ],
  updates: [],
  missing: [],
  pending_checks: [],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

test("serve renders, gates the push API, and re-renders on push", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-serve-"));
  fs.mkdirSync(path.join(dir, "editions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "editions", "2026-11-12-morning.json"),
    JSON.stringify(EDITION, null, 2),
    "utf-8",
  );
  const port = 18700 + (process.pid % 400);
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | null = null;
  try {
    child = spawn(process.execPath, [CLI, "--data-dir", dir, "serve", "--port", String(port)], {
      env: { ...process.env, BD_PUSH_TOKEN: "test-token", BD_WATCH_MS: "300" },
      stdio: "ignore",
    });
    await waitFor(async () => {
      try {
        const r = await fetch(`${base}/api/health`);
        const j = JSON.parse(await r.text()) as { ok?: boolean };
        return j.ok === true;
      } catch {
        return false;
      }
    }, 60_000, "first render");

    const home = await fetch(`${base}/`);
    assert.strictEqual(home.status, 200);
    assert.ok((await home.text()).includes("服务夹具话题"));

    const health = JSON.parse(await (await fetch(`${base}/api/health`)).text()) as {
      pushApi: boolean;
      files: number;
    };
    assert.strictEqual(health.pushApi, true);
    assert.ok(health.files > 50, `expected a full site, got ${health.files} files`);

    assert.strictEqual((await fetch(`${base}/definitely-missing.html`)).status, 404);

    // Push API: no token -> 401, token -> 200 and the store moves.
    const noAuth = await fetch(`${base}/api/record`, {
      method: "POST",
      body: JSON.stringify([{ name: "推送话题", sources: ["Hacker News"], grade: "watch" }]),
    });
    assert.strictEqual(noAuth.status, 401);
    const pushed = await fetch(`${base}/api/record`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify([{ name: "推送话题", sources: ["Hacker News"], grade: "watch" }]),
    });
    assert.strictEqual(pushed.status, 200);
    const store = JSON.parse(
      fs.readFileSync(path.join(dir, "state", "seen-topics.json"), "utf-8"),
    ) as { topics: { name: string }[] };
    assert.ok(store.topics.some((t) => t.name === "推送话题"));

    // Edition push lands as a file, serves after re-render, and a
    // duplicate push is refused with 409.
    const evening = { ...EDITION, slot: "evening", title: "热点雷达 · 晚报" };
    const edPush = await fetch(`${base}/api/editions`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify(evening),
    });
    assert.strictEqual(edPush.status, 200);
    assert.ok(fs.existsSync(path.join(dir, "editions", "2026-11-12-evening.json")));
    await waitFor(
      async () => (await fetch(`${base}/edition-2026-11-12-evening.html`)).status === 200,
      30_000,
      "edition page after push",
    );
    const dup = await fetch(`${base}/api/editions`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify(evening),
    });
    assert.strictEqual(dup.status, 409);
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child!.on("exit", () => resolve(null))),
        sleep(5_000),
      ]);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
