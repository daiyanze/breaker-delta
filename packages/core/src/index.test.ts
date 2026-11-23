import { describe, expect, test } from "bun:test";
import {
  countIndependentSources,
  type EchoLike,
  groupHeatReferences,
  type HeatReference,
  isRunDue,
  isWave,
  slotId,
  type WaveParams,
  waveHeight,
} from "./index.ts";

const T0 = Date.UTC(2026, 11, 1, 9, 0, 0);
const HOUR = 3_600_000;
const echo = (id: string, groupId: string, heat = 0, firstSeenAt = T0): EchoLike => ({
  id,
  groupId,
  heat,
  firstSeenAt,
});

/** Callers pass the values from settings; core has no defaults of its own (invariant 9). */
const PARAMS: WaveParams = {
  waveThreshold: 2,
  halfLifeHours: 48,
  heightScale: 10,
  sourceBonus: 0.5,
  maxEchoesPerGroup: 0,
  heatNormalisation: "none",
};

/** The heat reference the property loops pass under "group"; "gitlab" has none. */
const REF: HeatReference = new Map([
  ["hn", 200],
  ["github", 1_500],
  ["lobsters", 0],
]);

/** Every combination of the height knobs (#28) the property tests run over. */
const PARAM_SETS: WaveParams[] = [];
for (const halfLifeHours of [6, 24, 48]) {
  for (const heightScale of [0.5, 10, 100]) {
    for (const sourceBonus of [0, 0.5, 2]) {
      for (const maxEchoesPerGroup of [0, 1, 2]) {
        for (const heatNormalisation of ["none", "group"] as const) {
          PARAM_SETS.push({
            waveThreshold: 2,
            halfLifeHours,
            heightScale,
            sourceBonus,
            maxEchoesPerGroup,
            heatNormalisation,
          });
        }
      }
    }
  }
}

/** The formula before #28, with its two hard-coded coefficients, for comparison. */
function heightBefore28(echoes: readonly EchoLike[], nowMs: number, halfLifeHours: number): number {
  if (echoes.length === 0) return 0;
  let sum = 0;
  for (const e of echoes) {
    const ageHours = Math.max(0, (nowMs - e.firstSeenAt) / HOUR);
    sum += (1 + Math.log10(1 + Math.max(0, e.heat))) * 0.5 ** (ageHours / halfLifeHours);
  }
  return 10 * sum * (1 + 0.5 * (new Set(echoes.map((e) => e.groupId)).size - 1));
}

describe("independent sources", () => {
  test("many echoes from one group count as one source", () => {
    const echoes = [echo("a", "official_blogs"), echo("b", "official_blogs")];
    expect(countIndependentSources(echoes)).toBe(1);
    expect(isWave(echoes, PARAMS)).toBe(false);
  });

  test("reaching the threshold in groups makes a wave", () => {
    const echoes = [echo("a", "hn"), echo("b", "github")];
    expect(isWave(echoes, PARAMS)).toBe(true);
  });

  test("below the threshold is never a wave, whatever the heat", () => {
    const echoes = [echo("a", "hn", 1_000_000), echo("b", "hn", 1_000_000)];
    expect(isWave(echoes, { ...PARAMS, waveThreshold: 3 })).toBe(false);
  });
});

