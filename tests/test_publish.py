"""Logic tests for radar/publish.py (v3 site). No network access:
fixture sources are deliberately unmapped, so no favicon fetch happens."""

import json
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote

from radar import publish

ED1 = {
    "date": "2026-11-12",
    "slot": "morning",
    "published_at": "2026-11-12T06:00:00+09:00",
    "title": "热点雷达 · 早报",
    "items": [
        {
            "level": "must",
            "title": "示例模型发布",
            "body": "正文 with <brackets> & symbols。",
            "action": "值得试。",
            "sources": ["官方博客"],
            "links": ["https://example.com/release"],
            "is_new": True,
        },
        {
            "level": "seed",
            "title": "小苗头",
            "body": "单源，先记一笔。",
            "action": "仅记录。",
            "sources": ["小站"],
            "links": [],
            "is_new": True,
        },
    ],
    "updates": [],
    "missing": ["X 未直读"],
    "pending_checks": [],
}

ED2 = {
    "date": "2026-11-12",
    "slot": "evening",
    "published_at": "2026-11-12T18:00:00+09:00",
    "title": "热点雷达 · 晚报",
    "items": [
        {
            "level": "must",
            "title": "示例模型发布",
            "body": "晚间跟进。",
            "action": "继续观察。",
            "sources": ["官方博客", "小站"],
            "links": ["https://example.com/release"],
            "is_new": False,
        },
    ],
    "updates": [],
    "missing": [],
    "pending_checks": [],
}


def _write_editions(tmpdir):
    editions_dir = Path(tmpdir) / "editions"
    editions_dir.mkdir()
    for ed in (ED1, ED2):
        name = f"{ed['date']}-{ed['slot']}.json"
        (editions_dir / name).write_text(
            json.dumps(ed, ensure_ascii=False), encoding="utf-8")
    return editions_dir


def _build(tmpdir):
    editions_dir = _write_editions(tmpdir)
    out_dir = Path(tmpdir) / "site"
    publish.build("https://example.com/triple-sigma", out_dir, editions_dir)
    return out_dir


def test_build_writes_all_outputs():
    out_dir = _build(tempfile.mkdtemp())
    for name in ("index.html", "rising.html", "seeds.html", "categories.html",
                 "sources.html", "archive.html", "about.html",
                 "edition-2026-11-12-morning.html",
                 "edition-2026-11-12-evening.html",
                 "feed.xml", "atom.xml", "sitemap.xml", "robots.txt",
                 "llms.txt", "favicon.svg", "og-image.png",
                 "en/index.html", "ja/index.html",
                 "示例模型发布.html",      # topic page: title slug URL
                 "topic-t01.html",          # legacy redirect stub
                 "level-must.html", "level-seed.html"):
        assert (out_dir / name).exists(), name
    assert list(out_dir.glob("category-*.html")), "category pages written"
    index = (out_dir / "index.html").read_text(encoding="utf-8")
    assert "示例模型发布" in index and "浪尖雷达" in index
    assert "https://example.com/triple-sigma/" in index  # canonical base used
    assert quote("示例模型发布.html") in index  # rows link to the slug URL
    archive = (out_dir / "archive.html").read_text(encoding="utf-8")
    assert "2026-11-12" in archive  # grouped by date
    level = (out_dir / "level-must.html").read_text(encoding="utf-8")
    assert "tagchip on" in level  # tag group shown, focused tag highlighted
    sources = (out_dir / "sources.html").read_text(encoding="utf-8")
    assert "cfgpre" in sources and "per_feed" in sources  # verbatim YAML config
    assert (out_dir / "source-官方博客.html").exists()  # source detail page
    rising = (out_dir / "rising.html").read_text(encoding="utf-8")
    assert "本期没有上涨" in rising  # explicit empty state when nothing rose


def test_feeds_parse():
    out_dir = _build(tempfile.mkdtemp())
    ET.parse(out_dir / "feed.xml")
    ET.parse(out_dir / "atom.xml")
    feed = (out_dir / "feed.xml").read_text(encoding="utf-8")
    assert "示例模型发布" in feed
    assert quote("示例模型发布.html") in feed  # items link to topic slug pages


def test_creator_panel_can_be_switched_off():
    import importlib
    import os
    os.environ["TS_CREATOR"] = "0"
    try:
        importlib.reload(publish)
        out_dir = _build(tempfile.mkdtemp())
        main = (out_dir / "示例模型发布.html").read_text(encoding="utf-8")
        assert "创作参考" not in main
    finally:
        del os.environ["TS_CREATOR"]
        importlib.reload(publish)


