// Empfehlung + Gewinnrechnung. Reine Logik, keine DOM-Zugriffe.
// Rechenweise wie der ZOLLER Wirtschaftlichkeitsrechner (Zeitersparnis × Werkzeugwechsel × Schichten × Arbeitstage × Stundensatz,
// TMS +5 % Produktivität und −20 % Werkzeugkosten nach RWTH Aachen); jede Annahme ist im Profil änderbar.
// Produktauswahl nach den technischen Daten der ZOLLER-Produktseiten (knowledge.js: SERIES, KEEPER_CAP, LOADBOX_CAP, ROBOBOX).
import { MTYPES, CONTROLS, PRODUCTS, HEAVY_HOLDER, SERIES, KEEPER_CAP, LOADBOX_CAP, ROBOBOX, UTIL, seriesFor } from './knowledge.js';

export const TIERS = ['start', 'pro', 'smart'];

export function defaultProfile(fx = 1, money = null) {
  // Vorgaben in Euro; money() rechnet sie in die Währung des Besuchers um und rundet auf (ZCurrency.amount)
  const r = money || ((v) => { const x = v * fx; const m = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)); return Math.round(x / m) * m; });
  return {
    v: 2, company: '', industry: '', machines: [],
    shifts: 2, days: 220, hours: 8, changes: 20, rate: r(95), staff: r(55), tools: 0, fx,
    measure: '', data: '', storage: '', shrink: null, hsc: null, grind: null, series: null, cam: false,
    network: '', maxLen: 0, maxDia: 0, inserts: false, erp: false, gauges: false,
    goals: [], pains: [], exclude: [], include: [], invest: 0, mode: 'zoller', tier: 'pro',
    known: [],                // Felder, die der Kunde selbst angegeben hat (alles andere ist Annahme)
  };
}

let _mid = 0;
export function newMachine(o = {}) {
  const t = MTYPES[o.type] ? o.type : 'vmc';
  return { id: 'm' + Date.now().toString(36) + (_mid++), count: 1, type: t, brand: '', model: '', control: '', holder: '',
           value: 0, cad: null, ...o, type: t };
}

// ------------------------------------------------------------------ abgeleitete Kennzahlen
export const isHeavy = (m) => HEAVY_HOLDER.test(m.holder || '') || (!m.holder && ['hmc', 'boring', 'gantry', 'vtl'].includes(m.type));

export function stats(p) {
  const ms = p.machines.filter(m => m.count > 0);
  const n = ms.reduce((s, m) => s + m.count, 0);
  const by = t => ms.filter(m => m.type === t).reduce((s, m) => s + m.count, 0);
  const turning = n ? ms.reduce((s, m) => s + m.count * (MTYPES[m.type]?.turning || 0), 0) / n : 0;
  const dmi = ms.filter(m => CONTROLS[m.control]?.dmi).reduce((s, m) => s + m.count, 0);
  const value = ms.reduce((s, m) => s + m.count * (m.value || MTYPES[m.type].value * (p.fx || 1)), 0);
  const heavy = n ? ms.filter(isHeavy).reduce((s, m) => s + m.count, 0) / n : 0;
  const tpd = n * p.changes * p.shifts;                               // Werkzeuge, die pro Tag gerüstet werden
  const tools = p.tools || Math.max(60, Math.round(n * 70 / 10) * 10); // Komplettwerkzeuge im Umlauf (Annahme: 70 je Maschine)
  const hoursPerMachine = p.hours * p.shifts * p.days;
  // Messbereich: Angabe des Kunden, sonst typischer Wert der größten Maschinenart (Planungsannahme)
  const reqL = Math.max(0, ...ms.map(m => MTYPES[m.type].req.L)), reqD = Math.max(0, ...ms.map(m => MTYPES[m.type].req.D));
  const L = p.maxLen || reqL, D = p.maxDia || reqD;
  const holders = [...new Set(ms.map(m => m.holder || MTYPES[m.type].holder))];
  return { n, by, turning, dmi, classic: n - dmi, value, heavy, tpd, tools, hoursPerMachine, L, D, sizeKnown: !!(p.maxLen || p.maxDia), holders,
           milling: n ? (by('vmc') + by('5ax') + by('hmc') + by('gantry') + by('boring')) / n : 0 };
}

