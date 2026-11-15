#!/usr/bin/env python3
"""Golden fixtures for the @breaker-delta/fetchers parity tests.

Runs the Python fetchers' pure parse functions over canned payloads
and writes packages/fetchers/fixtures/golden-fetchers.json plus
golden-config.json. The TS tests replay the same inputs through the
TypeScript port and compare item by item.

Payload provenance: unless marked "extra", every payload below is
copied verbatim from tests/test_fetchers.py (the Python parser test
suite) so both sides are judged on exactly the fixtures the Python
tests already use. Deterministic: fixed NOW, no network.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radar.fetchers import (appstore, arxiv, bluesky, civitai, common,
                            dailypapers, devto, federalregister, github,
                            googlenews, hackernews, hfspaces, huggingface,
                            lobsters, mastodon, openrouter, producthunt,
                            reddit, showhn, sitemaps, wikipedia, x)

NOW = datetime(2026, 11, 12, tzinfo=timezone.utc)
NOW_ISO = "2026-11-12T00:00:00.000Z"
OUT_DIR = ROOT / "packages" / "fetchers" / "fixtures"

G: dict = {"now": NOW_ISO}

# ---- github (tests: test_github_breakout_math / _old_repo / _trending) ----
gh_search_cases = []
for payload, cfg in [
    ({"items": [{"full_name": "acme/fastthing",
                 "html_url": "https://github.com/acme/fastthing",
                 "stargazers_count": 3000, "created_at": "2026-11-02T00:00:00Z",
                 "description": "fast thing"}]},
     {"max_age_days": 14, "min_stars_per_day": 200}),
    ({"items": [{"full_name": "acme/old", "html_url": "https://github.com/acme/old",
                 "stargazers_count": 9000, "created_at": "2025-01-01T00:00:00Z",
                 "description": ""}]},
     {}),
]:
    gh_search_cases.append({"payload": payload, "cfg": cfg,
                            "expected": github.parse_search(payload, NOW, cfg)})
G["github_parse_search"] = gh_search_cases

_trending_html = ('<article class="Box-row"><h2><a href="/meta/astryx">x</a></h2>'
                  '<a href="/meta/astryx/stargazers">23,622</a>'
                  '<span>3,108 stars today</span></article>')
G["github_parse_trending"] = [{"html": _trending_html,
                               "expected": github.parse_trending(_trending_html)}]

# ---- hackernews / showhn ----
_hn_payload = {"hits": [
    {"title": "Big Story", "url": "https://example.com", "points": 500,
     "num_comments": 200, "objectID": "1"},
    {"title": None, "url": None, "points": 1, "num_comments": 0, "objectID": "2"}]}
G["hackernews_parse"] = [{"payload": _hn_payload, "expected": hackernews.parse(_hn_payload)}]
_sh_payload = {"hits": [{"title": "Show HN: Thing", "url": None, "points": 12,
                         "num_comments": 3, "objectID": "99"}]}
G["showhn_parse"] = [{"payload": _sh_payload, "expected": showhn.parse(_sh_payload)}]

# ---- huggingface / hfspaces ----
_hf_payload = [{"id": "acme/new-model", "likes": 10, "downloads": 100,
                "createdAt": "2026-11-10T00:00:00.000Z"},
               {"id": "acme/old-model", "likes": 99, "downloads": 999,
                "createdAt": "2025-01-01T00:00:00.000Z"}]
G["huggingface_parse"] = [{"payload": _hf_payload,
                           "expected": huggingface.parse(_hf_payload, NOW)}]
_hfs_payload = [{"id": "acme/demo", "likes": 5, "trendingScore": 10, "sdk": "gradio",
                 "createdAt": "2026-11-10T00:00:00.000Z"}]
G["hfspaces_parse"] = [{"payload": _hfs_payload,
                        "expected": hfspaces.parse(_hfs_payload, NOW)}]

# ---- reddit ----
_rd_payload = {"data": {"children": [
    {"data": {"title": "Pinned", "permalink": "/r/x/1", "score": 1,
              "num_comments": 0, "stickied": True}},
    {"data": {"title": "Real Post", "permalink": "/r/x/2", "score": 42,
              "num_comments": 7, "stickied": False}}]}}
G["reddit_parse"] = [{"payload": _rd_payload, "subreddit": "x",
                      "expected": reddit.parse(_rd_payload, "x")}]
_rd_xml = ('<feed xmlns="http://www.w3.org/2005/Atom">'
           '<entry><title>Cool local model</title>'
           '<link href="https://www.reddit.com/r/LocalLLaMA/comments/abc"/></entry></feed>')
G["reddit_parse_rss"] = [{"xml": _rd_xml, "subreddit": "LocalLLaMA",
                          "expected": reddit.parse_rss(_rd_xml, "LocalLLaMA")}]

# ---- googlenews ----
_gn_xml = ('<rss><channel><item><title>Story - Outlet</title>'
           '<link>https://example.com/s</link><pubDate>Wed, 12 Nov 2026</pubDate>'
           '<source url="https://example.com">Outlet</source></item></channel></rss>')
G["googlenews_parse"] = [{"xml": _gn_xml, "expected": googlenews.parse(_gn_xml)}]

# ---- common.parse_feed / producthunt.parse_feed ----
_rss = ('<rss><channel><item><title>Launch</title>'
        '<link>https://example.com/a</link><pubDate>Thu, 13 Nov 2026</pubDate>'
        '</item></channel></rss>')
_atom = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Post</title>'
         '<link rel="alternate" href="https://example.com/b"/>'
         '<published>2026-11-13T00:00:00Z</published></entry></feed>')
G["parse_feed"] = [
    {"xml": _rss, "source": "official_blogs", "outlet": "Example", "limit": 5,
     "expected": common.parse_feed(_rss, "official_blogs", "Example")},
    {"xml": _atom, "source": "tech_media", "outlet": "Atom Blog", "limit": 5,
     "expected": common.parse_feed(_atom, "tech_media", "Atom Blog")},
]
_ph_atom = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>NewTool</title>'
            '<link href="https://www.producthunt.com/posts/newtool"/></entry></feed>')
G["producthunt_parse_feed"] = [{"xml": _ph_atom,
                                "expected": producthunt.parse_feed(_ph_atom)}]
# extra: GraphQL parse has no Python test; payload mirrors the API shape.
_ph_payload = {"data": {"posts": {"edges": [
    {"node": {"name": "Tool", "tagline": "Does things",
              "url": "https://www.producthunt.com/posts/tool",
              "votesCount": 123, "commentsCount": 45}}]}}}
G["producthunt_parse"] = [{"payload": _ph_payload, "extra": True,
                           "expected": producthunt.parse(_ph_payload)}]

# ---- arxiv ----
_ax_xml = ('<feed xmlns="http://www.w3.org/2005/Atom" '
           'xmlns:arxiv="http://arxiv.org/schemas/atom"><entry>'
           '<id>http://arxiv.org/abs/2611.00001v1</id>'
           '<title>A  New\n Method</title><published>2026-11-12T00:00:00Z</published>'
           '<summary>We propose things.</summary>'
           '<arxiv:primary_category term="cs.CL"/>'
           '<author><name>A</name></author></entry></feed>')
G["arxiv_parse"] = [{"xml": _ax_xml, "expected": arxiv.parse(_ax_xml)}]

# ---- openrouter (timestamps derived from NOW exactly like the test) ----
_recent = int(NOW.timestamp()) - 2 * 86400
_old = int(NOW.timestamp()) - 200 * 86400
_or_payload = {"data": [
    {"id": "acme/old", "name": "Old", "created": _old},
    {"id": "acme/new", "name": "New", "created": _recent, "context_length": 128000}]}
G["openrouter_parse"] = [{"payload": _or_payload,
                          "expected": openrouter.parse(_or_payload, NOW)}]

# ---- devto / lobsters ----
_dev_payload = [{"title": "Post", "url": "https://dev.to/x",
                 "public_reactions_count": 40, "comments_count": 5,
                 "reading_time_minutes": 3, "description": "d"}]
G["devto_parse"] = [{"payload": _dev_payload, "expected": devto.parse(_dev_payload)}]
_lob_payload = [{"title": "Story", "url": "https://example.com",
                 "comments_url": "https://lobste.rs/s/abc", "score": 30,
                 "comment_count": 9, "tags": ["ai"]}]
G["lobsters_parse"] = [{"payload": _lob_payload, "expected": lobsters.parse(_lob_payload)}]

# ---- mastodon ----
_mas_links = [{"title": "Big Story", "url": "https://x.example",
               "provider_name": "Outlet", "description": "d",
               "history": [{"accounts": "42", "uses": "50"}]}]
_mas_tags = [{"name": "ai", "url": "https://m/tags/ai", "history": [{"accounts": "7"}]}]
G["mastodon_parse_links"] = [{"payload": _mas_links,
                              "expected": mastodon.parse_links(_mas_links)}]
G["mastodon_parse_tags"] = [{"payload": _mas_tags,
                             "expected": mastodon.parse_tags(_mas_tags)}]

# ---- civitai ----
_civ_payload = {"items": [{"id": 7, "name": "Model X", "type": "Checkpoint",
                           "stats": {"downloadCount": 100, "thumbsUpCount": 9},
                           "modelVersions": [{"baseModel": "Flux"}]}]}
G["civitai_parse"] = [{"payload": _civ_payload, "expected": civitai.parse(_civ_payload)}]

# ---- appstore ----
_app_payload = {"feed": {"results": [
    {"name": "AppA", "url": "https://apps.apple.com/a", "artistName": "A Inc",
     "genres": [{"name": "Productivity"}]},
    {"name": "AppB", "url": "https://apps.apple.com/b", "artistName": "B Inc",
     "genres": []}]}}
G["appstore_parse"] = [{"payload": _app_payload, "chart": "top-grossing",
                        "expected": appstore.parse(_app_payload, "top-grossing")}]
# extra: legacy parser has no Python test; payload mirrors the legacy shape.
_app_legacy = {"feed": {"entry": [
    {"im:name": {"label": "Legacy App"},
     "link": [{"attributes": {"href": "https://apps.apple.com/legacy"}}],
     "category": {"attributes": {"label": "Utilities"}},
     "im:artist": {"label": "Legacy Inc"}}]}}
G["appstore_parse_legacy"] = [{"payload": _app_legacy, "chart": "top-free", "extra": True,
                               "expected": appstore.parse_legacy(_app_legacy, "top-free")}]

# ---- sitemaps ----
_sm_xml1 = ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            '<url><loc>https://www.futurepedia.io/tool/new-thing</loc>'
            '<lastmod>2026-11-11T00:00:00.000Z</lastmod></url>'
            '<url><loc>https://www.futurepedia.io/tool/old-thing</loc>'
            '<lastmod>2026-01-01T00:00:00.000Z</lastmod></url>'
            '<url><loc>https://www.futurepedia.io/ai-tools</loc></url></urlset>')
_sm_site1 = {"name": "futurepedia", "pattern": r"/tool/([^/]+)$", "max_age_days": 7}
_sm_xml2 = ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            '<url><loc>https://aitoptools.com/tool/naive-date</loc>'
            '<lastmod>2026-11-11</lastmod></url>'
            '<url><loc>https://aitoptools.com/tool/aware-date</loc>'
            '<lastmod>2026-11-10T00:00:00.000Z</lastmod></url></urlset>')
_sm_site2 = {"name": "aitoptools", "pattern": r"/tool/([^/]+)/?$"}
G["sitemaps_parse_urlset"] = [
    {"xml": _sm_xml1, "site": _sm_site1,
     "expected": sitemaps.parse_urlset(_sm_xml1, _sm_site1, NOW)},
    {"xml": _sm_xml2, "site": _sm_site2,
     "expected": sitemaps.parse_urlset(_sm_xml2, _sm_site2, NOW)},
]
_sm_idx1 = ('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            '<sitemap><loc>https://www.toolify.ai/sitemap_tools_2.xml</loc></sitemap>'
            '<sitemap><loc>https://www.toolify.ai/sitemap_tools_10.xml</loc></sitemap>'
            '<sitemap><loc>https://www.toolify.ai/sitemap_index_1.xml</loc></sitemap>'
            '</sitemapindex>')
_sm_idx2 = ('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            '<sitemap><loc>https://opentools.ai/pages-sitemap.xml</loc></sitemap>'
            '<sitemap><loc>https://opentools.ai/tools-sitemap.xml</loc></sitemap>'
            '</sitemapindex>')
G["sitemaps_parse_index"] = [
    {"xml": _sm_idx1, "pattern": r"sitemap_tools_(\d+)\.xml$",
     "expected": sitemaps.parse_index(_sm_idx1, r"sitemap_tools_(\d+)\.xml$")},
    {"xml": _sm_idx2, "pattern": r"/tools-sitemap\.xml$",
     "expected": sitemaps.parse_index(_sm_idx2, r"/tools-sitemap\.xml$")},
]


def _sm_item(url):
    return {"source": "sitemaps", "name": url.rsplit("/", 1)[-1],
            "url": url, "metrics": {}, "detail": ""}


_diff_steps = []
_items_ab = [_sm_item("https://x.io/tool/a"), _sm_item("https://x.io/tool/b")]
_fresh, _seen, _base = sitemaps.diff_items(_items_ab, {}, NOW)
_diff_steps.append({"items": _items_ab, "seen": {},
                    "expected": {"fresh": _fresh, "seen": _seen, "baseline": _base}})
_items_abc = _items_ab + [_sm_item("https://x.io/tool/c")]
_fresh, _seen2, _base = sitemaps.diff_items(_items_abc, _seen, NOW)
_diff_steps.append({"items": _items_abc, "seen": _seen,
                    "expected": {"fresh": _fresh, "seen": _seen2, "baseline": _base}})
_fresh, _seen3, _base = sitemaps.diff_items(_items_abc, _seen2, NOW)
_diff_steps.append({"items": _items_abc, "seen": _seen2,
                    "expected": {"fresh": _fresh, "seen": _seen3, "baseline": _base}})
_prune_seen = {"https://x.io/tool/gone": "2026-01-01",
               "https://x.io/tool/recent": "2026-11-01"}
_fresh, _seen4, _base = sitemaps.diff_items([], _prune_seen, NOW)
_diff_steps.append({"items": [], "seen": _prune_seen,
                    "expected": {"fresh": _fresh, "seen": _seen4, "baseline": _base}})
G["sitemaps_diff"] = _diff_steps

# ---- dailypapers ----
_dp_payload = [{"title": "T", "numComments": 4,
                "paper": {"id": "2611.08219", "title": "Agent Scaling",
                          "summary": "We scale.", "upvotes": 42,
                          "authors": [{"name": "A"}, {"name": "B"}],
                          "githubRepo": "acme/agent"}}]
G["dailypapers_parse"] = [{"payload": _dp_payload,
                           "expected": dailypapers.parse(_dp_payload)}]

# ---- bluesky ----
_bs_xml = ('<rss><channel><item>'
           '<link>https://bsky.app/profile/x/post/1</link>'
           '<description>Big news: a new model dropped</description>'
           '<pubDate>13 Nov 2026 00:36 +0000</pubDate>'
           '</item></channel></rss>')
G["bluesky_parse"] = [{"xml": _bs_xml, "handle": "x", "limit": 10,
                       "expected": bluesky.parse(_bs_xml, "x")}]

# ---- wikipedia ----
_wiki_payload = {"items": [{"articles": [
    {"article": "Main_Page", "views": 4000000, "rank": 1},
    {"article": "Jensen_Huang", "views": 1000000, "rank": 2},
    {"article": "Special:Search", "views": 900000, "rank": 3},
    {"article": "Some_Event", "views": 500000, "rank": 4}]}]}
G["wikipedia_parse"] = [{"payload": _wiki_payload, "limit": 25,
                         "expected": wikipedia.parse(_wiki_payload)}]

# ---- federalregister ----
_fr_payload = {"results": [
    {"title": "AI Safety Rule", "html_url": "https://www.federalregister.gov/d/1",
     "abstract": "A rule about AI.", "publication_date": "2026-11-14",
     "type": "Rule"},
    {"title": "", "html_url": "https://www.federalregister.gov/d/2"},
    {"title": "No URL Doc"}]}
G["federalregister_parse"] = [{"payload": _fr_payload, "limit": 10,
                               "expected": federalregister.parse(_fr_payload, 10)}]

# ---- x (extra: no Python parse test; payload mirrors the API shape) ----
_x_payload = {"data": [{"id": "123", "text": "hello world",
                        "public_metrics": {"like_count": 9}}]}
G["x_parse"] = [{"payload": _x_payload, "extra": True,
                 "expected": x.parse(_x_payload)}]

OUT_DIR.mkdir(parents=True, exist_ok=True)
(OUT_DIR / "golden-fetchers.json").write_text(
    json.dumps(G, ensure_ascii=False, indent=1), encoding="utf-8")

# ---- config golden: PyYAML is production's parser (PyYAML 6.0.1 here) ----
import yaml  # noqa: E402

cfg_golden = {
    "yaml_file": "config.example.yaml",
    "json_file": "config.example.json",
    "expected_from_yaml": yaml.safe_load(
        (ROOT / "config.example.yaml").read_text(encoding="utf-8")),
    "expected_from_json": json.loads(
        (ROOT / "config.example.json").read_text(encoding="utf-8")),
}
(OUT_DIR / "golden-config.json").write_text(
    json.dumps(cfg_golden, ensure_ascii=False, indent=1), encoding="utf-8")

counts = {k: len(v) for k, v in G.items() if isinstance(v, list)}
print("golden-fetchers cases:", counts)
print("total parse cases:", sum(counts.values()))
print("config golden written")
