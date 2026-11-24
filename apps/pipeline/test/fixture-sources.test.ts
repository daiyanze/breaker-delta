/** Fixture sources (#36): what verify-local's instances scan instead of the real sources. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { drizzleOver } from "@bd/db";
import { fixtureFetch } from "../src/core/fixture-sources.ts";
import { runSlot } from "../src/core/runner.ts";
import { type ScanOutput, scanStep } from "../src/core/scan.ts";
import { ADAPTERS } from "../src/sources/adapters/index.ts";
import { LAUNCH_GROUPS } from "../src/sources/launch-groups.ts";
import { memoryBlobs, migratedDatabase, NOW, SLOT } from "./helpers.ts";

const FIXTURES = new URL("../src/sources/fixtures/", import.meta.url);
const read = (file: string) => {
  try {
    return readFileSync(new URL(file, FIXTURES), "utf8");
  } catch {
    return null;
  }
};
const fixtures = fixtureFetch(read, () => NOW);

describe("fixtureFetch", () => {
  test("a group's first URL gets its fixture; other URLs get 404", async () => {
    const bundle = LAUNCH_GROUPS.find((g) => g.id === "official_blogs");
    const adapter = ADAPTERS.official_blogs;
    if (!bundle || !adapter) throw new Error("official_blogs is gone");
    const [first, second] = adapter.urls(bundle, NOW);
    const ok = await fixtures(first ?? "");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/xml");
    expect(await ok.text()).toBe(read("official_blogs.xml") ?? "");
    expect((await fixtures(second ?? "")).status).toBe(404);
    expect((await fixtures("https://elsewhere.example.com/")).status).toBe(404);
  });

  test("scanning on it fetches every group that has an adapter, and nothing real", async () => {
    const { db } = migratedDatabase();
    const { blobs } = memoryBlobs();
    const urls: string[] = [];
    const recording = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return fixtures(input);
    }) as unknown as typeof fetch;
    const scan = scanStep({ blobs, fetch: recording, groups: LAUNCH_GROUPS, adapters: ADAPTERS });
    const outcome = await runSlot(drizzleOver(db), () => NOW, SLOT, [scan], {
      maxAttempts: 1,
      leaseMs: 60_000,
    });
    expect(outcome.status).toBe("done");
    const withAdapter = LAUNCH_GROUPS.filter((g) => ADAPTERS[g.id]).map((g) => g.id);
    const row = await db.first<{ output: string }>(
      "SELECT output FROM run_steps WHERE step = 'scan'",
    );
    const output = JSON.parse(row?.output ?? "null") as ScanOutput;
    expect(output.fetched.sort()).toEqual(withAdapter.sort());
    expect(output.missing).toEqual([]);
    expect(urls.length).toBeGreaterThan(0);
  });
});
