/**
 * Write the preview seed (#41): full local runs over the scrubbed fixture
 * sources with the fake model, exported as SQL. See
 * `apps/pipeline/src/local/seed.ts`.
 *
 *   bun scripts/seed-preview.ts [out.sql]    default: stdout
 *
 * Load it into the preview database (the preview workflow does this):
 *
 *   wrangler d1 execute bd-content-preview --remote -c wrangler.preview-db.jsonc --file <out.sql>
 */
import { writeFileSync } from "node:fs";
import { buildSeed } from "../apps/pipeline/src/local/seed.ts";

const sql = await buildSeed();
const out = process.argv[2];
if (out) writeFileSync(out, sql);
else process.stdout.write(sql);
