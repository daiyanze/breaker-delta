/** The compute step (M1-13, #29) on an in-memory database. */
import { describe, expect, test } from "bun:test";
import { type EchoLike, slotStart, type WaveParams, waveHeight } from "@bd/core";
import { drizzleOver } from "@bd/db";
import { type ComputeOutput, computeStep } from "../src/core/compute.ts";
import type { StepContext } from "../src/core/runner.ts";
import { changeSettings, readSettings } from "../src/core/settings.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** The time the step computes at: the slot's start, not the clock. */
const T = slotStart(SLOT);
const EARLIER = "20261118T0500";
const LATER = "20261119T0600";

/** The default height settings, as the step passes them to core. */
const HEIGHT: WaveParams = {
  waveThreshold: 3,
  halfLifeHours: 24,
  heightScale: 10,
  sourceBonus: 0.5,
  maxEchoesPerGroup: 0,
  heatNormalisation: "none",
};

function setup() {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(db);
  const ctx = (slot = SLOT, now = NOW): StepContext => ({
    slot,
    db: orm,
    now: () => now,
    outputs: new Map(),
  });
  const run = async (slot = SLOT, now = NOW) =>
    (await computeStep().run(ctx(slot, now))) as ComputeOutput;

  const topic = (
    id: string,
    o: { state?: string; formedAt?: number; wentFlatAt?: number; mergedInto?: string } = {},
  ) =>
    sqlite.run(
      `INSERT INTO topics (id, slug, name, state, created_at, formed_at, went_flat_at, merged_into)
       VALUES (?1, ?1, ?1, ?2, 0, ?3, ?4, ?5)`,
      [id, o.state ?? "echo", o.formedAt ?? null, o.wentFlatAt ?? null, o.mergedInto ?? null],
    );
  /** An echo in `group`, first seen at `seenAt` in `slot`, with heat rows by slot. */
  const echo = (
    id: string,
    topicId: string | null,
    group: string,
    seenAt: number,
    slot = SLOT,
    heats: Record<string, number> = {},
  ) => {
    sqlite.run(
      `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
       VALUES (?1, ?2, ?3, 't', ?4, ?5, ?6)`,
      [id, `https://x.test/${id}`, group, seenAt, slot, topicId],
    );
    for (const [s, heat] of Object.entries(heats)) {
      sqlite.run("INSERT INTO echo_metrics (echo_id, slot, heat, seen_at) VALUES (?1, ?2, ?3, 0)", [
        id,
        s,
        heat,
      ]);
    }
  };
  const points = (slot = SLOT) =>
    sqlite
      .query(
        `SELECT topic_id, state, height, rank, source_count, echo_count FROM wave_points
         WHERE slot = ?1 ORDER BY topic_id`,
      )
      .all(slot) as {
      topic_id: string;
      state: string;
      height: number;
      rank: number | null;
      source_count: number;
      echo_count: number;
    }[];
  const topicRows = () =>
    sqlite.query("SELECT id, state, formed_at, went_flat_at FROM topics ORDER BY id").all() as {
      id: string;
      state: string;
      formed_at: number | null;
      went_flat_at: number | null;
    }[];
  const allPoints = () => sqlite.query("SELECT * FROM wave_points ORDER BY slot, topic_id").all();
  return { sqlite, orm, run, topic, echo, points, topicRows, allPoints };
}

/** Three echoes from three groups: a wave under the default threshold of 3. */
function threeSources(t: ReturnType<typeof setup>, topicId: string, seenAt = T + 60_000) {
  t.echo(`${topicId}-a`, topicId, "hn", seenAt);
  t.echo(`${topicId}-b`, topicId, "lobsters", seenAt);
  t.echo(`${topicId}-c`, topicId, "github", seenAt);
}

