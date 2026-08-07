#!/usr/bin/env python3
"""Thin FirstPair dispatcher for Verdun's native desktop and mobile vaults."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_ROOT = "publishing/verdun/scripts"


def command(action: str, product: str, output: Path) -> list[str]:
    if action == "build":
        name = "build-obsidian-vault.py" if product == "desktop" else "build-obsidian-mobile-vault.py"
        return [sys.executable, f"{SCRIPT_ROOT}/{name}", "--output", str(output)]
    name = "check-obsidian-vault.py" if product == "desktop" else "check-obsidian-mobile-vault.py"
    return [sys.executable, f"{SCRIPT_ROOT}/{name}", str(output)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("build", "validate"))
    parser.add_argument("product", choices=("desktop", "mobile"))
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    subprocess.run(command(args.action, args.product, args.output.resolve()), cwd=ROOT, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
