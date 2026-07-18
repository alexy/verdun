#!/usr/bin/env python3
"""Validate the compact Verdun mobile Reader vault."""
from __future__ import annotations
import json, sys
from pathlib import Path
def main() -> int:
    root = Path(sys.argv[1]).resolve(); manifest_path = root / "Verdun/_data/mobile-manifest.json"
    assert (root / "Home.md").exists() and manifest_path.exists() and (root / "Verdun/_data/units.jsonl").exists()
    manifest = json.loads(manifest_path.read_text()); pages = list((root / "Verdun/Reader").glob("*.md"))
    assert len(pages) == manifest["reader_page_count"] >= 8
    assert len(list((root / "Verdun/Examples").glob("*.md"))) == manifest["example_count"] == 5
    assert not (root / "Verdun/Codebase").exists()
    print(f"mobile vault ok: {len(pages)} Reader pages, {manifest['example_count']} examples")
    return 0
if __name__ == "__main__": raise SystemExit(main())
