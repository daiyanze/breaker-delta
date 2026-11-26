/** The assign step (M1-16, #32) on an in-memory database with the fake driver. */
import { describe, expect, test } from "bun:test";
import type { AssignResult } from "@bd/contracts";
import { drizzleOver } from "@bd/db";
import { type AssignInput, fakeDriver, type ModelDriver } from "@bd/judge";
import {
  type AssignOutput,
  assignStep,
  MAX_SLUG,
  nameCitesNoAddress,
  type PoolTopic,
  shortlist,
  slugBase,
  validateAssignments,
} from "../src/core/assign.ts";
import { runSlot, type StepContext } from "../src/core/runner.ts";
import { changeSettings } from "../src/core/settings.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const DAY = 86_400_000;

function setup() {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(db);
  const echo = (id: string, title: string, opts: { at?: number; topic?: string } = {}) =>
    sqlite
      .query(
        "INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id) VALUES (?, ?, 'g', ?, ?, ?, ?)",
      )
      .run(id, `https://x.test/${id}`, title, opts.at ?? NOW, SLOT, opts.topic ?? null);
  const topic = (id: string, name: string, opts: { at?: number; merged?: string } = {}) =>
    sqlite
      .query(
        "INSERT INTO topics (id, slug, name, state, created_at, merged_into) VALUES (?, ?, ?, 'echo', ?, ?)",
      )
      .run(id, id, name, opts.at ?? NOW, opts.merged ?? null);
  const alias = (topicId: string, name: string) =>
    sqlite
      .query("INSERT INTO topic_aliases (topic_id, alias, created_at) VALUES (?, ?, ?)")
      .run(topicId, name, NOW);
  const ctx = (now = NOW): StepContext => ({
    slot: SLOT,
    db: orm,
    now: () => now,
    outputs: new Map(),
  });
  const run = (driver: ModelDriver, now = NOW) =>
    assignStep({ driver }).run(ctx(now)) as Promise<AssignOutput>;
  const placed = () =>
    Object.fromEntries(
      (
        sqlite.query("SELECT id, topic_id FROM echoes ORDER BY id").all() as {
          id: string;
          topic_id: string | null;
        }[]
      ).map((r) => [r.id, r.topic_id]),
    );
  const topicRows = () =>
    sqlite.query("SELECT id, slug, name, state FROM topics ORDER BY created_at, slug").all() as {
      id: string;
      slug: string;
      name: string;
      state: string;
    }[];
  return { orm, sqlite, echo, topic, alias, ctx, run, placed, topicRows };
}

/** A driver that records its inputs and answers with `answer`. */
function scripted(answer: (input: AssignInput) => AssignResult | Promise<AssignResult>) {
  const inputs: AssignInput[] = [];
  const driver: ModelDriver = {
    async assign(input) {
      inputs.push(structuredClone(input));
      return {
        value: await answer(input),
        provider: "test",
        model: "test",
        promptVersion: null,
        repaired: false,
        calls: [],
      };
    },
    summarize: () => Promise.reject(new Error("not used")),
  };
  return { driver, inputs };
}

const pool = (id: string, name: string, lastActive: number, aliases: string[] = []): PoolTopic => ({
  id,
  name,
  aliases,
  lastActive,
});

