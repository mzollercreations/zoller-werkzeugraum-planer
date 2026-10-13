#!/usr/bin/env python3
"""Erzeugt den Werkzeugraum-Planer für alle Länderseiten der ZOLLER Webseite (content/sites.json).

Je Länderfassung entsteht docs/<sprachcode>/index.html (deutsche Hauptfassung: docs/index.html) mit
  - Sprache der Oberfläche (assets/js/strings*.js; fehlt eine Sprache, Englisch),
  - Links auf die Produkt- und Quellseiten der jeweiligen Länderseite (über die Zuordnung de_path -> Landespfad,
    dieselbe Logik wie der 3D-Showroom: zoller-produktumgebung-3d/tools/build_locale.py),
  - Landeswährung und umgerechneten Standardwerten (Stundensätze, Maschinenwerte),
  - E-Mail-Adresse der nationalen ZOLLER-Gesellschaft für »Angebot anfordern«,
  - Link zurück zur Länderseite und in den Showroom derselben Sprache.

    python3 tools/build.py            # braucht nur die Standardbibliothek
"""
import hashlib
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
WEB = ROOT.parent / "zoller-webseite"
SHOW = ROOT.parent / "zoller-produktumgebung-3d"
sys.path.insert(0, str(SHOW / "tools"))
import build_locale as BL  # noqa: E402  Locale: deutsche Pfade -> Seiten der Länderfassung

PLANER = "https://mzollercreations.github.io/zoller-werkzeugraum-planer/"
SHOWROOM = "https://mzollercreations.github.io/zoller-produktumgebung-3d/"
SITE_DE = "https://mzollercreations.github.io/zoller-webseite"
BOOKING = {"de": "https://myzoller.com/de/de/expert/booking", "en-US": "https://myzoller.com/us/en/expert/booking"}
BOOKING_INT = "https://myzoller.com/int/en/expert/booking/"

# Währung je Länderseite + grober Umrechnungsfaktor für die Standardwerte (der Kunde kann alles ändern)
CURRENCY = {"de": ("EUR", 1), "at": ("EUR", 1), "es": ("EUR", 1), "fr": ("EUR", 1), "pt": ("EUR", 1), "it": ("EUR", 1),
            "si": ("EUR", 1), "sk": ("EUR", 1), "ca": ("CAD", 1.5), "us": ("USD", 1.1), "mx": ("MXN", 20), "se": ("SEK", 11.4),
            "pl": ("PLN", 4.3), "cz": ("CZK", 25), "hu": ("HUF", 395), "cn": ("CNY", 7.9), "jp": ("JPY", 165), "kr": ("KRW", 1500),
            "in": ("INR", 93), "br": ("BRL", 6), "uk": ("GBP", .85), "ru": ("RUB", 100), "tr": ("TRY", 40)}

TITLE = {"de": "Werkzeugraum-Planer", "en": "Toolroom Planner"}
DESC = {"de": "Beschreiben Sie Ihre Fertigung – der ZOLLER Werkzeugraum-Planer stellt Ihre Maschinen in eine 3D-Halle, plant den passenden Werkzeugraum aus echten CAD-Daten und rechnet aus, was Sie gewinnen.",
        "en": "Describe your production – the ZOLLER Toolroom Planner puts your machines into a 3D hall, plans the matching toolroom from real CAD data and calculates what you gain."}


def js_paths():
    """Produkt- und Quellpfade aus assets/js/knowledge.js (eine Quelle für App und Build)"""
    src = (DOCS / "assets" / "js" / "knowledge.js").read_text(encoding="utf-8")
    prod = src[src.index("export const PRODUCTS"):src.index("export const FACTS")]
    facts = src[src.index("export const FACTS"):src.index("export const NEUTRAL_ACCENT")]
    p = dict(re.findall(r"^\s+'?([\w-]+)'?:\s*\{[^\n]*?path: '([^']*)'", prod, re.M))
    f = dict(re.findall(r"^\s+(\w+):\s*\{ path: '([^']*)' \}", facts, re.M))
    return p, f


