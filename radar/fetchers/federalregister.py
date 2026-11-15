"""Federal Register fetcher: US federal policy documents (L1).

The Federal Register API (federalregister.gov) is free and keyless
and carries the primary text of US rules, proposed rules, notices
and presidential documents — the earliest citable source on the
policy & regulation beat, weeks before media coverage. The search
term is configurable (`sources.federal_register.term`).
"""

from __future__ import annotations

import urllib.parse

from . import common

SOURCE = "federal_register"
LAYER = 1

API = "https://www.federalregister.gov/api/v1/documents.json"
FIELDS = ("title", "html_url", "abstract", "publication_date", "type")


def parse(payload: dict, limit: int = 10) -> list[dict]:
    """Pure parser for the documents response (unit-tested)."""
    items = []
    for doc in (payload or {}).get("results", [])[:limit]:
        title = (doc.get("title") or "").strip()
        url = doc.get("html_url") or ""
        if not title or not url:
            continue
        items.append({
            "source": SOURCE,
            "name": title,
            "url": url,
            "metrics": {"outlet": "Federal Register",
                        "published": doc.get("publication_date"),
                        "type": doc.get("type")},
            "detail": (doc.get("abstract") or "")[:300],
        })
    return items


def fetch(config: dict, now=None) -> dict:
    cfg = config.get("sources", {}).get("federal_register", {})
    term = cfg.get("term", "artificial intelligence")
    limit = cfg.get("limit", 10)
    query = urllib.parse.urlencode({
        "conditions[term]": term, "per_page": limit, "order": "newest",
    })
    fields = "".join(f"&fields%5B%5D={name}" for name in FIELDS)
    try:
        payload = common.get_json(f"{API}?{query}{fields}")
        items = parse(payload, limit)
        if not items:
            return common.missing(SOURCE, LAYER, f"no documents matched {term!r}")
        return common.ok(SOURCE, LAYER, items)
    except common.FetchError as exc:
        return common.missing(SOURCE, LAYER, str(exc))
