/** The settings row, its history, and the tick reading it (#19). */
import { describe, expect, test } from "bun:test";
import { SettingsSchema } from "@bd/contracts";
import { drizzleOver } from "@bd/db";
import { createPipeline, pipelineConfig } from "../src/core/app.ts";
import type { Step } from "../src/core/runner.ts";
import {
  changeSettings,
  InvalidSettingsError,
  readSettings,
  SettingsConflictError,
} from "../src/core/settings.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const DEFAULTS = SettingsSchema.parse({});

function setup() {
  const { sqlite, db: port } = migratedDatabase();
  return { sqlite, port, db: drizzleOver(port) };
}

function history(sqlite: ReturnType<typeof setup>["sqlite"]) {
  return sqlite
    .query<{ json: string; changed_at: number }, []>(
      "SELECT json, changed_at FROM settings_history ORDER BY id",
    )
    .all()
    .map((r) => ({ settings: JSON.parse(r.json), changedAt: r.changed_at }));
}

describe("readSettings", () => {
  test("seeds the defaults once, with one history row", async () => {
    const { sqlite, db } = setup();
    expect(await readSettings(db, NOW)).toEqual({ settings: DEFAULTS, updatedAt: NOW });
    expect(await readSettings(db, NOW + 1)).toEqual({ settings: DEFAULTS, updatedAt: NOW });
    expect(history(sqlite)).toEqual([{ settings: DEFAULTS, changedAt: NOW }]);
  });

  test("two seeds at once write one row and one history row", async () => {
    const { sqlite, db } = setup();
    await Promise.all([readSettings(db, NOW), readSettings(db, NOW + 1)]);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM settings").get()).toEqual({ n: 1 });
    expect(history(sqlite)).toHaveLength(1);
  });

  test("a key missing from the stored row reads as its default", async () => {
    const { sqlite, db } = setup();
    const { feedLimit: _dropped, ...older } = { ...DEFAULTS, waveThreshold: 4 };
    sqlite.run("INSERT INTO settings (id, json, updated_at) VALUES (1, ?, ?)", [
      JSON.stringify(older),
      NOW,
    ]);
    const { settings } = await readSettings(db, NOW);
    expect(settings).toEqual({ ...DEFAULTS, waveThreshold: 4 });
  });

  test("a stored row that is not JSON is the same error", async () => {
    const { sqlite, db } = setup();
    sqlite.run("INSERT INTO settings (id, json, updated_at) VALUES (1, '{', ?)", [NOW]);
    expect(readSettings(db, NOW)).rejects.toThrow("stored settings are invalid: not JSON");
  });

  test("a stored value the schema refuses is an error, not the defaults", async () => {
    const { sqlite, db } = setup();
    sqlite.run("INSERT INTO settings (id, json, updated_at) VALUES (1, ?, ?)", [
      JSON.stringify({ ...DEFAULTS, runIntervalMinutes: 5 }),
      NOW,
    ]);
    expect(readSettings(db, NOW)).rejects.toThrow(
      "stored settings are invalid: runIntervalMinutes",
    );
  });
});

