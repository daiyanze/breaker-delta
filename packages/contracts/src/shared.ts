/** Enums shared by the model contracts and the read contracts. */
import { z } from "zod";

export const LanguageSchema = z.enum(["en", "zh", "ja"]);
export type Language = z.infer<typeof LanguageSchema>;

/** Kinds of rows in the change feed (ADR 0014). */
export const ChangeTypeSchema = z.enum([
  "wave_formed",
  "wave_rising",
  "summary_updated",
  "corrected",
  "withdrawn",
  "verdict",
  "went_flat",
]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;
