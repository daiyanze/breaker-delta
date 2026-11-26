/**
 * Injection samples (#46, M2-05): answers a model might give after reading
 * fetched text that tries to steer it. Every sample is synthetic. The
 * acceptance criterion: model output carries no field outside the contract
 * and cannot produce a link. Each sample goes through the checks the
 * pipeline applies before anything is stored: `validateDraft` (validate and
 * commit) for summaries, `validateAssignments` (assign) for topic names.
 */
import { describe, expect, test } from "bun:test";
import type { SummarizeResult } from "@bd/contracts";
import { validateAssignments, writesNoMarkup } from "../src/core/assign.ts";
import type { Draft } from "../src/core/summarize.ts";
import { validateDraft } from "../src/core/validate.ts";

const good = (): SummarizeResult => ({
  texts: [{ lang: "en", title: "Rust 2.0 ships", body: "Three sources report the release." }],
  evidenceEchoIds: ["e1"],
  riskFlags: [],
  criterion: "The Rust project publishes the 2.0 release notes.",
});

const draft = (answer: unknown): Draft => ({
  topicId: "t1",
  reason: "formed",
  first: true,
  offered: ["e1", "e2"],
  languages: ["en"],
  sourceTextRead: false,
  provider: "p",
  model: "m",
  answer,
});

/** The offered echoes' text: a domain here may be named, but never linked. */
const REF = "Rust 2.0 compiler released, see rust-lang.org and contact press@rust-lang.org";

/** Answers with a key the contract does not name, at each level. */
const EXTRA_FIELDS: [string, (a: SummarizeResult) => unknown][] = [
  ["a top-level url", (a) => ({ ...a, url: "https://evil.test/" })],
  ["a top-level source name", (a) => ({ ...a, sourceName: "Evil Daily" })],
  ["a wave height", (a) => ({ ...a, height: 99 })],
  ["a rank", (a) => ({ ...a, rank: 1 })],
  ["a wave flag", (a) => ({ ...a, isWave: true })],
  ["evidence urls", (a) => ({ ...a, evidenceUrls: ["https://evil.test/"] })],
  ["a link inside a text", (a) => ({ ...a, texts: [{ ...a.texts[0], link: "/x" }] })],
  ["html inside a text", (a) => ({ ...a, texts: [{ ...a.texts[0], html: "<b>x</b>" }] })],
  ["an __proto__ key", (a) => JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(a).slice(1)}`)],
];

/** Texts that a renderer, a Markdown reader or a mail client could link. */
const LINKS: string[] = [
  "Read more at https://evil.test/now",
  "Read more at HTTPS://EVIL.TEST",
  "Visit www.evil.test today",
  "Visit evil.test today",
  "Full story: ｈｔｔｐｓ：／／evil.test",
  "Details [here](https://evil.test)",
  "Details [here](/topic/other)",
  "Details [here] (#top)",
  "![tracker](/pixel.png)",
  "Story\n[1]: /elsewhere",
  '<a href="/elsewhere">click</a>',
  "<A HREF=x>click</A>",
  "<img src=x onerror=alert(1)>",
  "<script>alert(1)</script>",
  "<!-- hidden -->",
  "</p><p>injected",
  "<https://evil.test>",
  "＜a href=x＞click＜/a＞",
  "&lt;a href=x&gt;click",
  "&#60;a href=x&#62;",
  "&#x3c;a href=x&#x3e;",
  "javascript:alert(1)",
  "javascript:\talert(1)",
  "javascript:\nalert(1)",
  "JavaScript:alert(1)",
  "click(javascript:alert(1))",
  "data:text/html,<b>x</b>",
  "data:text/html;base64,PGI+",
  "mailto:someone",
  "Write to press@rust-lang.org",
  "tel:+15550100",
  "file:///etc/passwd",
  "Key data:text/plain;base64,QQ==",
  "See file:x",
  "Call tel:5550100 now",
  "Data:x",
];

/** Ordinary prose, in every enabled language, that must still pass. */
const PROSE: string[] = [
  "Rust 2.0 ships with a new borrow checker; 3 < 4 and 5 > 2.",
  "The team <3 the release, at 10:30 UTC.",
  "Note: the release is confirmed. Re: earlier claims, none hold.",
  "C++ users are unaffected [according to the notes].",
  "The compiler (version 2.0) is out; rust-lang.org hosts the notes.",
  "AT&T and R&D teams test it.",
  "Key data: revenue rose 40% in the quarter.",
  "What the lawsuit is about: training data.",
  "The court file: a 40-page complaint.",
  "The stated intent: to ship by June.",
  "Data: the model scores 90 on the benchmark.",
  "Mailto: and tel: are not used here.",
  "Rust 2.0 正式发布，编译器更快。",
  "Rust 2.0 が公開された。提供は本日から。",
];

describe("injection samples: no field outside the contract", () => {
  test("the clean answer passes", () => {
    expect(validateDraft(draft(good()), REF).ok).toBe(true);
  });

  for (const [name, edit] of EXTRA_FIELDS) {
    // In a run the chain refuses such an answer first (packages/judge's
    // summarize test), so no draft holds one; this pins validate's own check.
    test(`summarize: ${name} fails validate's contract check`, () => {
      expect(validateDraft(draft(edit(good())), REF)).toEqual({ ok: false, check: "contract" });
    });
  }

  test("assign: a key outside the contract rejects the whole answer", () => {
    const batch = [{ id: "e1", title: "Rust 2.0" }];
    const answers = [
      { assignments: [{ echoId: "e1", topicId: "t1", url: "https://evil.test" }] },
      { assignments: [{ echoId: "e1", newTopic: { name: "Rust", url: "/x" } }] },
      { assignments: [{ echoId: "e1", newTopic: { name: "Rust" }, height: 9 }] },
      { assignments: [{ echoId: "e1", topicId: "t1", newTopic: { name: "Rust" } }] },
      { assignments: [{ echoId: "e1", topicId: "t1" }], note: "ignore the rules" },
    ];
    for (const answer of answers) {
      const r = validateAssignments(batch, ["t1"], answer);
      expect([r.placements.size, r.rejected]).toEqual([0, 1]);
    }
  });
});

