/** Model contracts: what a tool-less model call must return (ADR 0003). */
import { z } from "zod";
import { LanguageSchema } from "./shared.ts";

/** One model endpoint. Protocol: OpenAI-compatible chat completions. */
export const ProviderSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  /** Name of the secret/env var holding the key. The key itself is never stored. */
  apiKeyRef: z.string().min(1).optional(),
  model: z.string().min(1),
});
export type Provider = z.infer<typeof ProviderSchema>;

/** "HH:MM", 24-hour clock. */
const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * An IANA time zone name the runtime knows, e.g. "Asia/Tokyo" or "UTC".
 * Runtimes differ in what else they accept ("JST", "+09:00", "asia/tokyo"),
 * so the name's shape is checked first: a value saved on one runtime must
 * load on the other. (Comparing with `resolvedOptions().timeZone` would not
 * help: V8 rewrites some valid names, Bun does not.)
 */
const TimeZoneSchema = z.string().refine(
  (tz) => {
    if (tz !== "UTC" && !/^[A-Z][A-Za-z_]*(\/[A-Z][A-Za-z0-9_+-]*)+$/.test(tz)) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "not an IANA time zone name" },
);

/**
 * Everything a user can tune without touching code. docs/settings.md says
 * why each default was chosen and who decided it: the owner, the agent's
 * proposal, or inherited and unreviewed.
 */
export const SettingsSchema = z.object({
  runIntervalMinutes: z.number().int().min(15).default(60),
  waveThreshold: z.number().int().min(2).default(3),
  halfLifeHours: z.number().positive().default(24),
  /** Wave height: multiplies the whole height (#28). */
  heightScale: z.number().positive().max(1000).default(10),
  /** Wave height: extra weight per independent source after the first (#28). */
  sourceBonus: z.number().min(0).max(10).default(0.5),
  /** Wave height: echo scores counted per fetch group, highest first. 0: all (#28). */
  maxEchoesPerGroup: z.number().int().min(0).max(100).default(0),
  /** Wave height: "group" divides heat by the group's reference heat (#28). */
  heatNormalisation: z.enum(["none", "group"]).default("none"),
  /** Wave height: the percentile of a group's recent heat used as its reference under "group" (#28). */
  heatReferencePercentile: z.number().int().min(50).max(100).default(90),
  calmAfterDays: z.number().int().positive().default(7),
  risingPercent24h: z.number().positive().default(50),
  rewriteAfterNewEchoes: z.number().int().positive().default(5),
  summariesPerRun: z.number().int().min(0).default(3),
  reviewWindowDays: z.number().int().positive().default(14),
  languages: z.array(LanguageSchema).min(1).default(["en", "zh", "ja"]),
  keywordsInclude: z.array(z.string()).default([]),
  keywordsExclude: z.array(z.string()).default([]),
  assignProviders: z.array(ProviderSchema).default([]),
  summarizeProviders: z.array(ProviderSchema).default([]),
  feedLimit: z.number().int().positive().default(100),
  /** The site's time zone: day boundaries, labels and the mail send time. */
  timeZone: TimeZoneSchema.default("Asia/Tokyo"),
  /** When the edition mail goes out, in `timeZone`; everyone at the same moment. */
  mailSendTime: ClockTimeSchema.default("08:00"),
  /** Attempts per pipeline step before the run is marked failed. */
  stepMaxAttempts: z.number().int().min(1).max(10).default(3),
  /** How long a runner holds a run; it renews after each step. Longer than the slowest step. */
  runLeaseMinutes: z.number().int().min(1).default(30),
  /** Per attempt to fetch one source URL in the scan step, or one page in enrich, reading the body included. */
  fetchTimeoutSeconds: z.number().int().min(1).max(120).default(20),
  /** Attempts after the first for a source URL that may answer next time (network error, 429, 5xx). */
  fetchRetries: z.number().int().min(0).max(5).default(2),
  /** Wait before a source URL's first retry; doubled before each next one. */
  fetchRetryDelaySeconds: z.number().min(0).max(60).default(2),
  /** New echoes per assign model call. */
  assignBatchSize: z.number().int().min(1).max(100).default(20),
  /** Most existing topics offered to the assign model per call. 0: every echo starts a new topic. */
  assignShortlistSize: z.number().int().min(0).max(200).default(30),
  /** A topic can be shortlisted while its latest activity (the later of its latest echo and its creation) is at most this old. */
  assignActivityDays: z.number().int().min(1).default(7),
  /** Days after it was last seen that an echo of a topic that never became a wave is removed. */
  echoRetentionDays: z.number().int().min(1).default(30),
  /** Days after its slot that a scan's raw responses are removed from blob storage. */
  rawRetentionDays: z.number().int().min(1).default(30),
  /** Days the run report (`/__report`, #53) covers: the current UTC day and the ones before it. */
  reportWindowDays: z.number().int().min(1).max(90).default(7),
  /** Enrich: evidence pages fetched per selected wave at most. 0: none (#45). */
  enrichPagesPerTopic: z.number().int().min(0).max(10).default(3),
  /** Enrich: evidence pages fetched per run at most, over every selected wave (#45). */
  enrichPagesPerRun: z.number().int().min(0).max(100).default(9),
  /** Enrich: characters of text kept per page (#45). */
  enrichPageMaxChars: z.number().int().min(200).max(20000).default(4000),
  /** Enrich: kilobytes of a page's body read at most; the rest is not downloaded (#45). */
  enrichPageMaxKB: z.number().int().min(16).max(10240).default(1024),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** A fetched item before it is stored. Produced by source adapters. */
export const EchoInputSchema = z.object({
  url: z.string().url(),
  groupId: z.string().min(1),
  title: z.string().min(1).max(500),
  summary: z.string().max(2000).optional(),
  heat: z.number().min(0).default(0),
  publishedAt: z.string().datetime().optional(),
});
export type EchoInput = z.infer<typeof EchoInputSchema>;

/** assign: each new echo goes to one shortlisted topic or a new topic. */
export const AssignResultSchema = z.object({
  assignments: z.array(
    z.union([
      z.object({ echoId: z.string(), topicId: z.string() }),
      z.object({ echoId: z.string(), newTopic: z.object({ name: z.string().min(1).max(120) }) }),
    ]),
  ),
});
export type AssignResult = z.infer<typeof AssignResultSchema>;

export const RiskFlagSchema = z.enum([
  "named_person",
  "named_company",
  "appointment_or_dismissal",
  "lawsuit",
  "accident_or_casualty",
]);

/** summarize: per-language text that cites echoes by id only. */
export const SummarizeResultSchema = z.object({
  texts: z.array(
    z.object({
      lang: LanguageSchema,
      title: z.string().min(1).max(160),
      body: z.string().min(1).max(1200),
    }),
  ),
  evidenceEchoIds: z.array(z.string()).min(1),
  riskFlags: z.array(RiskFlagSchema).default([]),
  /** Only on the first summary of a topic, when it becomes a wave. */
  criterion: z.string().min(1).max(600).optional(),
});
export type SummarizeResult = z.infer<typeof SummarizeResultSchema>;

/** verdict: outcome of the 14-day review, citing evidence by id only. */
export const VerdictResultSchema = z.object({
  result: z.enum(["hit", "partial", "miss", "undetermined"]),
  evidenceIds: z.array(z.string()),
  reason: z.string().min(1).max(600),
});
export type VerdictResult = z.infer<typeof VerdictResultSchema>;
