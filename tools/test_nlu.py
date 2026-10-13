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
  const { STR } = await import('./assets/js/strings.js'); const S0 = STR.de;
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
  // neue Fähigkeiten: Maschinenarten, Netzwerk, Werkzeuggrößen, ERP, Wendeplatten
  const CASES = [
    ['Lohnfertiger: 2 DMG MORI DMU 50, 1 DMU 125 monoBLOCK, 2 Hermle C 42, 2 Haas VF-2, 1 Haas VF-6, 1 Mazak Integrex i-200, 1 Okuma Genos L3000, 2 Citizen L20, 1 INDEX MS32, 1 Heller H 5000, 1 Waldrich Coburg Portalfräsmaschine, 1 Liebherr LC 300 Wälzfräsmaschine, 1 Walter Helitronic, 1 TOS Bohrwerk, 1 Schiess Karussell. 2 Schichten.',
      p => p.machines.reduce((a, m) => a + m.count, 0) === 19 && ['gantry', 'gear', 'boring', 'vtl', 'multispindle', 'grinder', 'swiss', 'turnmill', 'hmc'].every(t => p.machines.some(m => m.type === t))],
    ['Wir haben 3 Okuma MB-46V im Netzwerk, Werkzeuglängen bis 600 mm, Messerköpfe mit Durchmesser 250 mm.', p => p.network === 'yes' && p.maxLen === 600 && p.maxDia === 250 && p.machines[0].count === 3],
    ['5 Haas VF-2, keine Netzwerkanbindung an den Maschinen.', p => p.network === 'no' && p.machines[0].count === 5],
    ['We run 2 Haas UMC-750 and 1 Doosan Puma 2600 on two shifts, SAP as ERP, lots of indexable inserts.', p => p.erp && p.inserts && p.shifts === 2 && p.machines.length === 2],
    ['8 Fräsmaschinen (4 DMG MORI DMU 50, 2 Hermle C 42, 2 Haas VF-2)', p => p.machines.reduce((a, m) => a + m.count, 0) === 8 && p.machines.length === 3],
    // Maschinenarten ohne Herstellernamen in allen Sprachen (6 Bearbeitungszentren + 2 Drehmaschinen) und Schichtzahl
    ...[['マシニングセンタ 6 台（Haas）、旋盤 2 台（Mazak）、1 シフト', 1], ['マシニングセンタ6台、NC旋盤2台、2直', 2], ['加工中心 6 台，数控车床 2 台，两班倒', 2],
        ['머시닝센터 6대, CNC 선반 2대, 2교대', 2], ['6 обрабатывающих центров и 2 токарных станка, две смены', 2], ['6 işleme merkezi ve 2 torna tezgâhı, 2 vardiya', 2],
        ['6 centrów obróbczych i 2 tokarki, dwie zmiany', 2], ['6 obráběcích center a 2 soustruhy, dvě směny', 2], ['6 obrábacích centier a 2 sústruhy, dve zmeny', 2],
        ['6 obdelovalnih centrov in 2 stružnici, dve izmeni', 2], ['6 megmunkálóközpont és 2 eszterga, két műszak', 2], ['6 bearbetningscenter och 2 svarvar, två skift', 2],
        ['6 centri di lavoro e 2 torni, due turni', 2], ['6 centros de usinagem e 2 tornos, dois turnos', 2], ['6 Bearbeitungszentren (Haas) und 2 Drehmaschinen (Okuma), 2 Schichten', 2]]
      .map(([txt, sh]) => [txt, p => p.shifts === sh && p.machines.filter(m => m.type === 'vmc').reduce((a, m) => a + m.count, 0) === 6 && p.machines.filter(m => m.type === 'lathe').reduce((a, m) => a + m.count, 0) === 2]),
    ['1 シフトあたり約 15 回の工具交換、マシニングセンタ 4 台', p => p.changes === 15 && p.machines[0]?.count === 4],
  ];
  for (const [txt, ok] of CASES) { n++; const p = defaultProfile(); apply(p, parse(txt), newMachine, true); if (!ok(p)) bad.push('Fall: ' + txt.slice(0, 60) + ' → ' + JSON.stringify({ m: p.machines.map(m => m.count + 'x' + m.type), net: p.network, L: p.maxLen, D: p.maxDia, erp: p.erp, ins: p.inserts })); }
  // Fachfragen: Absicht erkannt, Antwort vorhanden
  const { answer, isQuestion } = await import('./assets/js/expert.js');
  const { recommend, gains } = await import('./assets/js/engine.js');
  const prof = defaultProfile(); apply(prof, parse(S0['ex1']), newMachine, true);
  const items = recommend(prof), gain = gains(prof, items);
  const T = (k, v = {}) => { let x = STR.de[k] || k; return x.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (m, kk, a, b) => (+v[kk] === 1 ? a : b)).replace(/\{(\w+)\}/g, (m, kk) => v[kk] ?? m); };
  const ctx = { p: prof, items, gain, t: T, esc: (x) => String(x), eur: (x) => Math.round(x) + ' €', fmt: (x) => String(Math.round(x)), tierName: (x) => x };
  const QS = [['Brauche ich einen toolBalancer?', 'qa.need'], ['Warum venturion?', 'why'], ['Unterschied zidCode und zidCode 4.0?', 'qa.cmp'], ['Wie viele Werkzeuge passen in einen keeper?', 'qa.cap'],
              ['Was kostet das?', 'qa.price'], ['Lohnt sich das für uns?', 'qa.gain'], ['Was ist der twister?', 'role'], ['Do I need a toolBalancer?', 'qa.need'], ['Brauche ich einen roboBox?', 'qa.need']];
  for (const [q, want] of QS) {
    n++;
    const a = isQuestion(q) ? answer(q, ctx) : null;
    if (!a || !a.html) bad.push('Frage ohne Antwort: ' + q);
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
