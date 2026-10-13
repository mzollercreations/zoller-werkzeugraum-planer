// Fachfragen im Planungsassistenten beantworten (läuft im Browser, keine Daten an Server).
// Erkennt die Absicht einer Frage (Was ist …? Brauche ich …? Warum …? Unterschied …? Wie viele …? Was kostet …? Lohnt sich …?)
// in allen 18 Sprachen des Planers und antwortet aus dem belegten Produktwissen (knowledge.js, Texte spec.* / when.*)
// und der aktuellen Planung des Kunden (engine.js).
import { PRODUCTS, KEEPER_CAP, LOADBOX_CAP, UTIL } from './knowledge.js';
import { recommend, stats, TIERS } from './engine.js';

// Produktnamen in Fragen (Reihenfolge: spezifisch vor allgemein)
const NAMES = [
  ['venturion600', /venturion\s?600/], ['venturion800', /venturion\s?800/], ['venturion', /venturion/], ['smile', /\bsmile/], ['hyperion', /hyperion/],
  ['redomatic', /redomatic/], ['powershrink', /powershrink|schrumpfger(ä|ae)t|shrink(-fit)?\s?(unit|machine|device)/], ['toolbalancer', /toolbalancer|wuchtmaschine|balancing machine|auswucht/],
  ['keeper', /keeper/], ['toolorganizer', /toolorganizer/], ['twister', /twister/], ['autolock', /autolock/], ['toolstation', /toolstation/], ['ztower', /ztower|z-tower/],
  ['zidcode40', /zidcode\s?4|z\.?dmi/], ['zidcode', /zidcode/], ['idchip', /idchip|id-chip/], ['idlabel', /idlabel|id-label/], ['toolcart', /toolcart/], ['loadbox', /loadbox/],
  ['coramachineload', /coramachineload|maschinenbeladung/], ['coralogistic', /coralogistic|coraexpress/], ['robobox', /robobox/], ['corameasure', /corameasure/], ['micbox', /micbox/],
  ['roboset-2', /roboset/], ['genius', /genius/], ['titan', /\btitan\b/], ['hobcheck', /hobcheck/], ['smartcheck', /smartcheck/], ['pombasic', /pombasic/],
  ['zstock', /z\.?\s?stock/], ['zconnectivity', /connectivity/], ['zcam', /z\.?\s?cam/], ['zshopfloor', /shopfloor/], ['zresources', /z\.?\s?resources/], ['zintegration', /z\.?\s?integration/],
  ['tms-core', /tms|werkzeugverwaltung|tool\s?management|gestion d.outils|gestión de herramientas/],
];
const W = {
  cmp: /unterschied|vergleich|\bvs\.?\b|versus|differen|compar|différence|diferencia|differenza|różnic|rozdíl|rozdiel|különbség|razlik|skillnad|diferença|区别|比较|違い|比較|차이|비교|разниц|отлич|сравн|fark|karşılaştır/,
  need: /brauche|benötige|brauchen|lohnt sich ein|sinnvoll|need|necessary|required|besoin|faut-il|necesito|hace falta|necessario|serve un|serve davvero|potřebuj|potrebuj|potrzebuj|treba|kell egy|kell-e|szükség|behöver|preciso|需要|必要|필요|нужен|нужна|нужно|gerek|lazım/,
  why: /warum|wieso|weshalb|why|pourquoi|por qué|porque|perché|dlaczego|proč|prečo|miért|zakaj|varför|por que|为什么|なぜ|どうして|왜|почему|зачем|neden|niçin/,
  price: /kostet|kosten|preis|price|cost|prix|coûte|precio|cuesta|prezzo|costa|cena|kolik stojí|ile kosztuje|(?<![a-záéíóöőúüű])ár(a|at)?\b|mennyibe|koliko stane|pris|kostar|preço|quanto custa|价格|多少钱|価格|いくら|가격|얼마|цена|стоимост|сколько стоит|fiyat|ne kadar/,
  cap: /wie viele|wieviele|wie viel|how many|how much|capacit|kapazit|combien|cuántos|cuántas|quanti|quante|\bile\b|kolik|koľko|hány|koliko|hur många|quantos|quantas|多少|いくつ|何本|몇|сколько|kaç/,
  gain: /lohnt|rentabel|amortis|payback|\broi\b|return|worth|rentable|amortiza|ammortizz|conviene|opłaca|vyplatí|oplatí|megtérül|izplača|lönar|compensa|回本|值得|元が取れ|투자 회수|가치가|окуп|стоит ли|amorti|kazanç|değer mi/,
  reco: /empfiehl|empfehlung|was soll|recommend|suggest|recommand|conseill|recomiend|recomend|consigli|polec|doporuč|odporúč|ajánl|priporoč|rekommend|推荐|おすすめ|추천|рекоменд|öneri/,
  info: /was ist|was macht|was kann|what is|what does|what's|qu.est-ce|c.est quoi|qué es|che cos|cos.è|co to|czym jest|mi az|kaj je|vad är|o que é|是什么|とは|란|что такое|nedir/,
  net: /netzwerk|network|réseau|\bred\b|rete|síť|sieć|hálózat|omrežj|nätverk|rede|网络|ネットワーク|네트워크|сет(ь|и|ью|ей)|(?<![a-zçğıöşü])ağ(a|da|ı|ın)?(?![a-zçğıöşü])/,
};

