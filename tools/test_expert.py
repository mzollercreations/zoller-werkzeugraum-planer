#!/usr/bin/env python3
"""Fachfragen in allen 18 Sprachen: die vorgeschlagenen Fragen (qa.s.*) jeder Sprache müssen die richtige Antwortart
auslösen (Warum → Begründung, Brauche ich → Bedarf, Unterschied → Vergleich, Lohnt sich → Gewinn, Wie viele → Kapazität).

    python3 -m http.server 8792 --directory docs &
    ~/Claude/ZOLLER/video/.venv/bin/python tools/test_expert.py [http://localhost:8792/]
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

CHROME = os.path.expanduser("~/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
LANGS = ['de', 'en', 'fr', 'es', 'it', 'pt', 'pt-BR', 'sv', 'pl', 'cs', 'sk', 'sl', 'hu', 'zh', 'ja', 'ko', 'ru', 'tr']
DESC = 'Wir haben 8 Bearbeitungszentren von DMG Mori, 2 Drehmaschinen von Okuma, 1 Doosan Fräsmaschine, zwei Schichten, viele Schrumpffutter, HSK 63, Maschinen im Netzwerk'
EXTRA = [['qa.s.why', {'name': '»smile«'}], ['qa.s.cap', {}], ['qa.s.why', {'name': '»keeper«'}]]
# erwartete Antwortart je Frage: 4 Vorschläge, dann EXTRA
WANT = ['why|info', 'qa.need', 'qa.cmp', 'qa.gain', 'qa.pre.alt', 'qa.cap.keeper', 'why|info']
JS = r"""async ([langs, desc, extra]) => {
  const { parse, apply } = await import('./assets/js/nlu.js'); const E = await import('./assets/js/engine.js');
  const { STR } = await import('./assets/js/strings.js'); const X = await import('./assets/js/expert.js');
  const res = {};
  for (const L of langs) {
    if (!STR[L]) STR[L] = (await import(`./assets/js/strings-${L}.js`)).default;
    const PR = new Intl.PluralRules(L);
    const plural = (n, f) => { if (f.length === 2) return n === 1 ? f[0] : f[1]; const c = PR.select(n); return c === 'one' ? f[0] : c === 'two' ? f[1] : c === 'few' ? f[f.length - 2] : f[f.length - 1]; };
    const T = (k, v = {}) => { let x = STR[L][k] ?? STR.en[k] ?? STR.de[k] ?? k; x = x.replace(/\{(\w+)((?:\|[^|}]*){2,4})\}/g, (m, kk, f) => plural(+v[kk], f.slice(1).split('|'))); return x.replace(/\{(\w+)\}/g, (m, kk) => v[kk] ?? m); };
    const p = E.defaultProfile(); apply(p, parse(desc), E.newMachine, true);
    const items = E.recommend(p), gain = E.gains(p, items);
    const ctx = { p, items, gain, t: T, esc: (x) => String(x), eur: (x) => Math.round(x) + ' €', fmt: (x) => String(Math.round(x)), tierName: (x) => T('tier.' + x) };
    const keys = ['qa.cmp','qa.price','qa.cap.keeper','qa.cap.loadbox','qa.cap.pre','qa.gain','qa.net','qa.reco','qa.need.yes','qa.need.tier','qa.need.excl','qa.need.no','qa.pre.alt'];
    const cls = (h) => { if (!h) return 'NULL'; const txt = h.replace(/<[^>]+>/g, ''); for (const k of keys) { const pre = (STR[L][k] || '').split('{')[0].trim(); if (pre.length >= 3 && txt.startsWith(pre)) return k; const post = (STR[L][k] || '').split('}').pop().trim(); if (pre.length < 3 && post.length >= 4 && txt.includes(post.slice(0, 12))) return k; } return h.startsWith('<p><b>') && /– /.test(txt) && !h.includes('qa-cmp') ? 'why|info' : 'other'; };
    const qs = X.suggestions(items, T).concat(extra.map(e => T(e[0], e[1])));
    res[L] = qs.map(q => [q, X.isQuestion(q), cls(X.answer(q, ctx)?.html)]);
  }
  return res;
}"""

async def main():
    url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8792/'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True)
        pg = await b.new_page(); await pg.goto(url)
        r = await pg.evaluate(JS, [LANGS, DESC, EXTRA])
        await b.close()
    bad = 0
    for L, rows in r.items():
        for (q, iq, c), w in zip(rows, WANT):
            if not iq or not c.startswith(w):
                bad += 1; print(f'{L}: »{q}« → {c} (erwartet {w})')
    print(f'{sum(len(v) for v in r.values())} Fragen, {bad} Abweichungen')
    sys.exit(1 if bad else 0)

asyncio.run(main())
