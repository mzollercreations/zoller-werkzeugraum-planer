#!/usr/bin/env python3
"""Regressionstest des Sprachverständnisses: die 4 Beispieltexte in allen 18 Sprachen müssen Maschinenanzahl, Branche,
Schichten und Werkzeugwechsel richtig liefern. Läuft im Browser (Playwright + Chrome for Testing) gegen einen lokalen Server.

    python3 -m http.server 8792 --directory docs &      # oder launch.json »werkzeugraum-planer«
    ~/Claude/ZOLLER/video/.venv/bin/python tools/test_nlu.py [http://localhost:8792/]
"""
import asyncio, os, sys, json
from playwright.async_api import async_playwright

CHROME = os.path.expanduser("~/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8792/"
JS = """async () => {
  const { parse, apply } = await import('./assets/js/nlu.js'); const { defaultProfile, newMachine } = await import('./assets/js/engine.js');
  const { STR } = await import('./assets/js/strings.js');
  const langs = ['de','en','fr','es','it','pt','pt-BR','sv','pl','sl','cs','sk','hu','zh','ja','ko','ru','tr'];
  const exp = { 1: ['4,2,2', 'job', 2, 15], 2: ['24', 'auto', 3, 8], 3: ['6,4', 'medical', 2, 20], 4: ['10,4', 'aero', 3, 20] };
  const bad = []; let n = 0;
  for (const L of langs) {
    const S = STR[L] || (await import('./assets/js/strings-' + L + '.js')).default;
    for (const i of [1, 2, 3, 4]) {
      n++; const p = defaultProfile(); apply(p, parse(S['ex' + i]), newMachine, true);
      const got = [p.machines.map(m => m.count).join(','), p.industry, p.shifts, p.changes];
      const d = got.map((g, k) => g === exp[i][k] ? null : ['Anzahl', 'Branche', 'Schichten', 'Wechsel'][k] + '=' + g).filter(Boolean);
      if (d.length) bad.push(L + ' Beispiel ' + i + ': ' + d.join(' '));
    }
  }
  return { n, bad };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True)
        pg = await b.new_page()
        await pg.goto(BASE)
        r = await pg.evaluate(JS)
        await b.close()
    print(f"{r['n']} Beispieltexte geprüft, {len(r['bad'])} Abweichungen")
    for x in r["bad"]:
        print("  ", x)
    sys.exit(1 if r["bad"] else 0)

asyncio.run(main())
