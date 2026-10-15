# ZOLLER Werkzeugraum-Planer

Beschreiben Sie Ihre Fertigung in eigenen Worten – der Planer stellt Ihre Maschinen in eine 3D-Halle, baut den passenden
ZOLLER-Werkzeugraum aus den **offiziellen CAD-Daten**, begründet jede Empfehlung und rechnet aus, was Sie gewinnen.

**Live:** https://mzollercreations.github.io/zoller-werkzeugraum-planer/ (Länderfassungen unter `/<sprachcode>/`, z. B. `/en-us/`)

## Ablauf

1. **Fertigung** – Freitext oder Beispiel. Der Planungsassistent erkennt Maschinen (Anzahl, Hersteller, Baureihe, Typ,
   Steuerung, Aufnahme), Schichten, Werkzeugwechsel, Werkzeugbestand, Stundensatz, Branche, Ist-Zustand und Probleme –
   schon beim Tippen erscheinen die Maschinen in der Halle. Fehlt etwas Wichtiges, fragt er mit Antwort-Chips nach.
   Danach lässt sich alles per Satz ändern („noch 2 Okuma dazu“, „3 Schichten“, „ohne toolBalancer“) oder im Formular.
   Fachfragen beantwortet er in allen 18 Sprachen aus dem belegten Produktwissen und der eigenen Planung
   („Brauche ich einen toolBalancer?“, „Unterschied zidCode und zidCode 4.0?“, „Wie viele Werkzeuge passen in einen keeper?“).
2. **Lösung** – Empfehlung in drei Ausbaustufen (Einstieg, Professional, Smart Factory), geordnet nach dem
   Werkzeugkreislauf (Lagern → Montieren → Schrumpfen → Wuchten → Einstellen & Messen → Bereitstellen → Identifizieren
   → Prüfen → Software). Jede Position mit Begründung aus den Kundendaten, Beleg mit Quelle, Produktseite, 3D-Showroom.
3. **Werkzeugraum** – Three.js-Halle: Werkzeugraum aus CAD-Modellen, Kundenmaschinen (prozedural mit Typenschild,
   Steuerungsbildschirm und Signalsäule – oder eigenes CAD-Modell), »zidCode« an jeder Maschine, Werkzeugfluss und
   Datenpakete, Ansicht **Heute** (Regale, Antasten in der Maschine) gegen **Mit ZOLLER**, Rundgang (mit »zidCode«-Station
   und Leitstand), „Namen verbergen“, Bild- und GLB-Export. **AR:** iPhone/iPad über AR Quick Look (Werkzeugraum 1:1 mit
   Bodenmarkierung und Stationsschildern auf dem echten Hallenboden, oder die ganze Halle 1:20 als Tischmodell),
   Android über WebXR (Boden antippen), am Rechner QR-Code, der die Planung direkt auf dem Handy öffnet.
4. **Gewinn** – Mehrwert pro Jahr, Spindelstunden, Kapazität in Maschinen, Stillstand je Werkzeugwechsel, Kosten pro
   Arbeitstag ohne ZOLLER bzw. Amortisation (mit Angebotspreis), Hebel mit Formel und Quelle, Schicht-Vergleich,
   Fünf-Jahres-Kurve, Qualitätskennzahlen. Rechenweise **ZOLLER-Standard** (wie der ZOLLER Wirtschaftlichkeitsrechner)
   oder **konservativ**.
5. **Angebot** – Anfrage per E-Mail an die nationale ZOLLER-Gesellschaft (mit Konzept-Link), PDF-Konzept,
   Link zum Teilen (Zustand komprimiert im URL-Hash), 1:1 Expertengespräch. Das PDF enthält Kennzahlen, Diagramme
   (Hebel, Anteile, Stillstand je Wechsel, Schicht-Vergleich, fünf Jahre, Kapazität in Maschinen), Produkte mit
   Begründung, Rechenweg und alle Quellen.

Alles läuft im Browser: keine Cookies, kein Tracking, keine Daten an Server. Eigene CAD-Modelle bleiben auf dem Gerät.

## Rechnung und Quellen

| Hebel | Rechnung | Quelle |
|---|---|---|
| Einstellen außerhalb der Maschine | Wechsel/Jahr × 3 min (konservativ 2) × Stundensatz | ZOLLER Wirtschaftlichkeitsrechner (4,52 min gemessen, ≥ 15.000 € je Maschine, Jahr und Schicht) |
| Scannen statt tippen | Wechsel/Jahr × 20 s × Stundensatz | »zidCode«: 6 Werkzeuge 4:30 → 2:30 min |
| Produktivität TMS | Maschinenstunden × 5 % × Stundensatz | RWTH Aachen (im Wirtschaftlichkeitsrechner) |
| Werkzeugkosten | 10 % Maschinenwert × 20 % | RWTH Aachen (im Wirtschaftlichkeitsrechner) |
| Standzeit | verbleibende Werkzeugkosten × 10/110 | Anwender: ×1,5 (»smile«), ×2 (Wuchten) |
| Suchzeit | Wechsel/Jahr × (90 − 15) s × Personalsatz | Anwenderbericht LAUBLE |
| Automatisiertes Einstellen | Werkzeuge/Tag × 2 min × Personalsatz | »roboBox«-FAQ (2,3 Jahre bei 480 Werkzeugen/Tag) |

