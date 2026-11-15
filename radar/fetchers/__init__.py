"""Fetcher registry. Order is the methodology's layer order."""

from __future__ import annotations

from . import (appstore, arxiv, bluesky, civitai, dailypapers, devto,
               federalregister, github, googlenews, hackernews, hfspaces,
               huggingface, lobsters, mastodon, media, official, openrouter,
               producthunt, reddit, releases, showhn, sitemaps, stackexchange,
               wikipedia, x)

# L1 source layer first, then L2 fermentation. X stays first: when a
# token is configured it is the earliest signal of all.
FETCHERS = [x, official, github, hackernews, showhn, huggingface, hfspaces,
            openrouter, civitai, arxiv, dailypapers, bluesky, producthunt,
            releases, federalregister,
            reddit, media, devto, lobsters, stackexchange, mastodon,
            wikipedia, sitemaps, appstore, googlenews]

__all__ = ["FETCHERS"]