describe("wave height properties", () => {
  test("empty topic has height 0", () => {
    expect(waveHeight([], T0, PARAMS)).toBe(0);
  });

  test("one more independent source never lowers the height, for every parameter set", () => {
    const bases = [
      [echo("a", "hn", 120), echo("b", "hn", 5)],
      [echo("a", "hn", 120), echo("b", "hn", 5, T0 - 30 * HOUR), echo("d", "lobsters", 9)],
    ];
    for (const params of PARAM_SETS) {
      for (const base of bases) {
        for (const group of ["github", "gitlab"]) {
          for (const heat of [0, 1, 50, 10_000]) {
            for (const ageHours of [0, 1, 48, 500]) {
              const extra = echo("c", group, heat, T0 - ageHours * HOUR);
              const before = waveHeight(base, T0, params, REF);
              const after = waveHeight([...base, extra], T0, params, REF);
              expect(after).toBeGreaterThanOrEqual(before);
            }
          }
        }
      }
    }
  });

  test("with no new echoes the height never rises over time, for every parameter set", () => {
    const echoes = [
      echo("a", "hn", 300),
      echo("b", "github", 40, T0 - 5 * HOUR),
      echo("c", "hn", 2_000, T0 - 20 * HOUR),
      echo("d", "hn", 0, T0 + 3 * HOUR),
    ];
    for (const params of PARAM_SETS) {
      let previous = Number.POSITIVE_INFINITY;
      for (let h = 0; h <= 24 * 14; h += 3) {
        const height = waveHeight(echoes, T0 + h * HOUR, params, REF);
        expect(height).toBeLessThanOrEqual(previous);
        previous = height;
      }
    }
  });

  test("the defaults reproduce the formula from before #28", () => {
    const echoes = [
      echo("a", "hn", 300),
      echo("b", "github", 40, T0 - 5 * HOUR),
      echo("c", "hn", 2_000, T0 - 20 * HOUR),
      echo("d", "hn", -3, T0 - 100 * HOUR),
    ];
    for (const halfLifeHours of [6, 24, 48]) {
      for (const h of [0, 1, 24, 200]) {
        const now = T0 + h * HOUR;
        const params = { ...PARAMS, halfLifeHours };
        expect(waveHeight(echoes, now, params)).toBeCloseTo(
          heightBefore28(echoes, now, halfLifeHours),
          9,
        );
      }
    }
    // A fixed number, so a change to the reference function above is caught too.
    expect(waveHeight([echo("a", "hn", 9), echo("b", "github", 99)], T0, PARAMS)).toBeCloseTo(
      75,
      9,
    );
  });

  test("heightScale and sourceBonus enter as written", () => {
    const one = [echo("a", "hn", 0)];
    const two = [echo("a", "hn", 0), echo("b", "github", 0)];
    expect(waveHeight(one, T0, { ...PARAMS, heightScale: 3 })).toBeCloseTo(3, 12);
    expect(waveHeight(two, T0, { ...PARAMS, heightScale: 1, sourceBonus: 0 })).toBeCloseTo(2, 12);
    expect(waveHeight(two, T0, { ...PARAMS, heightScale: 1, sourceBonus: 2 })).toBeCloseTo(6, 12);
  });

  test("maxEchoesPerGroup counts only each group's highest scores", () => {
    const echoes = [
      echo("a", "hn", 9), // 2
      echo("b", "hn", 99), // 3
      echo("c", "hn", 0), // 1
      echo("d", "github", 0), // 1
      echo("e", "github", 999), // 4
    ];
    const p = { ...PARAMS, heightScale: 1, sourceBonus: 0 };
    expect(waveHeight(echoes, T0, { ...p, maxEchoesPerGroup: 0 })).toBeCloseTo(11, 12);
    expect(waveHeight(echoes, T0, { ...p, maxEchoesPerGroup: 1 })).toBeCloseTo(7, 12);
    expect(waveHeight(echoes, T0, { ...p, maxEchoesPerGroup: 2 })).toBeCloseTo(10, 12);
    expect(waveHeight(echoes, T0, { ...p, maxEchoesPerGroup: 5 })).toBeCloseTo(11, 12);
    // The cap ranks by score, freshness included: a fresh cold echo can beat a stale hot one.
    const aged = [echo("a", "hn", 999, T0 - 480 * HOUR), echo("b", "hn", 0)];
    expect(waveHeight(aged, T0, { ...p, maxEchoesPerGroup: 1 })).toBeCloseTo(1, 12);
  });

  test("many echoes from one group add up fully only without a cap", () => {
    const flood = Array.from({ length: 50 }, (_, i) => echo(`f${i}`, "hn", 0));
    const p = { ...PARAMS, heightScale: 1, sourceBonus: 0 };
    expect(waveHeight(flood, T0, p)).toBeCloseTo(50, 9);
    expect(waveHeight(flood, T0, { ...p, maxEchoesPerGroup: 3 })).toBeCloseTo(3, 12);
  });

  test('"group" normalisation divides heat by the group\'s reference', () => {
    const p: WaveParams = { ...PARAMS, heightScale: 1, sourceBonus: 0, heatNormalisation: "group" };
    // 1800 stars against a reference of 200 is the same heat as 9 points against 1.
    const ref = new Map([
      ["github", 200],
      ["hn", 1],
    ]);
    expect(waveHeight([echo("a", "github", 1_800)], T0, p, ref)).toBeCloseTo(2, 12);
    expect(waveHeight([echo("a", "hn", 9)], T0, p, ref)).toBeCloseTo(2, 12);
    // No reference, or 0, for a group: its echoes count with no heat.
    expect(waveHeight([echo("a", "gitlab", 5_000)], T0, p, ref)).toBeCloseTo(1, 12);
    expect(waveHeight([echo("a", "x", 5_000)], T0, p, new Map([["x", 0]]))).toBeCloseTo(1, 12);
    // "none" ignores any reference passed.
    expect(
      waveHeight([echo("a", "hn", 9)], T0, { ...p, heatNormalisation: "none" }, ref),
    ).toBeCloseTo(2, 12);
    expect(
      waveHeight([echo("a", "github", 1_800)], T0, { ...p, heatNormalisation: "none" }, ref),
    ).toBeCloseTo(1 + Math.log10(1_801), 12);
  });

  test('"group" normalisation without a reference is a caller error', () => {
    expect(() =>
      waveHeight([echo("a", "hn", 1)], T0, { ...PARAMS, heatNormalisation: "group" }),
    ).toThrow("heatReference");
  });

  test("one half-life halves a single echo's contribution", () => {
    const e = [echo("a", "hn", 0)];
    const now = waveHeight(e, T0, PARAMS);
    const later = waveHeight(e, T0 + 48 * HOUR, PARAMS);
    expect(later).toBeCloseTo(now / 2, 10);
  });
});

