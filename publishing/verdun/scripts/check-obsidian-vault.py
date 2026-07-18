#!/usr/bin/env python3
"""Validate the generated full Verdun Obsidian vault."""
from __future__ import annotations
import json
import sys
from pathlib import Path

REQUIRED = ["Home.md", "README.md", "Verdun/Book.md", "Verdun/Architecture.md", "Verdun/Examples.md", "Verdun/Codebase Index.md", "Verdun/_data/manifest.json", "Verdun/_data/units.jsonl"]

def main() -> int:
    root = Path(sys.argv[1]).resolve()
    missing = [item for item in REQUIRED if not (root / item).exists()]
    if missing:
        raise SystemExit("missing: " + ", ".join(missing))
    manifest = json.loads((root / "Verdun/_data/manifest.json").read_text())
    units = [line for line in (root / "Verdun/_data/units.jsonl").read_text().splitlines() if line]
    assert manifest["chapter_count"] >= 8, manifest
    assert manifest["code_file_count"] >= 50, manifest
    assert len(units) == manifest["unit_count"], (len(units), manifest)
    assert "[[Verdun/Codebase/" in (root / "Verdun/Examples.md").read_text()
    print(f"full vault ok: {manifest['chapter_count']} chapters, {manifest['code_file_count']} code notes")
    return 0
if __name__ == "__main__": raise SystemExit(main())
