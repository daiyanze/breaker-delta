/**
 * The settings row and its history (ADR 0008, invariant 9). One row,
 * `settings.id = 1`, holds the validated settings JSON. Every change,
 * including the first seed of the defaults, adds a `settings_history` row
 * with the JSON as it is after that change, written in the same batch.
 *
 * Settings are validated by `SettingsSchema` from `@bd/contracts` on the way
 * in and on the way out. A key the schema gained since the row was written
 * reads as its default; a stored value the schema refuses is an error, not
 * a silent fallback to the defaults.
 */
import { type Settings, SettingsSchema } from "@bd/contracts";
import { type Db, settings } from "@bd/db";
import { eq, sql } from "drizzle-orm";

const ROW = 1;

export interface StoredSettings {
  settings: Settings;
  /** Epoch ms of the last change (the seed counts as one). */
  updatedAt: number;
}

/** A change refused because the result is not valid settings. */
export class InvalidSettingsError extends Error {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(
      `invalid settings: ${issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ")}`,
    );
    this.name = "InvalidSettingsError";
  }
}

/** Another writer changed the settings between this change's read and write. */
export class SettingsConflictError extends Error {
  constructor() {
    super("settings changed while this change was being written; read them again");
    this.name = "SettingsConflictError";
  }
}

/** Every key a change may set; an unknown key is refused, not dropped. */
const ChangeSchema = SettingsSchema.strict();

async function readRow(db: Db) {
  return db
    .select({ json: settings.json, updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.id, ROW))
    .get();
}

function parseStored(json: string): Settings {
  const parsed = SettingsSchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    throw new Error(
      `stored settings are invalid: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

/**
 * The current settings. On a new database, seeds the defaults first, with
 * their history row. Two seeds at once write one row and one history row.
 */
export async function readSettings(db: Db, nowMs: number): Promise<StoredSettings> {
  const loaded = await load(db, nowMs);
  return { settings: loaded.settings, updatedAt: loaded.updatedAt };
}

/** The settings and the row's JSON as stored, which a change compares against. */
async function load(db: Db, nowMs: number): Promise<StoredSettings & { stored: string }> {
  let row = await readRow(db);
  if (!row) {
    const json = JSON.stringify(SettingsSchema.parse({}));
    // The history row is guarded on the settings row being absent, and goes
    // first: the batch is one transaction, so only one seed writes either.
    await db.batch([
      db.run(sql`INSERT INTO settings_history (json, changed_at)
        SELECT ${json}, ${nowMs} WHERE NOT EXISTS (SELECT 1 FROM settings WHERE id = ${ROW})`),
      db
        .insert(settings)
        .values({ id: ROW, json, updatedAt: nowMs })
        .onConflictDoNothing({ target: settings.id }),
    ]);
    row = await readRow(db);
    if (!row) throw new Error("settings row missing after seeding");
  }
  return { settings: parseStored(row.json), updatedAt: row.updatedAt, stored: row.json };
}

/**
 * Apply `patch` over the current settings. The result is validated as a
 * whole; an invalid result or an unknown key throws `InvalidSettingsError`
 * and writes nothing. A patch that changes nothing writes nothing.
 */
export async function changeSettings(
  db: Db,
  nowMs: number,
  patch: Record<string, unknown>,
): Promise<StoredSettings> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new InvalidSettingsError([{ path: "", message: "expected an object" }]);
  }
  const current = await load(db, nowMs);
  const parsed = ChangeSchema.safeParse({ ...current.settings, ...patch });
  if (!parsed.success) {
    throw new InvalidSettingsError(
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const before = current.stored;
  const after = JSON.stringify(parsed.data);
  if (after === JSON.stringify(current.settings)) {
    return { settings: current.settings, updatedAt: current.updatedAt };
  }

  // Both statements only apply while the row still holds what was read, so
  // two changes at once cannot lose one or leave history without a change.
  await db.batch([
    db.run(sql`INSERT INTO settings_history (json, changed_at)
      SELECT ${after}, ${nowMs} WHERE EXISTS (SELECT 1 FROM settings WHERE id = ${ROW} AND json = ${before})`),
    db
      .update(settings)
      .set({ json: after, updatedAt: nowMs })
      .where(sql`${settings.id} = ${ROW} AND ${settings.json} = ${before}`),
  ]);
  const row = await readRow(db);
  if (row?.json !== after || row.updatedAt !== nowMs) throw new SettingsConflictError();
  return { settings: parsed.data, updatedAt: nowMs };
}
