#!/usr/bin/env python3
"""Phase 0 golden samples for the Node migration.

Runs the Python implementations of every function scheduled for
Phase 1 over a fixed input set and writes the results to
``packages/core/fixtures/golden.json``. The TypeScript tests in
``packages/core/test`` compare against this file item by item, so the
Node port is verified against Python behaviour — quirks included.

Deterministic: fixed dates/times everywhere, sets serialised sorted.
Re-run with:  python3 scripts/make_golden.py
"""

from __future__ import annotations

import copy
import json
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radar import publish, scan, store, vocab  # noqa: E402
OUT = ROOT / "packages" / "core" / "fixtures" / "golden.json"

G: dict = {}


def section(name, value):
    G[name] = value


# ---------------------------------------------------------------- heat
heat_items = [
    {"level": "must", "sources": ["a"], "links": ["https://x/1"], "is_new": True},
    {"level": "must", "sources": ["a", "b"], "links": ["https://x/1"], "is_new": False},
    {"level": "watch", "sources": ["a", "b", "c"], "links": [], "is_new": True},
    {"level": "seed", "sources": ["a"], "links": [], "is_new": True},
    {"level": "seed", "sources": [], "links": [], "is_new": False},
    {"level": "breaking", "sources": ["a"], "links": ["https://x/1", "https://x/2"],
     "is_new": False},                                   # unknown level -> base 10
    {"sources": ["a", "b"], "links": [], "is_new": True},  # missing level -> base 10
    {"level": "watch", "sources": None, "links": None, "is_new": False},
    {"level": "must", "sources": ["a", "b", "c", "d"],
     "links": ["https://x/1", "https://x/2", "https://x/3"], "is_new": True},
]
section("heat", [{"item": it, "expected": publish.heat_of(copy.deepcopy(it))}
                 for it in heat_items])

# ------------------------------------------------------------ classify
classify_cases = [
    ["某工具被曝存在严重漏洞", "正文无关键词"],            # title hit: 安全
    ["新产品上线", "有关部门出台新的监管细则"],            # body-only hit: 政策与监管
    ["开源项目修复漏洞", ""],                              # title has 安全+开源 -> 安全 (rule order)
    ["新模型亮相", "正文提到漏洞利用"],                    # title scanned against ALL rules first -> AI 模型
    ["普通行业新闻一则", "一切如常"],                      # no hit -> 行业动态
    ["github tool released today", ""],                    # case-sensitive: "github" != "GitHub" -> 行业动态
    ["GitHub 上最火的仓库", ""],                           # 开源 via "GitHub"
    ["公司宣布 CEO 辞职并启动收购", ""],                   # 商业与资本
    ["智能体助手上线", "Agent framework"],                 # Agent 与应用 (title first)
    ["", ""],                                              # empty -> 行业动态
    [None, None],                                          # None-safe
    ["GPT 新版本推出", ""],                                # AI 模型
    ["某国宣布出口管制清单", ""],                          # 政策与监管 via title
]
section("classify", [{"title": t, "body": b, "expected": publish.classify(t, b)}
                     for t, b in classify_cases])

# ------------------------------------------------------------- slugify
slug_cases = [
    ["Hello World! Foo & Bar", "t01"],
    ["示例模型发布", "t01"],
    ["日本語のタイトル", "t02"],
    ["한국어 제목 테스트", "t03"],
    ["Résumé Café", "t04"],
    ["OpenAI GPT-5.2 发布", "t05"],
    ["a" * 60, "t06"],                                     # truncate to 48
    ["模" * 60, "t07"],                                    # CJK truncate to 48 chars
    ["x" * 47 + " y" + "z" * 10, "t08"],                    # cut lands on "-" -> stripped
    ["!!!", "t99"],                                        # empty -> fallback
    ["", "t00"],
    ["  Spaces   and---dashes  ", "t09"],
    ["Anthropic 发布新模型 Claude", "t10"],
]
section("slugify", [{"title": t, "fallback": f, "expected": publish.slugify(t, f)}
                    for t, f in slug_cases])
section("reserved_files", sorted(publish.RESERVED_FILES))
section("topic_file", [{"slug": "abc-def", "expected": publish.topic_file({"slug": "abc-def"})}])

# ------------------------------------------------------- titleKeywords
tk_titles = [
    "OpenAI Releases GPT-5 Model",                         # bigram chain hits the 10 cap
    "新模型发布引发广泛关注讨论热议",                        # CJK run > 8 -> first 4 chars
    "AI 模型 Gemini",
    "The Quick and the Dead",                              # stopwords filtered
    "示例模型发布",
    "",
]
section("title_keywords", [{"title": t, "expected": publish.title_keywords(t)}
                           for t in tk_titles])

