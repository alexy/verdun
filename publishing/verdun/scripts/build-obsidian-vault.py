#!/usr/bin/env python3
"""Build the Verdun codebase-reading Obsidian vault from canonical sources.

This builder must only be run after Obsidian has been closed for the target
vault. It writes the complete manuscript, a linked codebase reading map, and
the source files as Markdown notes rather than copying a working checkout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
BOOK = ROOT / "publishing" / "verdun"
DEFAULT_OUTPUT = BOOK / "dist-obsidian" / "Verdun Vault"
VAULT_BOOK = "Verdun"
TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".mjs", ".rs", ".sh", ".sql", ".toml", ".ts", ".vue", ".yaml", ".yml"}
SKIP_DIRS = {".git", "build", "dist", "dist-full", "dist-obsidian", "node_modules", "target", "tmp", "coverage", ".vercel"}
HEADINGS = re.compile(r"^# (.+)$", re.M)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_head() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except subprocess.CalledProcessError:
        return "unknown"


def safe_name(path: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", path).strip("-")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def note(path: Path, title: str, body: str, **meta: object) -> None:
    front = {"title": title, **meta}
    lines = ["---", *[f"{key}: {json.dumps(value)}" for key, value in front.items()], "---", "", body]
    write(path, "\n".join(lines))


def code_files() -> list[Path]:
    result: list[Path] = []
    for item in ROOT.rglob("*"):
        if not item.is_file() or any(part in SKIP_DIRS for part in item.relative_to(ROOT).parts):
            continue
        if item.suffix.lower() in TEXT_SUFFIXES or item.name in {"Dockerfile", "Makefile", "LICENSE"}:
            result.append(item)
    return sorted(result)


def section_text(manuscript: str) -> list[tuple[str, str]]:
    matches = list(HEADINGS.finditer(manuscript))
    pieces: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(manuscript)
        pieces.append((match.group(1), manuscript[match.start():end].strip()))
    return pieces


def build(output: Path) -> dict[str, object]:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    manuscript = (BOOK / "manuscript.md").read_text(encoding="utf-8")
    chapters = section_text(manuscript)
    root = output / VAULT_BOOK
    chapter_links: list[str] = []
    units: list[dict[str, object]] = []
    for number, (title, text) in enumerate(chapters, 1):
        slug = f"{number:02d}-{safe_name(title).lower()}"
        target = root / "Chapters" / f"{slug}.md"
        note(target, title, f"[[{VAULT_BOOK}/Book|Book index]]\n\n{text}", kind="chapter", source="publishing/verdun/manuscript.md", ordinal=number)
        chapter_links.append(f"- [[{VAULT_BOOK}/Chapters/{slug}|{number}. {title}]]")
        units.append({"kind": "chapter", "path": target.relative_to(output).with_suffix("").as_posix(), "source": "publishing/verdun/manuscript.md"})
    note(root / "Book.md", "Verdun: A Framework for Shared Work", "# Verdun\n\n" + "\n".join(chapter_links) + "\n\n## Reading the implementation\n\n- [[Verdun/Examples|Examples]]\n- [[Verdun/Codebase Index|Codebase index]]\n- [[Verdun/Architecture|Architecture map]]", kind="book-index")
    architecture = """# Architecture map

Verdun keeps shared contracts in the core and leaves product behavior in external applications.

- [[Verdun/Codebase/src-core-workbench.ts|Workbench contract]]
- [[Verdun/Codebase/src-accounts-store.ts|Unified accounts]]
- [[Verdun/Codebase/api-workbench-_db.ts|Neon/Postgres boundary]]
- [[Verdun/Codebase/crawler-src-sdk.rs|Rust crawler SDK]]
- [[Verdun/Codebase/api-workbench-health.ts|Vercel health route]]
"""
    note(root / "Architecture.md", "Architecture map", architecture, kind="architecture")
    example_paths = ["src/instances/demo/DemoApp.vue", "src/accounts/store.ts", "api/workbench/health.ts", "crawler/src/sdk.rs", "db/migrations/0003_generic_workbench_tables.sql"]
    note(root / "Examples.md", "Examples", "# Examples\n\n" + "\n".join(f"- [[{VAULT_BOOK}/Codebase/{safe_name(p)}|{p}]]" for p in example_paths), kind="examples")
    code_links: list[str] = []
    for source in code_files():
        relative = source.relative_to(ROOT).as_posix()
        destination = root / "Codebase" / f"{safe_name(relative)}.md"
        text = source.read_text(encoding="utf-8", errors="replace")
        language = source.suffix.lstrip(".") or "text"
        body = f"[[{VAULT_BOOK}/Codebase Index|Back to index]]\n\nSource: `{relative}`\n\n```{language}\n{text}\n```"
        note(destination, relative, body, kind="code", source=relative, sha256=sha(source), lines=text.count("\n") + 1)
        code_links.append(f"- [[{VAULT_BOOK}/Codebase/{safe_name(relative)}|{relative}]]")
        units.append({"kind": "code", "path": destination.relative_to(output).with_suffix("").as_posix(), "source": relative, "sha256": sha(source)})
    note(root / "Codebase Index.md", "Codebase index", "# Codebase index\n\n" + "\n".join(code_links), kind="code-index")
    manifest = {"title": "Verdun", "edition": "full", "source_commit": git_head(), "manuscript_sha256": sha(BOOK / "manuscript.md"), "chapter_count": len(chapters), "code_file_count": len(code_links), "unit_count": len(units)}
    data = root / "_data"
    write(data / "manifest.json", json.dumps(manifest, indent=2, sort_keys=True))
    write(data / "units.jsonl", "\n".join(json.dumps(item, sort_keys=True) for item in units))
    note(output / "Home.md", "Verdun Vault", "# Verdun Vault\n\n[[Verdun/Book|Read the book]]\n\n[[Verdun/Architecture|Explore the architecture]]\n\n[[Verdun/Examples|Start from examples]]", kind="home")
    write(output / "README.md", "# Verdun Vault\n\nA generated codebase-reading edition of *Verdun*. Open `Home.md`.\n")
    write(output / ".obsidian" / "app.json", json.dumps({"showLineNumber": True}, indent=2))
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    manifest = build(args.output.resolve())
    print(f"built {args.output}: {manifest['chapter_count']} chapters, {manifest['code_file_count']} code notes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
