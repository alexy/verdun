#!/usr/bin/env python3
"""Build a compact, independent Verdun reader vault for phones and tablets."""
from __future__ import annotations
import argparse, json, shutil
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[3]
BOOK = ROOT / "publishing" / "verdun"
DEFAULT_OUTPUT = BOOK / "dist-obsidian" / "Verdun Mobile Vault"

def load_full():
    spec = importlib.util.spec_from_file_location("verdun_full_vault", BOOK / "scripts/build-obsidian-vault.py")
    module = importlib.util.module_from_spec(spec); assert spec and spec.loader; spec.loader.exec_module(module); return module

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT); args = parser.parse_args()
    output = args.output.resolve()
    if output.exists(): shutil.rmtree(output)
    output.mkdir(parents=True)
    full = load_full()
    chapters = full.section_text((BOOK / "manuscript.md").read_text(encoding="utf-8"))
    root = output / "Verdun"
    links = []
    for number, (title, text) in enumerate(chapters, 1):
        slug = f"{number:02d}-{full.safe_name(title).lower()}"; target = root / "Reader" / f"{slug}.md"
        prev_link = f"[[Verdun/Reader/{number-1:02d}-{full.safe_name(chapters[number-2][0]).lower()}|Previous]]" if number > 1 else "Previous"
        next_link = f"[[Verdun/Reader/{number+1:02d}-{full.safe_name(chapters[number][0]).lower()}|Next]]" if number < len(chapters) else "Next"
        full.note(target, title, f"[[Home|Home]] · {prev_link} · {next_link}\n\n{text}", kind="reader", ordinal=number)
        links.append(f"- [[Verdun/Reader/{slug}|{number}. {title}]]")
    selected = ["src/core/workbench.ts", "src/accounts/store.ts", "api/workbench/health.ts", "crawler/src/sdk.rs", "db/migrations/0003_generic_workbench_tables.sql"]
    for path in selected:
        source = ROOT / path; full.note(root / "Examples" / f"{full.safe_name(path)}.md", path, f"Source: `{path}`\n\n```{source.suffix[1:]}\n{source.read_text(encoding='utf-8')}\n```", kind="example", source=path)
    full.note(output / "Home.md", "Verdun Mobile Vault", "# Verdun Mobile Vault\n\n## Reader\n\n" + "\n".join(links) + "\n\n## Code examples\n\n" + "\n".join(f"- [[Verdun/Examples/{full.safe_name(p)}|{p}]]" for p in selected), kind="home")
    manifest = {"title":"Verdun","edition":"mobile","reader_page_count":len(chapters),"example_count":len(selected),"source_commit":full.git_head()}
    units = [{"kind":"reader","path":f"Verdun/Reader/{number:02d}-{full.safe_name(title).lower()}","ordinal":number} for number, (title, _) in enumerate(chapters, 1)]
    units.extend({"kind":"example","path":f"Verdun/Examples/{full.safe_name(path)}","source":path} for path in selected)
    full.write(root / "_data" / "mobile-manifest.json", json.dumps(manifest, indent=2, sort_keys=True)); full.write(root / "_data" / "units.jsonl", "\n".join(json.dumps(unit, sort_keys=True) for unit in units)); full.write(output / "README.md", "# Verdun Mobile Vault\n\nA compact standalone reader. Open `Home.md`.\n"); full.write(output / ".obsidian" / "app.json", json.dumps({"showLineNumber":False}, indent=2))
    print(f"built {output}: {len(chapters)} Reader pages, {len(selected)} code examples")
    return 0
if __name__ == "__main__": raise SystemExit(main())