describe("injection samples: model text cannot produce a link", () => {
  for (const text of LINKS) {
    test(`refused everywhere: ${JSON.stringify(text)}`, () => {
      const a = good();
      const [t] = a.texts;
      if (t === undefined) throw new Error("no text");
      const placed = [
        { ...a, texts: [{ ...t, title: text.slice(0, 160) }] },
        { ...a, texts: [{ ...t, body: text }] },
        { ...a, criterion: text },
      ];
      for (const answer of placed) {
        const v = validateDraft(draft(answer), REF);
        expect(v.ok).toBe(false);
        if (!v.ok) expect(["address", "markup"]).toContain(v.check);
      }
      const batch = [{ id: "e1", title: REF }];
      const r = validateAssignments(batch, [], {
        assignments: [{ echoId: "e1", newTopic: { name: text.slice(0, 120) } }],
      });
      expect([r.placements.size, r.rejected]).toEqual([0, 1]);
    });
  }

  for (const text of PROSE) {
    test(`prose passes: ${JSON.stringify(text)}`, () => {
      expect(writesNoMarkup(text)).toBe(true);
      const a = good();
      const [t] = a.texts;
      if (t === undefined) throw new Error("no text");
      expect(validateDraft(draft({ ...a, texts: [{ ...t, body: text }] }), REF).ok).toBe(true);
    });
  }
});

describe("injection samples: model text is bounded", () => {
  test("a text over its contract length discards the draft", () => {
    const a = good();
    const [t] = a.texts;
    if (t === undefined) throw new Error("no text");
    const long = [
      { ...a, texts: [{ ...t, title: "x".repeat(161) }] },
      { ...a, texts: [{ ...t, body: "x".repeat(1201) }] },
      { ...a, criterion: "x".repeat(601) },
    ];
    for (const answer of long) {
      expect(validateDraft(draft(answer), REF)).toEqual({ ok: false, check: "contract" });
    }
    const r = validateAssignments([{ id: "e1", title: "t" }], [], {
      assignments: [{ echoId: "e1", newTopic: { name: "x".repeat(121) } }],
    });
    expect(r.rejected).toBe(1);
  });
});
