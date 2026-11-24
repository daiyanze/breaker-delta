import { describe, expect, test } from "bun:test";
import {
  change24h,
  countIndependentSources,
  crossedRising,
  type EchoLike,
  groupHeatReferences,
  type HeatReference,
  isRunDue,
  isWave,
  nextTopicStatus,
  rankByHeight,
  type StateParams,
  type SummaryCandidate,
  type SummaryState,
  selectForSummary,
  summaryDue,
  slotId,
  slotStart,
  type TopicStatus,
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
        expect(waveHeight(echoes, now, params)).toBe(heightBefore28(echoes, now, halfLifeHours));
      }
    }
    // Bit for bit on many sets: the sum keeps the input order when nothing is capped.
    let seed = 7;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const groups = ["hn", "github", "lobsters", "reddit"];
    for (let i = 0; i < 2_000; i++) {
      const set = Array.from({ length: 1 + Math.floor(rand() * 12) }, (_, j) =>
        echo(
          `e${j}`,
          groups[Math.floor(rand() * groups.length)] as string,
          Math.floor(rand() * 50_000),
          T0 - Math.floor(rand() * 200) * HOUR,
        ),
      );
      expect(waveHeight(set, T0, PARAMS)).toBe(heightBefore28(set, T0, PARAMS.halfLifeHours));
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

  test("the nearest rank is ceil(p * n / 100), with no rounding drift", () => {
    for (let n = 1; n <= 200; n++) {
      const echoes = Array.from({ length: n }, (_, i) => echo(`e${i}`, "hn", i + 1));
      for (let p = 50; p <= 100; p++) {
        const rank = Math.max(1, Math.ceil((p * n) / 100));
        expect([n, p, groupHeatReferences(echoes, p).get("hn")]).toEqual([n, p, rank]);
      }
    }
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

describe("topic status", () => {
  const DAY = 24 * HOUR;
  const STATE: StateParams = { waveThreshold: 2, calmAfterDays: 7 };
  const NEW: TopicStatus = { state: "echo", formedAt: null, wentFlatAt: null };
  const two = [echo("a", "hn", 0, T0), echo("b", "github", 0, T0)];

  test("one source stays an echo; a second source forms the wave at now", () => {
    const one = [echo("a", "hn"), echo("c", "hn")];
    expect(nextTopicStatus(NEW, one, T0, STATE)).toEqual(NEW);
    expect(nextTopicStatus(NEW, two, T0 + HOUR, STATE)).toEqual({
      state: "up",
      formedAt: T0 + HOUR,
      wentFlatAt: null,
    });
  });

  test("the threshold comes from the parameters", () => {
    const three = { ...STATE, waveThreshold: 3 };
    expect(nextTopicStatus(NEW, two, T0, three).state).toBe("echo");
    const more = [...two, echo("c", "lobsters")];
    expect(nextTopicStatus(NEW, more, T0, three).state).toBe("up");
  });

  test("formedAt is set once", () => {
    const up: TopicStatus = { state: "up", formedAt: T0, wentFlatAt: null };
    const later = [...two, echo("c", "lobsters", 0, T0 + DAY)];
    expect(nextTopicStatus(up, later, T0 + DAY, STATE).formedAt).toBe(T0);
  });

  test("a wave is never an echo again, even with fewer sources", () => {
    const up: TopicStatus = { state: "up", formedAt: T0, wentFlatAt: null };
    expect(nextTopicStatus(up, [echo("a", "hn", 0, T0)], T0 + HOUR, STATE)).toEqual(up);
    expect(nextTopicStatus(up, [], T0 + HOUR, STATE)).toEqual(up);
  });

  test("a wave goes flat calmAfterDays after its latest activity", () => {
    const up: TopicStatus = { state: "up", formedAt: T0, wentFlatAt: null };
    const late = [...two, echo("c", "hn", 0, T0 + DAY)];
    expect(nextTopicStatus(up, late, T0 + 8 * DAY - 1, STATE).state).toBe("up");
    expect(nextTopicStatus(up, late, T0 + 8 * DAY, STATE)).toEqual({
      state: "flat",
      formedAt: T0,
      wentFlatAt: T0 + 8 * DAY,
    });
  });

  test("formedAt counts as activity: echoes older than the calm window form an up wave", () => {
    const old = [echo("a", "hn", 0, T0), echo("b", "github", 0, T0)];
    const now = T0 + 30 * DAY;
    expect(nextTopicStatus(NEW, old, now, STATE).state).toBe("up");
  });

  test("a flat wave keeps its wentFlatAt, and a new echo brings it back up", () => {
    const flat: TopicStatus = { state: "flat", formedAt: T0, wentFlatAt: T0 + 7 * DAY };
    expect(nextTopicStatus(flat, two, T0 + 20 * DAY, STATE)).toEqual(flat);
    const back = [...two, echo("c", "hn", 0, T0 + 20 * DAY)];
    expect(nextTopicStatus(flat, back, T0 + 20 * DAY, STATE)).toEqual({
      state: "up",
      formedAt: T0,
      wentFlatAt: null,
    });
    const again = nextTopicStatus(
      { state: "up", formedAt: T0, wentFlatAt: null },
      back,
      T0 + 27 * DAY,
      STATE,
    );
    expect(again).toEqual({ state: "flat", formedAt: T0, wentFlatAt: T0 + 27 * DAY });
  });

  test("applying it again at the same time changes nothing", () => {
    const starts: TopicStatus[] = [
      NEW,
      { state: "up", formedAt: T0, wentFlatAt: null },
      { state: "flat", formedAt: T0, wentFlatAt: T0 + 7 * DAY },
    ];
    const sets = [[], [echo("a", "hn")], two, [...two, echo("c", "hn", 0, T0 + 10 * DAY)]];
    for (const start of starts) {
      for (const echoes of sets) {
        for (const now of [T0, T0 + 3 * DAY, T0 + 7 * DAY, T0 + 9 * DAY, T0 + 30 * DAY]) {
          const once = nextTopicStatus(start, echoes, now, STATE);
          expect(nextTopicStatus(once, echoes, now, STATE)).toEqual(once);
        }
      }
    }
  });
});

describe("rank by height", () => {
  test("highest first, ties by id, whatever the input order", () => {
    const topics = [
      { id: "t2", height: 5 },
      { id: "t3", height: 9 },
      { id: "t1", height: 5 },
    ];
    const expected = new Map([
      ["t3", 1],
      ["t1", 2],
      ["t2", 3],
    ]);
    expect(rankByHeight(topics)).toEqual(expected);
    expect(rankByHeight([...topics].reverse())).toEqual(expected);
    expect(rankByHeight([])).toEqual(new Map());
  });
});

describe("rising", () => {
  test("change24h is the percent change from the base; null without a base above 0", () => {
    expect(change24h(150, 100)).toBe(50);
    expect(change24h(50, 100)).toBe(-50);
    expect(change24h(100, 100)).toBe(0);
    expect(change24h(10, null)).toBeNull();
    expect(change24h(10, 0)).toBeNull();
    expect(change24h(10, -5)).toBeNull();
    expect(change24h(10, Number.NaN)).toBeNull();
  });

  test("crosses when now reaches the line and the previous run did not", () => {
    expect(crossedRising(50, 49.9, 50)).toBe(true);
    expect(crossedRising(80, null, 50)).toBe(true);
    expect(crossedRising(49.9, null, 50)).toBe(false);
    expect(crossedRising(null, null, 50)).toBe(false);
    expect(crossedRising(80, 50, 50)).toBe(false);
    expect(crossedRising(80, 60, 70)).toBe(true);
  });

  test("two runs in a row never both cross, whatever the values", () => {
    const values = [null, -100, -10, 0, 10, 49, 50, 51, 100, 1000];
    for (const line of [10, 50, 100]) {
      for (const a of values) {
        for (const b of values) {
          for (const c of values) {
            expect(crossedRising(c, b, line) && crossedRising(b, a, line)).toBe(false);
          }
        }
      }
    }
  });
});

describe("slot start", () => {
  test("is the start of the slot slotId names", () => {
    for (const interval of [15, 60, 180]) {
      for (const offset of [0, 7 * 60_000, 59 * 60_000, 25 * HOUR]) {
        const slot = slotId(T0 + offset, interval);
        expect(slotId(slotStart(slot), interval)).toBe(slot);
        expect(slotStart(slot)).toBeLessThanOrEqual(T0 + offset);
      }
    }
    expect(slotStart("20261201T0900")).toBe(T0);
  });

  test("refuses anything that is not a slot id", () => {
    for (const bad of ["", "20261201", "20261301T0900", "20261131T0900", "20261201T2400", "x"]) {
      expect(() => slotStart(bad)).toThrow("not a slot id");
    }
  });
});

describe("summary due", () => {
  const base: SummaryState = { formedAt: T0, publishedAt: null, newEchoesAt: [], failedAt: null };

  test("a wave with no published summary is due as formed, since it formed", () => {
    expect(summaryDue(base, 5)).toEqual({ reason: "formed", dueAt: T0 });
  });

  test("after a summary, due once rewriteAfterNewEchoes echoes are new, since the last of them", () => {
    const s = { ...base, publishedAt: T0 + HOUR };
    const at = [5, 3, 2, 4].map((h) => T0 + h * HOUR);
    expect(summaryDue({ ...s, newEchoesAt: at.slice(0, 3) }, 4)).toBeNull();
    expect(summaryDue({ ...s, newEchoesAt: at }, 4)).toEqual({
      reason: "new_echoes",
      dueAt: T0 + 5 * HOUR,
    });
    // More echoes than needed: due when the fourth arrived, not the last.
    expect(summaryDue({ ...s, newEchoesAt: [...at, T0 + 9 * HOUR] }, 4)).toEqual({
      reason: "new_echoes",
      dueAt: T0 + 5 * HOUR,
    });
    expect(summaryDue({ ...s, newEchoesAt: [] }, 1)).toBeNull();
  });

  test("a failed attempt moves the wait to that attempt, never earlier", () => {
    expect(summaryDue({ ...base, failedAt: T0 + 2 * HOUR }, 5)).toEqual({
      reason: "formed",
      dueAt: T0 + 2 * HOUR,
    });
    expect(summaryDue({ ...base, formedAt: T0 + 3 * HOUR, failedAt: T0 }, 5)).toEqual({
      reason: "formed",
      dueAt: T0 + 3 * HOUR,
    });
  });
});

describe("select for summary", () => {
  const c = (id: string, height: number, dueAt = T0): SummaryCandidate => ({
    id,
    height,
    dueAt,
    reason: "formed",
  });

  test("highest first among topics due in the same run, ties by id, cut at the budget", () => {
    const all = [c("t2", 5), c("t3", 9), c("t1", 5), c("t4", 1)];
    const expected = { selected: ["t3", "t1", "t2"], waiting: ["t4"] };
    const ids = (r: ReturnType<typeof selectForSummary>) => ({
      selected: r.selected.map((x) => x.id),
      waiting: r.waiting.map((x) => x.id),
    });
    expect(ids(selectForSummary(all, 3))).toEqual(expected);
    expect(ids(selectForSummary([...all].reverse(), 3))).toEqual(expected);
    expect(ids(selectForSummary(all, 0))).toEqual({ selected: [], waiting: ["t3", "t1", "t2", "t4"] });
    expect(ids(selectForSummary(all, 10))).toEqual({ selected: ["t3", "t1", "t2", "t4"], waiting: [] });
  });

  test("a topic that waited goes before one due later, whatever their heights", () => {
    const r = selectForSummary([c("new", 100, T0 + HOUR), c("old", 1, T0)], 1);
    expect(r.selected.map((x) => x.id)).toEqual(["old"]);
  });

  test("topics over budget are selected in the next run, before topics newly due then", () => {
    const run1 = selectForSummary([c("a", 4), c("b", 3), c("c", 2), c("d", 1)], 3);
    expect(run1.waiting.map((x) => x.id)).toEqual(["d"]);
    const run2 = selectForSummary([...run1.waiting, c("e", 99, T0 + HOUR)], 1);
    expect(run2.selected.map((x) => x.id)).toEqual(["d"]);
  });

  test("nothing selected was due later than a topic left waiting, whatever the input", () => {
    const heights = [0, 1, 5, 5, 40];
    const dues = [T0, T0 + HOUR, T0 + 2 * HOUR];
    const all: SummaryCandidate[] = [];
    for (const [i, h] of heights.entries()) {
      for (const [j, d] of dues.entries()) all.push(c(`t${i}${j}`, h, d));
    }
    for (let shift = 0; shift < all.length; shift++) {
      const input = [...all.slice(shift), ...all.slice(0, shift)];
      for (const budget of [0, 1, 4, 7, 15, 20]) {
        const r = selectForSummary(input, budget);
        expect(r.selected.length).toBe(Math.min(budget, all.length));
        expect(r.selected.length + r.waiting.length).toBe(all.length);
        for (const s of r.selected) {
          for (const w of r.waiting) {
            expect(s.dueAt < w.dueAt || (s.dueAt === w.dueAt && s.height >= w.height)).toBe(true);
          }
        }
        expect(r).toEqual(selectForSummary(all, budget));
      }
    }
  });
});
