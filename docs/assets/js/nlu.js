// Sprachverständnis des Planungsassistenten (läuft komplett im Browser, nichts verlässt das Gerät).
// Versteht Beschreibungen einer Fertigung auf Deutsch, Englisch, Französisch und Spanisch:
// Maschinen (Anzahl, Hersteller, Baureihe, Typ, Steuerung, Aufnahme), Schichten, Werkzeugwechsel, Werkzeugbestand,
// Stundensatz, Branche, Ist-Zustand (Messen, Datenübertragung, Lager), Schrumpfen/HSC/Nachschleifen, Probleme, Ziele
// und Änderungswünsche (»ohne toolBalancer«, »noch 2 Hermle dazu«, »3 Schichten«).
import { BRANDS, CONTROLS, MTYPES } from './knowledge.js';

const NUMW = {
  ein: 1, eine: 1, einen: 1, einer: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, zwoelf: 12, zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, hundert: 100,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, dozen: 12,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, vingt: 20,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, veinte: 20,
};

const TYPE_RE = [
  ['turnmill', /dreh-?\s?fräs|fräs-?\s?dreh|turn-?\s?mill|mill-?\s?turn|multi-?task|komplettbearbeitung|b-achs|tour-?fraise|torno-?fresadora|multitarea/],
  ['swiss', /langdreh|swiss[- ]?type|\bswiss\b|décolletage|decolletage|torno\s?suizo|torno\s?de\s?cabezal\s?móvil|sliding\s?head/],
  ['5ax', /5[- ]?achs|fünf-?achs|5[- ]?axis|five[- ]axis|5\s?ejes|5\s?axes|simultan(fräs)?|5x\b/],
  ['hmc', /horizontal(es|e|en)?\s?(bearbeitungs|fräs|baz|machining|mill)|\bhmc\b|horizontal(e|es)?\s?(zentr|center)|palettenwechsl|pallet\s?changer|centre\s?d.usinage\s?horizontal|centro\s?de\s?mecanizado\s?horizontal/],
  ['grinder', /werkzeugschleif|schleifmaschine|grinder|grinding\s?machine|rectificadora|affûteuse|affuteuse|rectifieuse/],
  ['lathe', /drehmaschine|drehbank|drehzentr|cnc-?dreh|\blathe|turning\s?cent|\btorno|\btour\b|\btours\b|drehautomat|vertikaldreh/],
  ['vmc', /vertikal|\bvmc\b|fräsmaschine|fraesmaschine|fräszentr|bearbeitungszentr|\bbaz\b|milling|\bmill(s)?\b|machining\s?cent|fresadora|centro\s?de\s?mecanizado|fraiseuse|centre\s?d.usinage|\bcnc-?fräs/],
];
// Baureihen, an denen man den Hersteller auch ohne Markennamen erkennt
const MODEL_BRAND = [
  [/\bdmu\b|\bdmu\s?\d|\bdmc\s?\d|\bctx\s?\w|\bnlx\b|\bntx\b|\bnhx\b|\bnvx\b|monoblock|duoblock/, 'dmgmori'], [/integrex|variaxis|quick\s?turn|\bvcn\b|\bhcn\b/, 'mazak'],
  [/genos|multus|\bosp\b/, 'okuma'], [/\bvf-?\d|\bumc-?\d|\bst-?\d0\b/, 'haas'], [/robodrill/, 'fanucrobo'], [/speedio/, 'brother'],
  [/\ba\d{2}nx\b/, 'makino'], [/hyperturn|maxxturn/, 'emco'], [/\bpuma\b|\blynx\b/, 'doosan'], [/cincom/, 'citizen'], [/swiss\s?(gt|st|dt)/, 'tornos'],
  [/helitronic/, 'walter'], [/\bc\s?(12|22|32|42|52|62)\b(?!\s?(mm|°))/, 'hermle'],
];
const MACHINE_WORD = /maschine|machine|bearbeitungszentr|zentren|center|centre|fräs|dreh|lathe|mill|torno|fresadora|baz|vmc|hmc/;
const UNIT_AFTER = /^\s*(-?\s?)?(%|€|eur|euro|usd|\$|schicht|shift|turno|équipe|poste|werkzeug|tool|outil|herramient|tag|day|jour|día|dia|min|sek|sec|std|stunde|hour|h\b|jahr|year|an\b|año|mitarbeit|employee|people|personne|empleado|µm|mm|m\b|m²|qm|u\/min|upm|rpm|1\/min|min-1|kw|kva|t\b|kg|wechsel|change|teile|parts|pièces|piezas|stk\.?\s?(werkzeug|tool)|achs|axis|axe|eje|°)/;

