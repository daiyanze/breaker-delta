/**
 * Globals the scripts need from the Workers types, without loading those types
 * as globals: they clash with Bun's (`Response`, `fetch`, ...). Imported as a
 * module, the way Miniflare itself does it.
 */
type D1Database = import("@cloudflare/workers-types/experimental").D1Database;