describe("shortlist", () => {
  test("ranks by shared words in name or alias, then by latest activity", () => {
    const topics = [
      pool("t1", "Weather report", 5),
      pool("t2", "Rust compiler release", 1),
      pool("t3", "Quantum", 2, ["quantum chips record"]),
      pool("t4", "Football results", 9),
    ];
    const ids = shortlist(topics, ["Rust compiler 2.0", "New quantum chips record"], 3).map(
      (t) => t.id,
    );
    expect(ids).toEqual(["t3", "t2", "t4"]);
  });

  test("ties on words and activity go by id; size caps the list; 0 offers none", () => {
    const topics = [pool("t2", "a b", 1), pool("t1", "a b", 1)];
    expect(shortlist(topics, ["x"], 5).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(shortlist(topics, ["x"], 1)).toHaveLength(1);
    expect(shortlist(topics, ["x"], 0)).toEqual([]);
  });
});

describe("validateAssignments", () => {
  const batch = [
    { id: "e1", title: "t" },
    { id: "e2", title: "t" },
  ];
  const ok = (answer: unknown) => validateAssignments(batch, ["t1"], answer);

  test("keeps shortlisted topics and named new topics", () => {
    const r = ok({
      assignments: [
        { echoId: "e1", topicId: "t1" },
        { echoId: "e2", newTopic: { name: "  Rust 2.0  " } },
      ],
    });
    expect(r.rejected).toBe(0);
    expect([...r.placements]).toEqual([
      ["e1", { topicId: "t1" }],
      ["e2", { newTopic: "Rust 2.0" }],
    ]);
  });

  test("a topic id outside the shortlist is rejected", () => {
    const r = ok({ assignments: [{ echoId: "e1", topicId: "t9" }] });
    expect(r.placements.size).toBe(0);
    expect(r.rejected).toBe(1);
  });

  test("an echo named twice is rejected both times, even if both agree", () => {
    const r = ok({
      assignments: [
        { echoId: "e1", topicId: "t1" },
        { echoId: "e1", topicId: "t1" },
        { echoId: "e2", topicId: "t1" },
      ],
    });
    expect([...r.placements.keys()]).toEqual(["e2"]);
    expect(r.rejected).toBe(2);
  });

  test("an echo outside the batch and a blank new name are rejected", () => {
    const r = ok({
      assignments: [
        { echoId: "e7", topicId: "t1" },
        { echoId: "e1", newTopic: { name: "   " } },
      ],
    });
    expect(r.placements.size).toBe(0);
    expect(r.rejected).toBe(2);
  });

  /** Rejections for `name` proposed as a new topic for an echo titled `title`. */
  const named = (name: string, title = "Release notes") =>
    validateAssignments([{ id: "e1", title }], [], {
      assignments: [{ echoId: "e1", newTopic: { name } }],
    }).rejected;

  test("a name with a URL scheme or www. is rejected, even when the title has it (invariant 2)", () => {
    for (const name of [
      "https://invented.example/source",
      "see HTTP://x.test",
      "www.example.org launch",
    ]) {
      expect([name, named(name, name)]).toEqual([name, 1]);
    }
  });

  test("a dotted word the echo's title does not have is rejected (invariant 2)", () => {
    for (const name of [
      "invented.example/news",
      "Story on example.com",
      "bbc.co.uk",
      "x.ai",
      "techcrunch.news",
      "例子.com",
      "example．com",
      "example。com",
      "ASP.NET Core 10 release",
    ]) {
      expect([name, named(name)]).toEqual([name, 1]);
    }
  });

  test("a dotted word the echo's own title has is kept", () => {
    expect(named("ASP.NET Core 10 release", "What's new in ASP.NET Core 10")).toBe(0);
    expect(named("Node.js/Deno", "node.js and Deno ship together")).toBe(0);
    expect(named("config.test.ts migration", "Moving config.test.ts to Bun")).toBe(0);
    expect(named("x.ai funding", "X.AI raises again")).toBe(0);
    expect(named("x.ai funding", "xAI raises again")).toBe(1);
    expect(named("example.com", "Posted on example.community")).toBe(1);
  });

  test("numbers, initials and slashes without a dotted word are kept", () => {
    for (const name of [
      "Rust 2.0",
      "GPT-5.5",
      "TypeScript 5.8/5.9 compatibility",
      "U.S. chip rules",
    ]) {
      expect([name, named(name)]).toEqual([name, 0]);
    }
  });

  test("a Chinese or Japanese full stop ends a sentence, not a dotted word", () => {
    for (const text of [
      "新功能已发布。服务将于下月推出。",
      "新機能が公開された。提供は来月始まる。",
      // Japanese academic style uses the fullwidth full stop.
      "新機能が公開された．提供は来月始まる．",
      "新機能が公開された｡提供は来月始まる｡",
      // A sentence that ends or starts with a Latin word or a number.
      "发布了 Rust 2.0。新版本更快。",
      "新版本已发布。Rust 团队表示将继续维护。",
      "Apple が発表した。iPhone の新型だ。",
    ]) {
      expect([text, nameCitesNoAddress(text, "")]).toEqual([text, true]);
    }
  });

  test("a full stop between two lower-case Latin words is still a dot (invariant 2)", () => {
    for (const text of [
      "example。com",
      "example．com",
      "example｡com",
      "ｅｘａｍｐｌｅ。ｃｏｍ",
      "详情见 example。com。",
      "詳細は evil。example で。",
      "例子.com",
      "新功能已发布。详情见 news.example。",
      // A capital after the stop: URL parsers read these as example.com too.
      "Example。COM/docs",
      "Example．Com",
      "详情见 Example｡Com",
    ]) {
      expect([text, nameCitesNoAddress(text, "")]).toEqual([text, false]);
    }
  });

  test("a stop between a Latin word or number and a capital fails closed", () => {
    // Rare prose such as this is refused, the price of catching Example。Com.
    expect(nameCitesNoAddress("OpenAI 推出 GPT-5。OpenAI 表示……", "")).toBe(false);
  });

  test("an answer that fails the contract rejects the whole batch", () => {
    for (const bad of [null, { assignments: [{ echoId: "e1" }] }, { assignments: "x" }]) {
      expect(ok(bad)).toEqual({ placements: new Map(), rejected: 2 });
    }
  });

  test("a model-written url field fails the contract: the whole answer is rejected (#46)", () => {
    const r = ok({ assignments: [{ echoId: "e1", topicId: "t1", url: "https://evil.test" }] });
    expect(r).toEqual({ placements: new Map(), rejected: 2 });
  });
});

describe("slugBase", () => {
  test("lower-case ASCII words joined by hyphens, accents dropped", () => {
    expect(slugBase("Rust 2.0 compiler: announced!")).toBe("rust-2-0-compiler-announced");
    expect(slugBase("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  test("empty for a name with no ASCII letters or digits", () => {
    expect(slugBase("発表した")).toBe("");
    expect(slugBase("---")).toBe("");
  });

  test("at most MAX_SLUG characters, no trailing hyphen", () => {
    const s = slugBase(`${"ab ".repeat(50)}`);
    expect(s.length).toBeLessThanOrEqual(MAX_SLUG);
    expect(s).not.toEndWith("-");
  });
});

describe("assign step", () => {
  test("every new echo gets exactly one topic; similar ones share a new topic", async () => {
    const s = setup();
    s.topic("t1", "OpenAI GPT-6 launch", { at: NOW - DAY });
    s.echo("e1", "OpenAI releases GPT-6 with longer context");
    s.echo("e2", "Rust 2.0 compiler announced");
    s.echo("e3", "Rust compiler 2.0: what changes");
    s.echo("e4", "Weather is nice");
    const out = await s.run(fakeDriver());
    expect(out).toEqual({
      echoes: 4,
      assigned: 4,
      newTopics: 2,
      rejected: 0,
      failedBatches: 0,
      unassigned: 0,
    });
    const placed = s.placed();
    expect(placed.e1).toBe("t1");
    expect(placed.e2).toBe(placed.e3 as string);
    expect(placed.e4).not.toBe(placed.e2 as string);
    const created = s.topicRows().filter((t) => t.id !== "t1");
    expect(created.map((t) => [t.slug, t.name, t.state])).toEqual([
      ["rust-2-0-compiler-announced", "Rust 2.0 compiler announced", "echo"],
      ["weather-is-nice", "Weather is nice", "echo"],
    ]);
  });

  test("echoes that already have a topic are not sent or changed", async () => {
    const s = setup();
    s.topic("t1", "Old story");
    s.echo("e1", "Old story part one", { topic: "t1" });
    s.echo("e2", "Something else entirely");
    const { driver, inputs } = scripted((input) => ({
      assignments: input.echoes.map((e) => ({ echoId: e.id, topicId: "t1" })),
    }));
    const out = await s.run(driver);
    expect(inputs.flatMap((i) => i.echoes.map((e) => e.id))).toEqual(["e2"]);
    expect(out.assigned).toBe(1);
    expect(s.placed()).toEqual({ e1: "t1", e2: "t1" });
  });

  test("a topic id outside the shortlist is rejected and its echo waits", async () => {
    const s = setup();
    s.topic("t1", "Shortlisted story");
    s.topic("t2", "Merged away", { merged: "t1" });
    s.echo("e1", "First echo");
    s.echo("e2", "Second echo");
    const { driver, inputs } = scripted(() => ({
      assignments: [
        { echoId: "e1", topicId: "t2" },
        { echoId: "e2", topicId: "t1" },
      ],
    }));
    const out = await s.run(driver);
    expect(inputs[0]?.topics.map((t) => t.id)).toEqual(["t1"]);
    expect(out).toMatchObject({ assigned: 1, rejected: 1, unassigned: 1 });
    expect(s.placed()).toEqual({ e1: null, e2: "t1" });
  });

  test("failed echoes are retried next run", async () => {
    const s = setup();
    s.echo("e1", "Rust 2.0 compiler announced");
    s.echo("e2", "Weather is nice");
    const failing = scripted(() => Promise.reject(new Error("all providers failed: quoted")));
    const first = await s.run(failing.driver);
    expect(first).toMatchObject({ echoes: 2, assigned: 0, failedBatches: 1, unassigned: 2 });
    expect(s.placed()).toEqual({ e1: null, e2: null });
    expect(JSON.stringify(first)).not.toContain("quoted");

    // A model that leaves an echo out leaves it for the next run too.
    const partial = scripted(() => ({
      assignments: [{ echoId: "e1", newTopic: { name: "Rust" } }],
    }));
    const second = await s.run(partial.driver, NOW + 3_600_000);
    expect(second).toMatchObject({ echoes: 2, assigned: 1, unassigned: 1 });

    const third = await s.run(fakeDriver(), NOW + 7_200_000);
    expect(third).toMatchObject({ echoes: 1, assigned: 1, unassigned: 0 });
    expect(Object.values(s.placed()).every((t) => t !== null)).toBe(true);
  });

  test("the shortlist uses name, alias and recent activity, within the settings' size", async () => {
    const s = setup();
    await changeSettings(s.orm, NOW, { assignShortlistSize: 2, assignActivityDays: 3 });
    s.topic("tName", "Rust compiler release", { at: NOW - 10 * DAY });
    s.echo("old", "Rust echo", { at: NOW - 2 * DAY, topic: "tName" });
    s.topic("tAlias", "Qubits", { at: NOW - DAY });
    s.alias("tAlias", "quantum chips record");
    s.topic("tRecent", "Football results", { at: NOW - 1000 });
    s.topic("tStale", "Rust compiler quantum chips", { at: NOW - 4 * DAY });
    s.echo("e1", "Rust compiler 2.0");
    s.echo("e2", "New quantum chips record");
    const { driver, inputs } = scripted((input) => ({
      assignments: input.echoes.map((e) => ({ echoId: e.id, newTopic: { name: "x" } })),
    }));
    await s.run(driver);
    expect(inputs[0]?.topics).toEqual([
      { id: "tAlias", name: "Qubits", aliases: ["quantum chips record"] },
      { id: "tName", name: "Rust compiler release" },
    ]);
  });

  test("a topic's activity is the later of its latest echo and its creation", async () => {
    const s = setup();
    await changeSettings(s.orm, NOW, { assignActivityDays: 7 });
    s.topic("tNewOldEcho", "Alpha", { at: NOW - DAY });
    s.echo("a", "Alpha old", { at: NOW - 8 * DAY, topic: "tNewOldEcho" });
    s.topic("tOldNewEcho", "Beta", { at: NOW - 10 * DAY });
    s.echo("b", "Beta new", { at: NOW - 2 * DAY, topic: "tOldNewEcho" });
    s.topic("tStale", "Gamma", { at: NOW - 10 * DAY });
    s.echo("c", "Gamma old", { at: NOW - 8 * DAY, topic: "tStale" });
    s.echo("e1", "Something new");
    const { driver, inputs } = scripted((input) => ({
      assignments: input.echoes.map((e) => ({ echoId: e.id, newTopic: { name: "x" } })),
    }));
    await s.run(driver);
    expect(inputs[0]?.topics.map((t) => t.id).sort()).toEqual(["tNewOldEcho", "tOldNewEcho"]);
  });

  test("batches follow the settings; later batches see topics earlier ones created", async () => {
    const s = setup();
    await changeSettings(s.orm, NOW, { assignBatchSize: 2 });
    s.echo("e1", "Rust 2.0 compiler announced", { at: NOW - 3 });
    s.echo("e2", "Weather is nice", { at: NOW - 2 });
    s.echo("e3", "Rust compiler 2.0: what changes", { at: NOW - 1 });
    const fake = fakeDriver();
    const { driver, inputs } = scripted((input) => fake.assign(input).then((r) => r.value));
    const out = await s.run(driver);
    expect(inputs.map((i) => i.echoes.map((e) => e.id))).toEqual([["e1", "e2"], ["e3"]]);
    expect(inputs[1]?.topics.map((t) => t.name)).toContain("Rust 2.0 compiler announced");
    expect(out).toMatchObject({ assigned: 3, newTopics: 2 });
    const placed = s.placed();
    expect(placed.e3).toBe(placed.e1 as string);
  });

  test("echoes go to the model by id, title and excerpt only", async () => {
    const s = setup();
    s.echo("e1", "Title one");
    s.sqlite.run("UPDATE echoes SET excerpt = 'An excerpt' WHERE id = 'e1'");
    s.echo("e2", "Title two");
    const { driver, inputs } = scripted((input) => ({
      assignments: input.echoes.map((e) => ({ echoId: e.id, newTopic: { name: e.title } })),
    }));
    await s.run(driver);
    expect(inputs[0]?.echoes).toEqual([
      { id: "e1", title: "Title one", summary: "An excerpt" },
      { id: "e2", title: "Title two" },
    ]);
  });

  test("slugs are unique and stable: a taken one gets a number, a CJK name the id", async () => {
    const s = setup();
    s.sqlite.run(
      "INSERT INTO topics (id, slug, name, state, created_at) VALUES ('tOld', 'rust', 'Rust', 'echo', 0)",
    );
    s.echo("e1", "one");
    s.echo("e2", "two");
    s.echo("e3", "three");
    const { driver } = scripted(() => ({
      assignments: [
        { echoId: "e1", newTopic: { name: "Rust" } },
        { echoId: "e2", newTopic: { name: "Rust!" } },
        { echoId: "e3", newTopic: { name: "発表" } },
      ],
    }));
    const out = await s.run(driver);
    expect(out.newTopics).toBe(3);
    const rows = s.topicRows().filter((t) => t.id !== "tOld");
    const slugs = Object.fromEntries(rows.map((t) => [t.name, t.slug]));
    expect(slugs.Rust).toBe("rust-2");
    expect(slugs["Rust!"]).toBe("rust-3");
    const cjk = rows.find((t) => t.name === "発表");
    expect(cjk?.slug).toBe(cjk?.id as string);
    expect(s.sqlite.query("SELECT slug FROM topics WHERE id = 'tOld'").get()).toEqual({
      slug: "rust",
    });
  });

  test("a retried or resumed attempt does not assign an echo twice", async () => {
    const s = setup();
    s.echo("e1", "Rust 2.0 compiler announced");
    s.echo("e2", "Weather is nice");
    const fake = fakeDriver();
    const { driver, inputs } = scripted((input) => fake.assign(input).then((r) => r.value));
    await s.run(driver);
    const topics = s.topicRows();
    const placed = s.placed();
    const again = await s.run(driver);
    expect(again).toMatchObject({ echoes: 0, assigned: 0, newTopics: 0 });
    expect(inputs).toHaveLength(1);
    expect(s.topicRows()).toEqual(topics);
    expect(s.placed()).toEqual(placed);
  });

  test("runs as a runner step and stores counts only", async () => {
    const s = setup();
    s.echo("e1", "Weather is nice");
    const outcome = await runSlot(s.orm, () => NOW, SLOT, [assignStep({ driver: fakeDriver() })], {
      maxAttempts: 1,
      leaseMs: 60_000,
    });
    expect(outcome.status).toBe("done");
    const row = s.sqlite.query("SELECT output FROM run_steps WHERE step = 'assign'").get() as {
      output: string;
    };
    expect(JSON.parse(row.output)).toEqual({
      echoes: 1,
      assigned: 1,
      newTopics: 1,
      rejected: 0,
      failedBatches: 0,
      unassigned: 0,
    });
  });
});