function normalize(text) {
  let s = ' ' + text.toLowerCase().replace(/[–—]/g, '-').replace(/[“”„«»]/g, '"').replace(/ /g, ' ') + ' ';
  s = s.replace(/(\d)[.,'’ ](\d{3})(?!\d)/g, '$1$2').replace(/(\d)[.,'’ ](\d{3})(?!\d)/g, '$1$2');   // 2.500 / 2,500 / 2 500
  s = s.replace(/(\d+)\s?k\b(?!w)/g, (m, d) => String(+d * 1000));                                   // 30k
  s = s.replace(/\b(ein|zwei|drei)-?(schicht)/g, (m, a, b) => ({ ein: 1, zwei: 2, drei: 3 }[a]) + b);
  s = s.replace(/\b([a-zäöüßéèáíóñ]+)\b/g, (w) => (NUMW[w] !== undefined ? String(NUMW[w]) : w));
  s = s.replace(/(\d+)\s?(x|×|mal|stk\.?|stück|pcs\.?|units?|unidades|unités)\s/g, '$1 ');
  return s;
}

function findBrand(seg) {
  let best = null;
  for (const b of BRANDS) {
    const m = seg.match(b.re);
    if (m && (!best || m.index < best.idx)) best = { b, idx: m.index, len: m[0].length };
  }
  if (best) return best;
  for (const [re, id] of MODEL_BRAND) {
    const m = seg.match(re);
    if (m) { const b = BRANDS.find(x => x.id === id); if (b) return { b, idx: m.index, len: 0, viaModel: true }; }
  }
  return null;
}

function findControl(seg) {
  for (const [id, c] of Object.entries(CONTROLS)) if (c.re && c.re.test(seg)) return id;
  return '';
}

function findHolder(seg) {
  const m = seg.match(/\b(hsk)\s?-?\s?([aetfc])?\s?-?\s?(\d{2,3})\b|\b(sk|iso|bt|cat|din)\s?-?\s?(30|40|50)\b|\bcapto\s?-?\s?c?(\d)\b|\bvdi\s?-?\s?(\d{2})\b|\bkm\s?(\d{2,3})\b|\bpsc\s?(\d{2})\b/);
  if (!m) return '';
  if (m[1]) return 'HSK-' + (m[2] ? m[2].toUpperCase() : 'A') + m[3];
  if (m[4]) return (m[4] === 'iso' || m[4] === 'din' ? 'SK' : m[4].toUpperCase()) + ' ' + m[5];
  if (m[6]) return 'Capto C' + m[6];
  if (m[7]) return 'VDI ' + m[7];
  if (m[8]) return 'KM' + m[8];
  if (m[9]) return 'PSC ' + m[9];
  return '';
}