def ui_langs():
    """Sprachen, für die es Oberflächentexte gibt"""
    langs = set(re.findall(r"^(\w\w):\s*\{", (DOCS / "assets" / "js" / "strings.js").read_text(encoding="utf-8"), re.M))
    for f in (DOCS / "assets" / "js").glob("strings-*.js"):
        langs.add(f.stem.split("-", 1)[1])
    return langs


def version():
    files = sorted((DOCS / "assets" / "js").glob("*.js")) + [DOCS / "assets" / "css" / "app.css"]
    return hashlib.sha1(b"".join(f.read_bytes() for f in files)).hexdigest()[:10]


def page(cfg, lang, base, ver):
    t = (ROOT / "tools" / "index.template.html").read_text(encoding="utf-8")
    t = t.replace('<html lang="de">', f'<html lang="{cfg["locale"]}">')
    t = t.replace("<title>Werkzeugraum-Planer | ZOLLER</title>", f"<title>{TITLE.get(lang, TITLE['en'])} | ZOLLER</title>")
    t = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(DESC.get(lang, DESC["en"]))}">', t)
    head = (f'<base href="{base}">\n' if base else "") + f"<script>window.PLANER = {json.dumps(cfg, ensure_ascii=False, separators=(',', ':'))};</script>"
    t = t.replace("<!--planer-config-->", head)
    t = re.sub(r'(assets/(?:css/app\.css|js/app\.js))\?v=\w+', rf'\1?v={ver}', t)
    return t


def main():
    sites = json.loads((WEB / "content" / "sites.json").read_text(encoding="utf-8"))
    prod_paths, fact_paths = js_paths()
    langs = ui_langs()
    ver = version()
    en_int = next(BL.Locale(s, l) for s in sites.values() for l in s["locales"] if l["src"] == "en_DE" and not l.get("overlay"))
    BL.EN_INT = en_int
    made = []
    for sid, site in sites.items():
        cur, fx = CURRENCY.get(sid, ("EUR", 1))
        for loc in site["locales"]:
            code = loc["code"]
            folder = "" if not loc["src"] else code.lower() + "/"
            ui = loc["lang"] if loc["lang"] in langs else "en"
            if loc["src"]:
                L = BL.Locale(site, loc)
                web = lambda p, L=L: L.web_de(p) or en_int.web_de(p)   # noqa: E731
                site_url = L.base_url
            else:
                web = lambda p: SITE_DE + p + "/"                          # noqa: E731
                site_url = site["url"]
            # Sprachwahl: alle Sprachen derselben Länderseite, auf der deutschen Seite zusätzlich Englisch (international)
            sibs = [l for l in site["locales"]]
            if sid == "de":
                sibs = sibs[:1] + [l for s in sites.values() for l in s["locales"] if l["src"] == "en_DE" and not l.get("overlay")]
            lang_map = {}
            for l in sibs:
                k = l["lang"] if l["lang"] in langs else "en"
                lang_map.setdefault(k, "" if not l["src"] else l["code"].lower() + "/")
            co = site.get("company") or {}
            cfg = {
                "lang": ui, "locale": code, "base": "", "site": sid, "country": site.get("country") or "",
                "siteUrl": site_url, "showroom": SHOWROOM + folder, "planer": PLANER + folder,
                "mail": co.get("email", "info@zoller.info"), "company": co.get("name", "ZOLLER"),
                "expert": BOOKING.get(code, BOOKING["de"] if loc["lang"] == "de" else BOOKING_INT),
                "currency": cur, "fx": fx, "langs": list(lang_map), "locales": lang_map,
                "links": {k: web(v) for k, v in prod_paths.items() if v and web(v)},
                "factLinks": {k: web(v) for k, v in fact_paths.items() if web(v)},
            }
            out = DOCS / folder / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(page(cfg, ui, "../" if folder else "", ver), encoding="utf-8")
            made.append(f"{folder or '/'} ({ui}, {cur}, {len(cfg['links'])} Produktlinks)")
    print("Planer:", ", ".join(made))


if __name__ == "__main__":
    main()