describe("state transitions", () => {
  test("an echo topic below the threshold stays an echo, with no rank", async () => {
    const t = setup();
    t.topic("t1");
    t.echo("e1", "t1", "hn", T + 60_000);
    t.echo("e2", "t1", "lobsters", T + 60_000);
    t.echo("e3", "t1", "hn", T + 60_000);
    const out = await t.run();
    expect(out).toEqual({ topics: 1, up: 0, formed: [], wentFlat: [] });
    expect(t.points()).toEqual([
      {
        topic_id: "t1",
        state: "echo",
        height: expect.any(Number),
        rank: null,
        source_count: 2,
        echo_count: 3,
      },
    ]);
    expect(t.topicRows()).toEqual([
      { id: "t1", state: "echo", formed_at: null, went_flat_at: null },
    ]);
  });

  test("echo -> up at the threshold: formed at the slot's start, ranked", async () => {
    const t = setup();
    t.topic("t1");
    threeSources(t, "t1");
    const out = await t.run();
    expect(out).toEqual({ topics: 1, up: 1, formed: ["t1"], wentFlat: [] });
    expect(t.points()).toMatchObject([{ topic_id: "t1", state: "up", rank: 1, source_count: 3 }]);
    expect(t.topicRows()).toEqual([{ id: "t1", state: "up", formed_at: T, went_flat_at: null }]);
  });

  test("the threshold comes from settings", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { waveThreshold: 2 });
    t.topic("t1");
    t.echo("e1", "t1", "hn", T);
    t.echo("e2", "t1", "lobsters", T);
    expect((await t.run()).formed).toEqual(["t1"]);
  });

  test("up -> flat calmAfterDays after the latest echo", async () => {
    const t = setup();
    t.topic("t1", { state: "up", formedAt: T - 10 * DAY });
    threeSources(t, "t1", T - 7 * DAY);
    const out = await t.run();
    expect(out).toEqual({ topics: 1, up: 0, formed: [], wentFlat: ["t1"] });
    expect(t.points()).toMatchObject([{ topic_id: "t1", state: "flat", rank: null }]);
    expect(t.topicRows()).toEqual([
      { id: "t1", state: "flat", formed_at: T - 10 * DAY, went_flat_at: T },
    ]);
  });

  test("a wave with an echo inside the window stays up", async () => {
    const t = setup();
    t.topic("t1", { state: "up", formedAt: T - 10 * DAY });
    threeSources(t, "t1", T - 7 * DAY);
    t.echo("late", "t1", "hn", T - 7 * DAY + 1);
    expect((await t.run()).wentFlat).toEqual([]);
    expect(t.topicRows()[0]?.state).toBe("up");
  });

  test("calmAfterDays comes from settings", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { calmAfterDays: 2 });
    t.topic("t1", { state: "up", formedAt: T - 3 * DAY });
    threeSources(t, "t1", T - 2 * DAY);
    expect((await t.run()).wentFlat).toEqual(["t1"]);
  });

  test("flat -> up when a new echo arrives; wentFlatAt is cleared", async () => {
    const t = setup();
    t.topic("t1", { state: "flat", formedAt: T - 20 * DAY, wentFlatAt: T - 10 * DAY });
    threeSources(t, "t1", T - 20 * DAY);
    t.echo("new", "t1", "hn", T + 60_000);
    const out = await t.run();
    expect(out).toEqual({ topics: 1, up: 1, formed: [], wentFlat: [] });
    expect(t.topicRows()).toEqual([
      { id: "t1", state: "up", formed_at: T - 20 * DAY, went_flat_at: null },
    ]);
  });

  test("a flat wave and an old echo topic with no recent echo get no new point", async () => {
    const t = setup();
    t.topic("flat", { state: "flat", formedAt: T - 20 * DAY, wentFlatAt: T - 10 * DAY });
    threeSources(t, "flat", T - 20 * DAY);
    t.topic("old");
    t.echo("o1", "old", "hn", T - 8 * DAY, EARLIER);
    expect(await t.run()).toEqual({ topics: 0, up: 0, formed: [], wentFlat: [] });
    expect(t.points()).toEqual([]);
  });

  test("a wave that lost sources to a split stays up", async () => {
    const t = setup();
    t.topic("t1", { state: "up", formedAt: T - DAY });
    t.echo("e1", "t1", "hn", T - DAY);
    await t.run();
    expect(t.topicRows()[0]).toEqual({
      id: "t1",
      state: "up",
      formed_at: T - DAY,
      went_flat_at: null,
    });
    expect(t.points()).toMatchObject([{ state: "up", rank: 1, source_count: 1 }]);
  });
});

