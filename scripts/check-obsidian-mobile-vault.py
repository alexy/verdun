#!/usr/bin/env python3
"""Run Verdun's source-owned mobile vault validator from the repository root."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "publishing/verdun/scripts/check-obsidian-mobile-vault.py"


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} VAULT")
    subprocess.run([sys.executable, str(VALIDATOR), sys.argv[1]], cwd=ROOT, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
