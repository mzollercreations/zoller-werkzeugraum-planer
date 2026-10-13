#!/usr/bin/env python3
"""Offizielle ZOLLER-CAD-Modelle (~/Claude/ZOLLER/cad/original, GLB mm + Draco) -> web-taugliche GLBs für den Planer.

Je Gerät entsteht docs/models/<id>.glb mit EINEM Mesh und einem Primitive pro Materialklasse
(gelb, weißaluminium, schwarzgrau, Monitor …), damit der Browser nur wenige Draw-Calls braucht:
  - Meter statt Millimeter, Gerät steht auf y=0, Grundfläche zentriert, Bedienerseite zeigt nach +Z (glTF/three.js)
  - Materialklassen wie cad/zoller_cad.py (Name zuerst, sonst nächste CAD-Farbe)
  - Monitore bekommen planare UVs (aufrecht, von vorn ungespiegelt) für die »pilot«/TMS-Bildschirmbilder
  - schwere Modelle werden reduziert (pyfqmr), Normalen mit Knickwinkel neu berechnet, alles Draco-komprimiert
Außerdem: docs/models/tex/*.webp (Bildschirme), docs/img/render/<id>.webp (Cycles-Vorschauen), docs/data/models.json

    .venv/bin/python tools/build_models.py            # alle Geräte
    .venv/bin/python tools/build_models.py keeper     # nur eins
"""
import json, os, struct, sys, time
import numpy as np
np.seterr(all="ignore")          # numpy 2.0 + Accelerate meldet bei matmul falsche Überläufe
import DracoPy, pygltflib, pyfqmr
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CAD = os.path.join(os.path.dirname(ROOT), "cad")
OUT = os.path.join(ROOT, "docs", "models")

# id: (Datei, Bildschirmbild, Dreiecks-Budget)
DEVICES = {
    "venturion":      ("pilot 4.0_venturion«.glb", "screen_pilot4_measure.png", 60000),
    "venturion600":   ("pilot 4.0_Venturion_600«.glb", "screen_pilot4_measure.png", 60000),
    "venturion800":   ("pilot 4.0_Venturion_800«.glb", "screen_pilot4_measure.png", 60000),
    "smile":          ("pilot 4.0_smile«.glb", "screen_pilot4_contour.png", 60000),
    "keeper":         ("2500478_702302_ZOLLER »keeper«.glb", "screen_tms_keeper.png", 110000),
    "toolorganizer":  ("2500479_703741_ZOLLER »toolOrganizer«.glb", "screen_tms_organizer.png", 50000),
    "toolstation":    ("2501657_713197_ZOLLER Werkbank »toolStation«.glb", "screen_tms_station.png", 90000),
    "zidcode":        ("XXXXXXX_717076_ZOLLER »zidCode«.glb", "screen_zid_scan.png", 45000),
    "redomatic600":   ("XXXXXXX_752865_ZOLLER »redomatic 600«.glb", "screen_pilot4_measure.png", 90000),
    "powershrink400": ("XXXXXXX_752398_ZOLLER »powerShrink 400«.glb", "screen_pilot4_contour.png", 52000),
    "toolbalancer":   ("XXXXXXX_720749_ZOLLER »toolBalancer«.glb", "screen_pilot4_contour.png", 80000),
    # leichte Fassung für die Stationen an jeder Maschine (bis zu 60 Stück in einer Halle)
    "zidcode_lo":     ("XXXXXXX_717076_ZOLLER »zidCode«.glb", "screen_zid_scan.png", 5000),
}
# zidCode: Display teilt sich das Material mit dem Gehäuse -> nur große, nach vorn oben zeigende Flächen sind Bildschirm
SCREEN_FACES = {"zidcode": dict(mat="plastik-schwarz", normal=(0, .41, .91), ymin=.8)}
SCREEN_FACES["zidcode_lo"] = SCREEN_FACES["zidcode"]