export function isQuestion(text) {
  const s = ' ' + text.toLowerCase() + ' ';
  if (/\?|？|¿/.test(text)) return true;
  return Object.entries(W).some(([k, re]) => k !== 'net' && re.test(s)) && productsIn(s).length > 0;
}
// alle genannten Produkte in Reihenfolge; ein allgemeiner Name an derselben Stelle wie ein genauerer zählt nicht
// (»zidCode 4.0« ist nicht zusätzlich »zidCode«, »venturion 600« nicht zusätzlich »venturion«)
function productsIn(s) {
  const hits = [];
  for (const [id, re] of NAMES) for (const m of s.matchAll(new RegExp(re.source, 'g'))) hits.push({ id, at: m.index, end: m.index + m[0].length });
  const keep = hits.filter((h) => !hits.some((o) => o !== h && o.id !== h.id && o.at <= h.at && o.end >= h.end && o.end - o.at > h.end - h.at));
  const out = [];
  for (const h of keep.sort((x, y) => x.at - y.at)) if (!out.includes(h.id)) out.push(h.id);
  return out;
}

// Antwort als { html, chips? } – oder null, wenn die Frage nicht zu beantworten ist (dann versteht der Planer den Text als Angabe)
export function answer(text, ctx) {
  const { p, items, gain, t, esc, eur, fmt, tierName } = ctx;
  const s = ' ' + text.toLowerCase().replace(/[»«"“”„]/g, '') + ' ';
  const prods = productsIn(s);
  const has = (k) => W[k].test(s);
  const name = (id) => t('prod.' + id);
  const item = (id) => items.find(i => i.id === id);
  const why = (it) => it.why.map(([k, v]) => t(k, v)).join(' ');
  const spec = (id) => { const x = t('spec.' + id); return x === 'spec.' + id ? t('role.' + id) : x; };
  const b = (x) => `<b>${esc(x)}</b>`;
  const P = (x) => `<p>${x}</p>`;
  const st = stats(p);

  // Vergleich zweier Produkte
  if (prods.length >= 2 && (has('cmp') || /(^|[\s,])(oder|or|ou|o|oppure|czy|nebo|alebo|vagy|ali|eller|или|veya|yoksa)(?=[\s,?]|$)|或|还是|それとも|または|또는/.test(s))) {
    const [a, c] = prods;
    return { html: P(esc(t('qa.cmp', { a: name(a), b: name(c) }))) + `<dl class="qa-cmp"><dt>${esc(name(a))}</dt><dd>${esc(spec(a))}</dd><dt>${esc(name(c))}</dt><dd>${esc(spec(c))}</dd></dl>` + mine([a, c]) };
  }
  // Preis
  if (has('price')) {
    return { html: P(esc(t('qa.price', { day: eur(gain.eur / p.days) }))), chips: [[t('qa.c.invest'), 'go:gain'], [t('offer.mail'), 'mail']] };
  }
  // Kapazität
  if (has('cap') && prods.length) {
    const id = prods[0];
    if (id === 'keeper') {
      const cap = Math.round(KEEPER_CAP.S * (1 - st.heavy) + KEEPER_CAP.L * st.heavy);
      return { html: P(esc(t('qa.cap.keeper', { s: KEEPER_CAP.S, l: KEEPER_CAP.L, tools: st.tools, qty: Math.max(1, Math.ceil(st.tools / cap)) }))) };
    }
    if (id === 'loadbox') return { html: P(esc(t('qa.cap.loadbox', { cap: LOADBOX_CAP, tools: st.tools, qty: Math.max(1, Math.ceil(st.tools / LOADBOX_CAP)) }))) };
    if (['smile', 'venturion', 'venturion600', 'venturion800', 'hyperion', 'redomatic'].includes(id)) {
      const min = PRODUCTS[id].min;
      const cap = Math.floor(p.hours * 60 * UTIL / min) * p.shifts;
      return { html: P(esc(t('qa.cap.pre', { name: name(id), min, cap, shifts: p.shifts, tpd: st.tpd, qty: Math.max(1, Math.ceil(st.tpd / cap)) }))) };
    }
    return { html: P(`${b(name(id))} – ${esc(spec(id))}`) };
  }
  // Lohnt sich das? / Amortisation
  if (has('gain') && !prods.length) {
    return { html: P(esc(t('qa.gain', { eur: eur(gain.eur), hours: fmt(gain.spindle), day: eur(gain.eur / p.days), m: (gain.machinesEq || 0).toFixed(1).replace('.', t('qa.dec')) }))), chips: [[t('a.cta.gain'), 'go:gain']] };
  }
  // Netzwerk / zidCode-Varianten
  if (has('net') && (prods.includes('zidcode') || prods.includes('zidcode40') || !prods.length)) {
    return { html: P(esc(t('qa.net'))) + `<dl class="qa-cmp"><dt>${esc(name('zidcode'))}</dt><dd>${esc(spec('zidcode'))}</dd><dt>${esc(name('zidcode40'))}</dt><dd>${esc(spec('zidcode40'))}</dd></dl>` + mine(['zidcode', 'zidcode40']) };
  }
  // Empfehlung zusammenfassen
  if (has('reco') && !prods.length) {
    const list = items.filter(i => !PRODUCTS[i.id].soft && !PRODUCTS[i.id].virtual).map(i => `${i.qty > 1 ? i.qty + '× ' : ''}${i.model ? '»' + i.model + '«' : name(i.id)}`);
    return { html: P(esc(t('qa.reco', { tier: tierName(p.tier), list: list.join(', ') }))), chips: [[t('a.cta.solution'), 'go:solution']] };
  }
  if (!prods.length) return null;
  const id = prods[0];
  const it = item(id) || (id === 'venturion' && items.find(i => /^venturion/.test(i.id)));
  // Warum …?
  if (has('why')) {
    if (it) return { html: P(`${b(it.model ? '»' + it.model + '«' : name(it.id))} – ${esc(why(it))}`) + facts(it) };
    return needAnswer(id);
  }
  // Brauche ich …?
  if (has('need')) return needAnswer(id);
  // Was ist …? (und jede andere Frage mit Produktnamen)
  return { html: P(`${b(name(id))} – ${esc(t('role.' + id))}.`) + P(esc(spec(id))) + mine([id]), chips: [[t('sol.showroom'), 'showroom:' + id]] };

  function needAnswer(id) {
    const PRE = ['smile', 'venturion', 'venturion600', 'venturion800', 'hyperion'];
    const sib = !it && PRE.includes(id) && items.find(i => PRE.includes(i.id));
    if (sib) {
      const w = t('when.' + id);
      return { html: P(esc(t('qa.pre.alt', { have: '»' + (sib.model || sib.id) + '«', name: name(id), when: w === 'when.' + id ? t('when.default') : w }))) + P(esc(why(sib))) };
    }
    if (it) return { html: P(esc(t('qa.need.yes', { name: it.model ? '»' + it.model + '«' : name(id), qty: fmt(it.qty) }))) + P(esc(why(it))) + facts(it) };
    const T = TIERS.indexOf(p.tier);
    for (let k = T + 1; k < TIERS.length; k++) {
      const alt = recommend(p, TIERS[k]).find(i => i.id === id);
      if (alt) return { html: P(esc(t('qa.need.tier', { name: name(id), tier: tierName(p.tier), tier2: tierName(TIERS[k]) }))) + P(esc(why(alt))), chips: [[tierName(TIERS[k]), 'tier:' + TIERS[k]]] };
    }
    if (p.exclude.includes(id)) return { html: P(esc(t('qa.need.excl', { name: name(id) }))), chips: [[t('sol.restore') + ': ' + name(id), 'restore:' + id]] };
    const w = t('when.' + id);
    return { html: P(esc(t('qa.need.no', { name: name(id), when: w === 'when.' + id ? t('when.default') : w }))), chips: [[t('hit.include', { v: name(id) }), 'include:' + id]] };
  }
  function mine(ids) {
    const got = ids.map(item).filter(Boolean);
    if (!got.length) return '';
    return P(`<small>${esc(t('qa.mine'))} ${got.map(g => esc(`${fmt(g.qty)}× ${g.model ? '»' + g.model + '«' : name(g.id)}`)).join(' · ')}</small>`);
  }
  function facts(it) {
    if (!it.facts?.length) return '';
    return `<p class="qa-src">${it.facts.slice(0, 2).map(f => esc(t('fact.' + f))).join(' ')}</p>`;
  }
}

// Vorschläge für Fragen, passend zur aktuellen Planung
export function suggestions(items, t) {
  const pre = items.find(i => ['smile', 'venturion', 'venturion600', 'venturion800', 'hyperion'].includes(i.id));
  const out = [];
  if (pre) out.push(t('qa.s.why', { name: pre.model ? '»' + pre.model + '«' : t('prod.' + pre.id) }));
  out.push(items.some(i => i.id === 'toolbalancer') ? t('qa.s.cap') : t('qa.s.need'));
  out.push(t('qa.s.cmp'));
  out.push(t('qa.s.gain'));
  return out;
}
