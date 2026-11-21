/**
 * Desk read contracts: what the desk reads from `apps/pipeline` (ADR 0010).
 * Subscriber addresses are never part of these shapes; the Mail tab's
 * look-up and export are separate actions for a signed-in editor.
 */
import { z } from "zod";
import { SettingsSchema } from "./model.ts";
import {
  EchoItemSchema,
  IdSchema,
  InstantSchema,
  LocalizedTextSchema,
  OriginalTextSchema,
  OutcomeSchema,
  PredictionSchema,
  SlotSchema,
  SlugSchema,
} from "./read.ts";

const TopicNameFields = {
  slug: SlugSchema,
  headlines: z.array(LocalizedTextSchema),
  sourceHeadline: OriginalTextSchema,
};

export const DeskSettingsSchema = z.object({
  current: SettingsSchema,
  updatedAt: InstantSchema.nullable(),
  /** Newest first. Values are the settings JSON before and after. */
  history: z.array(
    z.object({
      changedAt: InstantSchema,
      changes: z.array(
        z.object({
          key: z.string().min(1),
          from: z.unknown(),
          to: z.unknown(),
        }),
      ),
    }),
  ),
});
export type DeskSettings = z.infer<typeof DeskSettingsSchema>;

/** Outside evidence for a verdict. Fetched by code; the model cites it by id. */
export const EvidenceSchema = z.object({
  id: IdSchema,
  kind: z.enum(["news", "pageviews"]),
  url: z.url(),
  title: OriginalTextSchema,
  publisher: z.string().min(1),
  publishedAt: InstantSchema.nullable(),
});

export const VerdictQueueSchema = z.object({
  items: z.array(
    z.object({
      ...TopicNameFields,
      prediction: PredictionSchema,
      proposed: z.object({
        outcome: OutcomeSchema,
        reason: z.array(LocalizedTextSchema).min(1),
        evidenceIds: z.array(IdSchema),
      }),
      evidence: z.array(EvidenceSchema),
    }),
  ),
});
export type VerdictQueue = z.infer<typeof VerdictQueueSchema>;

export const CorrectionTopicsSchema = z.object({
  items: z.array(
    z.object({
      topicId: IdSchema,
      ...TopicNameFields,
      summaryStatus: z.enum(["published", "withdrawn", "none"]),
      summaryVersion: z.number().int().positive().nullable(),
      publishedAt: InstantSchema.nullable(),
      corrections: z.number().int().nonnegative(),
      recentEchoes: z.array(EchoItemSchema),
    }),
  ),
});
export type CorrectionTopics = z.infer<typeof CorrectionTopicsSchema>;

export const DeskCorrectionsSchema = z.object({
  /** Newest first. */
  items: z.array(
    z.object({
      id: IdSchema,
      kind: z.enum(["correction", "withdrawal", "merge"]),
      at: InstantSchema,
      ...TopicNameFields,
      version: z.number().int().positive().nullable(),
      texts: z.array(LocalizedTextSchema).min(1),
    }),
  ),
});
export type DeskCorrections = z.infer<typeof DeskCorrectionsSchema>;

export const ScanLogSchema = z.object({
  /** Newest first. */
  runs: z.array(
    z.object({
      slot: SlotSchema,
      startedAt: InstantSchema,
      finishedAt: InstantSchema.nullable(),
      status: z.enum(["running", "done", "failed"]),
      groupsOk: z.number().int().nonnegative(),
      groupsFailed: z.array(IdSchema),
      newEchoes: z.number().int().nonnegative(),
      wavesFormed: z.number().int().nonnegative(),
      summariesWritten: z.number().int().nonnegative(),
      /** A short error class, never fetched text. */
      error: z.string().max(200).nullable(),
    }),
  ),
});
export type ScanLog = z.infer<typeof ScanLogSchema>;

export const MailKindSchema = z.enum([
  "morning",
  "weekly",
  "notice",
  "correction",
  "announcement",
  "letter",
]);

export const MailNextSchema = z.object({
  kind: z.enum(["morning", "weekly"]),
  at: InstantSchema,
  recipients: z.number().int().nonnegative(),
  waves: z.number().int().nonnegative(),
  held: z.boolean(),
});

export const DeskMailSchema = z.object({
  transport: z.object({
    name: z.string().min(1).nullable(),
    configured: z.boolean(),
  }),
  /** Null when mail is off. */
  next: MailNextSchema.nullable(),
  /** Newest first. Counts only, no addresses. */
  recentSends: z.array(
    z.object({
      id: IdSchema,
      kind: MailKindSchema,
      subject: z.string().min(1).nullable(),
      at: InstantSchema,
      recipients: z.number().int().nonnegative(),
      delivered: z.number().int().nonnegative(),
      bounced: z.number().int().nonnegative(),
      unsubscribed: z.number().int().nonnegative(),
    }),
  ),
  subscribers: z.object({
    confirmed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    unsubscribed30d: z.number().int().nonnegative(),
    /** Stopped after three bounces in a row. */
    stopped: z.number().int().nonnegative(),
  }),
});
export type DeskMail = z.infer<typeof DeskMailSchema>;

/** The desk's query layer, served by `apps/pipeline` (ADR 0010). */
export interface DeskQueries {
  settings(): Promise<DeskSettings>;
  verdictQueue(): Promise<VerdictQueue>;
  correctionTopics(): Promise<CorrectionTopics>;
  corrections(): Promise<DeskCorrections>;
  scanLog(): Promise<ScanLog>;
  mail(): Promise<DeskMail>;
}