describe("group heat references", () => {
  test("nearest-rank percentile per group", () => {
    const echoes = [
      ...Array.from({ length: 10 }, (_, i) => echo(`h${i}`, "hn", (i + 1) * 10)),
      echo("g1", "github", 5),
      echo("g2", "github", -4),
    ];
    const ref = groupHeatReferences(echoes, 90);
    expect(ref.get("hn")).toBe(90);
    expect(ref.get("github")).toBe(5);
    expect(groupHeatReferences(echoes, 100).get("hn")).toBe(100);
    expect(groupHeatReferences(echoes, 50).get("hn")).toBe(50);
    expect(groupHeatReferences(echoes, 50).get("github")).toBe(0);
    expect(groupHeatReferences([], 90).size).toBe(0);
  });
});

describe("run slots", () => {
  test("slot id is stable inside an interval and valid as an instance id", () => {
    expect(slotId(T0, 60)).toBe("20261201T0900");
    expect(slotId(T0 + 59 * 60_000, 60)).toBe("20261201T0900");
    expect(slotId(T0 + 60 * 60_000, 60)).toBe("20261201T1000");
    expect(slotId(T0 + 20 * 60_000, 15)).toBe("20261201T0915");
    expect(slotId(T0, 60)).toMatch(/^[a-zA-Z0-9_][a-zA-Z0-9-_]*$/);
  });

  test("a run is due once per slot", () => {
    expect(isRunDue(null, T0, 60)).toBe(true);
    expect(isRunDue("20261201T0900", T0 + 30 * 60_000, 60)).toBe(false);
    expect(isRunDue("20261201T0900", T0 + 60 * 60_000, 60)).toBe(true);
  });
});
