import { describe, expect, test } from "bun:test";
import {
  LanguageSchema,
  type RiskFlag,
  RiskFlagSchema,
  SettingsSchema,
  UNVERIFIED_WORDING,
} from "@bd/contracts";
import {
  countFirstHandSources,
  EVENT_RISK_FLAGS,
  type EvidenceSource,
  isHighRisk,
  isUnverified,
  NAMED_RISK_FLAGS,
  unverifiedWording,
} from "./index.ts";

const MIN = SettingsSchema.parse({}).factGateFirstHandSources;
const first = (groupId: string): EvidenceSource => ({ groupId, firstHand: true });
const relay = (groupId: string): EvidenceSource => ({ groupId, firstHand: false });

/** Every subset of the contract's flags. */
function allFlagSets(): RiskFlag[][] {
  const flags = RiskFlagSchema.options;
  const out: RiskFlag[][] = [];
  for (let mask = 0; mask < 1 << flags.length; mask++) {
    out.push(flags.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

describe("fact gate (ADR 0006, #47)", () => {
  test("the default threshold is two first-hand sources", () => {
    expect(MIN).toBe(2);
  });

  test("high risk: someone named and one of the listed events", () => {
    expect(isHighRisk(["named_person", "lawsuit"])).toBe(true);
    expect(isHighRisk(["named_company", "accident_or_casualty"])).toBe(true);
    expect(isHighRisk(["named_person", "appointment_or_dismissal"])).toBe(true);
    expect(isHighRisk([])).toBe(false);
    expect(isHighRisk(["named_person", "named_company"])).toBe(false);
    expect(isHighRisk(["lawsuit", "accident_or_casualty"])).toBe(false);
  });

  test("every flag in the contract is either a name or an event", () => {
    const known = new Set([...NAMED_RISK_FLAGS, ...EVENT_RISK_FLAGS]);
    expect([...known].sort()).toEqual([...RiskFlagSchema.options].sort());
  });

  test("first-hand sources are counted per fetch group, relaying ones not at all", () => {
    expect(countFirstHandSources([])).toBe(0);
    // A bundle group's many echoes count once (invariant 3).
    expect(countFirstHandSources([first("blogs"), first("blogs"), first("blogs")])).toBe(1);
    expect(countFirstHandSources([first("blogs"), first("github"), relay("news")])).toBe(2);
    expect(countFirstHandSources([relay("news"), relay("reddit")])).toBe(0);
  });

  test("a high-risk summary with fewer than two first-hand sources is unverified", () => {
    const risky: RiskFlag[] = ["named_person", "appointment_or_dismissal"];
    expect(isUnverified(risky, [], MIN)).toBe(true);
    expect(isUnverified(risky, [first("blogs"), first("blogs")], MIN)).toBe(true);
    expect(isUnverified(risky, [first("blogs"), relay("news"), relay("reddit")], MIN)).toBe(true);
    expect(isUnverified(risky, [first("blogs"), first("github")], MIN)).toBe(false);
  });

  test("a summary that is not high-risk is never unverified", () => {
    expect(isUnverified(["named_company"], [], MIN)).toBe(false);
    expect(isUnverified(["lawsuit"], [relay("news")], MIN)).toBe(false);
  });

  test("the threshold comes from the setting", () => {
    const risky: RiskFlag[] = ["named_company", "lawsuit"];
    const two = [first("a"), first("b")];
    expect(isUnverified(risky, two, 2)).toBe(false);
    expect(isUnverified(risky, two, 3)).toBe(true);
    expect(isUnverified(risky, [first("a")], 1)).toBe(false);
  });

  test("property: unverified exactly when high-risk and short of first-hand sources", () => {
    const evidenceSets: EvidenceSource[][] = [
      [],
      [relay("x")],
      [first("a")],
      [first("a"), first("a"), relay("x")],
      [first("a"), first("b")],
      [first("a"), first("b"), first("c"), relay("x")],
    ];
    for (const flags of allFlagSets()) {
      for (const evidence of evidenceSets) {
        for (const min of [1, 2, 3, 10]) {
          const want = isHighRisk(flags) && countFirstHandSources(evidence) < min;
          expect(isUnverified(flags, evidence, min)).toBe(want);
          // Adding a first-hand source from a new group never makes it unverified.
          if (!isUnverified(flags, evidence, min)) {
            expect(isUnverified(flags, [...evidence, first("new")], min)).toBe(false);
          }
          // Adding a relaying source never changes the result.
          expect(isUnverified(flags, [...evidence, relay("new")], min)).toBe(
            isUnverified(flags, evidence, min),
          );
        }
      }
    }
  });

  test("the neutral wording exists in every language, with the threshold filled in", () => {
    for (const lang of LanguageSchema.options) {
      expect(UNVERIFIED_WORDING[lang].label.length).toBeGreaterThan(0);
      expect(UNVERIFIED_WORDING[lang].note).toContain("{min}");
      const w = unverifiedWording(lang, 3);
      expect(w.label).toBe(UNVERIFIED_WORDING[lang].label);
      expect(w.note).toContain("3");
      expect(w.note).not.toContain("{min}");
    }
    expect(unverifiedWording("en", 2).note).toBe(
      "We could not confirm this with 2 first-hand sources. The wording below says only what was reported and by whom.",
    );
  });
});
