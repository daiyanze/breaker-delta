/**
 * The fact gate (ADR 0006, #47). Code decides whether a published summary
 * carries the "unverified" label (invariant 1): the model only flags risks,
 * and code counts the first-hand sources among the echoes the summary cites.
 *
 * - **High risk.** A summary is high-risk when its flags name someone (a
 *   person or a company) and one of the events ADR 0006 lists: an
 *   appointment or dismissal, a lawsuit, an accident or casualty. A name
 *   alone, or an event with no one named, is not high-risk.
 * - **First-hand sources.** Counted per fetch group, as independent sources
 *   are (invariant 3): the distinct groups, among the summary's evidence
 *   echoes, whose tier is `first_hand`. A bundle group counts once.
 * - **Unverified.** High-risk with fewer first-hand sources than
 *   `factGateFirstHandSources`.
 */
import { type Language, type RiskFlag, UNVERIFIED_WORDING } from "@bd/contracts";

/** Flags that name someone. */
export const NAMED_RISK_FLAGS: readonly RiskFlag[] = ["named_person", "named_company"];
/** Flags for the events that make a named story high-risk. */
export const EVENT_RISK_FLAGS: readonly RiskFlag[] = [
  "appointment_or_dismissal",
  "lawsuit",
  "accident_or_casualty",
];

/** Whether a summary's flags make it high-risk: someone named, and one of the events. */
export function isHighRisk(flags: readonly RiskFlag[]): boolean {
  return (
    flags.some((f) => NAMED_RISK_FLAGS.includes(f)) &&
    flags.some((f) => EVENT_RISK_FLAGS.includes(f))
  );
}

/** One echo a summary cites, with what code knows about its fetch group. */
export interface EvidenceSource {
  groupId: string;
  /** True when the group's tier is first-hand (where things appear first). */
  firstHand: boolean;
}

/** First-hand sources among a summary's evidence, counted per fetch group. */
export function countFirstHandSources(evidence: readonly EvidenceSource[]): number {
  return new Set(evidence.filter((e) => e.firstHand).map((e) => e.groupId)).size;
}

/** Whether a summary is published with the "unverified" label. */
export function isUnverified(
  flags: readonly RiskFlag[],
  evidence: readonly EvidenceSource[],
  minFirstHandSources: number,
): boolean {
  return isHighRisk(flags) && countFirstHandSources(evidence) < minFirstHandSources;
}

/** The "unverified" label and note in one language, with the threshold filled in. */
export function unverifiedWording(
  lang: Language,
  minFirstHandSources: number,
): { label: string; note: string } {
  const w = UNVERIFIED_WORDING[lang];
  return { label: w.label, note: w.note.replaceAll("{min}", String(minFirstHandSources)) };
}
