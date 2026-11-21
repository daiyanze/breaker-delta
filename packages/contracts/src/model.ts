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

/** Everything a user can tune without touching code. Defaults are proposals. */
export const SettingsSchema = z.object({
  runIntervalMinutes: z.number().int().min(15).default(60),
  waveThreshold: z.number().int().min(2).default(2),
  halfLifeHours: z.number().positive().default(48),
  calmAfterDays: z.number().int().positive().default(7),
  risingPercent24h: z.number().positive().default(50),
  rewriteAfterNewEchoes: z.number().int().positive().default(5),
  summariesPerRun: z.number().int().min(0).default(10),
  reviewWindowDays: z.number().int().positive().default(14),
  languages: z.array(LanguageSchema).min(1).default(["en", "zh", "ja"]),
  keywordsInclude: z.array(z.string()).default([]),
  keywordsExclude: z.array(z.string()).default([]),
  assignProviders: z.array(ProviderSchema).default([]),
  summarizeProviders: z.array(ProviderSchema).default([]),
  feedLimit: z.number().int().positive().default(100),
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
