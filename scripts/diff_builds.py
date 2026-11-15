#!/usr/bin/env python3
"""Layer-A parity check for the Node migration (Phase 3, publisher).

Builds the tests/test_publish.py fixture (ED1/ED2 + the synthetic
track-record ledger) twice — once with radar/publish.py, once with
@breaker-delta/publisher via scripts/run_publish.mjs — and compares
the two output trees byte for byte. Both builds share the repo's
real assets/, config.example.* and radar/favicon-cache (the fixture
sources are deliberately unmapped, so no favicon fetch happens);
the favicon meta.json hash is printed before/after each build to
prove the cache file is untouched in content.

Usage: python3 scripts/diff_builds.py [--keep]
Exit code 0 when the trees are identical, 1 otherwise.
"""

import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def load_test_module():
    spec = importlib.util.spec_from_file_location(
        "test_publish", ROOT / "tests" / "test_publish.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def meta_hash():
    p = ROOT / "radar" / "favicon-cache" / "meta.json"
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "-"


def tree_bytes(base):
    out = {}
    for p in sorted(base.rglob("*")):
        if p.is_file():
            out[str(p.relative_to(base))] = p.read_bytes()
    return out


def main():
    keep = "--keep" in sys.argv
    mod = load_test_module()
    work = Path(tempfile.mkdtemp(prefix="bd-diff-"))
    try:
        editions_dir = mod._write_editions(work)
        track = mod._write_track_record(work)

        print(f"favicon meta.json before: {meta_hash()}")
        py_out = work / "py-site"
        mod.publish.build("https://example.com/triple-sigma", py_out,
                          editions_dir, track_record_path=track)
        print(f"favicon meta.json after python: {meta_hash()}")

        opts = {
            "rootDir": str(ROOT),
            "editionsDir": str(editions_dir),
            "trackRecordPath": str(track),
            "outDir": str(work / "node-site"),
            "baseUrl": "https://example.com/triple-sigma",
        }
        opts_path = work / "opts.json"
        opts_path.write_text(json.dumps(opts), encoding="utf-8")
        subprocess.run(
            ["node", str(ROOT / "scripts" / "run_publish.mjs"), str(opts_path)],
            check=True, cwd=ROOT, capture_output=True, text=True)
        print(f"favicon meta.json after node: {meta_hash()}")
        node_out = work / "node-site"

        a, b = tree_bytes(py_out), tree_bytes(node_out)
        names = sorted(set(a) | set(b))
        diffs = []
        for name in names:
            if name not in a:
                diffs.append((name, "only in node build"))
            elif name not in b:
                diffs.append((name, "only in python build"))
            elif a[name] != b[name]:
                x, y = a[name], b[name]
                i = next((k for k in range(min(len(x), len(y)))
                          if x[k] != y[k]), min(len(x), len(y)))
                diffs.append((name,
                              f"bytes differ at offset {i} "
                              f"(py {len(x)}B vs node {len(y)}B)\n"
                              f"    py:   {x[max(0, i - 60):i + 60]!r}\n"
                              f"    node: {y[max(0, i - 60):i + 60]!r}"))
        print(f"files compared: {len(names)} | identical: "
              f"{len(names) - len(diffs)} | different: {len(diffs)}")
        for name, why in diffs:
            print(f"DIFF {name}: {why}")
        return 1 if diffs else 0
    finally:
        if keep:
            print(f"kept workdir: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
