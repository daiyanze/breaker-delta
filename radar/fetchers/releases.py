"""GitHub Releases watcher: flagship OSS release feeds (L1).

Version releases of the projects the local-AI ecosystem actually
runs on — llama.cpp, vLLM, Claude Code. A release is a first-hand
artifact (the thing itself changed), so this sits in the source
layer; the three feeds together count as ONE source for resonance.

Feed list lives in config (`sources.gh_releases.feeds`), so users
can point the watch at their own stack's flagship projects.
"""

from __future__ import annotations

from . import common

SOURCE = "gh_releases"
LAYER = 1

DEFAULT_FEEDS = [
    {"name": "llama.cpp Releases", "url": "https://github.com/ggml-org/llama.cpp/releases.atom"},
    {"name": "vLLM Releases", "url": "https://github.com/vllm-project/vllm/releases.atom"},
    {"name": "Claude Code Releases", "url": "https://github.com/anthropics/claude-code/releases.atom"},
]


def fetch(config: dict, now=None) -> dict:
    cfg = config.get("sources", {}).get("gh_releases", {})
    feeds = cfg.get("feeds", DEFAULT_FEEDS)
    return common.fetch_feed_bundle(SOURCE, LAYER, feeds, cfg.get("per_feed", 5))
