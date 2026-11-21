/**
 * The migrations, embedded in the build. `bun build --compile` bundles text
 * imports, so the local executable needs no `packages/db/migrations` folder.
 * Add a line here with every new migration; a test fails if one is missing.
 */
import m0000 from "../../../../packages/db/migrations/0000_init.sql" with { type: "text" };
import m0001 from "../../../../packages/db/migrations/0001_run_steps.sql" with { type: "text" };

export interface Migration {
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { name: "0000_init.sql", sql: m0000 },
  { name: "0001_run_steps.sql", sql: m0001 },
];