const has = (p, k) => p.pains.includes(k) || p.goals.includes(k);
const ceil = Math.ceil, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Einstellgerät: Familie, Baureihe, Kapazität
export function presetterFor(p, s, T) {
  const aeroMed = ['aero', 'medical'].includes(p.industry);
  let fam = 'venturion';
  if (s.turning >= .5) fam = 'hyperion';
  else if (s.n <= 5 && T === 0 && !aeroMed && !has(p, 'automation') && s.L <= 800 && s.D <= 620) fam = 'smile';
  if (p.include.includes('smile')) fam = 'smile';
  if (p.include.includes('hyperion')) fam = 'hyperion';
  if (['venturion', 'venturion600', 'venturion800'].some(x => p.include.includes(x))) fam = 'venturion';
  let ser = fam === 'hyperion' ? seriesFor('hyperion', s.L) : seriesFor(fam, s.L, s.D);
  let heavyUp = false;
  if (fam === 'venturion' && s.heavy >= .3 && ser.pid === 'venturion') { ser = SERIES.venturion[1]; heavyUp = true; }
  for (const x of ['venturion600', 'venturion800']) if (p.include.includes(x)) ser = SERIES.venturion.find(v => v.pid === x);
  const pid = fam === 'venturion' ? ser.pid : fam;
  const cap = Math.floor(p.hours * 60 * UTIL / PRODUCTS[pid].min) * p.shifts;     // Werkzeuge je Gerät und Tag
  return { fam, pid, ser, cap, heavyUp, aeroMed };
}