Alle Belege stehen in `docs/assets/js/knowledge.js` (`FACTS`, mit Pfad der Quellseite) und in den Texten (`fact.*`).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `docs/assets/js/app.js` | Oberfläche, Assistent, Panels, Gewinn-Dashboard, Teilen/PDF/Mail |
| `docs/assets/js/nlu.js` | Sprachverständnis (18 Sprachen: Maschinenarten, Zahlwörter, Schichten; Marken, Baureihen, Steuerungen) |
| `docs/assets/js/expert.js` | Fachfragen: Absicht erkennen (Warum/Brauche ich/Unterschied/Wie viele/Preis/Lohnt sich), Antwort aus Wissen + Planung |
| `docs/assets/js/engine.js` | Empfehlungsregeln und Gewinnrechnung |
| `docs/assets/js/knowledge.js` | Maschinentypen, ~70 Hersteller mit Baureihen, Steuerungen (»z.DMI«), Produkte mit Messbereichen und Kapazitäten, Fakten |
| `docs/assets/js/scene.js` | 3D-Halle: Layout, CAD-Geräte, Fluss, Heute/Mit ZOLLER, Kamera, Export, USDZ-Zusammenbau für AR |
| `docs/assets/js/xr.js` | WebXR-AR für Android (Bodenerkennung, Platzieren, 1:1 / 1:20) |
| `docs/assets/js/machines.js` | prozedurale Kundenmaschinen |
| `docs/assets/js/strings.js` | Texte DE + EN (weitere Sprachen: `strings-<sprache>.js`) |
| `docs/models/*.glb` | CAD-Modelle, erzeugt von `tools/build_models.py` aus `~/Claude/ZOLLER/cad/original` |
| `docs/ar/*.usdc` | dieselben Geräte für AR Quick Look (zweiseitige Flächen, Bildschirme als Leuchtbild), ebenfalls aus `build_models.py` |
| `docs/models/lod/*.glb` | leichte Fernfassungen (`tools/build_lod.py`, je Gerät per Sichtvergleich eingestellt; ohne redomatic, toolBalancer, powerShrink – deren Netze zerfallen beim Vereinfachen). Der Messestand-Planer übernimmt sie |
| `tools/test_nlu.py`, `tools/test_expert.py` | Tests: Beispieltexte aller Sprachen, Maschinenarten, Fachfragen in 18 Sprachen |
| `tools/build.py` | Länderfassungen (Links, Währung, Mailadresse) aus `zoller-webseite/content/sites.json` |

```bash
python3 -m venv .venv && .venv/bin/pip install numpy DracoPy pygltflib pyfqmr pillow usd-core
.venv/bin/python tools/build_models.py     # CAD -> docs/models + docs/ar (nur bei neuen/geänderten CAD-Dateien)
.venv/bin/python tools/build_lod.py        # danach: Fernfassungen -> docs/models/lod + docs/data/lod.json
python3 tools/build.py                     # Länderfassungen + Versionsnummern
python3 tools/check_strings.py             # alle Sprachen vollständig, Platzhalter stimmen
python3 -m http.server 8792 --directory docs &
~/Claude/ZOLLER/video/.venv/bin/python tools/test_nlu.py && ~/Claude/ZOLLER/video/.venv/bin/python tools/test_expert.py
```

**3D-Leistung (Handy/iPad):** Fernfassung, bis ein Gerät groß im Bild ist (Bild, GLB, PDF immer voll); Materialklassen als
Vertex-Attribute (2 Draw-Calls je Gerät, ~6 je Kundenmaschine); Werkzeugfluss und Signalsäulen ohne Kamerabewegung mit
30 Bildern/s, ohne Bewegung gar nicht; Auflösung passt sich der Bildrate an; unter der Gewinn-Seite wird nicht gezeichnet.
Geräte-Objekte nie in `userData` legen: `clone()` und der GLB-Export serialisieren sie als JSON.

Neue Texte gehören in `docs/assets/js/strings.js` bzw. die Sprachdateien, Änderungen an der Seite in
`tools/index.template.html` (daraus entstehen alle `index.html`).
