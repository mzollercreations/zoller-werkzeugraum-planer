// Empfehlung + Gewinnrechnung. Reine Logik, keine DOM-Zugriffe.
// Rechenweise wie der ZOLLER Wirtschaftlichkeitsrechner (Zeitersparnis × Werkzeugwechsel × Schichten × Arbeitstage × Stundensatz,
// TMS +5 % Produktivität und −20 % Werkzeugkosten nach RWTH Aachen); jede Annahme ist im Profil änderbar.
import { MTYPES, CONTROLS, PRODUCTS } from './knowledge.js';

export const TIERS = ['start', 'pro', 'smart'];

export function defaultProfile(fx = 1) {
  const r = (v) => { const x = v * fx; const m = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)); return Math.round(x / m) * m; };
  return {
    v: 1, company: '', industry: '', machines: [],
    shifts: 2, days: 220, hours: 8, changes: 20, rate: r(95), staff: r(55), tools: 0, fx,
    measure: '', data: '', storage: '', shrink: null, hsc: null, grind: null, series: null, cam: false,
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
export function stats(p) {
  const ms = p.machines.filter(m => m.count > 0);
  const n = ms.reduce((s, m) => s + m.count, 0);
  const by = t => ms.filter(m => m.type === t).reduce((s, m) => s + m.count, 0);
  const turning = n ? ms.reduce((s, m) => s + m.count * (MTYPES[m.type]?.turning || 0), 0) / n : 0;
  const dmi = ms.filter(m => CONTROLS[m.control]?.dmi).reduce((s, m) => s + m.count, 0);
  const value = ms.reduce((s, m) => s + m.count * (m.value || MTYPES[m.type].value * (p.fx || 1)), 0);
  const tpd = n * p.changes * p.shifts;                               // Werkzeuge, die pro Tag gerüstet werden
  const tools = p.tools || Math.max(60, Math.round(n * 70 / 10) * 10); // Komplettwerkzeuge im Umlauf (Annahme: 70 je Maschine)
  const hoursPerMachine = p.hours * p.shifts * p.days;
  return { n, by, turning, dmi, classic: n - dmi, value, tpd, tools, hoursPerMachine,
           large: n ? (by('hmc') + (p.industry === 'energy' ? n * .3 : 0)) / n : 0,
           milling: n ? (by('vmc') + by('5ax') + by('hmc')) / n : 0 };
}

const has = (p, k) => p.pains.includes(k) || p.goals.includes(k);
const ceil = Math.ceil, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ Empfehlung
// Ergebnis: Liste von Positionen { id, qty, step, why: [[key, params]], facts: [], have?, opt? }
export function recommend(p, tier = p.tier) {
  const s = stats(p);
  const T = TIERS.indexOf(tier);           // 0 start, 1 pro, 2 smart
  const out = [];
  const add = (id, qty, why, facts = [], extra = {}) => {
    if (p.exclude.includes(id) || qty <= 0) return;
    out.push({ id, qty, step: PRODUCTS[id].step, why, facts, ...extra });
  };
  if (!s.n) return out;
  const aeroMed = ['aero', 'medical'].includes(p.industry);

  // --- Einstellen & Messen
  let robo = false;
  if (T === 2 && s.tpd >= 240 && !p.exclude.includes('robobox')) {
    robo = true;
    add('robobox', 1, [['why.robobox', { tpd: s.tpd }]], ['robobox']);
  }
  let pre = 'venturion', preWhy = [];
  if (s.turning >= .5) { pre = 'hyperion'; preWhy.push(['why.hyperion', { share: Math.round(s.turning * 100) }]); }
  else if (s.large >= .3) { pre = s.by('hmc') / s.n >= .5 ? 'venturion800' : 'venturion600'; preWhy.push(['why.large', {}]); }
  else if (s.n <= 5 && T === 0 && !aeroMed && !has(p, 'automation')) { pre = 'smile'; preWhy.push(['why.smile', { n: s.n }]); }
  else preWhy.push(['why.venturion', { n: s.n }]);
  if (p.include.includes('smile')) pre = 'smile';
  if (p.include.includes('hyperion')) pre = 'hyperion';
  const cap = PRODUCTS[pre].cap * p.shifts;
  let qty = robo ? 1 : clamp(ceil(s.tpd / cap), 1, 6);
  const shrinkHeavy = p.shrink && T >= 1 && s.tpd >= 60 && !p.exclude.includes('redomatic');
  if (shrinkHeavy && qty > 1) qty -= 1;    // »redomatic« übernimmt das Einstellen der Schrumpfwerkzeuge
  preWhy.unshift(['why.measure', { tpd: s.tpd, qty, cap }]);
  if (aeroMed) preWhy.push(['why.aeromed', {}]);
  add(pre, qty, preWhy, ['calc15k', 'setup40', pre === 'hyperion' ? 'hyp20' : (pre === 'smile' ? 'procam' : 'ituwa')],
      p.measure === 'zoller' ? { have: true } : {});

  // --- Schrumpfen
  if (p.shrink) {
    if (shrinkHeavy) add('redomatic', 1, [['why.redomatic', { tpd: s.tpd }]], ['redo10']);
    else add('powershrink', 1, [['why.powershrink', {}]], ['ps27']);
  } else if (p.include.includes('powershrink')) add('powershrink', 1, [['why.powershrink', {}]], ['ps27']);

  // --- Wuchten
  if ((p.hsc || has(p, 'chatter') || has(p, 'spindle') || p.include.includes('toolbalancer')) && (T >= 1 || has(p, 'spindle') || p.include.includes('toolbalancer'))) {
    add('toolbalancer', 1, [[p.hsc ? 'why.balance.hsc' : 'why.balance.pain', {}]], ['balance2x', 'spindle', 'tb04']);
  } else if (T === 2 && ['aero', 'mold', 'medical'].includes(p.industry)) {
    add('toolbalancer', 1, [['why.balance.ind', {}]], ['balance2x', 'tb04']);
  }

  // --- Identifizieren & Übertragen (an jeder Maschine)
  if (p.data !== 'post' || p.include.includes('zidcode')) {
    const why = [[p.data === 'paper' ? 'why.zid.paper' : 'why.zid.typed', { n: s.n, year: s.tpd * p.days }]];
    if (T >= 1 && s.dmi) {
      add('zidcode40', s.dmi, [...why, ['why.zid.dmi', { n: s.dmi }]], ['zdmi', 'zid45']);
      if (s.classic) add('zidcode', s.classic, [['why.zid.classic', { n: s.classic }]], ['zid45']);
    } else add('zidcode', s.n, why, ['zid45']);
    if (T >= 1 && !p.exclude.includes('idchip')) add('idchip', s.tools, [['why.idchip', { tools: s.tools }]], ['runout3']);
  }

  // --- Lagern
  if (p.storage !== 'tms' || T >= 1) {
    if (T === 0) add('toolorganizer', clamp(ceil(s.n / 6), 1, 4), [['why.organizer', {}]], ['lauble']);
    else {
      const kq = clamp(ceil(s.tools / 420), 1, 8);
      add('keeper', kq, [['why.keeper', { tools: s.tools, qty: kq }]], ['keeper420', 'lauble']);
      add('toolorganizer', clamp(ceil(s.n / 8), 1, 4), [['why.organizer2', {}]], []);
    }
  }

  // --- Montieren
  if (T >= 1) add('toolstation', clamp(ceil(s.tpd / 160), 1, 3), [['why.toolstation', { tpd: s.tpd }]], []);

  // --- Bereitstellen
  if (T >= 1) add('toolcart', clamp(ceil(s.n / 6), 1, 6), [['why.toolcart', { n: s.n }]], []);
  if (T === 2 && s.n >= 12) add('loadbox', 1, [['why.loadbox', { n: s.n }]], []);
  if (T === 2 && (has(p, 'unmanned') || s.by('hmc') >= 4)) add('coramachineload', 1, [['why.cora', {}]], []);

  // --- Prüfen / Nachschleifen
  if (p.grind) add(T >= 1 ? 'genius' : 'pombasic', 1, [['why.grind', {}]], ['genius60']);
  else if (T >= 1 && (aeroMed || has(p, 'doc') || has(p, 'scrap'))) add('pombasic', 1, [['why.pombasic', {}]], []);
  if (T === 2 && (p.industry === 'toolmaker' || (p.grind && p.series))) add('roboset-2', 1, [['why.roboset', {}]], ['roboset']);

  // --- Software
  if (T === 0) { if (p.storage !== 'tms') add('tms-starter', 1, [['why.starter', {}]], []); }
  else if (T === 1) add('tms-silver', 1, [['why.silver', {}]], ['tms5', 'tool20']);
  else { add('tms-gold', 1, [['why.gold', {}]], ['tms5', 'tool20']); add('zshopfloor', 1, [['why.shopfloor', {}]], []); add('zconnectivity', 1, [['why.connectivity', {}]], []); }
  if (p.cam && T >= 1) add('zcam', 1, [['why.cam', {}]], []);

  // ausdrücklich gewünschte Produkte, die die Regeln nicht gesetzt haben
  for (const id of p.include) if (PRODUCTS[id] && !out.some(o => o.id === id)) add(id, 1, [['why.include', {}]], []);
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

  // 1 Einstellen außerhalb der Maschine
  if (any('smile', 'venturion', 'venturion600', 'venturion800', 'hyperion', 'redomatic', 'robobox')) {
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
  if (any('tms-silver', 'tms-gold')) {
    const pct = cons ? 2 : 5;
    const h = s.n * s.hoursPerMachine * pct / 100;
    L.push({ id: 'tms', eur: h * p.rate, spindle: h, staffH: 0, facts: ['tms5'], f: { pct } });
  }
  // 4 Werkzeugkosten (RWTH: Werkzeugkosten/Jahr ≈ 10 % des Maschinenwerts, TMS spart 20 % davon)
  const toolSpend = s.value * .10;
  if (any('tms-silver', 'tms-gold')) {
    const pct = cons ? 10 : 20;
    L.push({ id: 'toolcost', eur: toolSpend * pct / 100, spindle: 0, staffH: 0, facts: ['tool20'], f: { value: s.value, spend: toolSpend, pct } });
  }
  // 5 Standzeit durch Rundlauf + Wuchten (konservativ, Anwender berichten ×1,5 bis ×2)
  if (any('powershrink', 'redomatic', 'toolbalancer')) {
    const life = cons ? 5 : 10;
    const rest = any('tms-silver', 'tms-gold') ? (cons ? .9 : .8) : 1;     // was nach der TMS-Einsparung noch an Werkzeugkosten bleibt
    const eur = toolSpend * rest * life / (100 + life);
    L.push({ id: 'toollife', eur, spindle: 0, staffH: 0, facts: ['life15', 'balance2x', 'runout3'], f: { life } });
  }
  // 6 Suchzeit (LAUBLE: 90 s je Komplettwerkzeug)
  if (any('keeper', 'toolorganizer') && any('tms-starter', 'tms-silver', 'tms-gold') && p.storage !== 'tms') {
    const before = p.storage === 'cabinets' ? 60 : 90, after = 15;
    const sec = (before - after) * (cons ? .6 : 1);
    const h = changesYear * sec / 3600;
    L.push({ id: 'search', eur: h * p.staff, spindle: 0, staffH: h, facts: ['lauble'], f: { before, after: before - sec } });
  }
  // 7 Automatisiertes Einstellen
  if (any('robobox')) {
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
              'shrink', 'hsc', 'grind', 'series', 'cam', 'goals', 'pains', 'exclude', 'include', 'invest', 'mode', 'tier', 'known'];
export function pack(p) {
  const o = {};
  for (const k of KEYS) o[k] = p[k];
  o.m = p.machines.map(m => [m.count, m.type, m.brand, m.model, m.control, m.holder, m.value || 0]);
  return o;
}
export function unpack(o, fx = 1) {
  const p = defaultProfile(fx);
  for (const k of KEYS) if (o[k] !== undefined) p[k] = o[k];
  p.machines = (o.m || []).map(a => newMachine({ count: a[0], type: a[1], brand: a[2], model: a[3], control: a[4], holder: a[5], value: a[6] }));
  return p;
}
