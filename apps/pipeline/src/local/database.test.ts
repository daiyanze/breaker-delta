import { Database as SQLite } from "bun:sqlite";
import { describe, test } from "bun:test";
import { databaseChecks } from "@bd/ports/conformance";
import { sqliteDatabase } from "./database.ts";

describe("bun:sqlite passes the Database port checks", () => {
  for (const check of databaseChecks(async () => sqliteDatabase(new SQLite(":memory:")))) {
    test(check.name, () => check.run());
  }
});