// ------------------------------------------------------------------ Empfehlung
// Ergebnis: Liste von Positionen { id, qty, step, why: [[key, params]], facts: [], model?, have? }
export function recommend(p, tier = p.tier) {
  const s = stats(p);
  const T = TIERS.indexOf(tier);           // 0 Einstieg, 1 Professional, 2 Smart Factory
  const out = [];
  const no = (id) => p.exclude.includes(id);
  const add = (id, qty, why, facts = [], extra = {}) => {
    if (no(id) || qty <= 0 || out.some(o => o.id === id)) return null;
    const it = { id, qty, step: PRODUCTS[id].step, why, facts, ...extra };
    out.push(it); return it;
  };
  const got = (id) => out.some(o => o.id === id);
  if (!s.n) return out;

  // --- Einstellen & Messen (automatisiert ab ~240 Werkzeugen pro Tag in der Smart Factory)
  let auto = null;
  const pr = presetterFor(p, s, T);
  if (T === 2 && s.tpd >= 240) {
    if (p.shrink && !no('robobox')) { auto = 'robobox'; add('robobox', 1, [['why.robobox', { tpd: s.tpd, L: ROBOBOX.L, d0: ROBOBOX.d[0], d1: ROBOBOX.d[1] }]], ['robobox', 'roboboxd']); }
    else if (!no('corameasure') && pr.fam === 'venturion') { auto = 'corameasure'; add('corameasure', 1, [['why.corameasure', { tpd: s.tpd }]], ['setup40']); }
  }
  let qty = auto ? 1 : clamp(ceil(s.tpd / pr.cap), 1, 6);
  const shrinkHeavy = p.shrink && T >= 1 && s.tpd >= 60 && !no('redomatic') && auto !== 'robobox';
  if (shrinkHeavy && qty > 1) qty -= 1;    // »redomatic« übernimmt das Einstellen der Schrumpfwerkzeuge
  const why = [['why.measure', { tpd: s.tpd, qty, cap: pr.cap, min: PRODUCTS[pr.pid].min }]];
  why.push([(pr.ser.D ? 'why.range' : 'why.rangeh') + (s.sizeKnown ? '' : '.a'), { model: '»' + pr.ser.name + '«', L: s.L, D: s.D, Lmax: pr.ser.L, Dmax: pr.ser.D || 0 }]);
  if (pr.fam === 'hyperion') why.push(['why.hyperion', { share: Math.round(s.turning * 100) }]);
  else if (pr.fam === 'smile') why.push(['why.smile', { n: s.n }]);
  else if (pr.heavyUp) why.push(['why.heavy', { share: Math.round(s.heavy * 100) }]);
  else why.push(['why.venturion', { n: s.n }]);
  if (pr.fam === 'venturion' && s.turning >= .15) why.push(['why.turnopt', { share: Math.round(s.turning * 100) }]);
  if (pr.aeroMed) why.push(['why.aeromed', {}]);
  add(pr.pid, qty, why, ['calc15k', 'setup40', pr.fam === 'hyperion' ? 'hyp20' : (pr.fam === 'smile' ? 'procam' : 'ituwa'), pr.fam === 'smile' ? 'smiled' : pr.fam === 'hyperion' ? 'hypd' : 'ventd'],
      { model: pr.ser.name, spec: { L: pr.ser.L, D: pr.ser.D || 0 }, ...(p.measure === 'zoller' ? { have: true } : {}) });

  // --- Schrumpfen
  if (p.shrink || p.include.includes('powershrink') || p.include.includes('redomatic')) {
    if (shrinkHeavy || p.include.includes('redomatic')) add('redomatic', 1, [['why.redomatic', { tpd: s.tpd }]], ['redo10'], { model: 'redomatic 600' });
    if (!got('redomatic') && auto !== 'robobox' || p.include.includes('powershrink') || (auto === 'robobox' && s.heavy > 0)) {
      const ps = s.heavy >= .3 ? SERIES.powershrink[2] : s.L > 600 ? SERIES.powershrink[3] : T === 0 ? SERIES.powershrink[0] : SERIES.powershrink[1];
      const key = { 'powerShrink 200': 'why.ps200', 'powerShrink 400': 'why.ps400', 'powerShrink 600': 'why.ps600', 'powerShrink 400 | 11': 'why.ps11' }[ps.name];
      add('powershrink', 1, [['why.powershrink', {}], [key, { L: ps.L }]], ['ps27', 'psmodels'], { model: ps.name, spec: { L: ps.L } });
    }
  }

  // --- Wuchten
  if ((p.hsc || has(p, 'chatter') || has(p, 'spindle') || p.include.includes('toolbalancer')) && (T >= 1 || has(p, 'spindle') || p.include.includes('toolbalancer'))) {
    add('toolbalancer', 1, [[p.hsc ? 'why.balance.hsc' : 'why.balance.pain', {}]], ['balance2x', 'spindle', 'tb04']);
  } else if (T === 2 && ['aero', 'mold', 'medical'].includes(p.industry)) {
    add('toolbalancer', 1, [['why.balance.ind', {}]], ['balance2x', 'tb04']);
  }

  // --- Identifizieren & Übertragen (an jeder Maschine)
  if (p.data !== 'post' || p.include.includes('zidcode') || p.include.includes('zidcode40')) {
    const noNet = p.network === 'no';
    const dmiN = noNet ? 0 : s.dmi;
    const base = [[p.data === 'paper' ? 'why.zid.paper' : 'why.zid.typed', { n: s.n, year: s.tpd * p.days }]];
    if (T >= 1 && dmiN) {
      const w = [...base, ['why.zid.dmi', { n: dmiN }]];
      if (!p.network) w.push(['why.zid.netq', {}]);
      add('zidcode40', dmiN, w, ['zdmi', 'zid45', 'zidnet']);
      if (s.n - dmiN > 0) add('zidcode', s.n - dmiN, [['why.zid.classic', { n: s.n - dmiN }]], ['zid45', 'zidnet']);
    } else add('zidcode', s.n, noNet ? [...base, ['why.zid.nonet', {}]] : base, ['zid45', 'zidnet']);
    // Halterkennung: »zidCode 4.0« braucht einen eindeutigen 2D-Code an jedem Halter
    const z40 = got('zidcode40');
    if (T >= 1 || z40) {
      const rot = Math.round(s.tools * (1 - s.turning)), turn = s.tools - rot;
      if (rot > 0) add('idchip', rot, [['why.idchip', { tools: rot }], ...(z40 ? [['why.idreq', {}]] : [])], ['idlabel', 'runout3']);
      if (turn > 0) add('idlabel', turn, [['why.idlabel', { tools: turn }], ...(z40 ? [['why.idreq', {}]] : [])], ['idlabel']);
    }
  }

  // --- Lagern
  const lbQty = T === 2 && s.n >= 12 && s.tools >= 600 && !no('loadbox') ? clamp(ceil(s.tools / LOADBOX_CAP), 1, 3) : 0;
  if (p.storage !== 'tms' || T >= 1) {
    if (T === 0) add('toolorganizer', clamp(ceil(s.n / 6), 1, 4), [['why.organizer', {}]], ['lauble']);
    else {
      const cap = Math.round(KEEPER_CAP.S * (1 - s.heavy) + KEEPER_CAP.L * s.heavy);
      if (lbQty) {      // die »loadBox« lagert die Werkzeuge bis 450 mm / Ø 120 mm / 10 kg, der »keeper« den Rest (Annahme: 20 %)
        const big = Math.round(s.tools * .2), kq = Math.max(1, ceil(big / cap));
        add('keeper', kq, [['why.keeper.lb', { tools: big, qty: kq, cap }]], ['keeper420', 'loadbox']);
      } else {
        const kq = Math.max(1, ceil(s.tools / cap));
        add('keeper', kq, [['why.keeper', { tools: s.tools, qty: kq, cap }]], ['keeper420', 'lauble']);
      }
      add('toolorganizer', clamp(ceil(s.n / 8), 1, 4), [['why.organizer2', {}]], []);
      if (T === 2 && s.n >= 8) add('twister', 1, [['why.twister', {}]], []);
      if ((T === 2 && s.n >= 12) || p.gauges) add('autolock', 1, [['why.autolock', {}]], []);
    }
  }

  // --- Montieren
  if (T >= 1) {
    if (s.n <= 4 && s.tpd < 100) add('ztower', 1, [['why.ztower', { tpd: s.tpd }]], []);
    else add('toolstation', clamp(ceil(s.tpd / 160), 1, 3), [['why.toolstation', { tpd: s.tpd }]], []);
  }
  if (T === 2 && p.inserts && (p.series || s.tpd >= 200)) add('micbox', 1, [['why.micbox', {}]], []);

  // --- Bereitstellen
  if (T >= 1) add('toolcart', clamp(ceil(s.n / 6), 1, 6), [['why.toolcart', { n: s.n }]], []);
  if (lbQty) add('loadbox', lbQty, [['why.loadbox', { n: s.n, cap: LOADBOX_CAP }]], ['loadbox']);
  if (T === 2 && (has(p, 'unmanned') || s.by('hmc') >= 4)) add('coramachineload', 1, [['why.cora', {}]], ['cora']);
  if (T === 2 && (s.n >= 16 || has(p, 'unmanned')) && (got('loadbox') || got('coramachineload'))) add('coralogistic', 1, [['why.coralogistic', {}]], []);

  // --- Prüfen
  if (p.grind) add(T >= 1 ? 'genius' : 'pombasic', 1, [['why.grind', {}]], ['genius60']);
  else if (T >= 1 && (pr.aeroMed || has(p, 'doc') || has(p, 'scrap'))) add('pombasic', 1, [['why.pombasic', {}]], []);
  if (s.by('gear') && T >= 1) add('hobcheck', 1, [['why.hobcheck', { n: s.by('gear') }]], []);
  if (T === 2 && (p.industry === 'toolmaker' || (p.grind && p.series))) add('roboset-2', 1, [['why.roboset', {}]], ['roboset']);

  // --- Software: »TMS Core« + Add-ons
  if (T === 0) { if (p.storage !== 'tms') add('tms-core', 1, [['why.core.start', {}]], ['webtms']); }
  else {
    add('tms-core', 1, [['why.core', {}]], ['tms5', 'tool20'], { full: true });
    if (got('keeper') || got('toolorganizer')) add('zstock', 1, [['why.zstock', {}]], []);
    if (got('zidcode40') || T === 2) add('zconnectivity', 1, [[got('zidcode40') ? 'why.zconn' : 'why.connectivity', {}]], ['zconn']);
    if (T === 2) add('zshopfloor', 1, [['why.shopfloor', {}]], []);
    if (T === 2 || p.gauges) add('zresources', 1, [['why.zresources', {}]], []);
    if (p.cam) add('zcam', 1, [['why.cam', {}]], []);
    if (p.erp) add('zintegration', 1, [['why.zintegration', {}]], []);
  }

  // ausdrücklich gewünschte Produkte, die die Regeln nicht gesetzt haben
  for (const id of p.include) if (PRODUCTS[id] && !PRODUCTS[id].legacy && !got(id)) add(id, 1, [['why.include', {}]], []);
  return out;
}

