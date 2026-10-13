# ZOLLER Werkzeugraum-Planer

Beschreiben Sie Ihre Fertigung in eigenen Worten – der Planer stellt Ihre Maschinen in eine 3D-Halle, baut den passenden
ZOLLER-Werkzeugraum aus den **offiziellen CAD-Daten**, begründet jede Empfehlung und rechnet aus, was Sie gewinnen.

**Live:** https://mzollercreations.github.io/zoller-werkzeugraum-planer/ (Länderfassungen unter `/<sprachcode>/`, z. B. `/en-us/`)

## Ablauf

1. **Fertigung** – Freitext oder Beispiel. Der Planungsassistent erkennt Maschinen (Anzahl, Hersteller, Baureihe, Typ,
   Steuerung, Aufnahme), Schichten, Werkzeugwechsel, Werkzeugbestand, Stundensatz, Branche, Ist-Zustand und Probleme –
   schon beim Tippen erscheinen die Maschinen in der Halle. Fehlt etwas Wichtiges, fragt er mit Antwort-Chips nach.
   Danach lässt sich alles per Satz ändern („noch 2 Okuma dazu“, „3 Schichten“, „ohne toolBalancer“) oder im Formular.
2. **Lösung** – Empfehlung in drei Ausbaustufen (Einstieg, Professional, Smart Factory), geordnet nach dem
   Werkzeugkreislauf (Lagern → Montieren → Schrumpfen → Wuchten → Einstellen & Messen → Bereitstellen → Identifizieren
   → Prüfen → Software). Jede Position mit Begründung aus den Kundendaten, Beleg mit Quelle, Produktseite, 3D-Showroom.
3. **Werkzeugraum** – Three.js-Halle: Werkzeugraum aus CAD-Modellen, Kundenmaschinen (prozedural mit Typenschild,
   Steuerungsbildschirm und Signalsäule – oder eigenes CAD-Modell), »zidCode« an jeder Maschine, Werkzeugfluss und
   Datenpakete, Ansicht **Heute** (Regale, Antasten in der Maschine) gegen **Mit ZOLLER**, Rundgang, Bild-, GLB- und
   AR-Export (USDZ für iPhone/iPad).
4. **Gewinn** – Mehrwert pro Jahr, Spindelstunden, Kapazität in Maschinen, Stillstand je Werkzeugwechsel, Kosten pro
   Arbeitstag ohne ZOLLER bzw. Amortisation (mit Angebotspreis), Hebel mit Formel und Quelle, Schicht-Vergleich,
   Fünf-Jahres-Kurve, Qualitätskennzahlen. Rechenweise **ZOLLER-Standard** (wie der ZOLLER Wirtschaftlichkeitsrechner)
   oder **konservativ**.
5. **Angebot** – Anfrage per E-Mail an die nationale ZOLLER-Gesellschaft (mit Konzept-Link), PDF-Konzept,
   Link zum Teilen (Zustand komprimiert im URL-Hash), 1:1 Expertengespräch.

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
| `docs/assets/js/nlu.js` | Sprachverständnis (DE/EN/FR/ES-Schlüsselwörter, Marken, Baureihen, Steuerungen) |
| `docs/assets/js/engine.js` | Empfehlungsregeln und Gewinnrechnung |
| `docs/assets/js/knowledge.js` | Maschinentypen, 45 Hersteller mit Baureihen, Steuerungen (»z.DMI«), Produkte, Fakten |
| `docs/assets/js/scene.js` | 3D-Halle: Layout, CAD-Geräte, Fluss, Heute/Mit ZOLLER, Kamera, Export |
| `docs/assets/js/machines.js` | prozedurale Kundenmaschinen |
| `docs/assets/js/strings.js` | Texte DE + EN (weitere Sprachen: `strings-<sprache>.js`) |
| `docs/models/*.glb` | CAD-Modelle, erzeugt von `tools/build_models.py` aus `~/Claude/ZOLLER/cad/original` |
| `tools/build.py` | Länderfassungen (Links, Währung, Mailadresse) aus `zoller-webseite/content/sites.json` |

```bash
python3 -m venv .venv && .venv/bin/pip install numpy DracoPy pygltflib pyfqmr pillow
.venv/bin/python tools/build_models.py     # CAD -> docs/models (nur bei neuen/geänderten CAD-Dateien)
python3 tools/build.py                     # Länderfassungen + Versionsnummern
```

Neue Texte gehören in `docs/assets/js/strings.js` bzw. die Sprachdateien, Änderungen an der Seite in
`tools/index.template.html` (daraus entstehen alle `index.html`).
