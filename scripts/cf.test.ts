import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// scripts/cf.sh must never run wrangler without a well-formed token and account
// ID (ADR 0019, L12, L13). A stub `bun` stands in for wrangler and reports what it received.
const dir = mkdtempSync(join(tmpdir(), "cf-sh-"));
const bin = join(dir, "bin");
mkdirSync(bin);
const stub = join(bin, "bun");
writeFileSync(
  stub,
  '#!/bin/sh\necho "ran $* token=${CLOUDFLARE_API_TOKEN:+set} account=$CLOUDFLARE_ACCOUNT_ID key=${CLOUDFLARE_API_KEY:-none}"\n',
);
chmodSync(stub, 0o755);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ACC = "0123456789abcdef0123456789abcdef";

let n = 0;
function run(file: string | null, env: Record<string, string> = {}) {
  const path = join(dir, `env-${n++}`);
  if (file !== null) writeFileSync(path, file);
  const p = Bun.spawnSync(["sh", join(import.meta.dir, "cf.sh"), "whoami"], {
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, BD_CF_ENV: path, ...env },
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

describe("scripts/cf.sh", () => {
  test("runs wrangler with the token and account from the file, printing neither", () => {
    const r = run(`CLOUDFLARE_API_TOKEN=tok_123-x\nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`ran x --bun wrangler whoami token=set account=${ACC} key=none\n`);
    expect(r.out + r.err).not.toContain("tok_123-x");
  });

  test("accepts CRLF line endings", () => {
    expect(run(`CLOUDFLARE_API_TOKEN=tok\r\nCLOUDFLARE_ACCOUNT_ID=${ACC}\r\n`).code).toBe(0);
  });

  test("drops a global API key from the environment", () => {
    const r = run(`CLOUDFLARE_API_TOKEN=tok\nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`, {
      CLOUDFLARE_API_KEY: "global",
      CLOUDFLARE_EMAIL: "a@b.c",
    });
    expect(r.out).toContain("key=none");
  });

  const refused: [string, string | null, Record<string, string>?][] = [
    ["no store at all", null],
    ["an already-set token but no store", null, { CLOUDFLARE_API_TOKEN: "stale" }],
    ["a token without an account ID", "CLOUDFLARE_API_TOKEN=tok\n"],
    ["an empty token", `CLOUDFLARE_API_TOKEN=\nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`],
    ["a quoted value", `CLOUDFLARE_API_TOKEN="tok"\nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`],
    ["trailing spaces", `CLOUDFLARE_API_TOKEN=tok  \nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`],
    ["an inline comment", `CLOUDFLARE_API_TOKEN=tok # mine\nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`],
    [
      "a duplicated key",
      `CLOUDFLARE_API_TOKEN=a\nCLOUDFLARE_API_TOKEN=b\nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`,
    ],
    ["export prefixes", `export CLOUDFLARE_API_TOKEN=tok\nexport CLOUDFLARE_ACCOUNT_ID=${ACC}\n`],
    // L13: a token in the account slot reached wrangler and was printed in a URL.
    [
      "a token stored as the account ID",
      "CLOUDFLARE_API_TOKEN=tok\nCLOUDFLARE_ACCOUNT_ID=cfat_abc123-x\n",
    ],
    ["a short account ID", "CLOUDFLARE_API_TOKEN=tok\nCLOUDFLARE_ACCOUNT_ID=abc123\n"],
    [
      "an upper-case account ID",
      `CLOUDFLARE_API_TOKEN=tok\nCLOUDFLARE_ACCOUNT_ID=${ACC.toUpperCase()}\n`,
    ],
    ["a 33-digit account ID", `CLOUDFLARE_API_TOKEN=tok\nCLOUDFLARE_ACCOUNT_ID=${ACC}0\n`],
    ["swapped values", `CLOUDFLARE_API_TOKEN=${ACC}\nCLOUDFLARE_ACCOUNT_ID=cfat_abc123-x\n`],
    ["an account ID in both slots", `CLOUDFLARE_API_TOKEN=${ACC}\nCLOUDFLARE_ACCOUNT_ID=${ACC}\n`],
  ];
  for (const [name, file, env] of refused) {
    test(`refuses ${name}, without running wrangler`, () => {
      const r = run(file, env);
      expect(r.code).toBe(1);
      expect(r.out).toBe("");
      expect(r.err).toContain("not running wrangler");
      // The refusal never echoes a stored value. Short ones ("tok") are
      // skipped: they occur in the message's own words.
      for (const v of file?.match(/=[^\r\n]{6,}/g) ?? []) {
        expect(r.err).not.toContain(v.slice(1));
      }
    });
  }
});