def test_track_record_page_matches_ledger():
    out_dir = _build(tempfile.mkdtemp())
    for lang_dir in ("", "en/", "ja/"):
        tr = (out_dir / f"{lang_dir}track-record.html").read_text(encoding="utf-8")
        assert tr.count('class="tr-row"') == 24, lang_dir  # ledger rows
        assert "2026-11-25" in tr  # first review batch
        assert "Anthropic IPO" in tr and "黄仁勋" in tr
    zh = (out_dir / "track-record.html").read_text(encoding="utf-8")
    assert "已登记" in zh and "24" in zh
    assert "待复核" in zh  # blank results render as pending
    assert "首批复核 2026-11-25" in zh  # no invented hit rate before due date
    assert "话题弧" in zh and "事实核查优先" in zh  # judgement criteria
    index = (out_dir / "index.html").read_text(encoding="utf-8")
    # nav: 🏆 战绩 sits between 数据源 and 归档
    assert index.index("sources.html") < index.index("track-record.html") \
        < index.index("archive.html")
    assert "🏆 战绩" in index


def test_parse_track_record_counts():
    data = publish.parse_track_record()
    assert data["total"] == 24
    assert data["reviewed"] == 0
    assert data["first_review"] == "2026-11-25"
    assert len(data["groups"]) == 4
    assert sum(len(g["entries"]) for g in data["groups"]) == 24


def test_submit_page_and_bookmarklet():
    out_dir = _build(tempfile.mkdtemp())
    for lang_dir in ("", "en/", "ja/"):
        sub = (out_dir / f"{lang_dir}submit.html").read_text(encoding="utf-8")
        assert "github.com/daiyanze/breaker-delta/issues/new" in sub, lang_dir
        assert "template=seed.md" in sub
        assert "javascript:" in sub and "encodeURIComponent" in sub  # bookmarklet
        assert 'id="seedtext"' in sub and "URLSearchParams" in sub
        assert "标题：" in sub and "链接：" in sub and "理由：" in sub
    seeds = (out_dir / "seeds.html").read_text(encoding="utf-8")
    assert 'href="submit.html"' in seeds  # linked from the seeds page
    about = (out_dir / "about.html").read_text(encoding="utf-8")
    assert 'href="submit.html"' in about  # and from About


def test_data_files_structure_and_dedup():
    out_dir = _build(tempfile.mkdtemp())
    topics = json.loads((out_dir / "data" / "topics.json").read_text(encoding="utf-8"))
    assert topics["generated_at"]
    assert len(topics["topics"]) == 2  # fixture: merged example + one seed
    for t in topics["topics"]:
        for key in ("slug", "title", "heat", "first_seen", "level",
                    "url_patterns", "title_keywords"):
            assert key in t, key
    ex = next(t for t in topics["topics"] if t["slug"].startswith("示例"))
    assert ex["heat"] == 108 and ex["level"] == "must"
    assert "example.com/release" in ex["url_patterns"]
    assert ex["first_seen"] == "2026-11-12" and ex["title_keywords"]
    alerts = json.loads((out_dir / "data" / "alerts.json").read_text(encoding="utf-8"))
    keys = [a["dedupe_key"] for a in alerts["alerts"]]
    assert len(keys) == len(set(keys)), "alert dedupe keys must be unique"
    for a in alerts["alerts"]:
        assert a["reason"] in ("resonance", "surge")
        if a["heat_before"] == 0:
            assert a["reason"] == "resonance"  # surge is existing topics only
        assert a["dedupe_key"] == f"{a['topic_slug']}:{a['reason']}:2026-11-12-evening"
        for key in ("topic_slug", "title", "heat_before", "heat_after", "edition"):
            assert key in a, key


def test_topic_page_has_wave_chart_and_visible_nofollow_links():
    out_dir = _build(tempfile.mkdtemp())
    main = (out_dir / "示例模型发布.html").read_text(encoding="utf-8")
    assert "海浪图" in main
    assert "url(#wgrad)" in main  # area chart gradient fill
    assert 'class="orig"' in main and "<details>" not in main  # links shown directly
    assert 'rel="nofollow noopener"' in main
    assert "https://example.com/release" in main
    assert "Telegram" in main  # default share set is international platforms
    assert 'href="source-' in main  # history-table sources link to source pages
    assert "创作参考" in main and "钩子三选一" in main  # creator v2: hook options
    assert "Hormozi" in main  # long-form skeleton attribution
    assert 'class="help"' in main  # collapsible wave-height explainer
