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
  /** Multiplies the whole height. Positive. */
  heightScale: number;
  /** Extra weight per independent source after the first. 0 or more. */
  sourceBonus: number;
  /** Echo scores counted per fetch group, highest first. 0: every echo counts. */
  maxEchoesPerGroup: number;
  /**
   * "none": heat in the source's own units (points, stars...).
   * "group": heat divided by the group's reference heat (`HeatReference`).
   */
  heatNormalisation: "none" | "group";
}

/**
 * Reference heat per fetch group, by group id: what "a lot of heat" means in
 * that group's units. Derived data, not a setting: the caller computes it
 * (for example with `groupHeatReferences` over the group's recent echoes)
 * and passes it in. Core only divides by it.
 */
export type HeatReference = ReadonlyMap<string, number>;

const HOUR_MS = 3_600_000;

/** Independent sources are counted per fetch group, never per echo. */
export function countIndependentSources(echoes: readonly EchoLike[]): number {
  return new Set(echoes.map((e) => e.groupId)).size;
}

export function isWave(echoes: readonly EchoLike[], params: WaveParams): boolean {
  return countIndependentSources(echoes) >= params.waveThreshold;
}

/**
 * Wave height. The coefficients come from settings (#28); their values are
 * fixed by a follow-up ADR. Two properties must hold for every parameter set
 * and are tested:
 *   1. adding an echo from a new independent source never lowers the height;
 *   2. with the same echoes, the height never rises as time passes.
 *
 * Per echo: score = (1 + log10(1 + heat')) * 0.5^(ageHours / halfLifeHours),
 * where heat' is the echo's heat, or heat / reference for its group when
 * `heatNormalisation` is "group" (0 when the group has no positive
 * reference). Per group, only the `maxEchoesPerGroup` highest scores count
 * (all when 0). Height = heightScale * sum * (1 + sourceBonus * (sources - 1)).
 *
 * `heatReference` is required when `heatNormalisation` is "group" and
 * ignored otherwise. It is an input: the height of a fixed set of echoes
 * changes when the caller passes a different reference.
 */
export function waveHeight(
  echoes: readonly EchoLike[],
  nowMs: number,
  params: WaveParams,
  heatReference?: HeatReference,
): number {
  if (echoes.length === 0) return 0;
  if (params.heatNormalisation === "group" && heatReference === undefined) {
    throw new Error('waveHeight: heatNormalisation "group" needs a heatReference');
  }
  const scoresByGroup = new Map<string, number[]>();
  let sum = 0;
  for (const e of echoes) {
    const ageHours = Math.max(0, (nowMs - e.firstSeenAt) / HOUR_MS);
    const freshness = 0.5 ** (ageHours / params.halfLifeHours);
    const rawHeat = Math.max(0, e.heat);
    let heat = rawHeat;
    if (params.heatNormalisation === "group") {
      const ref = heatReference?.get(e.groupId) ?? 0;
      heat = ref > 0 ? rawHeat / ref : 0;
    }
    const score = (1 + Math.log10(1 + heat)) * freshness;
    // Uncapped, add in input order, so the defaults give the old formula's
    // numbers bit for bit (#28).
    if (params.maxEchoesPerGroup === 0) sum += score;
    const scores = scoresByGroup.get(e.groupId);
    if (scores) scores.push(score);
    else scoresByGroup.set(e.groupId, [score]);
  }
  if (params.maxEchoesPerGroup > 0) {
    for (const scores of scoresByGroup.values()) {
      scores.sort((a, b) => b - a);
      for (const s of scores.slice(0, params.maxEchoesPerGroup)) sum += s;
    }
  }
  const sources = scoresByGroup.size;
  return params.heightScale * sum * (1 + params.sourceBonus * (sources - 1));
}

/**
 * Reference heat per group: the `percentile` (0 to 100, nearest rank) of the
 * heats of the given echoes in each group. Negative heat counts as 0. The
 * caller chooses which echoes (for example a group's echoes of the last few
 * days); a group whose reference is 0 gets no heat under "group".
 */