# -------------------------------------------------------------- tokens
scan_token_names = [
    "GPT-5.2 Released: The Model!",
    "A b cd efg",
    "Show HN: something interesting",
    "node.js 22 released",
    "Try example.com. today",
    "KRILLION Daily",
    "v2.0.1-alpha ships",
    "",
]
section("scan_tokens", [{"name": n, "expected": sorted(scan.tokens(n))}
                        for n in scan_token_names])

publish_token_titles = [
    "GPT-5 发布",
    "示例模型发布",
    "Hello World 2026",
    "ClaudeとGeminiの比較",
    "",
]
section("publish_tokens", [{"title": t, "expected": sorted(publish.tokens(t))}
                           for t in publish_token_titles])

# ------------------------------------------------------- topic_weights
tw_configs = [
    {"topics": {"AI Agents": 5, "Chips": 2}},
    {"grading": {"relevance_topics": ["A", "B"]}},
    {"topics": {}, "grading": {"relevance_topics": ["Legacy"]}},  # empty dict -> legacy
    {"topics": {"Solo": 3}, "grading": {"relevance_topics": ["Ignored"]}},
    {},
]
section("topic_weights", [{"config": c, "expected": scan.topic_weights(copy.deepcopy(c))}
                          for c in tw_configs])

# ------------------------------------------------------------ itemTime
def _mk_item(metrics):
    return {"source": "test", "name": "x", "url": "https://example.com",
            "metrics": metrics, "detail": ""}

item_time_cases = [
    {"published": "2026-11-13T10:00:00Z"},
    {"published": "2026-11-13T10:00:00+09:00"},
    {"published": "2026-11-13T10:00:00"},                  # naive -> UTC
    {"published": "2026-11-13"},                           # date only -> midnight UTC
    {"published": "13 Nov 2026 00:36 +0000"},               # RFC 2822
    {"published": "Thu, 13 Nov 2026 00:36:00 GMT"},         # RFC 2822 with weekday
    {"created": "2026-11-12T08:30:00Z"},                    # created fallback
    {"pubDate": "12 Nov 2026 08:30:00 +0000"},              # pubDate fallback
    {"published": "", "created": "2026-11-12T08:30:00Z"},   # empty published skipped
    {},                                                    # no timestamp -> None
    {"published": "not a date"},                           # garbage -> None
    {"published": "2026-11-13T10:00:00.123456Z"},           # fractional seconds
]
section("item_time", [
    {"metrics": m,
     "expected": (scan.item_time(_mk_item(m)).isoformat()
                  if scan.item_time(_mk_item(m)) else None)}
    for m in item_time_cases])

# -------------------------------------------------------- applyControls
NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)


def _c_item(name, detail="", published=None, source="test", **extra):
    metrics = {}
    if published:
        metrics["published"] = published
    return {"source": source, "name": name, "url": "https://example.com",
            "metrics": metrics, "detail": detail, **extra}


def _controls_case(results, config):
    work = copy.deepcopy(results)
    stats, alerts = scan.apply_controls(work, copy.deepcopy(config), NOW)
    return {"input": {"results": results, "config": config, "now": NOW.isoformat()},
            "expected": {"stats": stats, "alerts": alerts, "results": work}}


fresh = (NOW - timedelta(hours=2)).isoformat()
stale = (NOW - timedelta(hours=100)).isoformat()
controls_a = _controls_case(
    [{"source": "test", "layer": 1, "status": "ok", "note": "", "items": [
        _c_item("Free giveaway now"),
        _c_item("MCP server released", detail="an AI Agents tool", published=fresh),
        _c_item("Gemini 9 launches", published=fresh),
        _c_item("Old news", published=stale),
        _c_item("Undated thing"),
    ]}],
    {"keywords": {"mute": ["giveaway"], "boost": ["mcp"], "alert": ["gemini"]},
     "topics": {"AI Agents": 5},
     "filters": {"max_age_hours": 48}})

controls_b = _controls_case(
    [{"source": "test", "layer": 1, "status": "ok", "note": "", "items": [
        _c_item("mcp server", detail="AI Agents stuff",
                keyword_hits={"custom": ["z"]}),          # pre-existing hits merged
        _c_item("spam in detail", detail="this is a GIVEAWAY post"),  # mute via detail
        _c_item("Plain item"),
    ]}],
    {"keywords": {"mute": ["giveaway"], "boost": ["MCP"]},   # boost case-insensitive
     "grading": {"relevance_topics": ["AI Agents"]}})       # legacy topics, weight 1

