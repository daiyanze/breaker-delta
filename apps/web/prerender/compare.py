#!/usr/bin/env python3
"""Normalized equivalence check for prerendered pages (Rewrite
Phase 3c): compares a prerender output dir against the frozen
golden build on visible text + link inventory per page — the
gate a page type must pass before its static rendering switches
to the React prerender. Byte equality is NOT expected (React
comment nodes, attribute order); the registered differences are
listed in REWRITE-DESIGN.md's Phase 3 execution record.

Usage: compare.py <golden-site-dir> <prerender-out-dir> <relpath>...
Exit code 0 when every listed page matches modulo nothing at
all; differences are printed either way for the record.
"""

import re
import sys
from collections import Counter


def visible_text(html: str) -> str:
    html = re.sub(r"<head>.*?</head>", "", html, flags=re.S)
    html = re.sub(r"<script.*?</script>", "", html, flags=re.S)
    html = re.sub(r"<style.*?</style>", "", html, flags=re.S)
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def hrefs(html: str) -> Counter:
    return Counter(re.findall(r'href="([^"]*)"', html))


def main() -> int:
    golden_dir, out_dir, rels = sys.argv[1], sys.argv[2], sys.argv[3:]
    bad = 0
    for rel in rels:
        g = open(f"{golden_dir}/{rel}", encoding="utf-8").read()
        n = open(f"{out_dir}/{rel}", encoding="utf-8").read()
        gt, nt = visible_text(g), visible_text(n)
        gh, nh = hrefs(g), hrefs(n)
        parts = []
        if gt == nt:
            parts.append("text EQUAL")
        else:
            i = next(
                (k for k in range(min(len(gt), len(nt))) if gt[k] != nt[k]),
                min(len(gt), len(nt)),
            )
            parts.append(
                f"text DIFF at {i}: golden ...{gt[max(0, i - 30):i + 40]!r} "
                f"vs new ...{nt[max(0, i - 30):i + 40]!r}"
            )
            bad = 1
        if gh == nh:
            parts.append("hrefs EQUAL")
        else:
            parts.append(
                f"hrefs DIFF golden-only={dict(gh - nh)} new-only={dict(nh - gh)}"
            )
            bad = 1
        print(rel, "|", " | ".join(parts))
    return bad


if __name__ == "__main__":
    sys.exit(main())
