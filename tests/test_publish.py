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