controls_c = _controls_case(
    [{"source": "test", "layer": 1, "status": "ok", "note": "", "items": [
        _c_item("Ancient but kept", published=stale),       # max_age 0 is falsy -> kept
    ]}],
    {"topics": {}, "grading": {"relevance_topics": ["Kept"]},
     "filters": {"max_age_hours": 0}})
section("apply_controls", [controls_a, controls_b, controls_c])

# ------------------------------------------------------------- resonance
def _r_item(name, source):
    return {"source": source, "name": name, "url": f"https://example.com/{name}",
            "metrics": {}, "detail": ""}


def _r_result(source, items):
    return {"source": source, "layer": 1, "status": "ok", "note": "", "items": items}


res_a = [_r_result("s1", [_r_item("Krillion alpha", "s1")]),
         _r_result("s2", [_r_item("Krillion beta", "s2")]),
         _r_result("s3", [_r_item("Krillion gamma", "s3")])]
res_b = [_r_result("s1", [_r_item("Lonely shared token", "s1"),
                          _r_item("Lonely other thing", "s1")])]
res_c = [_r_result("s1", [_r_item(f"Megatoken story {i}", "s1") for i in range(7)]),
         _r_result("s2", [_r_item(f"Megatoken story {i}", "s2") for i in range(6, 13)])]
# 13 distinct items share "megatoken" -> over MAX_TOKEN_ITEMS, excluded.
res_d = [_r_result("s1", [_r_item(f"Duodeci report{i}", "s1") for i in range(6)]),
         _r_result("s2", [_r_item(f"Duodeci report{i}", "s2") for i in range(6, 12)])]
# exactly 12 items -> included.
res_e = [_r_result("s1", [_r_item("Zeta alpha", "s1"), _r_item("Omega alpha", "s1")]),
         _r_result("s2", [_r_item("Zeta beta", "s2"), _r_item("Omega beta", "s2")]),
         _r_result("s3", [_r_item("Zeta gamma", "s3")])]
# zeta: 3 sources / 3 items; omega: 2 sources / 2 items -> zeta sorts first.
res_f = [_r_result("s1", [_r_item(f"Tok{i:02d} alpha{i}", "s1") for i in range(65)]),
         _r_result("s2", [_r_item(f"Tok{i:02d} beta{i}", "s2") for i in range(65)])]
# 65 groups, all tied -> token order, truncated to MAX_GROUPS (60).
section("resonance", [
    {"input": r, "expected": scan.resonance_groups(copy.deepcopy(r))}
    for r in (res_a, res_b, res_c, res_d, res_e, res_f)])

# ---------------------------------------------------------------- store
def _store_golden():
    s = {"topics": []}
    steps = {}
    steps["upsert_new"] = copy.deepcopy(
        store.upsert_topic(s, "Model X", ["x", "github"], "必看", today=date(2026, 11, 11)))
    steps["upsert_update"] = copy.deepcopy(
        store.upsert_topic(s, "Model X", ["reddit", "x"], "关注", today=date(2026, 11, 12)))
    steps["upsert_second"] = copy.deepcopy(
        store.upsert_topic(s, "Old Topic", ["hn"], "苗头", today=date(2026, 10, 20)))
    # legacy record without a review key: upsert fills an empty review
    s["topics"].append({"name": "Legacy", "first_seen": "2026-11-01",
                        "last_seen": "2026-11-01", "sources": ["x"],
                        "history": [{"date": "2026-11-01", "grade": "关注"}]})
    steps["upsert_legacy_fills_review"] = copy.deepcopy(
        store.upsert_topic(s, "Legacy", ["y"], "必看", today=date(2026, 11, 5)))
    steps["due_at_14d_exact"] = [t["name"] for t in
                                  store.due_for_review(s, today=date(2026, 11, 3))]
    steps["due_later"] = [t["name"] for t in
                          store.due_for_review(s, today=date(2026, 11, 25))]
    steps["record_hit"] = copy.deepcopy(
        store.record_review(s, "Old Topic", "hit", today=date(2026, 11, 25)))
    steps["due_after_review"] = [t["name"] for t in
                                 store.due_for_review(s, today=date(2026, 11, 26))]
    try:
        store.record_review(s, "Model X", "maybe", today=date(2026, 11, 26))
        steps["record_invalid"] = None
    except ValueError as exc:
        steps["record_invalid"] = {"error_type": "ValueError", "error_arg": str(exc)}
    try:
        store.record_review(s, "Nope", "hit", today=date(2026, 11, 26))
        steps["record_missing"] = None
    except KeyError as exc:
        steps["record_missing"] = {"error_type": "KeyError", "error_arg": exc.args[0]}
    steps["final_store"] = copy.deepcopy(s)
    # file round-trip + missing file
    with tempfile.TemporaryDirectory() as td:
        p = str(Path(td) / "sub" / "seen.json")
        store.save_store(s, p)
        steps["roundtrip"] = store.load_store(p)
        steps["missing_file"] = store.load_store(str(Path(td) / "nope.json"))
    return steps