_REF = [
    ((0.0346, 0.0386, 0.0409), "darkgrey"), ((0.3985, 0.4005, 0.3943), "whitealu"), ((0.9529, 0.8941, 0.0), "yellow"),
    ((0.8976, 0.7483, 0.0498), "yellow"), ((0.0101, 0.0101, 0.0101), "blackplastic"), ((0.0039, 0.0092, 0.0161), "pa6"),
    ((0.0199, 0.0249, 0.0279), "anodized"), ((0.1632, 0.1999, 0.4497), "screen"), ((0.1778, 0.1868, 0.1773), "screen"),
    ((0.3544, 0.3837, 0.3995), "steel"), ((0.8940, 0.8894, 0.8398), "whiteplastic"), ((0.8588, 0.8546, 0.8183), "paper"),
    ((0.7541, 0.5926, 0.3675), "wood"), ((0.0218, 0.0218, 0.0218), "worktop"), ((0.0283, 0.0281, 0.0298), "bellows"),
    ((0.0458, 0.0419, 0.0380), "blackoxide"), ((0.7648, 0.5728, 0.1191), "brass"), ((0.0028, 0.0031, 0.0039), "glossblack"),
    ((0.2295, 0.2828, 0.3083), "zinc"), ((1.0, 0.0252, 0.0121), "red"), ((0.2403, 0.2480, 0.2442), "chrome"),
    ((0.0, 0.7172, 0.5498), "teal"), ((0.0, 0.0081, 0.81), "blue"), ((0.0, 0.0, 0.0), "glossblack"),
]
_NAMES = [("gelb", "yellow"), ("monitor", "screen"), ("faltenbalg", "bellows"), ("messing", "brass"), ("brueniert", "blackoxide"),
          ("alu-eloxiert", "steel"), ("eloxiert", "anodized"), ("verzinkt", "zinc"), ("rot", "red"), ("papier", "paper"),
          ("plastik-weiss", "whiteplastic"), ("weissaluminium", "whitealu"), ("schwarzgrau", "darkgrey"),
          ("schwarz lackiert", "glossblack"), ("plastik-schwarz", "blackplastic"), ("pa 6", "pa6"), ("st_12", "steel")]
# Ersatzfarben (sRGB) für Viewer ohne unsere Materialbibliothek
FALLBACK = dict(darkgrey="#35383b", whitealu="#a9acab", yellow="#f0dc00", blackplastic="#141516", pa6="#111317",
                anodized="#1e2124", steel="#b9bdc0", whiteplastic="#e6e4dc", paper="#e0ded6", wood="#c8a679",
                worktop="#232426", bellows="#18191b", blackoxide="#2a2826", brass="#c9a14a", glossblack="#0d0e10",
                zinc="#9da6ab", red="#c8140f", chrome="#9a9e9c", teal="#1fa58a", blue="#1a3fae", screen="#050506")


def classify(mat):
    if mat is None:
        return "darkgrey"
    n = (mat.name or "").lower()
    for k, c in _NAMES:
        if k in n and not (k == "rot" and "brot" in n):
            return c
    col = (.5, .5, .5)
    if mat.pbrMetallicRoughness and mat.pbrMetallicRoughness.baseColorFactor:
        col = tuple(mat.pbrMetallicRoughness.baseColorFactor[:3])
    return min(_REF, key=lambda rc: sum((a - b) ** 2 for a, b in zip(rc[0], col)))[1]