describe("changeSettings", () => {
  test("every change leaves a history row with the settings after it", async () => {
    const { sqlite, db } = setup();
    await changeSettings(db, NOW, { runIntervalMinutes: 30 });
    const second = await changeSettings(db, NOW + 1, { waveThreshold: 4, languages: ["en"] });
    const expected: typeof DEFAULTS = {
      ...DEFAULTS,
      runIntervalMinutes: 30,
      waveThreshold: 4,
      languages: ["en"],
    };
    expect(second).toEqual({ settings: expected, updatedAt: NOW + 1 });
    expect(await readSettings(db, NOW + 2)).toEqual(second);
    expect(history(sqlite)).toEqual([
      { settings: DEFAULTS, changedAt: NOW },
      { settings: { ...DEFAULTS, runIntervalMinutes: 30 }, changedAt: NOW },
      { settings: expected, changedAt: NOW + 1 },
    ]);
  });

  test("a change that sets the current values writes nothing", async () => {
    const { sqlite, db } = setup();
    await changeSettings(db, NOW, { runIntervalMinutes: 30 });
    const same = await changeSettings(db, NOW + 1, { runIntervalMinutes: 30 });
    expect(same.updatedAt).toBe(NOW);
    expect(history(sqlite)).toHaveLength(2);
  });

  const invalid: [string, Record<string, unknown>, string][] = [
    ["an interval under 15 minutes", { runIntervalMinutes: 5 }, "runIntervalMinutes"],
    ["a fractional threshold", { waveThreshold: 2.5 }, "waveThreshold"],
    ["a wrong type", { halfLifeHours: "24" }, "halfLifeHours"],
    ["no languages", { languages: [] }, "languages"],
    ["an unknown language", { languages: ["fr"] }, "languages.0"],
    [
      "a provider without a model",
      { assignProviders: [{ name: "x", baseUrl: "https://x.test" }] },
      "assignProviders.0.model",
    ],
    ["a time zone the runtime does not know", { timeZone: "Mars/Olympus" }, "timeZone"],
    ["a send time out of range", { mailSendTime: "24:00" }, "mailSendTime"],
    ["an unknown key", { runIntervalMinute: 30 }, ""],
    ["a null value", { feedLimit: null }, "feedLimit"],
  ];
  for (const [what, patch, path] of invalid) {
    test(`refuses ${what} and writes nothing`, async () => {
      const { sqlite, db } = setup();
      await readSettings(db, NOW);
      const err = await changeSettings(db, NOW + 1, patch).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidSettingsError);
      expect((err as InvalidSettingsError).issues.map((i) => i.path)).toContain(path);
      expect(await readSettings(db, NOW + 2)).toEqual({ settings: DEFAULTS, updatedAt: NOW });
      expect(history(sqlite)).toHaveLength(1);
    });
  }

  test("refuses a patch that is not an object", async () => {
    const { db } = setup();
    for (const patch of [null, [], "x"]) {
      const err = await changeSettings(db, NOW, patch as never).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidSettingsError);
    }
  });

  test("a change against settings another writer just changed fails and writes nothing", async () => {
    const { sqlite, port, db } = setup();
    await readSettings(db, NOW);
    // Another writer changes the row after this change has read it.
    const racing = drizzleOver({
      ...port,
      async batch(statements) {
        sqlite.run("UPDATE settings SET json = ?, updated_at = ? WHERE id = 1", [
          JSON.stringify({ ...DEFAULTS, waveThreshold: 5 }),
          NOW + 1,
        ]);
        return port.batch(statements);
      },
    });
    const err = await changeSettings(racing, NOW + 2, { waveThreshold: 4 }).catch((e) => e);
    expect(err).toBeInstanceOf(SettingsConflictError);
    expect((await readSettings(db, NOW + 3)).settings.waveThreshold).toBe(5);
    expect(history(sqlite)).toHaveLength(1);
  });
  test("a change that applied is not reported as a conflict when another change follows it", async () => {
    const { sqlite, port, db } = setup();
    await readSettings(db, NOW);
    // Another writer changes the row right after this change's batch.
    const followed = drizzleOver({
      ...port,
      async batch(statements) {
        await port.batch(statements);
        sqlite.run("UPDATE settings SET json = ?, updated_at = ? WHERE id = 1", [
          JSON.stringify({ ...DEFAULTS, waveThreshold: 5 }),
          NOW + 3,
        ]);
      },
    });
    const result = await changeSettings(followed, NOW + 2, { waveThreshold: 4 });
    expect(result.settings.waveThreshold).toBe(4);
    expect(history(sqlite).map((h) => h.settings.waveThreshold)).toEqual([3, 4]);
  });
});

describe("tick reads the settings", () => {
  const noop: Step[] = [{ name: "noop", run: async () => null }];

  test("a new interval takes effect at the next tick", async () => {
    const { port, db } = setup();
    let now = NOW; // 05:07 UTC
    const pipeline = createPipeline(
      { db: port, clock: { now: () => now } },
      pipelineConfig({}),
      noop,
    );
    expect(await pipeline.tick()).toMatchObject({ slot: SLOT, started: true });

    now = NOW + 30 * 60_000; // 05:37: same hourly slot, a new half-hour slot
    expect(await pipeline.tick()).toMatchObject({ slot: SLOT, started: false });
    await changeSettings(db, now, { runIntervalMinutes: 30 });
    expect(await pipeline.tick()).toMatchObject({ slot: "20261119T0530", started: true });
  });

  test("step attempts come from settings", async () => {
    const { port, db } = setup();
    await changeSettings(db, NOW, { stepMaxAttempts: 2 });
    let calls = 0;
    const failing: Step[] = [
      {
        name: "boom",
        run: async () => {
          calls++;
          throw new Error("no");
        },
      },
    ];
    const pipeline = createPipeline(
      { db: port, clock: { now: () => NOW } },
      pipelineConfig({}),
      failing,
    );
    expect(await pipeline.tick()).toMatchObject({ status: "failed" });
    expect(calls).toBe(2);
  });

  test("invalid stored settings fail the tick before a run starts", async () => {
    const { sqlite, port } = setup();
    sqlite.run("INSERT INTO settings (id, json, updated_at) VALUES (1, ?, ?)", [
      JSON.stringify({ ...DEFAULTS, stepMaxAttempts: 0 }),
      NOW,
    ]);
    const pipeline = createPipeline(
      { db: port, clock: { now: () => NOW } },
      pipelineConfig({}),
      noop,
    );
    expect(pipeline.tick()).rejects.toThrow("stored settings are invalid");
    expect(sqlite.query("SELECT COUNT(*) AS n FROM runs").get()).toEqual({ n: 0 });
  });
});