section("store", _store_golden())

# ----------------------------------------------------------------- vocab
def _vocab_golden():
    td = tempfile.mkdtemp()
    path = str(Path(td) / "vocab.json")
    cfg = {"vocab": {"window_days": 60, "state_file": path}}

    def gh(name):
        return {"source": "github", "name": name, "url": "https://example.com",
                "metrics": {}, "detail": ""}

    def hn(name):
        return {"source": "hackernews", "name": name, "url": "https://example.com",
                "metrics": {}, "detail": ""}

    rounds = []
    plan = [
        (NOW, [{"source": "github", "items": [gh("a/b"), gh("c/d")]},
               {"source": "hackernews", "items": [hn("Some Headline")]}]),
        (NOW, [{"source": "github", "items": [gh("a/b"), gh("e/f")]}]),
        (NOW + timedelta(days=61), [{"source": "github", "items": [gh("a/b")]}]),
    ]
    for when, results in plan:
        work = copy.deepcopy(results)
        stats = vocab.apply_vocab(work, copy.deepcopy(cfg), when)
        rounds.append({
            "now": when.isoformat(),
            "input": results,
            "expected": {
                "stats": stats,
                "novel_items": [i["name"] for r in work for i in r["items"]
                                if i.get("novel")],
                "saved_vocab": json.loads(Path(path).read_text(encoding="utf-8")),
            },
        })
    disabled = vocab.apply_vocab([], {"vocab": {"enabled": False}}, NOW)
    return {"rounds": rounds, "disabled": disabled,
            "entity_sources": sorted(vocab.ENTITY_SOURCES)}


section("vocab", _vocab_golden())

# ------------------------------------------------------------ topic_key
LEDGER = [{"name": "OpenAI GPT 模型发布引热议"}]
tk_cases = [
    ("Anthropic 完成新一轮融资", LEDGER),
    ("英伟达发布新芯片", []),
    ("黄仁勋现身台北", []),
    ("NVIDIA stock jumps", []),                # case-sensitive: no "Nvidia" substring
    ("OpenAI GPT 模型发布", LEDGER),            # exactly 6 shared publish tokens
    ("OpenAI 模型发布", LEDGER),                # 5 shared -> below threshold
    ("完全无关的话题", LEDGER),
    ("示例模型发布", []),
]
section("topic_key", [{"title": t, "ledger": led,
                       "expected": list(publish.topic_key({"title": t}, led))}
                      for t, led in tk_cases])

# ------------------------------------------------- buildTopics full chain
ED1 = {
    "date": "2026-11-12", "slot": "morning",
    "published_at": "2026-11-12T06:00:00+09:00", "title": "热点雷达 · 早报",
    "items": [
        {"level": "must", "title": "示例模型发布",
         "body": "正文 with <brackets> & symbols。", "action": "值得试。",
         "sources": ["官方博客"], "links": ["https://example.com/release"],
         "is_new": True},
        {"level": "seed", "title": "小苗头", "body": "单源，先记一笔。",
         "action": "仅记录。", "sources": ["小站"], "links": [], "is_new": True},
    ],
    "updates": [], "missing": ["X 未直读"], "pending_checks": [],
}
ED2 = {
    "date": "2026-11-12", "slot": "evening",
    "published_at": "2026-11-12T18:00:00+09:00", "title": "热点雷达 · 晚报",
    "items": [
        {"level": "must", "title": "示例模型发布", "body": "晚间跟进。",
         "action": "继续观察。", "sources": ["官方博客", "小站"],
         "links": ["https://example.com/release"], "is_new": False},
    ],
    "updates": [], "missing": [], "pending_checks": [],
}
ED3 = {
    "date": "2026-11-13", "slot": "morning",
    "published_at": "2026-11-13T06:00:00+09:00", "title": "热点雷达 · 早报",
    "items": [
        {"level": "must", "title": "示例模型发布", "body": "第三天继续发酵。",
         "action": "重点跟进。", "sources": ["官方博客", "小站", "大站", "外站"],
         "links": ["https://example.com/release", "https://example.com/followup"],
         "is_new": False},                                   # heat 156 vs 108 -> surge
        {"level": "watch", "title": "全新共振话题", "body": "两源同时报。",
         "action": "观察。", "sources": ["源A", "源B"],
         "links": ["https://example.com/reso"], "is_new": True},   # resonance
        {"level": "must", "title": "Anthropic 发布新模型", "body": "官方发布。",
         "action": "试用。", "sources": ["官方博客", "科技媒体"],
         "links": ["https://example.com/anthropic"], "is_new": True},  # arc + resonance
        {"level": "watch", "title": "OpenAI GPT 模型发布", "body": "台账匹配。",
         "action": "记录。", "sources": ["小站"],
         "links": ["https://example.com/led"], "is_new": True},        # ledger arc, 1 source
        {"level": "seed", "title": "单源新苗头", "body": "只有一个来源。",
         "action": "仅记录。", "sources": ["小站"], "links": [], "is_new": True},
    ],
    "updates": [], "missing": [], "pending_checks": [],
}
CHAIN_LEDGER = [{"name": "OpenAI GPT 模型发布引热议", "first_seen": "2026-11-10",
                 "last_seen": "2026-11-12", "sources": ["小站"],
                 "history": [{"date": "2026-11-10", "grade": "关注"}],
                 "review": {"due": None, "result": None, "checked_on": None,
                            "_first_seen": "2026-11-10"}}]


