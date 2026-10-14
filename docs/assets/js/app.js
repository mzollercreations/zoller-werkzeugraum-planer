// ZOLLER Werkzeugraum-Planer – Oberfläche und Ablauf
import { STR } from './strings.js';
import { BRANDS, CONTROLS, MTYPES, PRODUCTS, STEPS, FACTS, SITE, SHOWROOM, INDUSTRIES, brandByName, NEUTRAL_ACCENT } from './knowledge.js';
import { defaultProfile, newMachine, recommend, gains, stats, pack, unpack, TIERS } from './engine.js';
import { parse, apply, missing } from './nlu.js';
import { answer, isQuestion, suggestions } from './expert.js';

const CFG = Object.assign({ lang: 'de', base: '', langs: ['de', 'en'], locales: { de: '', en: 'en/' }, siteUrl: SITE + '/', showroom: SHOWROOM,
  mail: 'info@zoller.info', company: 'E. Zoller GmbH & Co. KG', expert: SITE + '/unternehmen/kontakt/ansprechpartner/', links: {}, factLinks: {} }, window.PLANER || {});
const LANG = CFG.lang;
if (!STR[LANG]) {           // weitere Sprachen liegen in eigenen Dateien
  try { Object.assign(STR, { [LANG]: (await import(`./strings-${LANG}.js`)).default }); } catch (e) { console.warn('Sprache', LANG, e); }
}
const BASE = CFG.base;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ Texte + Zahlen
// Pluralformen: {n|eins|viele}, slawisch {n|eins|wenige|viele}, slowenisch {n|eins|zwei|wenige|viele}
let PR;
function plural(n, f) {
  if (f.length === 2) return n === 1 ? f[0] : f[1];
  const c = (PR ||= new Intl.PluralRules(LOC)).select(n);
  if (c === 'one') return f[0];
  if (c === 'two') return f[1];
  if (c === 'few') return f[f.length - 2];
  return f[f.length - 1];
}
export function t(key, p = {}) {
  let s = STR[LANG]?.[key] ?? STR.en?.[key] ?? STR.de[key] ?? key;
  if (CUR !== 'EUR' && !key.startsWith('fact.') && key !== 'gain.calc15k') s = s.replace(/€/g, SYM);
  s = s.replace(/\{(\w+)((?:\|[^|}]*){2,4})\}/g, (m, k, f) => plural(+p[k], f.slice(1).split('|')));
  return s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? (typeof p[k] === 'number' ? fmt(p[k]) : p[k]) : m));
}
const LOC = CFG.locale || (LANG === 'de' ? 'de-DE' : LANG);
const CUR = CFG.currency || 'EUR', FX = CFG.fx || 1;
const NF = new Intl.NumberFormat(LOC, { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const CF = new Intl.NumberFormat(LOC, { style: 'currency', currency: CUR, maximumFractionDigits: 0 });
const SYM = CF.formatToParts(0).find((x) => x.type === 'currency')?.value || '€';
const nice = (v) => { const x = v * FX; const m = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)); return Math.round(x / m) * m; };
const fmt = (n) => NF.format(Math.round(n));
const eur = (n) => { const r = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(n) || 1)) - 2)); return CF.format(Math.round(n / r) * r); };
const eurExact = (n) => CF.format(Math.round(n));

// ------------------------------------------------------------------ Zustand
const S = {
  step: 'intro', profile: defaultProfile(FX), chat: [], queue: [], asked: new Set(), items: [], gain: null, hall: null,
  cad: new Map(),        // Maschinen-ID -> eigenes CAD-Modell (Object3D), nur im Browser
  first: true, mode: 'after',
};
window.ZP = S;          // zum Nachsehen in der Konsole
const STEP_IDS = ['profile', 'solution', 'room', 'gain', 'offer'];
const app = $('[data-app]');
const panel = $('[data-panel-inner]');

