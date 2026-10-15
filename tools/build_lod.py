#!/usr/bin/env python3
"""Leichte Fernfassungen der CAD-Geräte für die 3D-Ansichten (docs/models/lod/<id>.glb + docs/data/lod.json).

Aus der Übersicht und auf dem Handy sind die Geräte nur ein paar hundert Pixel groß – dort reicht ein Bruchteil der
Dreiecke. scene.js (und booth3d.js im Messestand-Planer, der die Dateien mit tools/build.py übernimmt) zeigt die
Fernfassung, bis ein Gerät groß im Bild ist, und lädt erst dann die volle Fassung (für Bild, GLB und PDF immer die volle).
Gebaut mit build_models.py (gleiche Ausrichtung, Materialklassen, Bildschirm-UVs), nur mit kleinerem Budget.

    .venv/bin/python tools/build_lod.py          # alle Geräte
    .venv/bin/python tools/build_lod.py keeper   # nur eins
"""
import json, os, pathlib, sys, time
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_models as bm  # noqa: E402

OUT = ROOT / "docs" / "models" / "lod"
# Je Gerät: Dreiecks-Budget (volle Fassung: 30–135 Tsd.), offene Ränder mitvereinfachen, Raster-Vorstufe (m; schließt
# Lochbleche, die sich sonst kaum vereinfachen lassen). Gewählt per Sichtvergleich voll gegen fern aus drei Blickwinkeln
# (das Verfahren reagiert je nach CAD-Netz sehr unterschiedlich). Nicht dabei: redomatic 600, toolBalancer, powerShrink 400
# – deren Netze zerfallen bei jeder Einstellung (Löcher, Keile); sie zeigen in 3D immer die volle Fassung.
LOD = {"venturion": (8000, True, 0), "venturion600": (8000, True, 0), "venturion800": (9000, True, 0), "keeper": (16000, True, 0),
       "smile": (10000, False, .004), "zidcode": (9000, False, .004), "toolcart": (14000, False, .004),
       "toolstation": (20000, True, .004), "toolorganizer": (14000, True, .004)}
CELL = 0
_simplify = bm.simplify


def cluster(v, f, cell):
    """Eckpunkte auf ein Raster ziehen: schließt Löcher und Spalte unter der Rastergröße (Kantenzusammenlegung allein
    erhält jedes Loch eines Lochblechs). Doppelte und entartete Dreiecke fallen weg; gezeichnet wird ohnehin zweiseitig."""
    q = np.floor(v / cell).astype(np.int64)
    key, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.ravel()
    nv = np.zeros((len(key), 3)); np.add.at(nv, inv, v); nv /= np.bincount(inv)[:, None]
    nf = inv[f]
    nf = nf[(nf[:, 0] != nf[:, 1]) & (nf[:, 1] != nf[:, 2]) & (nf[:, 0] != nf[:, 2])]
    _, idx = np.unique(np.sort(nf, axis=1), axis=0, return_index=True)
    return nv, nf[np.sort(idx)]


def _key(q):
    q = q + (1 << 20)
    return (q[..., 0] << 42) | (q[..., 1] << 21) | q[..., 2]


def _samples(v, f, step):
    """Abtastpunkte je Dreieck im Abstand ~step: Liste von (Dreiecksindizes, Punkte[Dreieck, Punkt, 3])."""
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    n = np.ceil(np.max([np.linalg.norm(b - a, axis=1), np.linalg.norm(c - b, axis=1), np.linalg.norm(a - c, axis=1)], 0) / step).astype(int)
    n = np.clip(n, 1, 300)
    for k in np.unique(n):
        sel = np.nonzero(n == k)[0]
        i, j = np.meshgrid(np.arange(k + 1), np.arange(k + 1)); m = i + j <= k
        u, w = (i[m] / k)[None, :, None], (j[m] / k)[None, :, None]
        yield sel, a[sel, None] + (b[sel, None] - a[sel, None]) * u + (c[sel, None] - a[sel, None]) * w


def off_surface(v0, f0, v, f, cs=.015):
    """Dreiecke der vereinfachten Fläche, die irgendwo mehr als ~1,5–5 cm neben der Originalfläche liegen."""
    cells = np.unique(np.concatenate([_key(np.floor(p.reshape(-1, 3) / cs).astype(np.int64)) for _, p in _samples(v0, f0, cs * .7)]))
    d = np.array([(dx << 42) + (dy << 21) + dz for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1)], dtype=np.int64)
    near = np.unique((cells[:, None] + d[None, :]).ravel())
    bad = np.zeros(len(f), bool)
    for sel, p in _samples(v, f, cs):
        bad[sel] = ~np.isin(_key(np.floor(p / cs).astype(np.int64)), near).all(1)
    return bad


def simplify(v, f, target, border=True):
    """Wie im Werkzeugraum-Planer, plus: Dreiecke, die irgendwo deutlich neben der Originalfläche liegen, fallen weg.
    Die Quadrik-Vereinfachung setzt bei dünnen Teilen (Kabel, Blechkanten, Hauben) einzelne Punkte weit daneben – das
    gäbe große Keile quer durch das Gerät."""
    v0, f0 = v, f
    if CELL and len(f) > target * 1.5:
        v, f = cluster(v, f, CELL)
    v, f = _simplify(v, f, target, border)
    if len(f) < len(f0):
        f = f[~off_surface(v0, f0, v, f)]
    return v, f


bm.simplify = simplify
# Gelbe Akzente (Griffe, Schriftzüge, Lochwand-Haken), Rot und LEDs bleiben unvereinfacht – wenige Dreiecke, prägen aber
# das Gerät auch aus der Ferne. Beim »zidCode« und »toolCart« ist Gelb großflächig (Gehäuse, Wannen) und wird normal
# vereinfacht; Logo-/Lochmuster-Gruppen des »toolCart« ebenso.
bm.KEEP_CLS = {dev: {"red", "led"} if dev in ("zidcode", "toolcart") else {"yellow", "red", "led"} for dev in LOD}
bm.KEEP_BIG = {}


def main():
    global CELL
    OUT.mkdir(parents=True, exist_ok=True)
    man_path = ROOT / "docs" / "data" / "lod.json"
    man = json.loads(man_path.read_text()) if man_path.exists() else {}
    ids = [a for a in sys.argv[1:] if not a.startswith("--")] or list(LOD)
    for dev in ids:
        t0 = time.time()
        budget, lo, CELL = LOD[dev]
        prims, size, _ = bm.collect(dev, budget, lo=lo)
        path = OUT / f"{dev}.glb"
        bm.write_glb(str(path), prims)
        tris = sum(len(p["idx"]) for p in prims)
        man[dev] = {"file": f"models/lod/{dev}.glb", "tris": int(tris)}
        print(f"{dev:15s} -> {tris:>6d} Dreiecke, {len(prims):2d} Materialien, {path.stat().st_size / 1024:5.0f} KB ({time.time() - t0:.1f}s)")
    for dev in [d for d in man if d not in LOD]:          # aus LOD genommen → Fernfassung entfernen
        (OUT / f"{dev}.glb").unlink(missing_ok=True); del man[dev]
    man_path.write_text(json.dumps(dict(sorted(man.items())), indent=1))


main()
