/**
 * Pure rules. No IO and no clock: time is always a parameter.
 * See CLAUDE.md "Invariants" before changing anything here.
 */

/** The fields of an echo that the rules need. */
export interface EchoLike {
  id: string;
  /** Fetch group the echo came from. One group = one independent source. */
  groupId: string;
  /** Epoch milliseconds when the echo was first seen. */
  firstSeenAt: number;
  /** Source-native heat (points, stars, upvotes...). Missing heat is 0. */
  heat: number;
}

export interface WaveParams {
  /** Independent sources needed for a topic to count as a wave. */
  waveThreshold: number;
  /** Hours for an echo's contribution to halve. */
  halfLifeHours: number;
}

const HOUR_MS = 3_600_000;

/** Independent sources are counted per fetch group, never per echo. */
export function countIndependentSources(echoes: readonly EchoLike[]): number {
  return new Set(echoes.map((e) => e.groupId)).size;
}

export function isWave(echoes: readonly EchoLike[], params: WaveParams): boolean {
  return countIndependentSources(echoes) >= params.waveThreshold;
}

/**
 * Wave height. PROVISIONAL coefficients: they are fixed in M1 by a follow-up
 * ADR. Two properties must hold for any future formula and are tested:
 *   1. adding an echo from a new independent source never lowers the height;
 *   2. with the same echoes, the height never rises as time passes.
 */
export function waveHeight(echoes: readonly EchoLike[], nowMs: number, params: WaveParams): number {
  if (echoes.length === 0) return 0;
  let sum = 0;
  for (const e of echoes) {
    const ageHours = Math.max(0, (nowMs - e.firstSeenAt) / HOUR_MS);
    const freshness = 0.5 ** (ageHours / params.halfLifeHours);
    const heat = 1 + Math.log10(1 + Math.max(0, e.heat));
    sum += heat * freshness;
  }
  const sources = countIndependentSources(echoes);
  return 10 * sum * (1 + 0.5 * (sources - 1));
}

/**
 * Deterministic id of the run slot that contains `nowMs`, e.g. "20261201T0900".
 * Only letters, digits and "T" so it is valid as a workflow instance id.
 */
export function slotId(nowMs: number, intervalMinutes: number): string {
  const intervalMs = Math.max(1, Math.floor(intervalMinutes)) * 60_000;
  const start = new Date(Math.floor(nowMs / intervalMs) * intervalMs);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(start.getUTCFullYear(), 4)}${p(start.getUTCMonth() + 1)}${p(start.getUTCDate())}` +
    `T${p(start.getUTCHours())}${p(start.getUTCMinutes())}`
  );
}

/** A run is due when the current slot differs from the last one that ran. */
export function isRunDue(lastSlot: string | null, nowMs: number, intervalMinutes: number): boolean {
  return lastSlot !== slotId(nowMs, intervalMinutes);
}