def trs(node):
    if node.matrix:
        return np.array(node.matrix, dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if node.scale:
        m = np.diag([*node.scale, 1.0]) @ m
    if node.rotation:
        x, y, z, w = node.rotation
        r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        R = np.eye(4); R[:3, :3] = r; m = R @ m
    if node.translation:
        T = np.eye(4); T[:3, 3] = node.translation; m = T @ m
    return m


def read_parts(path):
    """[(material, world-positions mm (n,3), faces (m,3), node-index)] for every primitive"""
    g = pygltflib.GLTF2().load(path)
    blob = g.binary_blob()
    parts = []

    def walk(i, parent):
        n = g.nodes[i]
        M = parent @ trs(n)
        if n.mesh is not None:
            for p in g.meshes[n.mesh].primitives:
                ext = (p.extensions or {}).get("KHR_draco_mesh_compression")
                if not ext:
                    raise SystemExit(f"{path}: Primitive ohne Draco – nicht unterstützt")
                bv = g.bufferViews[ext["bufferView"]]
                d = DracoPy.decode(blob[bv.byteOffset or 0:(bv.byteOffset or 0) + bv.byteLength])
                pts = np.asarray(d.points, dtype=np.float64).reshape(-1, 3)
                fc = np.asarray(d.faces, dtype=np.int64).reshape(-1, 3)
                pts = (np.c_[pts, np.ones(len(pts))] @ M.T)[:, :3]
                if np.linalg.det(M[:3, :3]) < 0:
                    fc = fc[:, ::-1]
                mat = g.materials[p.material] if p.material is not None else None
                parts.append((mat, pts, fc, i))
        for c in n.children or []:
            walk(c, M)

    for r in g.scenes[g.scene or 0].nodes:
        walk(r, np.eye(4))
    return parts


def weld(pts, faces, eps=5e-5):
    """identical positions (0.05 mm grid, metres) -> one vertex; drops degenerate triangles"""
    q = np.round(pts / eps).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    v = pts[first]
    f = inv[faces]
    ok = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    f = f[ok]
    used, remap = np.unique(f.reshape(-1), return_inverse=True)      # unbenutzte Punkte entfernen
    return v[used], remap.reshape(-1, 3)


def face_normals(v, f):
    n = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    a = np.linalg.norm(n, axis=1)
    return n / np.maximum(a, 1e-20)[:, None], a * .5


def creased(v, f, angle=34.0):
    """split vertices at hard edges: per corner the area-weighted mean of the adjacent face normals within `angle`.
    Returns new (positions, normals, faces)."""
    fn, fa = face_normals(v, f)
    m = len(f)
    corner_v = f.reshape(-1)
    corner_f = np.repeat(np.arange(m), 3)
    order = np.argsort(corner_v, kind="stable")
    cv = corner_v[order]
    starts = np.r_[0, np.flatnonzero(np.diff(cv)) + 1]
    counts = np.diff(np.r_[starts, len(cv)])
    cosl = np.cos(np.radians(angle))
    out_n = np.zeros((m * 3, 3))
    # Paare innerhalb jeder Vertex-Gruppe, gruppiert nach Gruppengröße (vektorisiert)
    for k in np.unique(counts):
        g0 = starts[counts == k]
        idx = g0[:, None] + np.arange(k)[None, :]            # (G,k) Positionen in order
        corners = order[idx]                                  # (G,k) Corner-Indizes
        fcs = corner_f[corners]                               # (G,k) Flächen
        N = fn[fcs]                                           # (G,k,3)
        A = fa[fcs][..., None] * N                            # gewichtet
        if k == 1:
            out_n[corners[:, 0]] = N[:, 0]
            continue
        for s in range(0, len(g0), max(1, 200000 // (k * k))):
            Ns = N[s:s + 200000 // (k * k) or 1]
            As = A[s:s + 200000 // (k * k) or 1]
            dots = np.einsum("gij,gkj->gik", Ns, Ns)          # (g,k,k)
            w = (dots >= cosl).astype(np.float64)
            res = np.einsum("gik,gkj->gij", w, As)
            out_n[corners[s:s + len(Ns)].reshape(-1)] = res.reshape(-1, 3)
    ln = np.linalg.norm(out_n, axis=1)
    out_n = out_n / np.maximum(ln, 1e-20)[:, None]
    bad = ln < 1e-12
    out_n[bad] = np.repeat(fn, 3, axis=0)[bad]
    # Corner -> eindeutiger Vertex (Position + quantisierte Normale)
    qn = np.round(out_n * 127).astype(np.int64)
    key = np.c_[corner_v, qn]
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    return v[corner_v[first]], out_n[first], inv.reshape(-1, 3)


def screen_uv(v, f):
    """planar UV for one monitor face group (world metres, front = +Z)"""
    fn, fa = face_normals(v, f)
    n = (fn * fa[:, None]).sum(0)
    n /= max(np.linalg.norm(n), 1e-12)
    if n[2] < 0:
        n = -n
    up = np.array([0.0, 1.0, 0.0]); up = up - up.dot(n) * n
    if np.linalg.norm(up) < 1e-4:
        up = np.array([0.0, 0.0, -1.0])
    up /= np.linalg.norm(up)
    right = np.cross(up, n); right /= np.linalg.norm(right)
    used = np.unique(f)
    u = v @ right; w = v @ up
    u0, u1, w0, w1 = u[used].min(), u[used].max(), w[used].min(), w[used].max()
    return np.c_[(u - u0) / max(u1 - u0, 1e-9), (w - w0) / max(w1 - w0, 1e-9)]


def simplify(v, f, target, border=True):
    if len(f) <= target:
        return v, f
    s = pyfqmr.Simplify()
    s.setMesh(v.astype(np.float64), f.astype(np.int32))
    s.simplify_mesh(target_count=int(target), aggressiveness=6 if border else 8, preserve_border=border, verbose=0)
    nv, nf, _ = s.getMesh()
    return np.asarray(nv, dtype=np.float64), np.asarray(nf, dtype=np.int64)


def build(dev):
    file, screen_img, budget = DEVICES[dev]
    t0 = time.time()
    parts = read_parts(os.path.join(CAD, "original", file))
    allp = np.vstack([p[1] for p in parts]) * .001
    mn, mx = allp.min(0), allp.max(0)
    off = np.array([-(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2])
    size = mx - mn
    sf = SCREEN_FACES.get(dev)
    groups = {}                     # Klasse -> list of (pts, faces)
    screens = []                    # list of (pts, faces) – je Primitive eine Monitorfläche
    for mat, pts, fc, node in parts:
        p = pts * .001 + off
        c = classify(mat)
        if sf and mat is not None and sf["mat"] in (mat.name or "").lower():
            fnrm, _ = face_normals(p, fc)
            cen = p[fc].mean(1)
            hit = (np.abs(fnrm @ np.array(sf["normal"]) / np.linalg.norm(sf["normal"])) > .97) & (cen[:, 1] > sf["ymin"] * size[1])
            if hit.any():
                screens.append((p, fc[hit]))
                fc = fc[~hit]
        if c == "screen":
            screens.append((p, fc))
            continue
        groups.setdefault(c, []).append((p, fc))
    tri_total = sum(len(f) for g in groups.values() for _, f in g)
    prims = []
    for c, lst in sorted(groups.items(), key=lambda kv: -sum(len(f) for _, f in kv[1])):
        offs = np.cumsum([0] + [len(p) for p, _ in lst])
        v = np.vstack([p for p, _ in lst]); f = np.vstack([fc + o for (_, fc), o in zip(lst, offs)])
        lo = dev.endswith('_lo')
        v, f = weld(v, f, eps=.0025 if lo else 5e-5)    # leichte Fassung: Punkte auf 2,5-mm-Raster zusammenlegen
        tgt = max(60 if lo else 400, budget * len(f) / max(tri_total, 1)) if tri_total > budget else len(f)
        v, f = simplify(v, f, tgt, border=not lo)
        v, f = weld(v, f)
        pv, pn, pf = creased(v, f)
        prims.append(dict(cls=c, pos=pv, nrm=pn, idx=pf))
    for i, (p, fc) in enumerate(screens):
        v, f = weld(p, fc)
        if not len(f):
            continue
        uv = screen_uv(v, f)
        fn, fa = face_normals(v, f)
        n = (fn * fa[:, None]).sum(0); n /= max(np.linalg.norm(n), 1e-12)
        if n[2] < 0:
            n = -n
        prims.append(dict(cls="screen", pos=v, nrm=np.tile(n, (len(v), 1)), idx=f, uv=uv))
    write_glb(os.path.join(OUT, dev + ".glb"), prims)
    tris = sum(len(p["idx"]) for p in prims)
    print(f"{dev:15s} {sum(len(f) for _, _, f, _ in parts):>8d} -> {tris:>7d} Dreiecke, {len(prims):2d} Materialien, "
          f"{os.path.getsize(os.path.join(OUT, dev + '.glb')) / 1024:7.0f} KB, {size[0]:.2f}×{size[2]:.2f}×{size[1]:.2f} m  ({time.time() - t0:.1f}s)")
    return dict(id=dev, file=f"models/{dev}.glb", screen=f"models/tex/{os.path.splitext(screen_img)[0]}.webp",
                size=[round(float(size[0]), 3), round(float(size[1]), 3), round(float(size[2]), 3)], tris=int(tris),
                classes=sorted({p["cls"] for p in prims}))


def write_glb(path, prims):
    bin_ = bytearray()
    views, accessors, meshprims, materials, matidx = [], [], [], [], {}

    def add_view(b):
        while len(bin_) % 4:
            bin_.append(0)
        views.append(dict(buffer=0, byteOffset=len(bin_), byteLength=len(b)))
        bin_.extend(b)
        return len(views) - 1

    for p in prims:
        pos = p["pos"].astype(np.float32); nrm = p["nrm"].astype(np.float32); idx = p["idx"].astype(np.uint32)
        uv = p.get("uv")
        enc = DracoPy.encode(pos, faces=idx, quantization_bits=13, compression_level=7, preserve_order=True,
                             normals=nrm.astype(np.float64), normal_quantization_bits=9,
                             tex_coord=uv.astype(np.float64) if uv is not None else None,
                             tex_coord_quantization_bits=12 if uv is not None else None)
        dv = add_view(enc)
        # Draco-Attribut-IDs aus dem Ergebnis lesen (DracoPy vergibt sie je nach vorhandenen Attributen)
        types = {0: "POSITION", 1: "NORMAL", 3: "TEXCOORD_0"}
        attrs_draco = {types[a["attribute_type"]]: a["unique_id"] for a in DracoPy.decode(enc).attributes
                       if a["attribute_type"] in types}
        n = len(pos)
        a_pos = len(accessors); accessors.append(dict(componentType=5126, count=n, type="VEC3",
                                                      min=pos.min(0).tolist(), max=pos.max(0).tolist()))
        a_nrm = len(accessors); accessors.append(dict(componentType=5126, count=n, type="VEC3"))
        attrs = dict(POSITION=a_pos, NORMAL=a_nrm)
        if uv is not None:
            a_uv = len(accessors); accessors.append(dict(componentType=5126, count=n, type="VEC2")); attrs["TEXCOORD_0"] = a_uv
        a_idx = len(accessors); accessors.append(dict(componentType=5125, count=int(idx.size), type="SCALAR"))
        c = p["cls"]
        if c not in matidx:
            h = FALLBACK.get(c, "#808080").lstrip("#")
            srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
            lin = [((x + .055) / 1.055) ** 2.4 if x > .04045 else x / 12.92 for x in srgb]
            matidx[c] = len(materials)
            materials.append(dict(name="zc_" + c, pbrMetallicRoughness=dict(baseColorFactor=lin + [1.0], metallicFactor=0.0,
                                                                             roughnessFactor=.5)))
        meshprims.append(dict(attributes=attrs, indices=a_idx, material=matidx[c], mode=4,
                              extensions={"KHR_draco_mesh_compression": dict(bufferView=dv, attributes=attrs_draco)}))
    gltf = dict(asset=dict(version="2.0", generator="zoller-werkzeugraum-planer/build_models.py"),
                extensionsUsed=["KHR_draco_mesh_compression"], extensionsRequired=["KHR_draco_mesh_compression"],
                scene=0, scenes=[dict(nodes=[0])], nodes=[dict(mesh=0, name=os.path.splitext(os.path.basename(path))[0])],
                meshes=[dict(primitives=meshprims)], materials=materials, accessors=accessors, bufferViews=views,
                buffers=[dict(byteLength=len(bin_))])
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    while len(bin_) % 4:
        bin_.append(0)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A)); fh.write(js)
        fh.write(struct.pack("<II", len(bin_), 0x004E4942)); fh.write(bin_)


def textures():
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    for f in sorted({d[1] for d in DEVICES.values()}):
        im = Image.open(os.path.join(CAD, "textures", f)).convert("RGB")
        im.thumbnail((1024, 1024), Image.LANCZOS)
        im.save(os.path.join(OUT, "tex", os.path.splitext(f)[0] + ".webp"), quality=86, method=6)
    rd = os.path.join(ROOT, "docs", "img", "render"); os.makedirs(rd, exist_ok=True)
    for dev in DEVICES:
        src = os.path.join(CAD, "previews", dev.replace("_lo", "") + ".jpg")
        if os.path.exists(src):
            im = Image.open(src).convert("RGB"); im.thumbnail((960, 960), Image.LANCZOS)
            im.save(os.path.join(rd, dev + ".webp"), quality=82, method=6)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    ids = sys.argv[1:] or list(DEVICES)
    man_path = os.path.join(ROOT, "docs", "data", "models.json")
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for d in ids:
        man[d] = build(d)
    textures()
    json.dump(man, open(man_path, "w"), indent=1, ensure_ascii=False)
