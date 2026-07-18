#!/usr/bin/env python3
"""First Pair entrypoint for the source-owned Verdun vault validators."""
from __future__ import annotations
import json
import runpy
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
vault = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
mobile_manifest = vault / "Verdun/_data/mobile-manifest.json" if vault else None
script = "check-obsidian-mobile-vault.py" if mobile_manifest and mobile_manifest.exists() else "check-obsidian-vault.py"
runpy.run_path(str(root / "publishing/verdun/scripts" / script), run_name="__main__")