// ------------------------------------------------------------------ Gewinnrechnung
// Hebel: { id, eur, spindle (h/Jahr Maschinenzeit), staffH (h/Jahr Personalzeit), facts, f (Formelparameter) }
export function gains(p, items) {
  const s = stats(p);
  const ids = new Set(items.filter(i => !i.have).map(i => i.id));
  const any = (...a) => a.some(x => ids.has(x));
  const cons = p.mode === 'cons';
  const L = [];
  const changesYear = s.tpd * p.days;          // Werkzeugwechsel pro Jahr (alle Maschinen)
  const tmsFull = items.some(i => i.id === 'tms-core' && i.full);

  // 1 Einstellen außerhalb der Maschine
  if (any('smile', 'venturion', 'venturion600', 'venturion800', 'hyperion', 'redomatic', 'robobox', 'corameasure')) {
    const base = cons ? 2 : 3;                                       // ZOLLER rechnet mit 3 min je Wechsel (4,52 min gemessen)
    const f = { measure: 1, machine: 1, manual: 1, old: .35, zoller: 0, '': 1 }[p.measure] ?? 1;
    const min = base * f;
    const h = changesYear * min / 60;
    L.push({ id: 'presetting', eur: h * p.rate, spindle: h, staffH: 0, facts: ['calc15k', 'min452', 'setup40'], f: { min, changes: p.changes, shifts: p.shifts, days: p.days, n: s.n, rate: p.rate } });
  }
  // 2 Datenübertragung per Scan statt Abtippen (»zidCode«: 6 Werkzeuge 4:30 → 2:30 min = 20 s je Werkzeug)
  if (any('zidcode', 'zidcode40') && p.data !== 'post') {
    const sec = cons ? 15 : 20;
    const h = changesYear * sec / 3600;
    L.push({ id: 'datatransfer', eur: h * p.rate, spindle: h, staffH: 0, facts: ['zid45', 'zdmi'], f: { sec, entries: changesYear * 2 } });
  }
  // 3 Produktivität durch Werkzeugverwaltung (RWTH: ≥ 5 %)
  if (tmsFull) {
    const pct = cons ? 2 : 5;
    const h = s.n * s.hoursPerMachine * pct / 100;
    L.push({ id: 'tms', eur: h * p.rate, spindle: h, staffH: 0, facts: ['tms5'], f: { pct } });
  }
  // 4 Werkzeugkosten (RWTH: Werkzeugkosten/Jahr ≈ 10 % des Maschinenwerts, TMS spart 20 % davon)
  const toolSpend = s.value * .10;
  if (tmsFull) {
    const pct = cons ? 10 : 20;
    L.push({ id: 'toolcost', eur: toolSpend * pct / 100, spindle: 0, staffH: 0, facts: ['tool20'], f: { value: s.value, spend: toolSpend, pct } });
  }
  // 5 Standzeit durch Rundlauf + Wuchten (konservativ, Anwender berichten ×1,5 bis ×2)
  if (any('powershrink', 'redomatic', 'toolbalancer', 'robobox')) {
    const life = cons ? 5 : 10;
    const rest = tmsFull ? (cons ? .9 : .8) : 1;     // was nach der TMS-Einsparung noch an Werkzeugkosten bleibt
    const eur = toolSpend * rest * life / (100 + life);
    L.push({ id: 'toollife', eur, spindle: 0, staffH: 0, facts: ['life15', 'balance2x', 'runout3'], f: { life } });
  }
  // 6 Suchzeit (LAUBLE: 90 s je Komplettwerkzeug)
  if (any('keeper', 'toolorganizer') && any('tms-core') && p.storage !== 'tms') {
    const before = p.storage === 'cabinets' ? 60 : 90, after = 15;
    const sec = (before - after) * (cons ? .6 : 1);
    const h = changesYear * sec / 3600;
    L.push({ id: 'search', eur: h * p.staff, spindle: 0, staffH: h, facts: ['lauble'], f: { before, after: before - sec } });
  }
  // 7 Automatisiertes Einstellen (Planungsannahme: 2 min Personalzeit je Werkzeug)
  if (any('robobox', 'corameasure')) {
    const min = cons ? 1 : 2;
    const h = Math.min(s.tpd, 480) * p.days * min / 60;
    L.push({ id: 'automation', eur: h * p.staff, spindle: 0, staffH: h, facts: ['robobox'], f: { min } });
  }
  const eur = L.reduce((a, l) => a + l.eur, 0);
  const spindle = L.reduce((a, l) => a + l.spindle, 0);
  const staffH = L.reduce((a, l) => a + l.staffH, 0);
  // Stillstand je Werkzeugwechsel an der Maschine (Minuten)
  const pres = L.find(l => l.id === 'presetting'), dt = L.find(l => l.id === 'datatransfer');
  const before = (p.measure === 'zoller' ? 1.52 : 4.52) + (p.data === 'post' ? 0 : .75);
  const after = before - (pres ? pres.f.min : 0) - (dt ? dt.f.sec / 60 : 0);
  return {
    levers: L.sort((a, b) => b.eur - a.eur), eur, spindle, staffH,
    machinesEq: s.hoursPerMachine ? spindle / s.hoursPerMachine : 0,
    perMachineShift: s.n ? eur / s.n / p.shifts : 0,
    setupBefore: before, setupAfter: Math.max(.3, after),
    entries: dt ? dt.f.entries : 0,
    payback: p.invest > 0 && eur > 0 ? p.invest / (eur / 12) : null,
    budget12: eur,        // Investitionsrahmen, der sich in 12 Monaten trägt
    stats: s,
  };
}

// ------------------------------------------------------------------ Teilen: Profil <-> URL
const KEYS = ['company', 'industry', 'shifts', 'days', 'hours', 'changes', 'rate', 'staff', 'tools', 'measure', 'data', 'storage',
              'shrink', 'hsc', 'grind', 'series', 'cam', 'network', 'maxLen', 'maxDia', 'inserts', 'erp', 'gauges',
              'goals', 'pains', 'exclude', 'include', 'invest', 'mode', 'tier', 'known'];
export function pack(p) {
  const o = {};
  for (const k of KEYS) if (p[k] !== undefined && p[k] !== '' && p[k] !== null && !(Array.isArray(p[k]) && !p[k].length)) o[k] = p[k];
  o.m = p.machines.map(m => [m.count, m.type, m.brand, m.model, m.control, m.holder, m.value || 0]);
  return o;
}
export function unpack(o, fx = 1, money = null) {
  const p = defaultProfile(fx, money);
  for (const k of KEYS) if (o[k] !== undefined) p[k] = o[k];
  p.machines = (o.m || []).map(a => newMachine({ count: a[0], type: a[1], brand: a[2], model: a[3], control: a[4], holder: a[5], value: a[6] }));
  return p;
}
