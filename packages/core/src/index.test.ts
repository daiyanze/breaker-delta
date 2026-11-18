import { describe, expect, test } from "bun:test";
import {
  countIndependentSources,
  DEFAULT_WAVE_PARAMS,
  type EchoLike,
  isRunDue,
  isWave,
  slotId,
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

describe("independent sources", () => {
  test("many echoes from one group count as one source", () => {
    const echoes = [echo("a", "official_blogs"), echo("b", "official_blogs")];
    expect(countIndependentSources(echoes)).toBe(1);
    expect(isWave(echoes, DEFAULT_WAVE_PARAMS)).toBe(false);
  });

  test("two groups make a wave at the default threshold", () => {
    const echoes = [echo("a", "hn"), echo("b", "github")];
    expect(isWave(echoes, DEFAULT_WAVE_PARAMS)).toBe(true);
  });

  test("below the threshold is never a wave, whatever the heat", () => {
    const echoes = [echo("a", "hn", 1_000_000), echo("b", "hn", 1_000_000)];
    expect(isWave(echoes, { ...DEFAULT_WAVE_PARAMS, waveThreshold: 3 })).toBe(false);
  });
});

describe("wave height properties", () => {
  test("empty topic has height 0", () => {
    expect(waveHeight([], T0, DEFAULT_WAVE_PARAMS)).toBe(0);
  });

  test("one more independent source never lowers the height", () => {
    const base = [echo("a", "hn", 120), echo("b", "hn", 5)];
    for (const heat of [0, 1, 50, 10_000]) {
      for (const ageHours of [0, 1, 48, 500]) {
        const extra = echo("c", "github", heat, T0 - ageHours * HOUR);
        const before = waveHeight(base, T0, DEFAULT_WAVE_PARAMS);
        const after = waveHeight([...base, extra], T0, DEFAULT_WAVE_PARAMS);
        expect(after).toBeGreaterThanOrEqual(before);
      }
    }
  });

  test("with no new echoes the height never rises over time", () => {
    const echoes = [echo("a", "hn", 300), echo("b", "github", 40, T0 - 5 * HOUR)];
    let previous = Number.POSITIVE_INFINITY;
    for (let h = 0; h <= 24 * 14; h += 6) {
      const height = waveHeight(echoes, T0 + h * HOUR, DEFAULT_WAVE_PARAMS);
      expect(height).toBeLessThanOrEqual(previous);
      previous = height;
    }
  });

  test("one half-life halves a single echo's contribution", () => {
    const e = [echo("a", "hn", 0)];
    const now = waveHeight(e, T0, DEFAULT_WAVE_PARAMS);
    const later = waveHeight(e, T0 + 48 * HOUR, DEFAULT_WAVE_PARAMS);
    expect(later).toBeCloseTo(now / 2, 10);
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