def _with_heat_rank(editions):
    """Mirror publish.load(): attach _heat, then _rank by heat desc."""
    eds = copy.deepcopy(editions)
    for ed in eds:
        for it in ed["items"]:
            it["_heat"] = publish.heat_of(it)
        ranked = sorted(ed["items"], key=lambda x: -x["_heat"])
        for i, it in enumerate(ranked, 1):
            it["_rank"] = i
    return eds


def _chain(editions, ledger):
    eds = _with_heat_rank(editions)
    topics = publish.build_topics(eds, copy.deepcopy(ledger))
    return {"editions": eds, "ledger": ledger, "topics": topics,
            "topics_data": publish.topics_data(eds, topics),
            "alerts_data": publish.alerts_data(eds, topics)}


section("chain", _chain([ED1, ED2, ED3], CHAIN_LEDGER))

# slug collisions + reserved names inside build_topics
COLLIDE_ED = {
    "date": "2026-11-14", "slot": "morning",
    "published_at": "2026-11-14T06:00:00+09:00", "title": "碰撞期",
    "items": [
        {"level": "seed", "title": "Hello World!", "body": "", "action": "",
         "sources": ["s"], "links": [], "is_new": True},
        {"level": "seed", "title": "Hello World?", "body": "", "action": "",
         "sources": ["s"], "links": [], "is_new": True},
        {"level": "seed", "title": "Index", "body": "", "action": "",
         "sources": ["s"], "links": [], "is_new": True},
        {"level": "seed", "title": "Rising", "body": "", "action": "",
         "sources": ["s"], "links": [], "is_new": False},
    ],
    "updates": [], "missing": [], "pending_checks": [],
}
section("chain_collide", _chain([COLLIDE_ED], []))
section("chain_empty", {"topics_data": publish.topics_data([], []),
                        "alerts_data": publish.alerts_data([], [])})

# --------------------------------------------------------- track record
TRACK_MD = """# 战绩台账

## 2026-11-11 试点期（复核日 2026-11-25）

| 级别 | 话题 | 复核标准 | 结果 |
| --- | --- | --- | --- |
| 🔥 | 话题甲 | 标准甲 | 命中 |
| 👀 | 话题乙 | 标准乙 | 未命中 |
| 🌱 | 话题丙 | 标准丙 |  |

## 2026-11-12 早报（复核日 2026-11-26）

| 级别 | 话题 | 复核标准 | 结果 |
| --- | --- | --- | --- |
| 🔥 | 话题丁 | 标准丁 | 命中，持续发酵 |
| 🚀 | 不是级别行 | 标准 | 命中 |

## 2026-11-13 空组（复核日 2026-11-27）

（暂无条目）
"""


def _track_golden():
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "track-record.md"
        p.write_text(TRACK_MD, encoding="utf-8")
        parsed = publish.parse_track_record(str(p))
        missing = publish.parse_track_record(str(Path(td) / "nope.md"))
    return {"markdown": TRACK_MD, "expected": parsed, "missing_file": missing}


section("track_record", _track_golden())

# ------------------------------------------------------------------ done
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(G, ensure_ascii=False, indent=1), encoding="utf-8")
counts = {k: (len(v) if isinstance(v, list) else "obj") for k, v in G.items()}
print(f"wrote {OUT}")
for k, v in counts.items():
    print(f"  {k}: {v}")