describe("inputs", () => {
  test("a topic whose only echo is from a later slot gets no point", async () => {
    const t = setup();
    t.topic("t1");
    t.echo("future", "t1", "hn", T - HOUR, LATER);
    expect(await t.run()).toEqual({ topics: 0, up: 0, formed: [], wentFlat: [] });
  });

  test("merged topics and echoes from later slots are left out", async () => {
    const t = setup();
    t.topic("gone", { mergedInto: "t1" });
    t.echo("g1", "gone", "hn", T);
    t.topic("t1");
    t.echo("e1", "t1", "hn", T);
    t.echo("e2", "t1", "lobsters", T);
    t.echo("future", "t1", "github", T + HOUR, LATER);
    expect(await t.run()).toEqual({ topics: 1, up: 0, formed: [], wentFlat: [] });
    expect(t.points()).toMatchObject([{ topic_id: "t1", source_count: 2, echo_count: 2 }]);
  });

  test("height uses each echo's latest heat from this slot or earlier, at the slot's start", async () => {
    const t = setup();
    t.topic("t1");
    t.echo("a", "t1", "hn", T - 2 * HOUR, EARLIER, { [EARLIER]: 10, [SLOT]: 40, [LATER]: 900 });
    t.echo("b", "t1", "lobsters", T - HOUR, EARLIER, { [EARLIER]: 5 });
    t.echo("c", "t1", "github", T + 60_000);
    await t.run();
    const expected: EchoLike[] = [
      { id: "a", groupId: "hn", firstSeenAt: T - 2 * HOUR, heat: 40 },
      { id: "b", groupId: "lobsters", firstSeenAt: T - HOUR, heat: 5 },
      { id: "c", groupId: "github", firstSeenAt: T + 60_000, heat: 0 },
    ];
    expect(t.points()[0]?.height).toBe(waveHeight(expected, T, HEIGHT));
  });

  test("under group normalisation, heat is divided by the group's reference", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { heatNormalisation: "group", heatReferencePercentile: 100 });
    t.topic("t1");
    t.echo("a", "t1", "hn", T, SLOT, { [SLOT]: 100 });
    t.echo("b", "t1", "lobsters", T, SLOT, { [SLOT]: 10 });
    // Outside the window: left out of the references.
    t.echo("z", null, "hn", T - 8 * DAY, EARLIER, { [EARLIER]: 10_000 });
    // Unassigned echoes in the window count toward the references.
    t.echo("x", null, "hn", T, SLOT, { [SLOT]: 400 });
    t.echo("y", null, "lobsters", T, SLOT, { [SLOT]: 20 });
    await t.run();
    const expected = waveHeight(
      [
        { id: "a", groupId: "hn", firstSeenAt: T, heat: 100 },
        { id: "b", groupId: "lobsters", firstSeenAt: T, heat: 10 },
      ],
      T,
      { ...HEIGHT, heatNormalisation: "group" },
      new Map([
        ["hn", 400],
        ["lobsters", 20],
      ]),
    );
    expect(t.points()[0]?.height).toBe(expected);
  });

  test("ranks up topics by height, highest first; echo topics have none", async () => {
    const t = setup();
    t.topic("low");
    threeSources(t, "low", T - 2 * DAY);
    t.topic("high");
    threeSources(t, "high", T);
    t.topic("echo");
    t.echo("q", "echo", "hn", T);
    const out = await t.run();
    expect(out.up).toBe(2);
    expect(t.points().map((p) => [p.topic_id, p.rank])).toEqual([
      ["echo", null],
      ["high", 1],
      ["low", 2],
    ]);
  });

  test("more topics than one write chunk", async () => {
    const t = setup();
    for (let i = 0; i < 1_201; i++) {
      const id = `t${String(i).padStart(4, "0")}`;
      t.topic(id);
      t.echo(`${id}-a`, id, "hn", T);
    }
    expect((await t.run()).topics).toBe(1_201);
    expect(t.points()).toHaveLength(1_201);
  });
});

describe("re-running", () => {
  test("gives the same rows and output, whatever the clock says", async () => {
    const t = setup();
    t.topic("formed");
    threeSources(t, "formed");
    t.topic("flat", { state: "up", formedAt: T - 10 * DAY });
    threeSources(t, "flat", T - 8 * DAY);
    t.topic("echo");
    t.echo("q", "echo", "hn", T, SLOT, { [SLOT]: 3 });
    await readSettings(t.orm, NOW);

    const first = await t.run(SLOT, NOW);
    const rows = { points: t.allPoints(), topics: t.topicRows() };
    expect(first).toEqual({ topics: 3, up: 1, formed: ["formed"], wentFlat: ["flat"] });

    const again = await t.run(SLOT, NOW + 40 * 60_000);
    expect(again).toEqual(first);
    expect({ points: t.allPoints(), topics: t.topicRows() }).toEqual(rows);
  });

  test("the next slot moves on: no new formed or flat ids, heights decay", async () => {
    const t = setup();
    t.topic("t1");
    threeSources(t, "t1");
    await t.run();
    const next = "20261119T0600";
    const out = await t.run(next, NOW + HOUR);
    expect(out).toEqual({ topics: 1, up: 1, formed: [], wentFlat: [] });
    const [now] = t.points(next);
    const [before] = t.points();
    expect(now?.height).toBeLessThan(before?.height ?? 0);
  });
});
