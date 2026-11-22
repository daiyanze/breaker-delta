import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { previewViolations } from "./wrangler-previews.ts";

const root = join(import.meta.dir, "..");
interface D1 {
  binding: string;
  database_name: string;
  database_id: string;
}
/** The parts of a wrangler config these tests read. */
interface Wrangler {
  main?: string;
  d1_databases: [D1];
  previews: { d1_databases: [D1]; r2_buckets: unknown[] };
}
async function read(path: string) {
  return Bun.JSONC.parse(await Bun.file(join(root, path)).text()) as Wrangler;
}

const pipeline = await read("apps/pipeline/wrangler.jsonc");
const web = await read("apps/web/wrangler.jsonc");
const previewDb = await read("apps/pipeline/wrangler.preview-db.jsonc");

describe("previews bind preview resources only (#11)", () => {
  test("the real configs pass", () => {
    expect(previewViolations({ pipeline, web })).toEqual([]);
  });

  test("the pipeline preview binds DB and BLOBS to preview resources", () => {
    expect(pipeline.previews.d1_databases.map((d) => d.binding)).toEqual(["DB"]);
    expect(pipeline.previews.r2_buckets).toEqual([
      { binding: "BLOBS", bucket_name: "bd-blobs-preview" },
    ]);
  });

  test("migrations go to the same preview database the previews bind", () => {
    const [db] = previewDb.d1_databases;
    expect(db).toMatchObject(pipeline.previews.d1_databases[0]);
    expect(db.database_name).toBe("bd-content-preview");
    expect(previewDb.main).toBeUndefined();
  });

  // L7: a violation in each place the rule covers is reported.
  const planted: [string, object][] = [
    ["production D1 by name", { d1_databases: [{ binding: "DB", database_name: "bd-content" }] }],
    [
      "production D1 by id",
      { d1_databases: [{ binding: "DB", database_id: pipeline.d1_databases[0].database_id }] },
    ],
    ["production bucket", { r2_buckets: [{ binding: "BLOBS", bucket_name: "bd-blobs" }] }],
    ["non-preview name", { d1_databases: [{ binding: "P", database_name: "bd-private" }] }],
    ["service to production", { services: [{ binding: "PIPE", service: "bd-pipeline" }] }],
    ["triggers", { triggers: { crons: ["* * * * *"] } }],
  ];
  for (const [what, previews] of planted) {
    test(`reports ${what}`, () => {
      expect(previewViolations({ pipeline, web: { ...web, previews } }).length).toBeGreaterThan(0);
      expect(
        previewViolations({ pipeline: { ...pipeline, previews }, web }).length,
      ).toBeGreaterThan(0);
    });
  }
});