export function groupHeatReferences(
  echoes: readonly Pick<EchoLike, "groupId" | "heat">[],
  percentile: number,
): Map<string, number> {
  const heats = new Map<string, number[]>();
  for (const e of echoes) {
    const list = heats.get(e.groupId);
    const h = Math.max(0, e.heat);
    if (list) list.push(h);
    else heats.set(e.groupId, [h]);
  }
  const p = Math.min(100, Math.max(0, percentile));
  const out = new Map<string, number>();
  for (const [group, list] of heats) {
    list.sort((a, b) => a - b);
    const rank = Math.max(1, Math.ceil((p * list.length) / 100));
    out.set(group, list[rank - 1] as number);
  }
  return out;
}

/** echo: not a wave yet; up: a wave; flat: a wave that has gone flat. */
export type TopicState = "echo" | "up" | "flat";

/** What a topic carries from one run to the next. Times are epoch ms. */
export interface TopicStatus {
  state: TopicState;
  /** When it first became a wave; null while it never was one. */
  formedAt: number | null;
  /** When it last went flat; null unless it is flat now. */
  wentFlatAt: number | null;
}

export interface StateParams {
  waveThreshold: number;
  /** Days without a new echo after which a wave goes flat. */
  calmAfterDays: number;
}

const DAY_MS = 86_400_000;

/**
 * A topic's status at `nowMs`, from its status at the previous run and all
 * of its echoes now.
 *
 * - echo -> up when its echoes come from `waveThreshold` independent
 *   sources. `formedAt` is set once and never changes after.
 * - A topic that was ever a wave is never an echo again, even when a split
 *   or a reassignment leaves it fewer sources: its summary and prediction
 *   stay.
 * - up -> flat when its latest activity (the later of its latest echo and
 *   `formedAt`) is `calmAfterDays` or more before `nowMs`.
 * - flat -> up when a newer echo brings its latest activity back inside
 *   `calmAfterDays`; `wentFlatAt` is cleared, and set again if it goes flat
 *   again.
 *
 * Applying it again at the same `nowMs` to its own result returns that
 * result unchanged, so a step that is retried writes the same values.
 */
export function nextTopicStatus(
  prev: TopicStatus,
  echoes: readonly EchoLike[],
  nowMs: number,
  params: StateParams,
): TopicStatus {
  const wasWave = prev.formedAt !== null;
  if (!wasWave && countIndependentSources(echoes) < params.waveThreshold) {
    return { state: "echo", formedAt: null, wentFlatAt: null };
  }
  const formedAt = prev.formedAt ?? nowMs;
  let lastActive = formedAt;
  for (const e of echoes) lastActive = Math.max(lastActive, e.firstSeenAt);
  if (nowMs - lastActive >= params.calmAfterDays * DAY_MS) {
    const wentFlatAt = prev.state === "flat" && prev.wentFlatAt !== null ? prev.wentFlatAt : nowMs;
    return { state: "flat", formedAt, wentFlatAt };
  }
  return { state: "up", formedAt, wentFlatAt: null };
}

/**
 * Ranks 1, 2, ... by height, highest first; equal heights are ordered by id
 * so the ranking never depends on input order.
 */
export function rankByHeight(
  topics: readonly { id: string; height: number }[],
): Map<string, number> {
  const sorted = [...topics].sort(
    (a, b) => b.height - a.height || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return new Map(sorted.map((t, i) => [t.id, i + 1]));
}

/**
 * A wave's height change, in percent, from `base` (its height 24 hours
 * earlier) to `height`. Null when there is no base: the wave was not up
 * then, or its height was not above 0.
 */
export function change24h(height: number, base: number | null): number | null {
  if (base === null || !(base > 0)) return null;
  return ((height - base) / base) * 100;
}

/**
 * Whether a wave crossed the rising line in this run: its 24-hour change
 * (`change24h`) reaches `risingPercent` now and did not at the previous run
 * (null counts as not reaching it). A wave that stays above the line is not
 * counted again until it falls below and crosses again, so two runs in a row
 * never both cross.
 */
export function crossedRising(
  now: number | null,
  previous: number | null,
  risingPercent: number,
): boolean {
  const reaches = (c: number | null) => c !== null && c >= risingPercent;
  return reaches(now) && !reaches(previous);
}

/** Epoch ms of the start of a slot from `slotId`; throws on anything else. */
export function slotStart(slot: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(slot);
  if (!m) throw new Error(`slotStart: not a slot id: ${slot}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(ms);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) {
    throw new Error(`slotStart: not a slot id: ${slot}`);
  }
  return ms;
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

export { normaliseUrl } from "./url.ts";