// ------------------------------------------------------------------ Start
init();
async function init() {
  document.documentElement.lang = LANG;
  $$('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  $$('[data-tp]').forEach((el) => { el.placeholder = t(el.dataset.tp); });
  document.title = `${t('ui.title')} | ZOLLER`;
  $('[data-home]').href = CFG.siteUrl;
  $('[data-showroom]').href = CFG.showroom;
  $('[data-hits]').dataset.empty = t('intro.live') + ' …';
  // Sprachen
  const sel = $('[data-lang]');
  sel.innerHTML = CFG.langs.map((l) => `<option value="${l}"${l === LANG ? ' selected' : ''}>${l.toUpperCase()}</option>`).join('');
  sel.addEventListener('change', () => { location.href = BASE + (CFG.locales[sel.value] ?? '') + location.search + location.hash; });
  // Schritte
  $('[data-steps]').innerHTML = STEP_IDS.map((s, i) => `<button type="button" data-go="${s}"><b>${i + 1}</b><span>${t('s' + (i + 1))}</span></button>`).join('');
  $('[data-steps]').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b && !b.disabled) go(b.dataset.go); });
  // Beispiele
  $('[data-examples]').innerHTML = [1, 2, 3, 4].map((i) => `<button type="button" data-ex="${i}">${esc(t('ex' + i + '.t').split(' · ')[0])}<small>${esc(t('ex' + i + '.t').split(' · ')[1] || '')}</small></button>`).join('');
  $('[data-examples]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ex]'); if (!b) return;
    const ta = $('[data-prompt-text]'); ta.value = t('ex' + b.dataset.ex); ta.dispatchEvent(new Event('input'));
    setTimeout(() => submitIntro(), 650);
  });
  const ta = $('[data-prompt-text]');
  let deb;
  ta.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => liveParse(ta.value), 140); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitIntro(); } });
  $('[data-prompt]').addEventListener('submit', (e) => { e.preventDefault(); submitIntro(); });
  $('[data-manual]').addEventListener('click', () => { startChat(); go('profile'); });
  // HUD
  $('[data-mode]').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) setMode(b.dataset.v); });
  $('[data-views]').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'); if (v) { S.hall?.stopTour(); S.hall?.view(v.dataset.view); }
    if (e.target.closest('[data-tour]')) toggleTour();
  });
  $('[data-ticker]').addEventListener('click', () => go('gain'));
  $('[data-names]')?.addEventListener('click', () => setNames(S.hall ? !S.hall.labelsOn : false));
  // 3D-Halle (lazy, damit die Seite sofort steht)
  const models = await fetch(BASE + 'data/models.json').then((r) => r.json()).catch(() => ({}));
  const aspects = await fetch(BASE + 'data/aspects.json').then((r) => r.json()).catch(() => ({}));
  try {
    const { Hall } = await import('./scene.js');
    const logo = await logoTexture();
    S.hall = new Hall($('[data-stage]'), {
      base: BASE, models, aspects, t, logo,
      onPick: onPick, onProgress: (k) => { $('[data-progress]').style.width = (k * 100) + '%'; if (k >= 1) setTimeout(() => $('[data-loader]').classList.add('is-done'), 300); },
      onTourEnd: () => tourLabel(false),
      onPlan: () => { if (S.step === 'room') prepareAR(); },
    });
    S.hall.setPlan({ devices: [], machines: [], software: [], lang: LANG }).then(() => {
      S.hall.view('overview'); $('[data-loader]').classList.add('is-done');
      setTimeout(() => { if (S.step === 'intro') S.hall.setAutoRotate(true); }, 1500);
    });
  } catch (err) {
    console.error(err);
    $('[data-loader]').innerHTML = '<span>WebGL nicht verfügbar – die Planung funktioniert trotzdem.</span>';
  }
  // geteilter Link?
  const h = location.hash.match(/^#p=([\w-]+)/);
  if (h) {
    try {
      const o = await decodeState(h[1]);
      S.profile = unpack(o, FX); S.profile.fx = FX; S.first = false;
      recompute(); startChat(true);
      if (/[#&]ar=1/.test(location.hash)) { go('room'); setTimeout(arHandoff, 600); } else go('solution');
    } catch (e) { console.warn('Link konnte nicht gelesen werden', e); }
  }
  render();
}

async function logoTexture() {
  const THREE = await import('three');
  const img = new Image(); img.src = BASE + 'assets/img/zoller-dark.svg';
  await img.decode().catch(() => {});
  const c = document.createElement('canvas'); c.width = 2048; c.height = 468;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 2048, 468);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  return tex;
}

// ------------------------------------------------------------------ Intro
function liveParse(text) {
  const r = parse(text);
  $('[data-hits]').innerHTML = hitChips(r).join('');
  // die Halle reagiert schon beim Tippen
  if (S.step === 'intro' && S.hall) {
    const p = defaultProfile(FX); apply(p, r, newMachine, true);
    const n = p.machines.reduce((a, m) => a + m.count, 0);
    S.preview = p; schedulePlan(p, []);
    if (n !== S.previewN) { S.previewN = n; S.hall.setAutoRotate(false); setTimeout(() => { S.hall.view(n ? 'hall' : 'overview'); setTimeout(() => S.step === 'intro' && S.hall.setAutoRotate(true), 1500); }, 250); }
  }
}
function hitChips(r) {
  const out = [];
  for (const g of r.machines) out.push(`<span class="chip chip--m">${g.count}× ${esc([g.brand, g.model].filter(Boolean).join(' ') || t('mts.' + g.type))}${g.control ? ' · ' + esc(CONTROLS[g.control]?.name.split(' ')[0] || '') : ''}</span>`);
  for (const h of r.hits) {
    if (h.kind === 'machine' || h.kind === 'control') continue;
    let s = '';
    if (['shifts', 'days', 'tools', 'rate', 'invest'].includes(h.kind)) s = t('hit.' + h.kind, { v: h.label });
    else if (['shrink', 'hsc', 'grind', 'series', 'cam'].includes(h.kind)) s = t(`hit.${h.kind}.${h.label ? 1 : 0}`);
    else if (h.kind === 'industry') s = t('ind.' + h.label);
    else if (h.kind === 'measure') s = t('meas.' + h.label);
    else if (h.kind === 'data') s = t('data.' + h.label);
    else if (h.kind === 'storage') s = t('stor.' + h.label);
    else if (h.kind === 'pain') s = t('pain.' + h.label);
    else if (h.kind === 'goal') s = t('goal.' + h.label);
    else if (h.kind === 'tier') s = t('tier.' + h.label);
    else if (h.kind === 'exclude' || h.kind === 'include') s = t('hit.' + h.kind, { v: t('prod.' + h.label) });
    else if (h.kind === 'network') s = t('hit.net.' + h.label);
    else if (h.kind === 'maxlen') s = t('hit.maxlen', { v: h.label });
    else if (h.kind === 'maxdia') s = t('hit.maxdia', { v: h.label });
    else if (['inserts', 'erp', 'gauges'].includes(h.kind)) s = t('hit.' + h.kind);
    if (s) out.push(`<span class="chip${h.kind === 'pain' ? '' : ' chip--y'}">${esc(s)}</span>`);
  }
  return out;
}
function submitIntro() {
  const text = $('[data-prompt-text]').value.trim();
  if (!text) { $('[data-prompt-text]').focus(); return; }
  startChat();
  say('you', esc(text));
  handleText(text);
  go('profile');
}

// ------------------------------------------------------------------ Assistent
function startChat(silent) {
  if (S.chat.length) return;
  S.chat.push({ who: 'bot', html: esc(t('a.hello')) });
  if (!silent && !S.profile.machines.length) S.queue = [];
}
function say(who, html, extra = {}) { S.chat.push({ who, html, ...extra }); if (S.step === 'profile') renderPanel(); }

function handleText(text) {
  const r = parse(text);
  const p = S.profile;
  if (isQuestion(text)) {
    // Angaben in der Frage übernehmen (aber »ohne …« / »mit …« sind hier Teil der Frage, kein Änderungswunsch)
    const info = { ...r, include: [], exclude: [], hits: r.hits.filter((h) => h.kind !== 'include' && h.kind !== 'exclude') };
    if (info.machines.length || Object.keys(info.patch).length) { apply(p, info, newMachine, S.first && !p.machines.length); S.first = false; recompute(); }
    const a = p.machines.length ? answer(text, qaCtx()) : null;
    if (a) { say('bot', a.html + qaChips(a.chips)); return; }
    if (!p.machines.length && !info.machines.length) { say('bot', esc(t('qa.first')), { replies: replyFor('machines') }); return; }
  }
  const before = p.machines.reduce((a, m) => a + m.count, 0);
  apply(p, r, newMachine, S.first && !p.machines.length);
  S.first = false;
  const chips = hitChips(r);
  if (!chips.length) {
    say('bot', esc(t('a.nothing')), { replies: replyFor('machines') });
    recompute(); return;
  }
  const n = p.machines.reduce((a, m) => a + m.count, 0);
  let html = `${esc(before ? t('a.updated') : t('a.got'))}<div class="msg__chips">${chips.join('')}</div>`;
  if (n && n !== before) html += `<p style="margin:.6rem 0 0">${esc(t('a.placed', { n }))}</p>`;
  say('bot', html);
  recompute();
  askNext(true);
}

function askNext(announce) {
  const q = missing(S.profile).filter((k) => !S.asked.has(k));
  if (!q.length || !S.profile.machines.length && S.asked.has('machines')) { finishChat(); return; }
  const k = q[0];
  S.asked.add(k);
  const rest = q.length;
  const lead = announce && rest > 1 ? `<p style="margin:0 0 .5rem;color:var(--ink3);font-size:.8rem">${esc(t('a.more', { n: Math.min(rest, 6) }))}</p>` : '';
  say('bot', `${lead}<span class="msg__q">${esc(t('q.' + k))}</span>`, { replies: replyFor(k), q: k });
}

function replyFor(k) {
  const opt = (label, fn, soft) => ({ label, fn, soft });
  const set = (field, v, label) => opt(label, () => { S.profile[field] = v; know(field); });
  const def = (field) => opt(t('chip.default'), () => know(field), true);
  switch (k) {
    case 'machines': return [opt(t('prof.add'), () => editMachine(null), true)];
    case 'shifts': return [1, 2, 3].map((v) => set('shifts', v, t('chip.shifts', { v }))).concat(def('shifts'));
    case 'measure': return ['machine', 'manual', 'old', 'zoller'].map((v) => set('measure', v, t('meas.' + v))).concat(def('measure'));
    case 'changes': return [5, 10, 20, 30].map((v) => set('changes', v, t('chip.changes', { v }))).concat(def('changes'));
    case 'data': return ['typed', 'paper', 'post'].map((v) => set('data', v, t('data.' + v))).concat(def('data'));
    case 'storage': return ['open', 'cabinets', 'tms'].map((v) => set('storage', v, t('stor.' + v))).concat(def('storage'));
    case 'shrink': return [set('shrink', true, t('chip.yes')), set('shrink', false, t('chip.no')), def('shrink')];
    case 'hsc': return [set('hsc', true, t('chip.yes')), set('hsc', false, t('chip.no')), def('hsc')];
    case 'rate': return [65, 85, 110, 140].map((v) => nice(v)).map((v) => set('rate', v, t('chip.rate', { v }))).concat(def('rate'));
    case 'network': return [set('network', 'yes', t('chip.net.yes')), set('network', 'no', t('chip.net.no')), def('network')];
    case 'toolsize': return [300, 450, 600, 800, 1200].map((v) => set('maxLen', v, t('chip.len', { v }))).concat(def('maxLen'));
  }
  return [];
}
function know(f) { if (!S.profile.known.includes(f)) S.profile.known.push(f); }

function onReply(mi, ri) {
  const m = S.chat[mi]; if (!m || !m.replies || m.answered) return;
  const r = m.replies[ri];
  m.answered = true;
  r.fn();
  if (m.q !== 'machines') say('you', esc(r.label));
  recompute();
  if (m.q && m.q !== 'machines') askNext(false);
  else renderPanel();
}

function finishChat() {
  if (S.done) { renderPanel(); return; }
  S.done = true;
  const g = S.gain;
  say('bot', `${esc(t('a.done', { items: S.items.reduce((a, i) => a + (PRODUCTS[i.id].virtual ? 0 : 1), 0), hours: fmt(g?.spindle || 0), eur: eur(g?.eur || 0) }))}
    <div class="btnrow" style="margin-top:.7rem"><button class="btn btn--yellow btn--sm" data-act="go:solution">${esc(t('a.cta.solution'))}</button><button class="btn btn--sm" data-act="go:gain">${esc(t('a.cta.gain'))}</button></div>`);
  say('bot', `<span class="msg__q">${esc(t('qa.ask'))}</span>` + qaChips(suggestions(S.items, t).map((q) => [q, 'ask:' + q])));
}
function qaCtx() { return { p: S.profile, items: S.items, gain: S.gain, t, esc, eur, fmt, tierName: (x) => t('tier.' + x) }; }
function qaChips(chips) {
  if (!chips || !chips.length) return '';
  return `<div class="replies qa-chips">${chips.map(([l, a]) => `<button type="button" data-qa="${esc(a)}">${esc(l)}</button>`).join('')}</div>`;
}
function onQA(a) {
  const [k, ...rest] = a.split(':'); const v = rest.join(':');
  if (k === 'go') go(v);
  else if (k === 'mail') mail();
  else if (k === 'ask') { say('you', esc(v)); handleText(v); }
  else if (k === 'showroom') window.open(showroomUrl(v), '_blank', 'noopener');
  else if (k === 'tier') { S.profile.tier = v; know('tier'); recompute(); say('bot', esc(t('qa.tierset', { tier: t('tier.' + v) }))); }
  else if (k === 'restore') { S.profile.exclude = S.profile.exclude.filter((x) => x !== v); recompute(); say('bot', esc(t('a.updated'))); }
  else if (k === 'include') { if (!S.profile.include.includes(v)) S.profile.include.push(v); S.profile.exclude = S.profile.exclude.filter((x) => x !== v); recompute(); say('bot', esc(t('qa.included', { name: t('prod.' + v) }))); }
}

// ------------------------------------------------------------------ Rechnen + Halle
function recompute() {
  const p = S.profile;
  S.items = recommend(p);
  S.gain = gains(p, S.items);
  schedulePlan(p, S.items);
  renderTicker();
  renderSteps();
  if (S.step === 'gain') renderGain();
}
let planTimer;
function schedulePlan(p, items) {
  clearTimeout(planTimer);
  planTimer = setTimeout(() => S.hall && S.hall.setPlan(planFor(p, items)), 60);
}
// so viele Geräte je Typ stehen höchstens im 3D-Raum (Beschriftung und Angebot nennen immer die geplante Menge)
const VISUAL_CAP = { keeper: 6, toolorganizer: 4, toolstation: 4, toolcart: 5, smile: 4, venturion: 4, venturion600: 4, venturion800: 4, hyperion: 4 };
function stepNo(items = S.items) {
  const present = STEPS.filter((st) => items.some((i) => i.step === st));
  return Object.fromEntries(present.map((st, i) => [st, i + 1]));
}
function planFor(p, items) {
  const devices = [], software = [];
  for (const it of items) {
    const pr = PRODUCTS[it.id];
    if (pr.soft) { software.push(it.id); continue; }
    if (pr.virtual || pr.perMachine) continue;
    const n = Math.min(it.qty, VISUAL_CAP[it.id] || 2);
    for (let i = 0; i < n; i++) devices.push({ key: it.id + '#' + i, pid: it.id });
  }
  const has = (id) => items.some((i) => i.id === id);
  const machines = [];
  let total = 0, order = 0;
  for (const m of p.machines) {
    const b = brandByName(m.brand);
    const z40 = has('zidcode40') && CONTROLS[m.control]?.dmi && S.profile.network !== 'no';
    const zid = z40 ? 'zidcode40' : (has('zidcode') ? 'zidcode' : (has('zidcode40') ? 'zidcode40' : null));
    for (let i = 0; i < m.count && total < 60; i++, total++) {
      machines.push({ key: m.id + '#' + i, group: m.id, order: order++, type: m.type, accent: b?.accent || NEUTRAL_ACCENT, brandId: b?.id || '', brand: b?.name || m.brand, model: m.model,
        controlName: CONTROLS[m.control]?.name || '', label: [m.brand, m.model].filter(Boolean).join(' '), zid, custom: S.cad.get(m.id) || null });
    }
  }
  return { devices, machines, software, lang: LANG, stepNo: stepNo(items), tools: stats(p).tools, qty: Object.fromEntries(items.map((i) => [i.id, i.qty])) };
}

function setMode(mode) {
  S.mode = mode;
  $$('[data-mode] button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === mode));
  S.hall?.setMode(mode);
  const cap = $('[data-caption]');
  if (mode === 'before') { cap.hidden = false; cap.innerHTML = `<b>${esc(t('room.before'))}</b>${esc(t('room.beforecap'))}`; }
  else { cap.hidden = false; cap.innerHTML = `<b>${esc(t('room.after'))}</b>${esc(t('room.aftercap'))}`; clearTimeout(S.capT); S.capT = setTimeout(() => { if (!S.touring) cap.hidden = true; }, 4200); }
}
// alle Rundgang-Knöpfe (HUD und Seitenleiste) zeigen denselben Zustand
function tourLabel(on) {
  $$('[data-tour] span, [data-act=tour]').forEach((el) => { el.textContent = t(on ? 'room.stop' : 'room.tour'); });
}
function toggleTour() {
  const h = S.hall; if (!h) return;
  if (h.tourTimer) { h.stopTour(); S.touring = false; $('[data-caption]').hidden = true; tourLabel(false); return; }
  if (S.mode !== 'after') setMode('after');
  S.touring = true;
  tourLabel(true);
  const cap = $('[data-caption]');
  h.tour((s) => {
    if (!s) { S.touring = false; cap.hidden = true; tourLabel(false); return; }
    cap.hidden = false;
    if (s.step) {
      const its = S.items.filter((i) => i.step === s.step && !PRODUCTS[i.id].soft);
      cap.innerHTML = `<b>${stepNo()[s.step]} · ${esc(t('step.' + s.step))}</b>${esc(t('stepd.' + s.step))} ${its.map((i) => esc(t('prod.' + i.id))).join(' · ')}`;
    } else if (s.zid) {
      const z40 = S.items.some((i) => i.id === 'zidcode40');
      cap.innerHTML = `<b>${stepNo().identify || ''} · ${esc(t('step.identify'))}</b>${esc(t(z40 ? 'tour.zid40' : 'tour.zid'))}`;
    } else if (s.hall) {
      cap.innerHTML = `<b>${esc(t('room.v.hall'))}</b>${esc(t('tour.hall', { n: S.profile.machines.reduce((a, m) => a + m.count, 0) }))}`;
    } else if (s.soft) {
      cap.innerHTML = `<b>${stepNo().software || ''} · ${esc(t('step.software'))}</b>${esc(t('tour.soft'))} ${S.items.filter((i) => PRODUCTS[i.id].soft).map((i) => esc(t('prod.' + i.id))).join(' · ')}`;
    } else cap.innerHTML = `<b>ZOLLER</b>${esc(t('tour.done'))}`;
  });
}

function onPick(hit) {
  if (hit.kind === 'zid') {
    const i = S.hall.zids.findIndex((m) => m.userData.info.key === hit.machine); S.hall.focusZid(Math.max(0, i), true);
    const cap = $('[data-caption]'); cap.hidden = false;
    cap.innerHTML = `<b>${esc(t('prod.' + hit.pid))}</b>${esc(t(hit.pid === 'zidcode40' ? 'tour.zid40' : 'tour.zid'))}`;
    clearTimeout(S.capT); S.capT = setTimeout(() => { if (!S.touring) cap.hidden = true; }, 7000);
    return;
  }
  if (hit.kind === 'machine') { S.hall.focusMachine(hit.key); const m = S.profile.machines.find((x) => x.id === hit.group); if (m && S.step === 'profile') editMachine(m); return; }
  if (hit.kind === 'station') { S.hall.focusStation(hit.step); if (S.step !== 'solution') go('solution', true); setTimeout(() => document.getElementById('st-' + hit.step)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); return; }
  if (hit.kind === 'device') {
    const pid = hit.pid; const st = PRODUCTS[pid]?.step;
    if (S.step !== 'solution') go('solution', true);
    setTimeout(() => { const el = document.getElementById('pc-' + pid) || document.getElementById('st-' + st); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.animate([{ boxShadow: '0 0 0 3px #f0e600' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1600 }); }, 80);
  }
}

// ------------------------------------------------------------------ Navigation
function go(step, keepCam) {
  if (step !== 'profile' && !S.profile.machines.length) step = 'profile';
  S.hall?.setAutoRotate(false);
  S.step = step;
  app.dataset.step = step;
  render();
  if (!S.hall || keepCam) return;
  if (step === 'room') { S.hall.view('toolroom'); prepareAR(); }
  else if (step === 'solution') S.hall.view('toolroom');
  else if (step === 'profile') S.hall.view(S.profile.machines.length ? 'overview' : 'overview');
}
function render() {
  S.hall?.setShift(S.step === 'intro' && innerWidth > 1100 ? .27 : 0);
  renderSteps();
  renderPanel();
  renderTicker();
  const gainEl = $('[data-gain]');
  if (S.step === 'gain') { gainEl.hidden = false; renderGain(); } else gainEl.hidden = true;
  $('[data-hud]').hidden = S.step === 'intro';
}
function renderSteps() {
  const has = S.profile.machines.length > 0;
  $$('[data-steps] button').forEach((b, i) => {
    b.classList.toggle('is-on', b.dataset.go === S.step);
    b.disabled = !has && b.dataset.go !== 'profile';
    b.classList.toggle('is-done', has && STEP_IDS.indexOf(S.step) > i);
  });
}
function renderTicker() {
  const tk = $('[data-ticker]');
  const g = S.gain;
  if (!g || !S.profile.machines.length || S.step === 'intro' || S.step === 'gain') { tk.hidden = true; return; }
  tk.hidden = false;
  tk.innerHTML = `<span><strong>+${fmt(g.spindle)}</strong>${esc(t('gain.spindle'))}</span><span><strong>${eur(g.eur)}</strong>${esc(t('gain.eur'))}</span>`;
  tk.style.cursor = 'pointer';
}

function renderPanel() {
  const fn = { intro: () => '', profile: panelProfile, solution: panelSolution, room: panelRoom, gain: panelGain, offer: panelOffer }[S.step] || (() => '');
  const st = panel.scrollTop;
  panel.innerHTML = fn();
  const foot = $('.panel__foot');
  if (foot) foot.remove();
  if (S.step === 'profile') {
    const f = document.createElement('div'); f.className = 'panel__foot';
    f.innerHTML = `<form class="composer" data-composer><textarea rows="1" placeholder="${esc(t('composer.ph'))}"></textarea><button type="submit" aria-label="${esc(t('composer.send'))}"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>`;
    $('[data-panel]').appendChild(f);
    const form = $('[data-composer]'), ta = $('textarea', form);
    form.addEventListener('submit', (e) => { e.preventDefault(); const v = ta.value.trim(); if (!v) return; ta.value = ''; say('you', esc(v)); handleText(v); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(128, ta.scrollHeight) + 'px'; });
    panel.scrollTop = panel.scrollHeight;
  } else panel.scrollTop = S.lastStep === S.step ? st : 0;
  S.lastStep = S.step;
  bindPanel();
  if (S.step === 'room') updateARButtons();
}

// ------------------------------------------------------------------ Panel: Fertigung
function panelProfile() {
  const p = S.profile;
  const chat = S.chat.map((m, i) => `<div class="msg msg--${m.who}">${m.html}${m.replies && !m.answered ? `<div class="replies">${m.replies.map((r, j) => `<button type="button" class="${r.soft ? 'is-soft' : ''}" data-reply="${i}:${j}">${esc(r.label)}</button>`).join('')}</div>` : ''}${m.replies && !m.answered && m.q && m.q !== 'machines' ? `<div style="margin-top:.5rem"><button class="link" style="font-size:.76rem;color:var(--ink3)" data-act="skip">${esc(t('a.skip'))}</button></div>` : ''}</div>`).join('');
  const n = p.machines.reduce((a, m) => a + m.count, 0);
  const ms = p.machines.map((m) => {
    const b = brandByName(m.brand);
    const c = CONTROLS[m.control];
    return `<button type="button" class="mrow" data-machine="${m.id}"><span class="mrow__n"><i style="background:${b?.accent || NEUTRAL_ACCENT}"></i>${m.count}×</span>
      <span class="mrow__t"><b>${esc([m.brand, m.model].filter(Boolean).join(' ') || t('mt.' + m.type))}</b><small>${esc(t('mt.' + m.type))}${c?.name ? ' · ' + esc(c.name) : ''}${m.holder ? ' · ' + esc(m.holder) : ''}</small></span>
      <span>${c?.dmi ? `<span class="badge badge--g">${t('prof.dmi')}</span>` : ''}${S.cad.has(m.id) ? ' <span class="badge">CAD</span>' : ''}</span></button>`;
  }).join('');
  const k = new Set(p.known);
  const a = (f) => (k.has(f) ? '' : `<span class="badge">${esc(t('prof.assumed'))}</span>`);
  const yn = (v) => (v ? t('chip.yes') : t('chip.no'));
  if (!p.machines.length) return `<div class="chat">${chat}</div><p style="margin-top:1rem"><button class="btn btn--ghost btn--sm" data-act="addm">+ ${esc(t('prof.add'))}</button></p>`;
  return `<details class="pcard-sum" ${S.sumOpen ? 'open' : ''} data-sum><summary><span><b>${esc(t('prof.h'))}</b><small>${esc(t('prof.total', { n }))} · ${esc(t('chip.shifts', { v: p.shifts }))} · ${eur(S.gain?.eur || 0)}</small></span><i>${esc(t('ui.edit'))}</i></summary>
  <div class="p-sec" style="margin-top:.8rem"><h3>${esc(t('prof.machines'))} <span>${esc(t('prof.total', { n }))}</span></h3><div class="mlist">${ms}</div>
    <p style="margin:.6rem 0 0"><button class="btn btn--ghost btn--sm" data-act="addm">+ ${esc(t('prof.add'))}</button></p></div>
  <div class="p-sec"><h3>${esc(t('prof.production'))} <button class="link" data-act="editprod">${esc(t('ui.edit'))}</button></h3><dl class="kv">
    <dt>${esc(t('f.shifts'))}</dt><dd>${p.shifts}${a('shifts')}</dd>
    <dt>${esc(t('f.changes'))}</dt><dd>${p.changes}${a('changes')}</dd>
    <dt>${esc(t('f.tools'))}</dt><dd>${fmt(stats(p).tools)}${a('tools')}</dd>
    <dt>${esc(t('f.rate'))}</dt><dd>${eurExact(p.rate)}${a('rate')}</dd>
    <dt>${esc(t('f.industry'))}</dt><dd>${esc(t('ind.' + (p.industry || '')))}</dd></dl></div>
  <div class="p-sec"><h3>${esc(t('prof.today'))} <button class="link" data-act="editprod">${esc(t('ui.edit'))}</button></h3><dl class="kv">
    <dt>${esc(t('f.measure'))}</dt><dd>${esc(t('meas.' + (p.measure || 'machine')))}${a('measure')}</dd>
    <dt>${esc(t('f.data'))}</dt><dd>${esc(t('data.' + (p.data || 'typed')))}${a('data')}</dd>
    <dt>${esc(t('f.storage'))}</dt><dd>${esc(t('stor.' + (p.storage || 'open')))}${a('storage')}</dd>
    <dt>${esc(t('f.shrink'))}</dt><dd>${yn(p.shrink)}${a('shrink')}</dd>
    <dt>${esc(t('f.hsc'))}</dt><dd>${yn(p.hsc)}${a('hsc')}</dd></dl></div></details>
  <div class="chat" style="margin-top:1.2rem">${chat}</div>
  ${S.done ? '' : `<p style="margin-top:1rem"><button class="btn btn--ghost btn--sm" data-act="go:solution">${esc(t('a.cta.solution'))} →</button></p>`}`;
}

// ------------------------------------------------------------------ Panel: Lösung
function img(pid) {
  const pr = PRODUCTS[pid];
  if (pr.cad && CFG.renders !== false) return { src: `${BASE}img/render/${pr.cad}.webp`, render: true };
  return { src: `${BASE}img/p/${pr.img}.webp`, render: false };
}
function pname(it) { return it.model ? '»' + it.model + '«' : t('prod.' + it.id); }
function prodUrl(pid) { const pr = PRODUCTS[pid]; return CFG.links[pid] || (LANG === 'de' ? SITE + pr.path + '/' : null); }
function showroomUrl(pid) { return CFG.showroom + '#produkt/' + PRODUCTS[pid].showroom; }
function factUrl(f) { return CFG.factLinks[f] || (LANG === 'de' ? SITE + FACTS[f].path + '/' : null); }

function panelSolution() {
  const p = S.profile, items = S.items;
  const dev = items.filter((i) => !PRODUCTS[i.id].soft && !PRODUCTS[i.id].virtual).reduce((a, i) => a + i.qty, 0);
  const soft = items.filter((i) => PRODUCTS[i.id].soft).length;
  const groups = STEPS.map((st) => ({ st, its: items.filter((i) => i.step === st) })).filter((g) => g.its.length);
  const card = (it) => {
    const im = img(it.id); const pr = PRODUCTS[it.id];
    const f = it.facts[0];
    const fu = f && factUrl(f);
    const pu = prodUrl(it.id);
    return `<article class="pcard${it.have ? ' is-have' : ''}" id="pc-${it.id}">
      <div class="pcard__img${im.render ? ' is-render' : ''}" style="background-image:url('${im.src}')"></div>
      <div class="pcard__t"><h4>${esc(pname(it))}${it.qty > 1 || pr.perMachine || pr.virtual ? `<span class="qty">${fmt(it.qty)}×</span>` : ''}${it.have ? `<span class="badge badge--g">${esc(t('sol.have'))}</span>` : ''}</h4>
        <p class="pcard__role">${esc(t('role.' + it.id))}${pr.perMachine ? ' · ' + esc(t('sol.permachine')) : ''}</p>
        ${it.spec ? `<p class="pcard__spec">${it.spec.L ? `<span>L ≤ ${fmt(it.spec.L)} mm</span>` : ''}${it.spec.D ? `<span>Ø ≤ ${fmt(it.spec.D)} mm</span>` : ''}</p>` : ''}
        <div class="pcard__why">${it.why.map(([k, v]) => `<p>${esc(t(k, v))}</p>`).join('')}</div>
        ${f ? `<div class="pcard__fact">${esc(t('fact.' + f))} ${fu ? `<a href="${fu}" target="_blank" rel="noopener">${esc(t('src.' + f))}</a>` : `<span>${esc(t('src.' + f))}</span>`}</div>` : ''}
        <div class="pcard__links">${pu ? `<a href="${pu}" target="_blank" rel="noopener">${esc(t('sol.page'))}</a>` : ''}<a href="${showroomUrl(it.id)}" target="_blank" rel="noopener">${esc(t('sol.showroom'))}</a>${!pr.soft && !pr.virtual ? `<button type="button" data-fly="${pr.perMachine ? 'hall' : it.step}">${esc(t('sol.fly'))}</button>` : ''}</div>
      </div>
      <button class="pcard__x" type="button" data-remove="${it.id}" aria-label="${esc(t('sol.remove'))}" title="${esc(t('sol.remove'))}"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </article>`;
  };
  return `<h2 class="p-h">${esc(t('sol.h'))}</h2><p class="p-lead">${esc(t('sol.lead'))}</p>
  <div class="tiers" role="group">${TIERS.map((x) => `<button type="button" data-tier="${x}" class="${p.tier === x ? 'is-on' : ''}">${esc(t('tier.' + x))}</button>`).join('')}</div>
  <p class="tierd">${esc(t('tierd.' + p.tier))}</p>
  <div class="solsum"><span>${esc(t('sol.count', { d: dev, s: soft }))}</span><strong>${eur(S.gain.eur)} / ${LANG === 'de' ? 'Jahr' : 'year'}</strong></div>
  ${groups.map((g) => `<section class="stepgrp" id="st-${g.st}"><div class="stepgrp__h"><b>${stepNo()[g.st]}</b><span>${esc(t('step.' + g.st))}<small>${esc(t('stepd.' + g.st))}</small></span></div>${g.its.map(card).join('')}</section>`).join('')}
  ${p.exclude.length ? `<div class="removed">${esc(t('sol.removed'))} ${p.exclude.map((x) => `<button type="button" data-restore="${x}">${esc(t('prod.' + x))} ↺</button>`).join('')}</div>` : ''}
  <p style="margin-top:1.4rem"><button class="btn btn--yellow btn--block" data-act="go:room">${esc(t('s3'))} →</button></p>`;
}

// ------------------------------------------------------------------ Panel: Werkzeugraum
function panelRoom() {
  const b = S.hall?.bounds;
  const st = b ? b.stations : [];
  const area = b ? (b.tool.x1 - b.tool.x0) * (b.tool.z1 - b.tool.z0) : 0;
  const hallA = b ? (b.hall.x1 - b.hall.x0) * (b.hall.z1 - b.hall.z0) : 0;
  return `<h2 class="p-h">${esc(t('room.h'))}</h2><p class="p-lead">${esc(t('room.lead'))}</p>
  <div class="facts3"><div><b>${fmt(area)} ${t('unit.m2')}</b><small>${esc(t('room.area'))}</small></div><div><b>${fmt(hallA)} ${t('unit.m2')}</b><small>${esc(t('room.hall'))}</small></div><div><b>${S.profile.machines.reduce((a, m) => a + m.count, 0)}</b><small>${esc(t('room.v.hall'))}</small></div></div>
  <div class="p-sec"><h3>${esc(t('room.stations'))}</h3><div class="stlist">${st.map((s) => `<button type="button" data-fly="${s.step}"><b>${stepNo()[s.step]}</b><span>${esc(t('step.' + s.step))}<small>${[...new Set(s.objs.map((o) => t('prod.' + o.userData.pid)))].join(' · ')}</small></span><span>→</span></button>`).join('')}
    ${S.items.some((i) => PRODUCTS[i.id].perMachine) ? `<button type="button" data-fly="zid"><b>${stepNo().identify}</b><span>${esc(t('step.identify'))}<small>${S.items.filter((i) => PRODUCTS[i.id].perMachine).map((i) => t('prod.' + i.id)).join(' · ')}</small></span><span>→</span></button>` : ''}</div></div>
  <div class="p-sec"><h3>${esc(t('room.flow'))}</h3><div class="toggles">
    <div class="toggle"><span>${esc(t('room.flow'))}</span><button class="switch" role="switch" aria-checked="${S.hall?.flowOn !== false}" data-toggle="flow"></button></div>
    <div class="toggle"><span>${esc(t('room.labels'))}</span><button class="switch" role="switch" aria-checked="${S.hall?.labelsOn !== false}" data-toggle="labels"></button></div></div>
    <p style="margin-top:.9rem" class="btnrow"><button class="btn btn--sm" data-act="tour">${esc(t(S.touring ? 'room.stop' : 'room.tour'))}</button><button class="btn btn--ghost btn--sm" data-act="mode:${S.mode === 'after' ? 'before' : 'after'}">${esc(t(S.mode === 'after' ? 'room.before' : 'room.after'))}</button></p></div>
  <div class="p-sec"><h3>${esc(t('ar.h'))}</h3>${arBlock()}</div>
  <div class="p-sec"><h3>${esc(t('room.export'))}</h3><div class="btnrow">
    <button class="btn btn--ghost btn--sm" data-act="png">${esc(t('room.png'))}</button><button class="btn btn--ghost btn--sm" data-act="glb">${esc(t('room.glb'))}</button></div></div>
  <p style="margin-top:1.4rem"><button class="btn btn--yellow btn--block" data-act="go:gain">${esc(t('s4'))} →</button></p>`;
}

// ------------------------------------------------------------------ Panel: Gewinn (Annahmen)
function panelGain() {
  const p = S.profile;
  const num = (f, step = 1) => `<label class="field">${esc(t('f.' + f))}<input type="number" inputmode="decimal" min="0" step="${step}" value="${p[f]}" data-num="${f}"></label>`;
  return `<h2 class="p-h">${esc(t('gain.assumptions'))}</h2><p class="p-lead">${esc(t('gain.moded'))}</p>
  <div class="tiers" style="grid-template-columns:1fr 1fr" role="group">${['zoller', 'cons'].map((m) => `<button type="button" data-calc="${m}" class="${p.mode === m ? 'is-on' : ''}">${esc(t('gain.mode.' + m))}</button>`).join('')}</div>
  <div class="p-sec"><label class="field">${esc(t('gain.invest'))}<input type="number" inputmode="numeric" min="0" step="1000" placeholder="${esc(t('gain.investph'))}" value="${p.invest || ''}" data-num="invest"></label></div>
  <div class="p-sec fgrid">${num('shifts')}${num('changes')}${num('days')}${num('hours')}${num('rate')}${num('staff')}${`<label class="field wide">${esc(t('f.tools'))}<input type="number" min="0" step="10" value="${p.tools || stats(p).tools}" data-num="tools"></label>`}</div>
  <div class="p-sec"><h3>${esc(t('s2'))}</h3><div class="tiers" role="group">${TIERS.map((x) => `<button type="button" data-tier="${x}" class="${p.tier === x ? 'is-on' : ''}">${esc(t('tier.' + x))}</button>`).join('')}</div></div>
  <p style="margin-top:1.4rem"><button class="btn btn--yellow btn--block" data-act="go:offer">${esc(t('s5'))} →</button></p>`;
}

// ------------------------------------------------------------------ Gewinn-Dashboard
function renderGain() {
  const g = S.gain, p = S.profile, s = g.stats;
  const el = $('[data-gain]');
  const max = Math.max(...g.levers.map((l) => l.eur), 1);
  const lever = (l) => {
    const f = { ...l.f };
    if (f.spend !== undefined) { f.spend = eur(f.spend); f.value = eur(f.value); }
    if (f.entries !== undefined) f.entries = fmt(f.entries);
    if (f.before !== undefined) { f.before = Math.round(f.before); f.after = Math.round(f.after); }
    const src = l.facts.map((x) => { const u = factUrl(x); return u ? `<a href="${u}" target="_blank" rel="noopener">${esc(t('src.' + x))}</a>` : esc(t('src.' + x)); });
    return `<div class="lever"><div class="lever__n">${esc(t('lever.' + l.id))}<small>${esc(t('leverd.' + l.id, f))}</small></div>
      <div class="lever__bar"><i data-w="${(l.eur / max) * 100}"></i></div>
      <div class="lever__v">${eur(l.eur)}<small>${l.spindle ? '+' + fmt(l.spindle) + ' ' + t('unit.h') : l.staffH ? fmt(l.staffH) + ' ' + t('unit.h') : ''}</small></div>
      <div class="lever__tip"><b>${esc(t('gain.formula'))}:</b> ${esc(t('leverf.' + l.id, f))}<br>${src.join(' · ')}</div></div>`;
  };
  const dayMin = p.hours * 60;
  const ch = p.changes;
  const measB = (p.measure === 'zoller' ? 1.52 : 4.52) * ch, entB = (p.data === 'post' ? 0 : .75) * ch;
  const pres = g.levers.find((l) => l.id === 'presetting'), dt = g.levers.find((l) => l.id === 'datatransfer');
  const measA = Math.max(0, measB - (pres ? pres.f.min * ch : 0)), entA = Math.max(0, entB - (dt ? dt.f.sec / 60 * ch : 0));
  const bar = (m, e) => `<div class="day__bar"><i data-k="cut" style="flex-grow:${dayMin - m - e}"></i><i data-k="setup" style="flex-grow:${m}" title="${esc(t('gain.setupblk'))}: ${fmt(m)} min"></i>${e > 0 ? `<i data-k="entry" style="flex-grow:${e}" title="${esc(t('gain.entry'))}: ${fmt(e)} min"></i>` : ''}</div>`;
  const usedFacts = [...new Set([...g.levers.flatMap((l) => l.facts), ...S.items.flatMap((i) => i.facts)])];
  const has = (id) => S.items.some((i) => i.id === id);
  const qual = [];
  const dec = (x) => (LANG === 'de' ? x : x.replace(',', '.'));
  if (has('zidcode') || has('zidcode40')) qual.push(['0', t('q2.typos'), t('fact.zid45')]);
  if (has('redomatic')) qual.push(['< 10 µm', t('q2.length'), t('fact.redo10')]);
  if (has('toolbalancer')) qual.push([dec('< 0,4 gmm'), t('q2.balance'), t('fact.tb04')]);
  if (has('idchip') || has('powershrink') || has('redomatic')) qual.push(['< 3 µm', t('q2.runout'), t('fact.runout3')]);
  if (has('robobox')) qual.push([dec('2,3'), t('q2.robobox'), t('fact.robobox')]);
  qual.push([dec('×1,5'), t('q2.life'), t('fact.life15')]);
  const guarantee = s.n && p.shifts ? g.perMachineShift : 0;   // in Landeswährung
  el.innerHTML = `<div class="gain__inner">
  <p class="kicker">${esc(t('gain.kicker'))}</p><h2>${esc(t('gain.h'))}</h2>
  <div class="hero4">
    <div><div><div class="big" data-count="${g.eur}" data-fmt="eur">${eur(g.eur)}</div><p>${esc(t('gain.eur'))}</p></div>
      <div class="sub">${esc(t('gain.calc15k', { v: eur(guarantee) + ' ' + t('gain.permachine') }))}</div></div>
    <div><div class="mid" data-count="${g.spindle}">+${fmt(g.spindle)}</div><p>${esc(t('gain.spindle'))}</p></div>
    <div><div class="mid">${NF1.format(g.machinesEq)}</div><p>${esc(t('gain.machines'))}</p></div>
    <div><div class="mid">${NF1.format(g.setupBefore)} → ${NF1.format(g.setupAfter)} <span style="font-size:.5em">min</span></div><p>${esc(t('gain.setup'))}</p></div>
    <div>${g.payback ? `<div class="mid">${esc(t('gain.months', { v: NF1.format(g.payback) }))}</div><p>${esc(t('gain.payback'))}</p>` : `<div class="mid">${eurExact(g.eur / p.days)}</div><p>${esc(t('gain.wait'))}</p>`}</div>
  </div>
  <div class="gcard"><h3>${esc(t('gain.levers'))}</h3><p>${esc(t('gain.moded'))}</p>${g.levers.map(lever).join('')}
    <details class="more"><summary>${esc(t('gain.table'))}</summary><table class="gtable"><tr><th>${esc(t('gain.levers'))}</th><th>h</th><th>€</th></tr>${g.levers.map((l) => `<tr><td>${esc(t('lever.' + l.id))}</td><td>${fmt(l.spindle || l.staffH)}</td><td>${eurExact(l.eur)}</td></tr>`).join('')}<tr><th>Σ</th><th>${fmt(g.spindle + g.staffH)}</th><th>${eurExact(g.eur)}</th></tr></table></details></div>
  <div class="g2">
    <div class="gcard"><h3>${esc(t('gain.day'))}</h3><p>${esc(t('gain.daynote', { changes: ch, before: fmt(measB + entB), after: fmt(measA + entA), gain: fmt(measB + entB - measA - entA) }))}</p>
      <div class="day"><div class="day__row"><span>${esc(t('gain.before'))}</span>${bar(measB, entB)}</div><div class="day__row"><span>${esc(t('gain.after'))}</span>${bar(measA, entA)}</div>
      <div class="day__legend"><span style="--c:rgba(255,255,255,.9)">${esc(t('gain.cutting'))}</span><span style="--c:#ff6b4a">${esc(t('gain.setupblk'))}</span><span style="--c:#ffb000">${esc(t('gain.entry'))}</span></div></div></div>
    <div class="gcard"><h3>${esc(t('gain.cum'))}</h3><p>${esc(t('gain.cumd'))}${p.invest ? ' · ' + esc(t('gain.investline')) + ': ' + eurExact(p.invest) : ''}</p>${cumChart(g.eur, p.invest)}</div>
  </div>
  <div class="gcard"><h3>${esc(t('gain.quality'))}</h3><div class="qual">${qual.slice(0, 6).map(([b, h, x]) => `<div><b>${esc(b)}</b><strong>${esc(h)}</strong>${esc(x)}</div>`).join('')}</div>
    <div class="qual" style="margin-top:.75rem"><div><b>${fmt(g.entries)}</b>${esc(t('gain.entries'))}</div><div><b>${fmt(g.staffH)}</b>${esc(t('gain.staff'))}</div><div><b>55 % / 29 %</b>${esc(t('fact.top55'))}</div></div></div>
  <ol class="src">${usedFacts.map((f) => { const u = factUrl(f); return `<li>${esc(t('fact.' + f))} – ${u ? `<a href="${u}" target="_blank" rel="noopener">${esc(t('src.' + f))}</a>` : esc(t('src.' + f))}</li>`; }).join('')}</ol>
  </div>`;
  requestAnimationFrame(() => { $$('.lever__bar i', el).forEach((i) => { i.style.width = i.dataset.w + '%'; }); countUp(el); });
}

function countUp(el) {
  $$('[data-count]', el).forEach((n) => {
    const v = +n.dataset.count, isEur = n.dataset.fmt === 'eur', t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 1100), e = 1 - Math.pow(1 - k, 3); n.textContent = isEur ? eur(v * e) : '+' + fmt(v * e); if (k < 1) requestAnimationFrame(step); };
    step();
  });
}

function cumChart(perYear, invest) {
  const W = 520, H = 230, L = 64, B = 30, T = 12, R = 14;
  const years = 5;
  const maxV = Math.max(perYear * years, invest || 0) * 1.08 || 1;
  const x = (i) => L + (W - L - R) * (i / years), y = (v) => T + (H - T - B) * (1 - v / maxV);
  const pts = Array.from({ length: years * 12 + 1 }, (_, m) => [x(m / 12), y(perYear * m / 12)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${x(years)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const ticks = [0, .25, .5, .75, 1].map((k) => maxV * k / 1.08);
  let inv = '';
  if (invest) {
    const yy = y(invest);
    const m = invest / (perYear / 12);
    inv = `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#ff6b4a" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - R}" y="${yy - 6}" text-anchor="end" class="lbl" style="fill:#ff6b4a">${esc(t('gain.investline'))}</text>`;
    if (m <= years * 12) inv += `<circle cx="${x(m / 12)}" cy="${yy}" r="5" fill="#f0e600" stroke="#000" stroke-width="2"/><text x="${x(m / 12) + 8}" y="${yy + 16}" class="lbl">${esc(t('gain.months', { v: NF1.format(m) }))}</text>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('gain.cum'))}">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.08)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${eur(v)}</text>`).join('')}
    ${Array.from({ length: years }, (_, i) => `<text x="${x(i + 1)}" y="${H - 8}" text-anchor="middle">${esc(t('gain.year', { v: i + 1 }))}</text>`).join('')}
    <path d="${area}" fill="rgba(240,230,0,.14)"/><path d="${line}" fill="none" stroke="#f0e600" stroke-width="2.5"/>
    ${Array.from({ length: years }, (_, i) => `<circle cx="${x(i + 1)}" cy="${y(perYear * (i + 1))}" r="4" fill="#f0e600"><title>${esc(t('gain.year', { v: i + 1 }))}: ${eurExact(perYear * (i + 1))}</title></circle>`).join('')}
    <text x="${x(years) - 4}" y="${y(perYear * years) - 10}" text-anchor="end" class="lbl">${eur(perYear * years)}</text>
    ${inv}</svg>`;
}

// ------------------------------------------------------------------ Panel: Angebot
function panelOffer() {
  const p = S.profile, g = S.gain;
  const n = p.machines.reduce((a, m) => a + m.count, 0);
  return `<h2 class="p-h">${esc(t('offer.h'))}</h2><p class="p-lead">${esc(t('offer.lead'))}</p>
  <div class="facts3"><div><b>${n}</b><small>${esc(t('room.v.hall'))}</small></div><div><b>${S.items.length}</b><small>ZOLLER</small></div><div><b>${eur(g.eur)}</b><small>${esc(t('gain.eur'))}</small></div></div>
  <div class="p-sec"><label class="field">${esc(t('offer.company'))}<input type="text" value="${esc(p.company)}" data-text="company" autocomplete="organization"></label></div>
  <div class="p-sec" style="display:grid;gap:.5rem">
    <button class="btn btn--yellow btn--block" data-act="mail">${esc(t('offer.mail'))}</button>
    <button class="btn btn--block" data-act="pdf">${esc(t('offer.pdf'))}</button>
    <button class="btn btn--ghost btn--block" data-act="share">${esc(t('offer.share'))}</button>
    <a class="btn btn--ghost btn--block" href="${CFG.expert}" target="_blank" rel="noopener">${esc(t('offer.expert'))}</a>
    <a class="btn btn--ghost btn--block" href="${CFG.showroom}" target="_blank" rel="noopener">${esc(t('offer.showroom'))}</a></div>
  <p class="note">${esc(t('offer.note'))}</p>`;
}

// ------------------------------------------------------------------ Ereignisse im Panel
function bindPanel() {
  const root = $('[data-panel]');
  root.onclick = async (e) => {
    const qa = e.target.closest('[data-qa]');
    if (qa) { onQA(qa.dataset.qa); return; }
    const arA = e.target.closest('[data-ar]');
    if (arA && !arA.getAttribute('rel')) { e.preventDefault(); toast(t('ar.wait')); return; }
    if (arA) return;
    const r = e.target.closest('[data-reply]');
    if (r) { const [mi, ri] = r.dataset.reply.split(':').map(Number); onReply(mi, ri); return; }
    const sum = e.target.closest('[data-sum] > summary');
    if (sum) { setTimeout(() => { S.sumOpen = sum.parentElement.open; }, 0); return; }
    const m = e.target.closest('[data-machine]');
    if (m) { const mm = S.profile.machines.find((x) => x.id === m.dataset.machine); editMachine(mm); S.hall?.focusMachine(mm.id + '#0'); return; }
    const tier = e.target.closest('[data-tier]');
    if (tier) { S.profile.tier = tier.dataset.tier; know('tier'); recompute(); renderPanel(); return; }
    const calc = e.target.closest('[data-calc]');
    if (calc) { S.profile.mode = calc.dataset.calc; recompute(); renderPanel(); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) { const id = rm.dataset.remove; S.profile.exclude.push(id); S.profile.include = S.profile.include.filter((x) => x !== id); recompute(); renderPanel(); return; }
    const rs = e.target.closest('[data-restore]');
    if (rs) { const id = rs.dataset.restore; S.profile.exclude = S.profile.exclude.filter((x) => x !== id); recompute(); renderPanel(); return; }
    const fly = e.target.closest('[data-fly]');
    if (fly) { const v = fly.dataset.fly; if (v === 'hall') S.hall?.view('hall'); else if (v === 'zid') S.hall?.focusZid(0, true); else S.hall?.focusStation(v); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const on = tg.getAttribute('aria-checked') !== 'true'; tg.setAttribute('aria-checked', on); if (tg.dataset.toggle === 'flow') S.hall?.setFlow(on); else setNames(on); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act.startsWith('go:')) go(act.slice(3));
    else if (act.startsWith('mode:')) { setMode(act.slice(5)); renderPanel(); }
    else if (act === 'skip') { const last = S.chat[S.chat.length - 1]; if (last) last.answered = true; S.asked = new Set([...S.asked, ...missing(S.profile)]); finishChat(); }
    else if (act === 'addm') editMachine(null);
    else if (act === 'editprod') editProduction();
    else if (act === 'tour') toggleTour();
    else if (act === 'png') { const url = S.hall.snapshot(2400, 1350); download(url, 'ZOLLER-Werkzeugraum.jpg'); }
    else if (act === 'glb') { toast(t('room.exporting')); const b = await S.hall.exportGLB(); download(URL.createObjectURL(b), 'ZOLLER-Werkzeugraum.glb'); }
    else if (act === 'qr') openQR();
    else if (act === 'xr') startXR();
    else if (act === 'share') { const u = await shareUrl(); try { await navigator.clipboard.writeText(u); toast(t('offer.copied')); } catch { prompt('', u); } }
    else if (act === 'mail') mail();
    else if (act === 'pdf') report();
  };
  root.oninput = (e) => {
    const n = e.target.closest('[data-num]');
    if (n) { const v = parseFloat(n.value); if (!isNaN(v)) { S.profile[n.dataset.num] = v; know(n.dataset.num); recompute(); } return; }
    const tx = e.target.closest('[data-text]');
    if (tx) S.profile[tx.dataset.text] = tx.value;
  };
}

// ------------------------------------------------------------------ Dialoge: Maschine + Produktion
const sheet = $('[data-sheet]'), sheetIn = $('[data-sheet-inner]');
function openSheet(html, onBind) {
  sheetIn.innerHTML = html;
  sheet.showModal();
  sheetIn.querySelector('[data-close]')?.addEventListener('click', () => sheet.close());
  onBind && onBind(sheetIn);
}
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

function editMachine(m) {
  const isNew = !m;
  m = m || newMachine({ count: 1, type: 'vmc' });
  const opts = (arr, v) => arr.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const html = `<div class="sheet__head"><h3>${esc(isNew ? t('prof.add') : [m.brand, m.model].filter(Boolean).join(' ') || t('mt.' + m.type))}</h3><button class="x" data-close aria-label="${esc(t('ui.close'))}">✕</button></div>
  <form class="fgrid" data-mform>
    <label class="field">${esc(t('f.count'))}<input type="number" min="1" max="99" value="${m.count}" name="count"></label>
    <label class="field">${esc(t('f.type'))}<select name="type">${opts(Object.keys(MTYPES).map((k) => [k, t('mt.' + k)]), m.type)}</select></label>
    <label class="field">${esc(t('f.brand'))}<input list="brands" value="${esc(m.brand)}" name="brand" autocomplete="off"><datalist id="brands">${BRANDS.map((b) => `<option value="${esc(b.name)}">`).join('')}</datalist></label>
    <label class="field">${esc(t('f.model'))}<input value="${esc(m.model)}" name="model"></label>
    <label class="field">${esc(t('f.control'))}<select name="control">${opts([['', '–'], ...Object.entries(CONTROLS).filter(([k]) => k !== 'other').map(([k, c]) => [k, c.name])], m.control)}</select></label>
    <label class="field">${esc(t('f.holder'))}<input value="${esc(m.holder)}" name="holder" placeholder="${esc(MTYPES[m.type].holder)}"></label>
    <label class="field wide">${esc(t('f.value'))}<input type="number" min="0" step="10000" value="${m.value || ''}" placeholder="${Math.round(MTYPES[m.type].value * FX)}" name="value"></label>
    <div class="field wide">${esc(t('f.cad'))}<small style="color:var(--ink3)">${esc(t('f.cadd'))}</small>
      <div class="btnrow"><label class="btn btn--ghost btn--sm">${esc(t('f.cadload'))}<input type="file" accept=".glb,.gltf,.stl,.obj" hidden name="cad"></label>${S.cad.has(m.id) ? `<button type="button" class="btn btn--ghost btn--sm" data-cadrm>${esc(t('f.cadremove'))}</button>` : ''}</div></div>
    <div class="wide btnrow" style="justify-content:space-between;margin-top:.4rem">${isNew ? '<span></span>' : `<button type="button" class="btn btn--ghost btn--sm" data-mrm>${esc(t('f.remove'))}</button>`}<button class="btn btn--yellow" type="submit">${esc(isNew ? t('prof.add') : t('ui.close'))}</button></div>
  </form>`;
  openSheet(html, (el) => {
    const f = $('[data-mform]', el);
    const upd = () => {
      const d = new FormData(f);
      m.count = Math.max(1, +d.get('count') || 1); m.type = d.get('type'); m.brand = d.get('brand').trim(); m.model = d.get('model').trim();
      m.control = d.get('control'); m.holder = d.get('holder').trim(); m.value = +d.get('value') || 0;
      const b = brandByName(m.brand); if (b && !m.control && f.control.dataset.touched !== '1') { m.control = b.ctl; f.control.value = b.ctl; }
      if (!isNew) { know('machines'); recompute(); if (S.step === 'profile') renderPanel(); }
    };
    f.addEventListener('change', (e) => { if (e.target.name === 'control') e.target.dataset.touched = '1'; if (e.target.name !== 'cad') upd(); });
    f.addEventListener('submit', (e) => { e.preventDefault(); upd(); if (isNew) { S.profile.machines.push(m); know('machines'); S.first = false; recompute(); if (S.step === 'profile' && !S.done) askNext(false); else renderPanel(); } sheet.close(); });
    $('[data-mrm]', el)?.addEventListener('click', () => { S.profile.machines = S.profile.machines.filter((x) => x !== m); S.cad.delete(m.id); recompute(); renderPanel(); sheet.close(); });
    $('[data-cadrm]', el)?.addEventListener('click', () => { S.cad.delete(m.id); recompute(); renderPanel(); sheet.close(); });
    f.cad.addEventListener('change', async () => {
      const file = f.cad.files[0]; if (!file) return;
      try { const obj = await loadCustom(file); S.cad.set(m.id, obj); if (isNew) { upd(); S.profile.machines.push(m); know('machines'); } recompute(); renderPanel(); sheet.close(); S.hall?.focusMachine(m.id + '#0'); }
      catch (err) { console.error(err); toast('CAD: ' + err.message); }
    });
  });
}

async function loadCustom(file) {
  const THREE = await import('three');
  const ext = file.name.split('.').pop().toLowerCase();
  const url = URL.createObjectURL(file);
  let obj;
  if (ext === 'glb' || ext === 'gltf') { const { GLTFLoader } = await import('../vendor/GLTFLoader.js'); const { DRACOLoader } = await import('../vendor/DRACOLoader.js'); const l = new GLTFLoader(); const d = new DRACOLoader(); d.setDecoderPath(BASE + 'assets/vendor/draco/'); l.setDRACOLoader(d); obj = (await l.loadAsync(url)).scene; }
  else if (ext === 'stl') { const { STLLoader } = await import('../vendor/STLLoader.js'); const geo = await new STLLoader().loadAsync(url); geo.computeVertexNormals(); obj = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xdfe2e4, roughness: .4, clearcoat: .3 })); obj.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(obj); obj = g; }
  else if (ext === 'obj') { const { OBJLoader } = await import('../vendor/OBJLoader.js'); obj = await new OBJLoader().loadAsync(url); obj.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshPhysicalMaterial({ color: 0xdfe2e4, roughness: .4, clearcoat: .3 }); }); }
  else throw new Error('Format');
  URL.revokeObjectURL(url);
  // Einheit erkennen (mm → m), auf den Boden stellen, zentrieren
  let box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxD = Math.max(size.x, size.y, size.z);
  const s = maxD > 40 ? .001 : maxD > 15 ? .01 : 1;
  const wrap = new THREE.Group(); wrap.add(obj); obj.scale.multiplyScalar(s);
  // liegt die Höhe auf Z (typisch für STEP/STL aus CAD), aufrichten
  box = new THREE.Box3().setFromObject(wrap); const sz = box.getSize(new THREE.Vector3());
  if (ext !== 'stl' && sz.z > sz.y * 1.6 && sz.y < 1.2) obj.rotation.x -= Math.PI / 2;
  box = new THREE.Box3().setFromObject(wrap);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return wrap;
}

function editProduction() {
  const p = S.profile;
  const num = (f, step = 1) => `<label class="field">${esc(t('f.' + f))}<input type="number" min="0" step="${step}" name="${f}" value="${f === 'tools' ? (p.tools || stats(p).tools) : p[f]}"></label>`;
  const radio = (f, vals, lbl) => `<div class="field wide">${esc(t('f.' + f))}<div class="opts" data-opt="${f}">${vals.map((v) => `<button type="button" data-v="${v}" class="${String(p[f]) === String(v) ? 'is-on' : ''}">${esc(lbl(v))}</button>`).join('')}</div></div>`;
  const yn = (v) => (v === 'true' || v === true ? t('chip.yes') : t('chip.no'));
  openSheet(`<div class="sheet__head"><h3>${esc(t('prof.h'))}</h3><button class="x" data-close aria-label="${esc(t('ui.close'))}">✕</button></div>
  <form class="fgrid" data-pform>
    <label class="field wide">${esc(t('f.industry'))}<select name="industry"><option value="">–</option>${INDUSTRIES.map((i) => `<option value="${i}"${p.industry === i ? ' selected' : ''}>${esc(t('ind.' + i))}</option>`).join('')}</select></label>
    ${num('shifts')}${num('changes')}${num('days')}${num('hours')}${num('rate')}${num('staff')}${num('tools', 10)}
    ${radio('measure', ['machine', 'manual', 'old', 'zoller'], (v) => t('meas.' + v))}
    ${radio('data', ['typed', 'paper', 'post'], (v) => t('data.' + v))}
    ${radio('storage', ['open', 'cabinets', 'tms'], (v) => t('stor.' + v))}
    ${radio('shrink', [true, false], yn)}${radio('hsc', [true, false], yn)}${radio('grind', [true, false], yn)}${radio('cam', [true, false], yn)}
    <div class="wide" style="text-align:right"><button class="btn btn--yellow" type="submit">${esc(t('ui.close'))}</button></div></form>`, (el) => {
    const f = $('[data-pform]', el);
    f.addEventListener('change', (e) => { const n = e.target.name; if (!n) return; const v = e.target.type === 'number' ? +e.target.value : e.target.value; p[n] = v; know(n); recompute(); renderPanel(); });
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt] button'); if (!b) return;
      const fld = b.parentElement.dataset.opt; let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false;
      p[fld] = v; know(fld); $$('button', b.parentElement).forEach((x) => x.classList.toggle('is-on', x === b)); recompute(); renderPanel();
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); sheet.close(); });
  });
}

// ------------------------------------------------------------------ Teilen, Mail, PDF
async function encodeState(o) {
  const json = new TextEncoder().encode(JSON.stringify(o));
  let bytes = json, pre = 'j';
  if (window.CompressionStream) {
    try { const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw')); bytes = new Uint8Array(await new Response(cs).arrayBuffer()); pre = 'z'; } catch { bytes = json; }
  }
  let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); });
  return pre + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function decodeState(str) {
  const pre = str[0]; const b64 = str.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  let bytes = bin;
  if (pre === 'z') bytes = new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function shareUrl() {
  const h = await encodeState(pack(S.profile));
  const u = location.href.split('#')[0] + '#p=' + h;
  history.replaceState(null, '', '#p=' + h);
  return u;
}
async function mail() {
  const p = S.profile, g = S.gain;
  const url = await shareUrl();
  const lines = [t('offer.mailintro'), '', p.company ? `${t('offer.company').replace(/ \(.*\)/, '')}: ${p.company}` : '',
    `${t('prof.machines')}: ` + p.machines.map((m) => `${m.count}× ${[m.brand, m.model].filter(Boolean).join(' ') || t('mt.' + m.type)}`).join(', '),
    `${t('f.shifts')}: ${p.shifts} · ${t('f.changes')}: ${p.changes}`, '',
    `${t('sol.h')} (${t('tier.' + p.tier)}):`, ...S.items.map((i) => `– ${i.qty}× ${t('prod.' + i.id)}`), '',
    `${t('gain.eur')}: ${eurExact(g.eur)} · ${t('gain.spindle')}: ${fmt(g.spindle)} h`, '', t('offer.mailoutro', { url })].filter((x) => x !== '');
  location.href = `mailto:${CFG.mail}?subject=${encodeURIComponent(t('offer.subject') + (p.company ? ' – ' + p.company : ''))}&body=${encodeURIComponent(lines.join('\n'))}`;
}
// ------------------------------------------------------------------ Konzept als PDF (Druckansicht mit Diagrammen)
const PC = { y: '#f0e600', yd: '#c9bf00', ink: '#111214', g: '#8a9096', gl: '#d9dcdf', gx: '#eef0f1', red: '#e2552f', amber: '#f2a900', green: '#1f9d55' };
const LEVER_COLORS = ['#f0e600', '#111214', '#6f767c', '#c9bf00', '#a7adb2', '#3d4246', '#e2552f'];
// Diagramme für das PDF: in der Breite einer Spalte (≈ 85 mm) gezeichnet, damit die Schrift in Originalgröße druckt
const CFK = new Intl.NumberFormat(LOC, { style: 'currency', currency: CUR, notation: 'compact', maximumFractionDigits: 1 });
function svgLevers(levers) {
  const W = 340, BW = 238, rh = 34, H = levers.length * rh + 2;
  const max = Math.max(...levers.map((l) => l.eur), 1);
  return `<svg viewBox="0 0 ${W} ${H}" class="r-chart" role="img">${levers.map((l, i) => {
    const y = i * rh, w = BW * l.eur / max;
    return `<text x="0" y="${y + 12}" class="t">${esc(t('lever.' + l.id))}</text>
      <rect x="0" y="${y + 17}" width="${BW}" height="10" rx="2" fill="${PC.gx}"/><rect x="0" y="${y + 17}" width="${Math.max(3, w)}" height="10" rx="2" fill="${i ? PC.ink : PC.y}"/>
      <text x="${W}" y="${y + 26}" text-anchor="end" class="v">${esc(eurExact(l.eur))}</text>`;
  }).join('')}</svg>`;
}
function svgDonut(levers, total) {
  const S0 = 230, cx = 110, cy = 110, r = 92, rin = 58;
  let a0 = -Math.PI / 2;
  const arcs = levers.map((l, i) => {
    const a1 = a0 + (l.eur / total) * Math.PI * 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const P = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
    const d = `M${P(a0, r)} A${r} ${r} 0 ${big} 1 ${P(a1, r)} L${P(a1, rin)} A${rin} ${rin} 0 ${big} 0 ${P(a0, rin)} Z`;
    a0 = a1;
    return `<path d="${d}" fill="${LEVER_COLORS[i % LEVER_COLORS.length]}" stroke="#fff" stroke-width="1.5"/>`;
  }).join('');
  const legend = levers.map((l, i) => `<div><span><i style="background:${LEVER_COLORS[i % LEVER_COLORS.length]}"></i>${esc(t('lever.' + l.id))}</span><b>${Math.round(l.eur / total * 100)} %</b></div>`).join('');
  return `<div class="r-donut"><svg viewBox="0 0 ${S0 - 10} ${S0 - 10}" role="img">${arcs}<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="v" style="font-size:15px">${esc(eurExact(total))}</text><text x="${cx}" y="${cy + 15}" text-anchor="middle" class="t">${esc(t('rep.peryear'))}</text></svg><div class="r-legend">${legend}</div></div>`;
}
function svgDowntime(before, after) {
  const W = 340, L = 74, R = 58, max = Math.max(before, after, .1);
  const bar = (y, v, c, label) => `<text x="0" y="${y + 20}" class="t">${esc(label)}</text><rect x="${L}" y="${y + 5}" width="${Math.max(3, (W - L - R) * v / max)}" height="22" rx="3" fill="${c}"/><text x="${L + (W - L - R) * v / max + 6}" y="${y + 20}" class="v">${esc(t('gain.minutes', { v: NF1.format(v) }))}</text>`;
  const saved = Math.round((1 - after / before) * 100);
  return `<svg viewBox="0 0 ${W} 66" class="r-chart" role="img">${bar(0, before, PC.red, t('gain.before'))}${bar(34, after, PC.y, t('gain.after'))}</svg><p class="r-big">${saved} % ${esc(t('rep.downtime.less'))}</p>`;
}
function svgShift(measB, entB, measA, entA, dayMin) {
  const W = 340, L = 74, BW = W - L;
  const row = (y, m, e, label) => {
    const cut = dayMin - m - e, k = BW / dayMin;
    return `<text x="0" y="${y + 20}" class="t">${esc(label)}</text>
      <rect x="${L}" y="${y + 5}" width="${cut * k}" height="22" fill="${PC.gl}"/>
      <rect x="${L + cut * k}" y="${y + 5}" width="${m * k}" height="22" fill="${PC.red}"/>
      ${e > 0 ? `<rect x="${L + (cut + m) * k}" y="${y + 5}" width="${e * k}" height="22" fill="${PC.amber}"/>` : ''}
      <text x="${L + 6}" y="${y + 20}" class="t" style="fill:#333">${esc(t('gain.minutes', { v: fmt(cut) }))}</text>`;
  };
  return `<svg viewBox="0 0 ${W} 66" class="r-chart" role="img">${row(0, measB, entB, t('gain.before'))}${row(34, measA, entA, t('gain.after'))}</svg>
    <div class="r-key"><span style="--c:${PC.gl}">${esc(t('gain.cutting'))}</span><span style="--c:${PC.red}">${esc(t('gain.setupblk'))}</span><span style="--c:${PC.amber}">${esc(t('gain.entry'))}</span></div>`;
}
function svgCum(perYear, invest) {
  const W = 340, H = 190, L = 62, B = 22, T = 18, R = 8, years = 5;
  const maxV = Math.max(perYear * years, invest || 0) * 1.1 || 1;
  const x = (i) => L + (W - L - R) * (i / years), y = (v) => T + (H - T - B) * (1 - v / maxV);
  const pts = Array.from({ length: years * 12 + 1 }, (_, m) => [x(m / 12), y(perYear * m / 12)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const ticks = [0, .25, .5, .75, 1].map((k) => maxV / 1.1 * k);
  let inv = '';
  if (invest) {
    const yy = y(invest), m = invest / (perYear / 12);
    inv = `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${PC.red}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - R}" y="${yy - 5}" text-anchor="end" class="t" style="fill:${PC.red}">${esc(t('gain.investline'))} ${esc(eurExact(invest))}</text>`;
    if (m <= years * 12) inv += `<circle cx="${x(m / 12)}" cy="${yy}" r="4.5" fill="${PC.y}" stroke="#000" stroke-width="2"/><text x="${x(m / 12) + 8}" y="${yy + 16}" class="v">${esc(t('gain.payback'))}: ${esc(t('gain.months', { v: NF1.format(m) }))}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="r-chart" role="img">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e5e7"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="t">${esc(v ? CFK.format(v) : CF.format(0))}</text>`).join('')}
    ${Array.from({ length: years }, (_, i) => `<text x="${x(i + 1)}" y="${H - 6}" text-anchor="${i === years - 1 ? 'end' : 'middle'}" class="t">${esc(t('gain.year', { v: i + 1 }))}</text>`).join('')}
    <path d="${line} L${x(years)} ${y(0)} L${x(0)} ${y(0)} Z" fill="rgba(240,230,0,.35)"/><path d="${line}" fill="none" stroke="#111" stroke-width="2.2"/>
    ${Array.from({ length: years }, (_, i) => `<circle cx="${x(i + 1)}" cy="${y(perYear * (i + 1))}" r="3" fill="#111"/>`).join('')}
    <text x="${x(years)}" y="${y(perYear * years) - 8}" text-anchor="end" class="v">${esc(eurExact(perYear * years))}</text>${inv}</svg>`;
}
function svgCapacity(n, eq) {
  // je Maschine ein Symbol, dahinter die gewonnene Kapazität in Gelb
  const per = 12, sz = 38, gap = 8, total = n + Math.ceil(eq);
  const rows = Math.ceil(Math.min(total, 48) / per);
  const W = per * (sz + gap), H = rows * (sz + gap);
  const icon = (i, fill, frac = 1) => {
    const cx = (i % per) * (sz + gap), cy = Math.floor(i / per) * (sz + gap);
    const shape = `<rect x="${cx + 4}" y="${cy + 8}" width="${sz - 8}" height="${sz - 10}" rx="3"/><rect x="${cx + 10}" y="${cy + 13}" width="${sz - 20}" height="${sz - 24}" rx="1" fill="#fff" opacity=".55"/>`;
    if (frac >= 1) return `<g fill="${fill}">${shape}</g>`;
    return `<clipPath id="cp${i}"><rect x="${cx}" y="${cy}" width="${sz * frac}" height="${sz}"/></clipPath><g fill="${PC.gl}">${shape}</g><g fill="${fill}" clip-path="url(#cp${i})">${shape}</g>`;
  };
  const items = [];
  for (let i = 0; i < Math.min(n, 48); i++) items.push(icon(i, '#3a3f44'));
  const whole = Math.floor(eq), frac = eq - whole;
  for (let i = 0; i < whole && n + i < 48; i++) items.push(icon(n + i, PC.y));
  if (frac > .02 && n + whole < 48) items.push(icon(n + whole, PC.y, frac));
  return `<svg viewBox="0 0 ${W} ${H}" class="r-chart r-cap" role="img">${items.join('')}</svg>`;
}
function report() {
  const p = S.profile, g = S.gain, st = g.stats;
  const shot = S.hall ? S.hall.snapshot(2000, 1000, 'hall') : '';
  const shotTool = S.hall ? S.hall.snapshot(2000, 1000, 'tool') : '';
  const date = new Date().toLocaleDateString(LOC);
  const dayMin = p.hours * 60, ch = p.changes;
  const measB = (p.measure === 'zoller' ? 1.52 : 4.52) * ch, entB = (p.data === 'post' ? 0 : .75) * ch;
  const pres = g.levers.find((l) => l.id === 'presetting'), dt = g.levers.find((l) => l.id === 'datatransfer');
  const measA = Math.max(0, measB - (pres ? pres.f.min * ch : 0)), entA = Math.max(0, entB - (dt ? dt.f.sec / 60 * ch : 0));
  const n = p.machines.reduce((a, m) => a + m.count, 0);
  const perDay = g.eur / p.days;
  const leverRows = g.levers.map((l) => { const f = { ...l.f }; if (f.spend !== undefined) { f.spend = eur(f.spend); f.value = eur(f.value); } if (f.entries !== undefined) f.entries = fmt(f.entries); return `<tr><td><b>${esc(t('lever.' + l.id))}</b><br><span class="r-small">${esc(t('leverd.' + l.id, f))}</span></td><td class="r-small">${esc(t('leverf.' + l.id, f))}</td><td class="num">${eurExact(l.eur)}</td></tr>`; }).join('');
  const facts = [...new Set([...g.levers.flatMap((l) => l.facts), ...S.items.flatMap((i) => i.facts)])];
  const tiles = (pairs) => `<div class="r-tiles">${pairs.map(([v, l], i) => `<div${i === 0 ? ' class="is-y"' : ''}><b>${v}</b>${esc(l)}</div>`).join('')}</div>`;
  $('[data-report]').innerHTML = `
  <section class="r-page r-cover">
    <div class="r-top"><img src="${BASE}assets/img/zoller-dark.svg" alt="ZOLLER"><span class="r-small">${esc(t('rep.date', { v: date }))}</span></div>
    <p class="r-kicker">${esc(t('ui.title'))}</p>
    <h1>${esc(t('rep.title'))}${p.company ? '<br><span>' + esc(p.company) + '</span>' : ''}</h1>
    <p class="r-lead">${esc(t('rep.lead', { n, tier: t('tier.' + p.tier), items: S.items.filter((i) => !PRODUCTS[i.id].virtual).length }))}</p>
    ${tiles([[eurExact(g.eur), t('gain.eur')], ['+' + fmt(g.spindle) + ' h', t('gain.spindle')], [NF1.format(g.machinesEq), t('gain.machines')], [g.payback ? esc(t('gain.months', { v: NF1.format(g.payback) })) : eurExact(perDay), g.payback ? t('gain.payback') : t('gain.wait')]])}
    ${shot ? `<img class="shot" src="${shot}" alt="">` : ''}
    <p class="r-small">${esc(t('rep.coverNote'))}</p>
  </section>
  <section class="r-page">
    <h2>${esc(t('rep.gain'))}</h2>
    <div class="r-grid2"><div><h3>${esc(t('gain.levers'))}</h3>${svgLevers(g.levers)}</div><div><h3>${esc(t('rep.share'))}</h3>${svgDonut(g.levers, g.eur || 1)}</div></div>
    <div class="r-grid2">
      <div><h3>${esc(t('rep.downtime.h'))}</h3>${svgDowntime(g.setupBefore, g.setupAfter)}<p class="r-small">${esc(t('rep.downtime.note', { changes: ch }))}</p></div>
      <div><h3>${esc(t('gain.day'))}</h3>${svgShift(measB, entB, measA, entA, dayMin)}<p class="r-small">${esc(t('gain.daynote', { changes: ch, before: fmt(measB + entB), after: fmt(measA + entA), gain: fmt(measB + entB - measA - entA) }))}</p></div>
    </div>
    <div class="r-grid2">
      <div><h3>${esc(t('gain.cum'))}</h3>${svgCum(g.eur, p.invest)}</div>
      <div><h3>${esc(t('rep.capacity'))}</h3>${svgCapacity(n, g.machinesEq)}<p class="r-small">${esc(t('rep.capacity.note', { n, eq: NF1.format(g.machinesEq), hours: fmt(g.spindle) }))}</p>
        <h3 style="margin-top:5mm">${esc(t('rep.wait'))}</h3>${tiles([[eurExact(perDay), t('rep.perday')], [eurExact(perDay * p.days / 12), t('rep.permonth')], [eurExact(g.eur), t('rep.peryear')]])}</div>
    </div>
  </section>
  <section class="r-page">
    <h2>${esc(t('rep.solution'))} – ${esc(t('tier.' + p.tier))}</h2>
    ${shotTool ? `<img class="shot shot--s" src="${shotTool}" alt="">` : ''}
    <table class="r-prod"><tr><th></th><th>${esc(t('rep.product'))}</th><th>${esc(t('rep.qty'))}</th><th>${esc(t('rep.reason'))}</th></tr>
    ${S.items.map((i) => { const im = img(i.id); return `<tr><td><img src="${im.src}" alt="" class="r-thumb${im.render ? ' is-render' : ''}"></td><td><b>${esc(pname(i))}</b><br><span class="r-small">${esc(t('step.' + i.step))} · ${esc(t('role.' + i.id))}</span>${i.spec ? `<br><span class="r-small">${i.spec.L ? 'L ≤ ' + fmt(i.spec.L) + ' mm' : ''}${i.spec.D ? ' · Ø ≤ ' + fmt(i.spec.D) + ' mm' : ''}</span>` : ''}</td><td class="num">${fmt(i.qty)}</td><td class="r-small">${i.why.map(([k, v]) => esc(t(k, v))).join('<br>')}</td></tr>`; }).join('')}</table>
  </section>
  <section class="r-page">
    <h2>${esc(t('rep.profile'))}</h2>
    <table><tr><th>${esc(t('rep.qty'))}</th><th>${esc(t('f.brand'))} / ${esc(t('f.model'))}</th><th>${esc(t('f.type'))}</th><th>${esc(t('f.control'))}</th><th>${esc(t('f.holder'))}</th></tr>
    ${p.machines.map((m) => `<tr><td class="num">${m.count}</td><td>${esc([m.brand, m.model].filter(Boolean).join(' ') || '–')}</td><td>${esc(t('mt.' + m.type))}</td><td>${esc(CONTROLS[m.control]?.name || '–')}</td><td>${esc(m.holder || MTYPES[m.type].holder)}</td></tr>`).join('')}</table>
    <p class="r-small">${esc(t('f.shifts'))}: ${p.shifts} · ${esc(t('f.changes'))}: ${p.changes} · ${esc(t('f.days'))}: ${p.days} · ${esc(t('f.hours'))}: ${p.hours} · ${esc(t('f.rate'))}: ${eurExact(p.rate)} · ${esc(t('f.staff'))}: ${eurExact(p.staff)} · ${esc(t('f.tools'))}: ${fmt(st.tools)} · ${esc(t('f.measure'))}: ${esc(t('meas.' + (p.measure || 'machine')))} · ${esc(t('f.data'))}: ${esc(t('data.' + (p.data || 'typed')))}</p>
    <h2>${esc(t('rep.calc'))}</h2>
    <table><tr><th>${esc(t('gain.levers'))}</th><th>${esc(t('gain.formula'))}</th><th class="num">${SYM}</th></tr>${leverRows}<tr><th>Σ</th><th></th><th class="num">${eurExact(g.eur)}</th></tr></table>
    <p class="r-small">${esc(t('gain.moded'))} (${esc(t('gain.mode.' + p.mode))})</p>
    <h2>${esc(t('rep.assume'))}</h2>
    <ol class="r-small r-src">${facts.map((f) => `<li>${esc(t('fact.' + f))} – ${esc(t('src.' + f))}${factUrl(f) ? ` (${esc(factUrl(f))})` : ''}</li>`).join('')}</ol>
    <p class="r-small">${esc(t('offer.note'))} ${esc(CFG.company)}</p>
  </section>`;
  const imgs = $$('[data-report] img');
  Promise.all(imgs.map((im) => (im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 5000); })))).then(() => setTimeout(() => window.print(), 150));
}

// ------------------------------------------------------------------ AR: iPhone/iPad (AR Quick Look), Android (WebXR), sonst QR-Code
const IOS_AR = (() => { try { return document.createElement('a').relList.supports('ar'); } catch { return false; } })();
let XR_OK = false;
try { navigator.xr?.isSessionSupported?.('immersive-ar').then((v) => { XR_OK = !!v; if (S.step === 'room') renderPanel(); }).catch(() => {}); } catch { /* kein WebXR */ }
const AR_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linejoin="round"><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/></svg>');
function arBlock() {
  if (IOS_AR) return `<div class="arbtns">
      <a class="btn btn--yellow btn--sm arbtn is-wait" data-ar="room" href="#"><img src="${AR_ICON}" alt="" width="18" height="18"><span>${esc(t('ar.room'))}</span><i class="spin"></i></a>
      <a class="btn btn--ghost btn--sm arbtn is-wait" data-ar="hall" href="#"><img src="${AR_ICON}" alt="" width="18" height="18"><span>${esc(t('ar.hall'))}</span><i class="spin"></i></a></div>
    <p class="note" data-arnote>${esc(t('ar.wait'))}</p>`;
  if (XR_OK) return `<div class="arbtns"><button class="btn btn--yellow btn--sm" data-act="xr"><img src="${AR_ICON}" alt="" width="18" height="18">${esc(t('ar.room'))}</button></div><p class="note">${esc(t('ar.note.xr'))}</p>`;
  if (matchMedia('(pointer: coarse)').matches) return `<p class="note">${esc(t('ar.note.none'))}</p>`;
  return `<div class="arbtns"><button class="btn btn--sm" data-act="qr"><img src="${AR_ICON}" alt="" width="18" height="18" style="filter:invert(1)">${esc(t('ar.qr'))}</button></div><p class="note">${esc(t('ar.note.qr'))}</p>`;
}
function prepareAR() {
  if (!IOS_AR || !S.hall) return;
  clearTimeout(S.arT);
  S.arT = setTimeout(async () => {
    if (!S.hall.bounds) return;
    const key = S.hall.planKey();
    if (S.ar?.key === key && (S.ar.room || S.ar.busy)) { updateARButtons(); return; }
    if (S.ar) for (const k of ['room', 'hall']) if (S.ar[k]) URL.revokeObjectURL(S.ar[k]);
    S.ar = { key, room: null, hall: null, busy: true };
    updateARButtons();
    try {
      for (const kind of ['room', 'hall']) {
        const blob = await S.hall.buildUSDZ(kind);
        if (S.ar.key !== key) return;
        S.ar[kind] = URL.createObjectURL(blob);
        updateARButtons();
      }
    } catch (e) { console.error('AR', e); S.ar.err = true; }
    S.ar.busy = false; updateARButtons();
  }, 1100);
}
function arFragment(kind) {
  const title = 'ZOLLER ' + t(kind === 'room' ? 'ar.room' : 'ar.hall');
  const sub = `${eur(S.gain?.eur || 0)} ${t('gain.eur')}`;
  return `#callToAction=${encodeURIComponent(t('offer.mail'))}&checkoutTitle=${encodeURIComponent(title)}&checkoutSubtitle=${encodeURIComponent(sub)}`;
}
function updateARButtons() {
  $$('[data-ar]').forEach((a) => {
    const url = S.ar?.[a.dataset.ar];
    if (url) {
      a.rel = 'ar'; a.href = url + arFragment(a.dataset.ar); a.classList.remove('is-wait');
      if (!a.dataset.bound) { a.dataset.bound = '1'; a.addEventListener('message', (e) => { if (e.data === '_apple_ar_quicklook_button_tapped') mail(); }, false); }
    } else { a.removeAttribute('rel'); a.setAttribute('href', '#'); a.classList.add('is-wait'); }
  });
  $$('[data-arnote]').forEach((n) => { n.textContent = S.ar?.err ? t('ar.err') : (S.ar?.room ? t('ar.note.ios') : t('ar.wait')); });
}
// Link vom QR-Code: auf dem Handy direkt das AR-Fenster anbieten (Quick Look braucht ein Antippen)
function arHandoff() {
  if (!IOS_AR && !XR_OK) return;
  openSheet(`<div class="sheet__head"><h3>${esc(t('ar.h'))}</h3><button class="x" data-close aria-label="${esc(t('ui.close'))}">✕</button></div><p class="p-lead">${esc(t('ar.handoff'))}</p>${arBlock()}`, (el) => {
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-ar]'); if (a && !a.getAttribute('rel')) { e.preventDefault(); toast(t('ar.wait')); }
      if (e.target.closest('[data-act="xr"]')) { sheet.close(); startXR(); }
    });
    prepareAR(); updateARButtons();
  });
}
let qrLib = null;
function loadScript(src) {
  return qrLib || (qrLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));
}
async function openQR() {
  const url = (await shareUrl()) + '&ar=1';
  try { await loadScript(BASE + 'assets/vendor/qrcode.min.js'); } catch { prompt('', url); return; }
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  openSheet(`<div class="sheet__head"><h3>${esc(t('ar.qr.h'))}</h3><button class="x" data-close aria-label="${esc(t('ui.close'))}">✕</button></div>
    <div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true })}</div><p class="note" style="text-align:center">${esc(t('ar.qr.note'))}</p>
    <p class="btnrow" style="justify-content:center;margin-top:.8rem"><button class="btn btn--ghost btn--sm" data-copy>${esc(t('offer.share'))}</button></p>`, (el) => {
    $('[data-copy]', el)?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); toast(t('offer.copied')); } catch { prompt('', url); } });
  });
}
async function startXR() {
  try { const m = await import('./xr.js'); await m.startXR(S.hall, { t, base: BASE }); }
  catch (e) { console.error(e); toast(t('ar.err')); }
}
function setNames(on) {
  S.hall?.setLabels(on);
  const b = $('[data-names]');
  if (b) { b.classList.toggle('is-on', !on); $('span', b).textContent = t(on ? 'room.hidenames' : 'room.shownames'); b.setAttribute('aria-pressed', String(!on)); }
  $$('[data-toggle="labels"]').forEach((x) => x.setAttribute('aria-checked', String(on)));
}

function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
let toastT;
function toast(msg) { const el = $('[data-toast]'); el.textContent = msg; el.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('is-on'), 2400); }
