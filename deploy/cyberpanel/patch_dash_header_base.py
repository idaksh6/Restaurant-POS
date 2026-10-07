"""Patch mesa-base.css so legacy dash-header grid rules skip .zk-dash-header-bar."""
from pathlib import Path

path = Path(__file__).resolve().parents[2] / "mesa-pos" / "src" / "styles" / "mesa-base.css"
s = path.read_text(encoding="utf-8")

replacements = [
    (
        '@media (width<=1100px){.zk-dash-header{',
        '@media (width<=1100px){.zk-dash-header:not(.zk-dash-header-bar){',
    ),
    (
        '@media (width<=720px){.zk-dash-header{grid-template-columns:1fr;',
        '@media (width<=720px){.zk-dash-header:not(.zk-dash-header-bar){grid-template-columns:1fr;',
    ),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit(f"Missing pattern: {old[:80]!r}")
    s = s.replace(old, new, 1)
    print(f"OK: {old[:50]!r}")

path.write_text(s, encoding="utf-8")
print("done")