function modelOf(brand, seg, orig) {
  if (!brand) return { type: '', model: '', ctl: '' };
  for (const [re, type, ctl] of brand.models) {
    const m = seg.match(re);
    if (m) {
      // Anzeige: Treffer + folgende Ziffern/Kürzel aus dem Originaltext
      const tail = seg.slice(m.index).match(/^[a-z0-9.-]+(\s?[0-9]{1,4}[a-z]{0,3})?(\s?(monoblock|duoblock|evo|ii|iii|nx|nxt|\bs\b|\bv\b))?/i);
      let model = (tail ? tail[0] : m[0]).trim();
      const o = orig.toLowerCase().indexOf(model);
      if (o >= 0) model = orig.substr(o, model.length);
      if (model === model.toLowerCase()) model = model.split(' ').map((w) => (w.length <= 5 || /\d/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
      model = model.replace(/monoblock/i, 'monoBLOCK').replace(/duoblock/i, 'duoBLOCK');
      return { type, model, ctl: ctl || '' };
    }
  }
  return { type: '', model: '', ctl: '' };
}

function countBefore(seg, idx) {
  // letzte Zahl vor dem Maschinenbegriff, die keine Einheit trägt
  const pre = seg.slice(0, idx);
  const re = /(\d+)/g; let m, n = 0;
  while ((m = re.exec(pre))) {
    const after = pre.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (!UNIT_AFTER.test(after) && +m[1] > 0 && +m[1] < 400) n = +m[1];
  }
  return n;
}

const NEG = /(ohne|kein(e|en|er)?|nicht|no|without|sin|sans|pas de|ni)\s+([a-z.»"]+\s){0,2}$/;

function neg(s, idx) { return NEG.test(s.slice(Math.max(0, idx - 28), idx)); }

function test(s, re) {
  const m = s.match(re);
  if (!m) return null;
  return neg(s, m.index) ? false : true;
}

// Produktnamen für »ohne …« / »mit …«
const PRODUCT_WORDS = [
  ['smile', /\bsmile\b/], ['venturion', /venturion/], ['hyperion', /hyperion/], ['redomatic', /redomatic/],
  ['powershrink', /powershrink|schrumpfger(ä|ae)t|shrink(-fit)?\s?(machine|unit)/], ['toolbalancer', /toolbalancer|wuchtmaschine|auswuchtmaschine|balancing\s?machine|wuchten/],
  ['keeper', /\bkeeper\b/], ['toolorganizer', /toolorganizer/], ['toolstation', /toolstation|montagewerkbank|werkbank/],
  ['zidcode', /zidcode/], ['toolcart', /toolcart|werkzeugwagen|tool\s?cart/], ['loadbox', /loadbox/], ['robobox', /robobox|roboter|automatisiert(es)?\s?einstell/],
  ['genius', /\bgenius\b/], ['pombasic', /pombasic/], ['roboset-2', /roboset/], ['coramachineload', /coramachineload|maschinenbeladung/],
  ['idchip', /idchip|id-chip/], ['tms-gold', /tms\s?gold|\bgold\b/], ['tms-silver', /tms\s?silver|\bsilver\b/],
];

export function parse(text, ctx = {}) {
  const orig = text;
  const s = normalize(text);
  const out = { patch: {}, machines: [], include: [], exclude: [], hits: [], mode: 'auto', pains: [], goals: [], ask: [] };
  const hit = (kind, label) => { if (!out.hits.some(h => h.kind === kind && h.label === label)) out.hits.push({ kind, label }); };
  const P = out.patch;

  // ---------------------------------------------------------- Maschinen (Segment für Segment)
  const segs = s.split(/[\n;.!?():]|,(?!\d)|\s(?:und|and|et|y|sowie|plus|außerdem|ausserdem|zusätzlich|also|as well as|ainsi que|además)\s|\s\+\s|\s\/\s/);
  let lastGroups = [];
  for (const raw of segs) {
    const seg = ' ' + raw.trim() + ' ';
    if (seg.trim().length < 2) continue;
    const br = findBrand(seg);
    let tword = null, tidx = 1e9;
    for (const [t, re] of TYPE_RE) { const m = seg.match(re); if (m && m.index < tidx) { tword = t; tidx = m.index; } }
    const ctl = findControl(seg);
    const holder = findHolder(seg);
    if (!br && !tword) {
      // Steuerung/Aufnahme ohne Maschine → gilt für die zuletzt genannte(n) Gruppe(n)
      if ((ctl || holder) && lastGroups.length) {
        const all = /\b(alle|all|toutes|todas|jeweils|each)\b/.test(seg);
        for (const g of (all ? out.machines : lastGroups)) { if (ctl) g.control = ctl; if (holder) g.holder = holder; }
        if (ctl) hit('control', CONTROLS[ctl].name);
      }
      continue;
    }
    // Maschinenbegriff ohne Zahl und ohne Marke ist oft nur Kontext (»Fräsen in Titan«) → nur mit Zahl übernehmen
    const idx = Math.min(br ? br.idx : 1e9, tword ? tidx : 1e9);
    let count = countBefore(seg, idx);
    if (!br && !count) continue;
    if (!count) count = /\b(mehrere|several|some|einige|plusieurs|varias|varios)\b/.test(seg) ? 2 : 1;
    const mod = modelOf(br?.b, seg, orig);
    // Baureihe ist am genauesten, dann spezielle Typwörter (5-Achs, Langdreher …), dann allgemeine (Fräsmaschine), dann Marke
    const type = mod.type || (tword && !['vmc', 'lathe'].includes(tword) ? tword : '') || tword || br?.b.type || 'vmc';
    const control = ctl || mod.ctl || br?.b.ctl || '';
    const g = { count, type, brand: br ? br.b.name : '', model: mod.model, control, holder: holder || '', _ctlGuess: !ctl, _generic: !br };
    out.machines.push(g); lastGroups = [g];
    hit('machine', `${count}× ${[g.brand, g.model].filter(Boolean).join(' ') || ''}`.trim());
  }
  // »8 Fräsmaschinen (4 DMU 50, 2 Hermle, 2 Haas)«: die Sammelangabe ohne Marke fällt weg, wenn die Einzelangaben sie ergeben
  out.machines = out.machines.filter((g, i) => {
    if (g.model) return true;
    const rest = out.machines.slice(i + 1).filter(x => (x.model || x.type !== g.type || !g._generic) && (g._generic || x.brand === g.brand));
    return !rest.length || rest.reduce((a, x) => a + x.count, 0) !== g.count;
  });
  // gleiche Gruppen zusammenfassen
  const merged = [];
  for (const g of out.machines) {
    const same = merged.find(x => x.brand === g.brand && x.model === g.model && x.type === g.type && x.control === g.control);
    if (same) same.count += g.count; else merged.push(g);
  }
  out.machines = merged;

  // ---------------------------------------------------------- Produktion
  let m;
  if ((m = s.match(/(\d)\s?-?\s?(schicht|shift|turno|équipe|equipe|poste)/))) P.shifts = Math.min(3, +m[1]);
  else if (/24\s?\/\s?7|rund um die uhr|around the clock|24 stunden|24 hours|3schicht|vollkonti/.test(s)) P.shifts = 3;
  else if (/(1|ein)schicht|single shift/.test(s)) P.shifts = 1;
  else if ((m = s.match(/(\d)schicht/))) P.shifts = Math.min(3, +m[1]);
  if (P.shifts) hit('shifts', P.shifts);
  if ((m = s.match(/(\d{3})\s?(arbeits|produktions|working|work)?\s?-?(tage|days|jours|días|dias)/))) P.days = Math.min(365, +m[1]);
  else if (/(6|sechs)\s?-?tage|6-day|6 days a week|samstag/.test(s)) P.days = 280;
  if (P.days) hit('days', P.days);
  // Werkzeugwechsel pro Schicht/Tag
  const CH = '(\\d+)\\s?(werkzeug|tool\\s?|outil\\s?|herramienta\\s?)?-?\\s?(wechsel|changes?|cambios?|changements?)\\s?(?:\\w+\\s){0,2}?(?:pro|je|per|a|am|\\/|par|por|each|every)\\s(?:[\\wäöü]+\\s){0,3}?';
  if ((m = s.match(new RegExp(CH + '(schicht|shift|turno|poste|équipe)')))) P.changes = +m[1];
  else if ((m = s.match(new RegExp(CH + '(tag|day|jour|día|dia)')))) P._changesDay = +m[1];
  else if ((m = s.match(/(\d+)\s?(komplett)?(werkzeuge?|tools?|outils?|herramientas?)\s?(\w+\s){0,3}?(pro|je|per|a|am|\/|par|por|each|every)\s?(\w+\s){0,3}?(schicht|shift|turno|poste)/))) { if (/maschine|machine|máquina/.test(m[0])) P.changes = +m[1]; else P._changesShiftTotal = +m[1]; }
  else if ((m = s.match(/(\d+)\s?(komplett)?(werkzeuge?|tools?|outils?|herramientas?)\s?(\w+\s){0,3}?(pro|je|per|a|am|\/|par|por|each|every)\s?(tag|day|jour|día|dia)/))) P._toolsDay = +m[1];
  else if ((m = s.match(/(rüsten|ruesten|setzen|messen|stellen|set up|preset|measure)\s?(wir\s|we\s)?(\w+\s)?(\d+)\s?(werkzeuge?|tools?)/))) P._toolsDay = +m[4];
  // Werkzeugbestand
  const toolRe = /(\d+)\s?(komplett-?|complete\s)?(werkzeuge?n?|tools?|outils?|herramientas?|werkzeugaufnahmen|tool\s?holders?|halter)\b(?!\s?(\w+\s){0,2}(pro|je|per|am|a\s(day|shift)|\/|par|por|each|every|wechsel))/g;
  while ((m = toolRe.exec(s))) {
    const before = s.slice(Math.max(0, m.index - 3), m.index);
    if (+m[1] >= 20 && !/\d/.test(before)) { P.tools = +m[1]; break; }
  }
  if ((m = s.match(/(werkzeugbestand|bestand|inventory|tool\s?stock)\D{0,22}(\d{2,6})/))) P.tools = +m[2];
  if (P.tools) hit('tools', P.tools);
  // Stundensatz
  if ((m = s.match(/(\d{2,3})\s?(€|eur|euro|\$|usd|dollar|£|chf)\s?(\/|pro|je|per|an|the|la|por|a l')\s?(h\b|std|stunde|hour|hr|heure|hora)/)) ||
      (m = s.match(/(stundensatz|maschinenstundensatz|hourly\s?rate|machine\s?rate|burden\s?rate|taux\s?horaire|tarifa\s?horaria)\D{0,24}(\d{2,3})/))) {
    P.rate = +(m[2] && /\d/.test(m[2]) ? m[2] : m[1]); hit('rate', P.rate);
  }
  if ((m = s.match(/(\d{2,3})\s?(€|eur|euro|\$)\s?(\/|pro|per)\s?(h|std|stunde|hour)\s?(\w+\s){0,3}(personal|mitarbeiter|staff|labou?r|lohn)/))) P.staff = +m[1];
  if ((m = s.match(/(budget|investition|investment|invest|presupuesto)\D{0,24}(\d{4,7})/))) { P.invest = +m[2]; hit('invest', P.invest); }

  // ---------------------------------------------------------- Branche
  const IND = [
    ['aero', /luftfahrt|luft- und raumfahrt|aerospace|aviation|flugzeug|triebwerk|raumfahrt|aéronaut|aeronáut|\baero\b|\bas\s?9100/],
    ['medical', /medizin|medical|implantat|dental|orthopäd|chirurg|médical|médic|\biso\s?13485/],
    ['auto', /automobil|automotive|kfz|\btier\s?1\b|\boem\b|fahrzeug|e-?mobil|getriebe|motorenteile|automoción|automobile/],
    ['mold', /formenbau|werkzeug-?\s?und\s?formenbau|mold|mould|moule|molde|stanzwerkzeug|druckguss|spritzguss/],
    ['toolmaker', /werkzeughersteller|werkzeugherstellung|präzisionswerkzeuge herstell|tool\s?manufactur|cutting\s?tool\s?maker|schleiferei|nachschleifdienst|regrind\s?service/],
    ['energy', /energie|energy|öl|oil\s?(and|&)\s?gas|\bgas\b|windkraft|wind\s?power|kraftwerk|turbinen|énergie|energía/],
    ['machinery', /maschinenbau|anlagenbau|sondermaschin|machine\s?build|machinery|construction\s?mécanique|maquinaria/],
    ['job', /lohnfertig|auftragsfertig|job\s?shop|contract\s?manufactur|zulieferer|sous-traitan|subcontrat|taller/],
    ['precision', /feinmechanik|präzisionsteile|precision\s?parts|uhren|watch|optik|décolletage/],
  ];
  for (const [id, re] of IND) if (re.test(s)) { P.industry = id; hit('industry', id); break; }

  // ---------------------------------------------------------- Ist-Zustand + Technik
  const sh = test(s, /schrumpf|shrink|frettage|contracci|termorretr|zsugor|skurcz|heat\s?fit/);
  if (sh !== null) { P.shrink = sh; hit('shrink', sh); }
  let hsc = test(s, /\bhsc\b|hochgeschwindigkeit|high[- ]speed|grande vitesse|alta velocidad|\bhpc\b/);
  if ((m = s.match(/(\d{5})\s?(u\/min|upm|rpm|min-1|1\/min|tr\/min|rev)/)) && +m[1] >= 15000) hsc = true;
  if (hsc !== null) { P.hsc = hsc; hit('hsc', hsc); }
  const gr = test(s, /schleifen\s([a-zäöü]+\s){0,3}(selbst\s)?nach\b|nachschleif|nachschärf|selbst schleifen|schleifen (wir|selbst)|werkzeugschleif|eigene werkzeuge (her|schleif)|regrind|resharpen|re-?sharpen|réaffût|reafilado|tool\s?grinding/);
  if (gr !== null) { P.grind = gr; hit('grind', gr); }
  if (/serie|series|großserie|mass production|high volume|stückzahl|production en série|producción en serie/.test(s)) { P.series = true; hit('series', true); }
  if (/losgröße\s?1\b|einzelteil|prototyp|one-?off|small\s?batch|kleinserie|high[- ]mix|petites séries|lotes pequeños/.test(s)) { P.series = false; hit('series', false); }
  if (/\bcam\b|mastercam|hypermill|esprit|nx\s?cam|solidcam|topsolid|tebis|fusion\s?360|gibbscam|edgecam|powermill/.test(s)) { P.cam = true; hit('cam', true); }

  if (/(haben|besitzen|nutzen|have|own|use|utilisons|tenemos)\s(\w+\s){0,3}(zoller|smile|venturion|hyperion)/.test(s)) P.measure = 'zoller';
  else if (/alte[snr]?\s(\w+\s)?(einstell|voreinstell|mess)gerät|altes\s?gerät|optical\s?comparator|profilprojektor|old\s?presetter|älteres|veraltet|outdated presetter/.test(s)) P.measure = 'old';
  else if (/messschieber|messuhr|caliper|von hand mess|ohne einstellgerät|kein(en)?\s(voreinstell|einstell)gerät|no\s?presetter|without\s?a?\s?presetter|sin\s?preajust|pied à coulisse|calibre/.test(s)) P.measure = 'manual';
  else if (/in der maschine|antast|messtaster|tastsystem|laser\s?(in der|an der) maschine|touch[- ]?off|in[- ]machine|on the machine|probe|papierstreifen|z-?setter|en máquina|dans la machine|blum|renishaw|tool\s?setter/.test(s)) P.measure = 'machine';
  if (P.measure) hit('measure', P.measure);
  if (/postprozessor|post-?processor|\brfid\b|balluff|direkt in die steuerung|dnc|netzwerk/.test(s) && !/tippen|abtipp/.test(s)) P.data = 'post';
  else if (/zettel|papier|einrichteblatt|aufschreiben|paper|hand-?written|notiz|papel|feuille/.test(s)) P.data = 'paper';
  else if (/abtipp|eintipp|tippen|von hand (ein|in)|manuell (ein|übertr)|tippfehler|eingabefehler|type (it|them|values) in|typing|type in|key in|manual(ly)? (enter|entry|input)|saisie manuelle|a mano/.test(s)) P.data = 'typed';
  if (P.data) hit('data', P.data);
  if (/\btms\b|werkzeugverwaltung(ssoftware)?|tool\s?management\s?software|\btdm\b|winTool|zoller tms/.test(s) && !neg(s, s.search(/\btms\b|werkzeugverwaltung/))) P.storage = 'tms';
  else if (/regal|schublade|offene[nm]?\s?(lager|schr)|such(en|zeit|t|e)|chaos|unordnung|kisten|kartons|shelves|drawers|search|cherch|busca|desorden/.test(s)) P.storage = 'open';
  else if (/werkzeugschr(ä|a)nk|lagerschr(ä|a)nk|schrank|cabinet|armoire|armario/.test(s)) P.storage = 'cabinets';
  if (P.storage) hit('storage', P.storage);

  // ---------------------------------------------------------- Probleme + Ziele
  const PAINS = [
    ['search', /such(en|zeit|t)|search|cherch|busca/], ['typos', /tippfehler|eingabefehler|zahlendreher|typo|input error|erreur de saisie/],
    ['crash', /crash|kollision|collision|zusammenst/], ['scrap', /ausschuss|nacharbeit|scrap|rework|rebut|chatarra/],
    ['chatter', /ratter|vibration|chatter|unwucht|imbalance|unbalance|balourd|desequilibr/], ['spindle', /spindel(schaden|schäden|lager|tausch|crash| kaputt| defekt)|spindle\s?(damage|failure|repair|rebuild)|broche|husillo/],
    ['skills', /fachkr(ä|a)ft|personalmangel|mitarbeiter (fehlen|finden)|skilled|labou?r shortage|pénurie|escasez/],
    ['doc', /dokumentation|rückverfolg|traceab|zertifiz|nachweis|audit|traçab|trazab/], ['setup', /rüstzeit|rüsten dauert|setup\s?time|set-?up|temps de réglage|tiempo de preparación/],
  ];
  for (const [id, re] of PAINS) if (re.test(s)) { out.pains.push(id); hit('pain', id); }
  const GOALS = [
    ['unmanned', /mannlos|geisterschicht|lights[- ]?out|unattended|unmanned|sans surveillance|desatendid/],
    ['automation', /automatis|automation|roboter|robot|automatiz/], ['transparency', /transparen|kennzahl|kpi|überblick|digitalis|smart factory|industrie\s?4/],
    ['quality', /qualität|quality|qualité|calidad|präzision|precision/], ['cost', /kosten senken|kostendruck|cost|coût|costo/],
  ];
  for (const [id, re] of GOALS) if (re.test(s)) { out.goals.push(id); hit('goal', id); }

  // ---------------------------------------------------------- Produktwünsche
  for (const [id, re] of PRODUCT_WORDS) {
    const mm = s.match(re);
    if (!mm) continue;
    const before = s.slice(Math.max(0, mm.index - 30), mm.index);
    if (/(ohne|kein(e|en)?|nicht|weg|entfern|streich|no|without|remove|drop|sin|sans|quitar|enlever)\s+([a-z»"]+\s){0,2}$/.test(before) || /^\s?(weg|raus|streichen|entfernen|removed?)/.test(s.slice(mm.index + mm[0].length, mm.index + mm[0].length + 12))) {
      out.exclude.push(id); hit('exclude', id);
    } else if (/(mit|inklusive|inkl\.?|plus|dazu|zusätzlich|auch|with|add|include|con|avec|ajout|incluir|möchten|wollen|want|gerne)\s+([a-z»"]+\s){0,3}$/.test(before)) {
      out.include.push(id); hit('include', id);
    }
  }
  // Ausbaustufe
  if (/smart factory|vollautomat|fully automat|maximal|alles\b|everything|komplett(lösung|paket)/.test(s)) { P.tier = 'smart'; hit('tier', 'smart'); }
  else if (/einstieg|klein anfangen|start small|günstig|budget knapp|basic|minimal|entry/.test(s)) { P.tier = 'start'; hit('tier', 'start'); }

  // Ergänzen oder ersetzen?
  if (/\b(dazu|zusätzlich|noch\s\d|weitere|another|additional|more|also|neu gekauft|bought|plus)\b/.test(s)) out.mode = 'add';
  else if (/\b(statt|anstatt|instead|replace|nur noch|only|en lugar|au lieu)\b/.test(s)) out.mode = 'replace';
  return out;
}

// Ergebnis in ein Profil übernehmen; gibt zurück, was sich geändert hat
export function apply(profile, r, newMachine, first) {
  const p = profile;
  const known = new Set(p.known);
  const set = (k, v) => { if (v === undefined || v === null || v === '') return; p[k] = v; known.add(k); };
  for (const k of ['shifts', 'days', 'rate', 'staff', 'tools', 'invest', 'industry', 'measure', 'data', 'storage', 'shrink', 'hsc', 'grind', 'series', 'cam', 'tier']) set(k, r.patch[k]);
  const sh = p.shifts || 2;
  if (r.patch.changes) set('changes', Math.min(60, r.patch.changes));
  if (r.machines.length) {
    const groups = r.machines.map(g => newMachine({ count: g.count, type: g.type, brand: g.brand, model: g.model, control: g.control, holder: g.holder }));
    if (first || r.mode === 'replace' || !p.machines.length) p.machines = groups;
    else for (const g of groups) {
      const same = p.machines.find(x => x.brand === g.brand && x.model === g.model && x.type === g.type);
      if (same && r.mode !== 'add') same.count = g.count; else if (same) same.count += g.count; else p.machines.push(g);
    }
    known.add('machines');
  }
  const n = p.machines.reduce((a, m) => a + m.count, 0) || 1;
  if (r.patch._changesDay) set('changes', Math.max(1, Math.round(r.patch._changesDay / sh)));
  if (r.patch._changesShiftTotal) set('changes', Math.max(1, Math.round(r.patch._changesShiftTotal / n)));
  if (r.patch._toolsDay) set('changes', Math.max(1, Math.round(r.patch._toolsDay / sh / n)));
  if (r.patch.series !== undefined && !known.has('changes')) p.changes = r.patch.series ? 8 : 20;
  if ((r.goals.includes('unmanned') || r.goals.includes('automation')) && !r.patch.tier && !known.has('tier')) p.tier = 'smart';
  for (const x of r.pains) if (!p.pains.includes(x)) p.pains.push(x);
  for (const x of r.goals) if (!p.goals.includes(x)) p.goals.push(x);
  if (r.pains.includes('search') && !p.storage) set('storage', 'open');
  if (r.pains.includes('typos') && !p.data) set('data', 'typed');
  if (r.goals.includes('unmanned') && !r.patch.shifts) set('shifts', 3);
  for (const x of r.exclude) { if (!p.exclude.includes(x)) p.exclude.push(x); p.include = p.include.filter(y => y !== x); }
  for (const x of r.include) { if (!p.include.includes(x)) p.include.push(x); p.exclude = p.exclude.filter(y => y !== x); }
  p.known = [...known];
  return p;
}

// Was fehlt noch für eine gute Planung? (Reihenfolge = Wichtigkeit)
export function missing(p) {
  const k = new Set(p.known), q = [];
  if (!p.machines.length) q.push('machines');
  if (!k.has('shifts')) q.push('shifts');
  if (!k.has('measure')) q.push('measure');
  if (!k.has('changes')) q.push('changes');
  if (!k.has('data') && p.measure !== 'zoller') q.push('data');
  if (!k.has('storage')) q.push('storage');
  if (!k.has('shrink')) q.push('shrink');
  if (!k.has('hsc') && p.machines.some(m => ['vmc', '5ax', 'hmc'].includes(m.type))) q.push('hsc');
  if (!k.has('rate')) q.push('rate');
  return q;
}

export const TYPES = Object.keys(MTYPES);
