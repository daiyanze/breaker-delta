/**
 * Private database schema (bd-private): the mailing list and what was sent
 * to it (ADR 0012, #18). Subscriber addresses live here and nowhere else.
 *
 * A separate package from `@bd/db` so content-database code cannot name
 * these tables: no rule in `scripts/check-deps.ts` lets it import
 * `@bd/private-db`. Its migrations are in `packages/private-db/migrations`;
 * `apps/pipeline/test/schema.test.ts` compares them with this file.
 * docs/schema.md describes each table. Times are epoch milliseconds.
 */

import { LanguageSchema, MailKindSchema } from "@bd/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** A Zod enum's values in the non-empty tuple shape drizzle's `enum` takes. */
function values<T extends string>(options: readonly T[]): [T, ...T[]] {
  return options as [T, ...T[]];
}

/** `column IN ('a', 'b')`, for a CHECK that holds an enum drizzle only types. */
function oneOf(column: string, options: readonly string[]) {
  return sql.raw(`${column} IN (${options.map((o) => `'${o}'`).join(", ")})`);
}

/** The two edition emails; a subscriber gets one of them (ADR 0012). */
export const EDITIONS = ["morning", "weekly"] as const;
export const SUBSCRIBER_STATUSES = ["pending", "confirmed", "unsubscribed"] as const;
/** The subscribe form, or an editor adding the address by hand at the desk. */
export const ADDED_VIA = ["form", "desk"] as const;
export const SEND_STATUSES = ["sending", "sent", "held"] as const;
export const DELIVERY_STATUSES = ["queued", "sent", "delivered", "failed", "bounced"] as const;

/** One address on the mailing list. */
export const subscribers = sqliteTable(
  "subscribers",
  {
    id: text("id").primaryKey(),
    /** Normalised by the code that adds it; one row per address. */
    email: text("email").notNull().unique(),
    lang: text("lang", { enum: values(LanguageSchema.options) }).notNull(),
    edition: text("edition", { enum: values(EDITIONS) }).notNull(),
    status: text("status", { enum: values(SUBSCRIBER_STATUSES) })
      .notNull()
      .default("pending"),
    addedVia: text("added_via", { enum: values(ADDED_VIA) }).notNull(),
    /** The editor who added it; set exactly when `addedVia` is "desk". */
    addedBy: text("added_by"),
    addedAt: integer("added_at").notNull(),
    confirmedAt: integer("confirmed_at"),
    unsubscribedAt: integer("unsubscribed_at"),
    /** Bounces since the last delivery that did not bounce. */
    bouncesInARow: integer("bounces_in_a_row").notNull().default(0),
    /** When sending stopped after too many bounces in a row. Null: still sending. */
    stoppedAt: integer("stopped_at"),
  },
  (t) => [
    index("subscribers_list").on(t.status, t.edition),
    check("subscribers_lang", oneOf("lang", LanguageSchema.options)),
    check("subscribers_edition", oneOf("edition", EDITIONS)),
    check("subscribers_status", oneOf("status", SUBSCRIBER_STATUSES)),
    check("subscribers_added_via", oneOf("added_via", ADDED_VIA)),
    check("subscribers_added_by", sql`(added_via = 'desk') = (added_by IS NOT NULL)`),
    check("subscribers_bounces", sql`bounces_in_a_row >= 0`),
  ],
);

/** One email sent to the list: an edition, or a hand-written one from the desk. */
export const sends = sqliteTable(
  "sends",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: values(MailKindSchema.options) }).notNull(),
    /** The edition's day, for the two editions only; each is sent once. */
    editionKey: text("edition_key"),
    /** Hand-written emails only; an edition's subject is written when it is sent. */
    subject: text("subject"),
    status: text("status", { enum: values(SEND_STATUSES) })
      .notNull()
      .default("sending"),
    /** The editor, for a hand-written email or a held edition. */
    createdBy: text("created_by"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("sends_edition").on(t.kind, t.editionKey).where(sql`edition_key IS NOT NULL`),
    index("sends_created").on(t.createdAt),
    check("sends_kind", oneOf("kind", MailKindSchema.options)),
    check("sends_status", oneOf("status", SEND_STATUSES)),
    check("sends_edition_key", sql`(${oneOf("kind", EDITIONS)}) = (edition_key IS NOT NULL)`),
  ],
);

/** One send to one subscriber. The key: the same send never reaches a person twice. */
export const deliveries = sqliteTable(
  "deliveries",
  {
    sendId: text("send_id").notNull(),
    subscriberId: text("subscriber_id").notNull(),
    status: text("status", { enum: values(DELIVERY_STATUSES) })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    /** The transport's short error. Never the address. */
    error: text("error"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sendId, t.subscriberId] }),
    index("deliveries_subscriber").on(t.subscriberId),
    check("deliveries_status", oneOf("status", DELIVERY_STATUSES)),
  ],
);
