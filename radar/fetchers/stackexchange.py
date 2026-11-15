"""Stack Exchange fetcher: hot network questions (L2).

The network-wide hot-questions Atom feed is free and keyless. What
working developers across all Stack Exchange sites are stuck on
right now is a demand signal — the same family as DEV.to and
Lobsters, but question-shaped: problems, not posts.
"""

from __future__ import annotations

from . import common

SOURCE = "stackexchange"
LAYER = 2

DEFAULT_FEEDS = [
    {"name": "Stack Exchange · Hot Questions",
     "url": "https://stackexchange.com/feeds/questions"},
]


def fetch(config: dict, now=None) -> dict:
    cfg = config.get("sources", {}).get("stackexchange", {})
    feeds = cfg.get("feeds", DEFAULT_FEEDS)
    return common.fetch_feed_bundle(SOURCE, LAYER, feeds, cfg.get("per_feed", 20))
