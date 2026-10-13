#!/usr/bin/env python3
"""Prüft, ob jede Sprachdatei (assets/js/strings-<lang>.js) alle Schlüssel der deutschen Texte hat
und dieselben Platzhalter ({n}, {tpd} …) verwendet."""
import re, sys
from pathlib import Path
JS = Path(__file__).resolve().parent.parent / "docs" / "assets" / "js"
src = (JS / "strings.js").read_text(encoding="utf-8")
de_block = src[src.index("de: {"):src.index("\nen: {")]
KEY = re.compile(r"'([\w.\-]+)':\s*'((?:[^'\\]|\\.)*)'")
de = dict(KEY.findall(de_block))
ph = lambda s: sorted(set(re.findall(r"\{(\w+)[}|]", s)))
bad = 0
for f in sorted(JS.glob("strings-*.js")):
    d = dict(KEY.findall(f.read_text(encoding="utf-8")))
    miss = [k for k in de if k not in d]
    extra = [k for k in d if k not in de]
    wrong = [k for k in de if k in d and ph(de[k]) != ph(d[k])]
    print(f"{f.stem}: {len(d)} Texte, fehlen {len(miss)}, zu viel {len(extra)}, Platzhalter falsch {len(wrong)}")
    for k in miss[:20]: print("   fehlt:", k)
    for k in wrong[:20]: print("   Platzhalter:", k, ph(de[k]), ph(d[k]))
    bad += len(miss) + len(wrong)
print("deutsch:", len(de), "Texte")
sys.exit(1 if bad else 0)
