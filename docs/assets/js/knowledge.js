// Fachwissen des Planers: Maschinentypen, Hersteller, Steuerungen, ZOLLER-Produkte, Prozessschritte, belegte Fakten.
// Alle Zahlen zu ZOLLER-Produkten (Messbereiche, Kapazitäten, Voraussetzungen, Nutzen) stammen aus Seiten der ZOLLER
// Webseite (Quellen in FACTS, Link über SITE + path). Werte, die nur Planungsannahmen sind, heißen hier ausdrücklich so.

export const SITE = 'https://mzollercreations.github.io/zoller-webseite';
export const SHOWROOM = 'https://mzollercreations.github.io/zoller-produktumgebung-3d/';

// ------------------------------------------------------------------ Maschinentypen (Kundenmaschinen)
// size: Breite × Tiefe × Höhe in m (prozedurales Modell), value: Richtwert Maschinenwert € (für die RWTH-Werkzeugkostenformel),
// turning: Anteil stehender Werkzeuge (Drehen), holder: übliche Aufnahme, req: Planungsannahme längstes Werkzeug L /
// größter Durchmesser D in mm, solange der Kunde nichts anderes sagt
export const MTYPES = {
  vmc:          { size: [2.7, 2.4, 2.65], value: 180000,  turning: 0,  holder: 'SK 40',     req: { L: 300, D: 160 } },
  '5ax':        { size: [3.1, 3.0, 2.95], value: 480000,  turning: 0,  holder: 'HSK-A63',   req: { L: 350, D: 200 } },
  hmc:          { size: [3.4, 4.6, 3.0],  value: 650000,  turning: 0,  holder: 'HSK-A100',  req: { L: 500, D: 315 } },
  gantry:       { size: [7.6, 4.6, 4.3],  value: 1100000, turning: 0,  holder: 'SK 50',     req: { L: 600, D: 400 } },
  boring:       { size: [6.4, 4.8, 4.2],  value: 950000,  turning: 0,  holder: 'SK 50',     req: { L: 800, D: 500 } },
  lathe:        { size: [3.6, 2.0, 2.05], value: 220000,  turning: 1,  holder: 'VDI 40',    req: { L: 250, D: 150 } },
  turnmill:     { size: [4.2, 2.5, 2.7],  value: 520000,  turning: .6, holder: 'Capto C6',  req: { L: 350, D: 200 } },
  vtl:          { size: [4.4, 4.0, 4.2],  value: 850000,  turning: 1,  holder: 'Capto C8',  req: { L: 500, D: 300 } },
  swiss:        { size: [2.6, 1.3, 1.85], value: 320000,  turning: .9, holder: 'Spannzange', req: { L: 150, D: 60 } },
  multispindle: { size: [5.2, 2.3, 2.4],  value: 750000,  turning: .9, holder: 'Spannzange', req: { L: 200, D: 80 } },
  grinder:      { size: [2.4, 2.2, 2.3],  value: 420000,  turning: 0,  holder: 'HSK-A50',   req: { L: 300, D: 200 } },
  gear:         { size: [3.8, 2.8, 2.7],  value: 650000,  turning: 0,  holder: 'Fräsdorn',  req: { L: 350, D: 250 } },
  other:        { size: [2.8, 2.4, 2.5],  value: 200000,  turning: .3, holder: 'SK 40',     req: { L: 300, D: 200 } },
};

// schwere Aufnahmen: im »keeper« L-Einsätze (8 statt 14 je Rahmen), am Einstellgerät großer Messbereich
export const HEAVY_HOLDER = /\b(SK|BT|CAT)\s?50\b|HSK-?[AET]?\s?(80|100|125|160)\b|Capto\s?C8|KM\s?(80|100)|PSC\s?(80|100)/i;

// ------------------------------------------------------------------ Steuerungen
// dmi: »zidCode 4.0« mit »z.DMI« schreibt direkt in den Werkzeugspeicher (laut ZOLLER: OKUMA, MAKINO, FANUC, HEIDENHAIN,
// Matsuura, Mazak, SIEMENS); alle anderen über »zidCode« (Tastatursimulation, USB/RS-232/Ethernet)
export const CONTROLS = {
  heidenhain: { name: 'HEIDENHAIN TNC', dmi: true,  re: /heidenhain|\btnc\s?\d*|\bitnc\b|\btnc7\b/ },
  siemens:    { name: 'SIEMENS SINUMERIK', dmi: true, re: /siemens|sinumerik|\b8[24]0\s?d\b|\bone\b(?=.*sinumerik)|\b828\b/ },
  fanuc:      { name: 'FANUC', dmi: true, re: /fanuc|\b3[012]i\b|\b0i-?[a-z]?\b/ },
  mazak:      { name: 'MAZATROL', dmi: true, re: /mazatrol|smooth\s?(x|g|ai|ez)/ },
  okuma:      { name: 'OKUMA OSP', dmi: true, re: /\bosp\b|osp-?p\d+/ },
  makino:     { name: 'MAKINO Pro', dmi: true, re: /makino\s?pro\s?\d|\bpro\s?[56]\b/ },
  matsuura:   { name: 'MATSUURA G-Tech', dmi: true, re: /g-?tech/ },
  haas:       { name: 'HAAS NGC', dmi: false, re: /\bngc\b/ },
  mitsubishi: { name: 'MITSUBISHI', dmi: false, re: /mitsubishi|\bm[78]0\b/ },
  brother:    { name: 'BROTHER CNC-C00', dmi: false, re: /cnc-?c00/ },
  hurco:      { name: 'HURCO WinMax', dmi: false, re: /winmax/ },
  other:      { name: '', dmi: false, re: null },
};

// ------------------------------------------------------------------ Hersteller
// re: Erkennung im Freitext; type: typischer Maschinentyp; ctl: übliche Steuerung; accent: Akzentfarbe des Modells;
// models: [Regex, Typ, Steuerung?] – Modellreihen, an denen der Planer den Maschinentyp erkennt
export const BRANDS = [
  { id: 'dmgmori', name: 'DMG MORI', re: /dmg\s?-?\s?mori|\bdmg\b|deckel\s?maho|gildemeister|mori\s?seiki/, type: 'vmc', ctl: 'heidenhain', accent: '#1b1d20',
    models: [[/\bgm\s?\d+|multisprint|\bmorinx\b/, 'multispindle', 'siemens'], [/\bdmu\s?-?\d+|monoblock|duoblock|\bdmu\b/, '5ax'], [/\bdmc\s?\d+\s?h\b|\bnhx\b|\bdmc\s?\d+h/, 'hmc', 'siemens'],
             [/\bdmc\b|\bdmv\b|\bcmx\s?\d*\s?v|\bnvx\b|\bdmp\b|\bdmf\b/, 'vmc'], [/\bntx\b|\bctx\s?\w*\s?tc\b|\bnt\s?\d{4}/, 'turnmill', 'siemens'],
             [/\bctx\b|\bnlx\b|\bclx\b|\bnzx\b|\balx\b|\bcmx\s?\d*\s?y/, 'lathe', 'siemens'], [/\bsprint\b|\bnzx-?s\b/, 'swiss', 'fanuc'], [/\bvl\s?\d|\bnrx\b/, 'lathe', 'siemens']] },
  { id: 'hermle', name: 'Hermle', re: /hermle/, type: '5ax', ctl: 'heidenhain', accent: '#5a6168', models: [[/\bc\s?\d{2}\b/, '5ax']] },
  { id: 'mazak', name: 'Mazak', re: /mazak|yamazaki/, type: 'vmc', ctl: 'mazak', accent: '#2e5f8a',
    models: [[/integrex/, 'turnmill'], [/variaxis|\bvariaxis\b/, '5ax'], [/\bhcn\b|\bfh-?\d+/, 'hmc'], [/mega\s?turn/, 'vtl'], [/\bvtc\b|\bvcn\b|\bvcu\b|\bvc-?\w*/, 'vmc'],
             [/quick\s?turn|\bqtn\b|\bqt\b|\bqtu\b|\bqte\b|\bsqt\b/, 'lathe'], [/syncrex/, 'swiss'], [/\bvortex\b.*(bridge|portal)|\bvqc\b/, 'gantry']] },
  { id: 'okuma', name: 'Okuma', re: /okuma/, type: 'vmc', ctl: 'okuma', accent: '#2d7a4f',
    models: [[/\bmcr\b|\bmcr-?[a-z]/, 'gantry'], [/\bv\d{2,3}r\b|\bvtr\b/, 'vtl'], [/genos\s?m|\bmb-?\d+v|\bm\d{3}v/, 'vmc'], [/genos\s?l|\blb\s?\d+|\blu\s?\d+|\bl\d{3,4}\b|space\s?turn/, 'lathe'],
             [/\bmu-?\d+|\bmu\s?\d/, '5ax'], [/\bma-?\d+h|\bmb-?\d+h|\bmah\b/, 'hmc'], [/multus/, 'turnmill']] },
  { id: 'haas', name: 'Haas', re: /\bhaas\b/, type: 'vmc', ctl: 'haas', accent: '#b5201c',
    models: [[/\bgr-?\d+/, 'gantry'], [/\bvf-?\d+|\bminimill|\bdm-?\d|\bdt-?\d|\btm-?\d|\bvm-?\d/, 'vmc'], [/\bumc-?\d+|\bvr-?\d+/, '5ax'], [/\bec-?\d+/, 'hmc'], [/\bst-?\d+|\bds-?\d+|\btl-?\d/, 'lathe']] },
  { id: 'makino', name: 'Makino', re: /makino/, type: 'hmc', ctl: 'makino', accent: '#21409a',
    models: [[/\ba\s?\d{2}\s?nx|\ba\d{2}\b|\ba[0-9]+nx/, 'hmc'], [/\bd\s?\d{3}|\bda\s?\d{3}|\bv\s?\d{2}/, '5ax'], [/\bps\s?\d{2}|\bf\s?\d{1,2}\b|\bu\s?\d/, 'vmc'], [/\bmcc\b|\bmag\s?\d/, 'gantry']] },
  { id: 'matsuura', name: 'Matsuura', re: /matsuura/, type: '5ax', ctl: 'matsuura', accent: '#1f6fb2', models: [[/\bmam72|\bmx-?\d+|\bcublex/, '5ax'], [/\bh\.plus|\bmam\b/, 'hmc'], [/\bvx-?\d+/, 'vmc']] },
  { id: 'grob', name: 'GROB', re: /\bgrob\b/, type: '5ax', ctl: 'siemens', accent: '#c41e2a', models: [[/\bg\s?\d{3}|\bg\d{3}/, '5ax'], [/\bgmode\b/, 'turnmill']] },
  { id: 'chiron', name: 'CHIRON', re: /chiron/, type: 'vmc', ctl: 'siemens', accent: '#0f5aa6', models: [[/\bfz\s?\d+\s?5x|\b5x\b/, '5ax'], [/\bfz\s?\d+|\bdz\s?\d+|\bmill\s?\d+/, 'vmc']] },
  { id: 'heller', name: 'HELLER', re: /heller/, type: 'hmc', ctl: 'siemens', accent: '#003b70', models: [[/\bh\s?\d{4}|\bf\s?\d{4}|\bhf\s?\d{4}/, 'hmc'], [/\bc\s?\d{4}/, '5ax']] },
  { id: 'index', name: 'INDEX', re: /\bindex\b/, type: 'turnmill', ctl: 'siemens', accent: '#004f9f',
    models: [[/\bms\s?\d{2}|\bmultiline|\bms\d{2}/, 'multispindle'], [/\bg\s?\d{3}|\bc\s?\d{3}|\br\s?\d{3}|\bmc\s?\d{3}/, 'turnmill'], [/\bb\s?\d{3}|\bv\s?\d{3}/, 'lathe']] },
  { id: 'traub', name: 'TRAUB', re: /traub/, type: 'swiss', ctl: 'siemens', accent: '#00508f', models: [[/\btnl\s?\d+|\btnk/, 'swiss'], [/\btnx\s?\d+|\btna\s?\d+/, 'lathe']] },
  { id: 'citizen', name: 'Citizen', re: /citizen|cincom|miyano/, type: 'swiss', ctl: 'mitsubishi', accent: '#00468c', models: [[/\bl\s?\d{2}|\bm\s?\d{2}|\bk\s?\d{2}|\ba\s?\d{2}|cincom/, 'swiss'], [/miyano|\bbnx|\bbnd|\bbne/, 'lathe']] },
  { id: 'star', name: 'Star', re: /star\s?micronics|\bstar\s+s[rbxw]-?\d/, type: 'swiss', ctl: 'fanuc', accent: '#0065b3', models: [[/\bsr-?\d+|\bsb-?\d+|\bsx-?\d+|\bsw-?\d+/, 'swiss']] },
  { id: 'tornos', name: 'Tornos', re: /\btornos(?=\s+(swiss|gt|st|dt|evodeco|multiswiss|multisigma|sigma|deco|sa\b))/, type: 'swiss', ctl: 'fanuc', accent: '#0f2d69',
    models: [[/multiswiss|multisigma|\bmulti\b/, 'multispindle'], [/swiss\s?(gt|st|dt|nano)|\bevodeco/, 'swiss']] },
  { id: 'nakamura', name: 'Nakamura-Tome', re: /nakamura/, type: 'turnmill', ctl: 'fanuc', accent: '#004b8d', models: [[/\bntj|\bntx|\bwt-?\d+|\bntrx|\bsuper\s?ntj/, 'turnmill'], [/\bsc-?\d+|\bas-?\d+/, 'lathe']] },
  { id: 'emco', name: 'EMCO', re: /\bemco\b/, type: 'lathe', ctl: 'siemens', accent: '#d71920', models: [[/hyperturn|maxxturn|\bemcoturn/, 'lathe'], [/\bumill|\bmmv|\bmaxxmill|\bemcomill/, 'vmc']] },
  { id: 'spinner', name: 'SPINNER', re: /spinner/, type: 'lathe', ctl: 'siemens', accent: '#c8102e', models: [[/\btc\s?\d+|\btts|\bpd\s?\d+/, 'lathe'], [/\bu5|\bu\s?5-?\d+/, '5ax'], [/\bvc\s?\d+|\bmvc/, 'vmc']] },
  { id: 'doosan', name: 'DN Solutions', re: /doosan|dn\s?solutions/, type: 'vmc', ctl: 'fanuc', accent: '#0a5aa8',
    models: [[/\bvtr\b|puma\s?v\d|\bv\d{4}\b/, 'vtl'], [/\bdbc\b|\bbm\s?\d+/, 'boring'], [/\bdcm\b/, 'gantry'], [/\bpuma\b|\blynx\b|\bsmx\b/, 'lathe'], [/\bdnm\b|\bdvf\b|\bmynx\b/, 'vmc'], [/\bnhp\b|\bhc\s?\d+/, 'hmc']] },
  { id: 'hurco', name: 'Hurco', re: /hurco/, type: 'vmc', ctl: 'hurco', accent: '#003a70', models: [[/\bvmx\s?\d+\s?u|\bvc\s?\d+\s?u/, '5ax'], [/\bvm\s?\d+|\bvmx\s?\d+/, 'vmc'], [/\bts\s?\d|\btm\s?\d/, 'lathe']] },
  { id: 'brother', name: 'Brother', re: /\bbrother\b|speedio/, type: 'vmc', ctl: 'brother', accent: '#1a3c7a', models: [[/speedio|\bs\s?\d{3}x\d|\bm\s?\d{3}x\d/, 'vmc']] },
  { id: 'fanucrobo', name: 'FANUC', re: /robodrill/, type: 'vmc', ctl: 'fanuc', accent: '#f2c500', models: [[/robodrill/, 'vmc']] },
  { id: 'kern', name: 'KERN', re: /\bkern\b/, type: '5ax', ctl: 'heidenhain', accent: '#3c3c3c', models: [[/micro|pyramid|evo/, '5ax']] },
  { id: 'fehlmann', name: 'Fehlmann', re: /fehlmann/, type: '5ax', ctl: 'heidenhain', accent: '#d40f14', models: [[/versa/, '5ax'], [/picomax/, 'vmc']] },
  { id: 'starrag', name: 'Starrag', re: /starrag|heckert|bumotec|droop|scharmann/, type: '5ax', ctl: 'siemens', accent: '#00447c',
    models: [[/droop|\bfogs\b/, 'gantry'], [/scharmann|\bheckert\s?h/, 'boring'], [/\bstc\b|\bhec\b|\blx\b|\bzt\b/, '5ax'], [/bumotec/, 'turnmill']] },
  { id: 'willemin', name: 'Willemin-Macodel', re: /willemin|macodel/, type: 'turnmill', ctl: 'fanuc', accent: '#c4161c', models: [[/\b\d{3}\b/, 'turnmill']] },
  { id: 'kitamura', name: 'Kitamura', re: /kitamura/, type: 'vmc', ctl: 'fanuc', accent: '#004c97', models: [[/mycenter\s?hx|\bhx\d+/, 'hmc'], [/mycenter|\bmedcenter/, 'vmc']] },
  { id: 'yasda', name: 'YASDA', re: /yasda/, type: '5ax', ctl: 'fanuc', accent: '#003f87', models: [[/\bytl|\bymc|\bpx/, '5ax']] },
  { id: 'quaser', name: 'Quaser', re: /quaser/, type: 'vmc', ctl: 'heidenhain', accent: '#d0021b', models: [[/\bux\s?\d+|\bur\s?\d+/, '5ax'], [/\bmv\s?\d+|\bmf\s?\d+/, 'vmc']] },
  { id: 'hyundai', name: 'Hyundai WIA', re: /hyundai|\bwia\b/, type: 'lathe', ctl: 'fanuc', accent: '#002c5f', models: [[/\bl\s?\d{3}|\bhd\s?\d+/, 'lathe'], [/\bkf\s?\d+|\bf\s?\d{3}/, 'vmc'], [/\bkh\s?\d+/, 'hmc']] },
  { id: 'liebherr', name: 'Liebherr', re: /liebherr/, type: 'gear', ctl: 'siemens', accent: '#f6c300', models: [[/\blc\s?\d+|\blgg\b|\blg\s?\d+/, 'gear']] },
  { id: 'gleason', name: 'Gleason', re: /gleason|pfauter/, type: 'gear', ctl: 'siemens', accent: '#00447c', models: [[/\bp\s?\d{3}|\bgenesis|\bphoenix/, 'gear']] },
  { id: 'kapp', name: 'KAPP NILES', re: /kapp|niles/, type: 'gear', ctl: 'siemens', accent: '#00508f', models: [[/\bkx\s?\d+|\bzp\s?\d+/, 'gear']] },
  { id: 'emag', name: 'EMAG', re: /\bemag\b/, type: 'lathe', ctl: 'siemens', accent: '#003b7a', models: [[/\bvl\s?\d+|\bvsc\s?\d+|\bvt\s?\d+/, 'lathe'], [/\bk\s?\d{3}|\bvlc\s?\d+\s?h/, 'gear']] },
  { id: 'walter', name: 'WALTER', re: /\bwalter\b(?=.*(helitronic|schleif|vision))|helitronic/, type: 'grinder', ctl: 'fanuc', accent: '#004a99', models: [[/helitronic/, 'grinder']] },
  { id: 'anca', name: 'ANCA', re: /\banca\b/, type: 'grinder', ctl: 'other', accent: '#00a3e0', models: [[/\bmx\d|\bfx\d|\bgx\d|\btx\d/, 'grinder']] },
  { id: 'vollmer', name: 'VOLLMER', re: /vollmer/, type: 'grinder', ctl: 'other', accent: '#e30613', models: [[/\bvgrind|\bvhybrid/, 'grinder']] },
  { id: 'schutte', name: 'SCHÜTTE', re: /sch(ü|ue|u)tte/, type: 'grinder', ctl: 'other', accent: '#004f9f', models: [[/\bscx|\bms\s?\d+|\bpc\s?\d+|\bsf\s?\d+/, 'multispindle', 'siemens'], [/\b\d{3}\s?linear|\bwu\s?\d+/, 'grinder']] },
  { id: 'rollomatic', name: 'Rollomatic', re: /rollomatic/, type: 'grinder', ctl: 'fanuc', accent: '#c00d1e', models: [[/grindsmart|\bshapesmart/, 'grinder']] },
  { id: 'gfms', name: 'GF Machining Solutions', re: /\bgf\b|mikron|agie|charmilles|machining\s?solutions/, type: '5ax', ctl: 'heidenhain', accent: '#00aab4', models: [[/\bmill\s?[ps]\s?\d+|\bhsm\s?\d+|\bmikron/, '5ax']] },
  { id: 'waldrich', name: 'Waldrich Coburg', re: /waldrich/, type: 'gantry', ctl: 'siemens', accent: '#004b8d', models: [[/taurus|multitec|powertec|\bpro\s?fm\b/, 'gantry']] },
  { id: 'zimmermann', name: 'Zimmermann', re: /zimmermann(?=.*(fz|portal|fräs|mill))|\bzimmermann\s?fz/, type: 'gantry', ctl: 'heidenhain', accent: '#e30613', models: [[/\bfz\s?\d+/, 'gantry']] },
  { id: 'fpt', name: 'FPT', re: /\bfpt\b/, type: 'gantry', ctl: 'heidenhain', accent: '#c4161c', models: [] },
  { id: 'schiess', name: 'Schiess', re: /schiess/, type: 'vtl', ctl: 'siemens', accent: '#003876', models: [[/vertiline|\bvmg\b/, 'vtl']] },
  { id: 'doerries', name: 'Dörries', re: /d(ö|oe|o)rries/, type: 'vtl', ctl: 'siemens', accent: '#00447c', models: [[/contumat|\bvdm\b|\bvcm\b/, 'vtl']] },
  { id: 'union', name: 'UNION', re: /\bunion\b(?=.*(bohr|boring|pcr|tc\s?\d|kcr))/, type: 'boring', ctl: 'heidenhain', accent: '#00508f', models: [[/\bpcr\b|\btc\s?\d+|\bkcr\b/, 'boring']] },
  { id: 'juaristi', name: 'JUARISTI', re: /juaristi/, type: 'boring', ctl: 'heidenhain', accent: '#c8102e', models: [] },
  { id: 'pama', name: 'PAMA', re: /\bpama\b/, type: 'boring', ctl: 'siemens', accent: '#003a70', models: [] },
  { id: 'fermat', name: 'FERMAT', re: /fermat/, type: 'boring', ctl: 'heidenhain', accent: '#00529b', models: [] },
  { id: 'toyoda', name: 'JTEKT Toyoda', re: /toyoda|jtekt/, type: 'hmc', ctl: 'fanuc', accent: '#c8102e', models: [[/\bfh\s?\d+|\bfa\s?\d+/, 'hmc']] },
  { id: 'mag', name: 'MAG', re: /\bmag\b(?=.*(spec|xs|ias|maschin))|cross\s?h(ü|ue)ller|ex-cell-o/, type: 'hmc', ctl: 'siemens', accent: '#004a8f', models: [] },
  { id: 'takisawa', name: 'Takisawa', re: /takisawa/, type: 'lathe', ctl: 'fanuc', accent: '#00529b', models: [] },
  { id: 'biglia', name: 'Biglia', re: /biglia/, type: 'lathe', ctl: 'fanuc', accent: '#c4161c', models: [] },
  { id: 'hedelius', name: 'Hedelius', re: /hedelius/, type: '5ax', ctl: 'heidenhain', accent: '#0a5aa8', models: [[/\bt\s?\d|\bacura|\btiltenta/, '5ax']] },
  { id: 'reiden', name: 'Reiden', re: /\breiden\b/, type: '5ax', ctl: 'heidenhain', accent: '#004c97', models: [] },
  { id: 'feeler', name: 'Feeler', re: /feeler/, type: 'vmc', ctl: 'fanuc', accent: '#00599c', models: [] },
  { id: 'leadwell', name: 'Leadwell', re: /leadwell/, type: 'vmc', ctl: 'fanuc', accent: '#00599c', models: [] },
  { id: 'ycm', name: 'YCM', re: /\bycm\b/, type: 'vmc', ctl: 'fanuc', accent: '#00599c', models: [] },
  { id: 'victor', name: 'Victor Taichung', re: /victor\s?taichung/, type: 'lathe', ctl: 'fanuc', accent: '#c8102e', models: [] },
  { id: 'kovosvit', name: 'Kovosvit MAS', re: /kovosvit|\bmas\b/, type: 'vmc', ctl: 'heidenhain', accent: '#004b93', models: [[/\bmcu\s?\d+\s?vt|\bmcu\s?\d+\s?5x/, '5ax'], [/\bmcv\b|\bmcu\b/, 'vmc'], [/\bsp\s?\d+|\bmultiax/, 'lathe']] },
  { id: 'weiler', name: 'WEILER', re: /\bweiler\b/, type: 'lathe', ctl: 'siemens', accent: '#00529b', models: [[/\be\s?\d{2}|\bv\s?\d{2}|\bdz\b/, 'lathe']] },
  { id: 'hwacheon', name: 'Hwacheon', re: /hwacheon/, type: 'lathe', ctl: 'fanuc', accent: '#003876', models: [[/\bhi-?tech|\bcutex/, 'lathe'], [/\bvesta|\bsirius|\bd2-?5ax/, 'vmc']] },
  { id: 'zayer', name: 'ZAYER', re: /zayer/, type: 'boring', ctl: 'heidenhain', accent: '#004a8f', models: [] },
  { id: 'ibarmia', name: 'IBARMIA', re: /ibarmia/, type: '5ax', ctl: 'heidenhain', accent: '#d0021b', models: [] },
  { id: 'soraluce', name: 'SORALUCE', re: /soraluce/, type: 'boring', ctl: 'heidenhain', accent: '#004c97', models: [] },
  { id: 'tos', name: 'TOS Varnsdorf', re: /\btos\s?varnsdorf|\bwhn\s?\d+|\bwrd\s?\d+/, type: 'boring', ctl: 'heidenhain', accent: '#00529b', models: [] },
];

// ------------------------------------------------------------------ Branchen
export const INDUSTRIES = ['job', 'auto', 'aero', 'medical', 'mold', 'machinery', 'energy', 'toolmaker', 'precision'];

// ------------------------------------------------------------------ Prozessschritte im Werkzeugkreislauf
export const STEPS = ['store', 'assemble', 'shrink', 'balance', 'measure', 'supply', 'identify', 'inspect', 'software'];

// ------------------------------------------------------------------ ZOLLER-Produkte des Planers
// cad: Modell aus docs/models; img: freigestelltes Foto (docs/img/p) mit Höhe h (m) für Produkte ohne CAD;
// path: Seite der ZOLLER Webseite; showroom: Produkt-ID im 3D-Showroom; foot: Grundfläche B × T (m) für die Hallenplanung
// (aus den technischen Daten, sonst geschätzt); min: Planungsannahme Minuten je Werkzeug (Einstellen inkl. Handling)
export const PRODUCTS = {
  smile:          { step: 'measure', cad: 'smile', img: 'smile', path: '/produkte/einstellen-messen/vertikale-geraete/smile', showroom: 'smile', foot: [1.9, 0.95], min: 4 },
  venturion:      { step: 'measure', cad: 'venturion', img: 'venturion', path: '/produkte/einstellen-messen/vertikale-geraete/venturion', showroom: 'venturion', foot: [2.35, 1.0], min: 3 },
  venturion600:   { step: 'measure', cad: 'venturion600', img: 'venturion', path: '/produkte/einstellen-messen/vertikale-geraete/venturion', showroom: 'venturion', foot: [2.3, 1.0], min: 3 },
  venturion800:   { step: 'measure', cad: 'venturion800', img: 'venturion', path: '/produkte/einstellen-messen/vertikale-geraete/venturion', showroom: 'venturion', foot: [2.65, 1.0], min: 3.5 },
  hyperion:       { step: 'measure', img: 'hyperion', h: 1.75, path: '/produkte/einstellen-messen/horizontale-geraete/hyperion', showroom: 'hyperion', foot: [2.2, 1.1], min: 3 },
  redomatic:      { step: 'shrink', cad: 'redomatic600', img: 'redomatic', path: '/produkte/schrumpftechnik/redomatic', showroom: 'redomatic', foot: [3.6, 1.95], min: 2.5 },
  powershrink:    { step: 'shrink', cad: 'powershrink400', img: 'powershrink', path: '/produkte/schrumpftechnik/powershrink', showroom: 'powershrink', foot: [1.1, 0.7] },
  toolbalancer:   { step: 'balance', cad: 'toolbalancer', img: 'toolbalancer', path: '/produkte/wuchttechnik/toolbalancer', showroom: 'toolbalancer', foot: [1.6, 2.05] },
  keeper:         { step: 'store', cad: 'keeper', img: 'keeper', path: '/produkte/toolmanagement/werkzeuglager/keeper', showroom: 'keeper', foot: [1.85, 1.55] },
  toolorganizer:  { step: 'store', cad: 'toolorganizer', img: 'toolorganizer', path: '/produkte/toolmanagement/werkzeuglager/toolorganizer', showroom: 'toolorganizer', foot: [0.85, 0.85] },
  twister:        { step: 'store', img: 'twister', h: 1.93, path: '/produkte/toolmanagement/werkzeuglager/twister', showroom: 'twister', foot: [0.8, 0.97] },
  autolock:       { step: 'store', img: 'autolock', h: 2.0, path: '/produkte/toolmanagement/werkzeuglager/autolock', showroom: 'autolock', foot: [1.0, 1.05] },
  toolstation:    { step: 'assemble', cad: 'toolstation', img: 'toolstation', path: '/produkte/toolmanagement/smart-cabinets/toolstation', showroom: 'toolstation', foot: [2.5, 0.9] },
  ztower:         { step: 'assemble', img: 'ztower', h: 2.1, path: '/produkte/toolmanagement/smart-cabinets/ztower', showroom: 'ztower', foot: [1.49, 0.9] },
  zidcode:        { step: 'identify', cad: 'zidcode', img: 'zidcode', path: '/produkte/toolmanagement/zidcode/zidcode', showroom: 'zidcode', foot: [0.45, 0.5], perMachine: true },
  zidcode40:      { step: 'identify', cad: 'zidcode', img: 'zidcode', path: '/produkte/toolmanagement/zidcode/zidcode-40', showroom: 'zidcode', foot: [0.45, 0.5], perMachine: true },
  idchip:         { step: 'identify', img: 'idchip', h: .5, path: '/produkte/werkzeugaufnahmen/idchip', showroom: 'idchip', virtual: true },
  idlabel:        { step: 'identify', img: 'idchip', h: .5, path: '/produkte/werkzeugaufnahmen/idchip', showroom: 'idchip', virtual: true },
  toolcart:       { step: 'supply', cad: 'toolcart', img: 'toolcart', h: .97, path: '/produkte/toolmanagement/smart-cabinets/toolcart', showroom: 'toolcart', foot: [0.92, 0.56] },
  loadbox:        { step: 'supply', img: 'loadbox', h: 2.2, path: '/produkte/automation/werkzeugbereitstellung/loadbox', showroom: 'loadbox', foot: [3.64, 3.4] },
  coramachineload:{ step: 'supply', img: 'coramachineload', h: 2.1, path: '/produkte/automation/werkzeuglogistik/coramachineload', showroom: 'coramachineload', foot: [2.6, 1.6], atMachine: true },
  coralogistic:   { step: 'supply', img: 'coralogistic', h: 1.4, path: '/produkte/automation/werkzeuglogistik/coralogistic', showroom: 'coralogistic', foot: [1.6, 1.0] },
  robobox:        { step: 'measure', img: 'robobox', h: 2.2, path: '/produkte/automation/werkzeugvorbereitung/robobox', showroom: 'robobox', foot: [2.94, 3.4] },
  corameasure:    { step: 'measure', img: 'corameasure-lg', h: 2.0, path: '/produkte/automation/werkzeugvorbereitung/corameasure-lg', showroom: 'corameasure-lg', foot: [3.15, 1.79] },
  micbox:         { step: 'assemble', img: 'micbox', h: 2.0, path: '/produkte/automation/werkzeugvorbereitung/micbox', showroom: 'micbox', foot: [2.4, 2.0] },
  'roboset-2':    { step: 'inspect', img: 'roboset-2', h: 2.1, path: '/produkte/automation/werkzeuginspektion/roboset-2', showroom: 'roboset-2', foot: [2.6, 2.2] },
  genius:         { step: 'inspect', img: 'genius', h: 2.0, path: '/produkte/pruefen-messen/universal-messmaschinen/genius', showroom: 'genius', foot: [1.3, 1.3] },
  titan:          { step: 'inspect', img: 'titan', h: 2.05, path: '/produkte/pruefen-messen/universal-messmaschinen/titan', showroom: 'titan', foot: [1.4, 1.4] },
  hobcheck:       { step: 'inspect', img: 'hobcheck', h: 2.05, path: '/produkte/pruefen-messen/universal-messmaschinen/hobcheck', showroom: 'hobcheck', foot: [2.0, 1.4] },
  smartcheck:     { step: 'inspect', img: 'smartcheck', h: 1.9, path: '/produkte/pruefen-messen/universal-messmaschinen/smartcheck', showroom: 'smartcheck', foot: [2.0, 1.1] },
  pombasic:       { step: 'inspect', img: 'pombasic', h: .72, path: '/produkte/pruefen-messen/prozessorientertes-messen/pombasic', showroom: 'pombasic', foot: [1.2, 0.8], table: true },
  'tms-core':     { step: 'software', img: 'tms-core', soft: true, path: '/produkte/toolmanagement/software/tms-core', showroom: 'tms-core' },
  zstock:         { step: 'software', img: 'zstock', soft: true, path: '/produkte/toolmanagement/software/add-on-zstock', showroom: 'zstock' },
  zconnectivity:  { step: 'software', img: 'zconnectivity', soft: true, path: '/produkte/toolmanagement/software/add-on-zconnectivity', showroom: 'zconnectivity' },
  zcam:           { step: 'software', img: 'zcam-integration', soft: true, path: '/produkte/toolmanagement/software/add-on-zcam-integration', showroom: 'zcam-integration' },
  zshopfloor:     { step: 'software', img: 'zshopfloor', soft: true, path: '/produkte/toolmanagement/software/add-on-zshopfloor', showroom: 'zshopfloor' },
  zresources:     { step: 'software', img: 'zresources', soft: true, path: '/produkte/toolmanagement/software/add-on-zresources', showroom: 'zresources' },
  zintegration:   { step: 'software', img: 'zintegration', soft: true, path: '/produkte/toolmanagement/software/add-on-zintegration', showroom: 'zintegration' },
  // ältere Paketnamen (nur noch für geteilte Links mit »ohne …«)
  'tms-starter':  { step: 'software', img: 'tms-core', soft: true, legacy: true, path: '/produkte/toolmanagement/tms-tool-management-solutions/softwarepakete/starter-lagerverwaltung', showroom: 'tms-starter' },
  'tms-silver':   { step: 'software', img: 'tms-core', soft: true, legacy: true, path: '/produkte/toolmanagement/tms-tool-management-solutions/softwarepakete/silver-betriebsorganisation', showroom: 'tms-silver' },
  'tms-gold':     { step: 'software', img: 'tms-core', soft: true, legacy: true, path: '/produkte/toolmanagement/tms-tool-management-solutions/softwarepakete/gold-shopfloormanagement', showroom: 'tms-gold' },
};

// ------------------------------------------------------------------ Baureihen mit Messbereichen (Technische Daten der Produktseiten)
// L: maximale Werkzeuglänge mm, D: maximaler Werkzeugdurchmesser mm (mit Optionen), Lstd/Dstd: Grundausführung
export const SERIES = {
  smile: [
    { name: 'smile 320', L: 350, D: 320 },
    { name: 'smile 420', L: 420, D: 420 },
    { name: 'smile 620', L: 800, D: 620, Lstd: 600 },
  ],
  venturion: [
    { name: 'venturion 450', pid: 'venturion', L: 820, D: 620, Lstd: 450, Dstd: 420 },
    { name: 'venturion 600', pid: 'venturion600', L: 1200, D: 800, Lstd: 600, Dstd: 600 },
    { name: 'venturion 800', pid: 'venturion800', L: 1600, D: 1400, Lstd: 600, Dstd: 1000 },
  ],
  hyperion: [
    { name: 'hyperion 300', L: 350 },
    { name: 'hyperion 500', L: 500 },
    { name: 'hyperion 700', L: 700 },
  ],
  powershrink: [
    { name: 'powerShrink 200', L: 400, Dmax: 32 },
    { name: 'powerShrink 400', L: 600, Dmax: 32 },
    { name: 'powerShrink 600', L: 600, Dmax: 50 },
    { name: 'powerShrink 400 | 11', L: 1100, Dmax: 32 },
  ],
  redomatic: [
    { name: 'redomatic 600', L: 1000, D: 800, Dmax: 50 },
  ],
};
// Kapazität »keeper« (Konfiguration): 5 Auszüge × 6 Rahmen × 14 Werkzeuge (Größe S, z. B. SK 40, HSK 63) bzw. × 8 (Größe L,
// z. B. SK 50, HSK 100)
export const KEEPER_CAP = { S: 5 * 6 * 14, L: 5 * 6 * 8 };
// »loadBox«: maximale Kapazität 2380 Werkzeuge, Werkzeuge bis 450 mm Länge, Ø 120 mm, 10 kg (FAQ + Technische Daten)
export const LOADBOX_CAP = 2380;
// »roboBox«: Werkzeuge bis 450 mm Länge, Schaftdurchmesser 5–25 mm, bis 10 kg (Technische Daten)
export const ROBOBOX = { L: 450, d: [5, 25] };
// Planungsannahme für Gerätekapazitäten: 75 % einer Schicht wird tatsächlich eingestellt
export const UTIL = .75;

// ------------------------------------------------------------------ Belegte Fakten (Quelle = Seite der ZOLLER Webseite)
export const FACTS = {
  calc15k:   { path: '/wirtschaftlichkeitsrechner' },
  min452:    { path: '/wirtschaftlichkeitsrechner' },
  setup40:   { path: '/solutions/einstellen-messen' },
  tms5:      { path: '/wirtschaftlichkeitsrechner' },
  tool20:    { path: '/wirtschaftlichkeitsrechner' },
  lauble:    { path: '/unternehmen/reports-stories/detail/mit-dem-team-boxenstopp-zum-perfekten-ergebnis' },
  ituwa:     { path: '/unternehmen/reports-stories/detail/venturion-verbessert-die-produktivitaet' },
  v70:       { path: '/unternehmen/reports-stories/detail/venturion-erhoeht-genauigkeit-und-prozesssicherheit' },
  procam:    { path: '/unternehmen/reports-stories/detail/mit-smile-420-zu-1-mio-usd-umsatzplus' },
  top55:     { path: '/unternehmen/reports-stories/detail/mit-smile-420-zu-1-mio-usd-umsatzplus' },
  sycotec:   { path: '/unternehmen/reports-stories/detail/mehr-tempo-weniger-werkzeugbrueche' },
  genius60:  { path: '/unternehmen/reports-stories/detail/so-effizient-kann-genius-kosten-senken' },
  balance2x: { path: '/unternehmen/reports-stories/detail/werkzeugwuchten-mehr-qualitaet-geringere-kosten' },
  spindle:   { path: '/unternehmen/reports-stories/detail/werkzeugwuchten-mehr-qualitaet-geringere-kosten' },
  life15:    { path: '/unternehmen/reports-stories/detail/mit-smile-zu-mehr-effizienz-und-hoeherer-qualitaet' },
  zid45:     { path: '/produkte/toolmanagement/zidcode' },
  zdmi:      { path: '/produkte/toolmanagement/zidcode/zidcode-40' },
  zidnet:    { path: '/produkte/toolmanagement/zidcode/faq' },
  idlabel:   { path: '/produkte/werkzeugaufnahmen/idchip' },
  robobox:   { path: '/produkte/automation/werkzeugvorbereitung/robobox/faq' },
  roboboxd:  { path: '/produkte/automation/werkzeugvorbereitung/robobox/technische-daten' },
  redo10:    { path: '/produkte/schrumpftechnik/redomatic/faq' },
  runout3:   { path: '/solutions/werkzeugaufnahmen' },
  tb04:      { path: '/produkte/wuchttechnik/toolbalancer' },
  ps27:      { path: '/produkte/schrumpftechnik/powershrink/faq' },
  psmodels:  { path: '/produkte/schrumpftechnik/powershrink/technische-daten' },
  keeper420: { path: '/produkte/toolmanagement/werkzeuglager/keeper/konfiguration' },
  roboset:   { path: '/unternehmen/reports-stories/detail/wirtschaftlich-in-serien-messen-mit-roboset-2' },
  hyp20:     { path: '/produkte/einstellen-messen/horizontale-geraete/hyperion' },
  smiled:    { path: '/produkte/einstellen-messen/vertikale-geraete/smile/technische-daten' },
  ventd:     { path: '/produkte/einstellen-messen/vertikale-geraete/venturion/technische-daten' },
  hypd:      { path: '/produkte/einstellen-messen/horizontale-geraete/hyperion/technische-daten' },
  loadbox:   { path: '/produkte/automation/werkzeugbereitstellung/loadbox/faq' },
  cora:      { path: '/produkte/automation/werkzeuglogistik/coramachineload/faq' },
  webtms:    { path: '/produkte/toolmanagement/tms-tool-management-solutions/webtms/faq' },
  zconn:     { path: '/produkte/toolmanagement/software/add-on-zconnectivity' },
};

// Akzentfarbe → bei unbekannter Marke neutral
export const NEUTRAL_ACCENT = '#3a3f45';

export function brandById(id) { return BRANDS.find(b => b.id === id) || null; }
export function brandByName(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  return BRANDS.find(b => b.name.toLowerCase() === n) || BRANDS.find(b => b.re.test(n)) || null;
}
// Baureihe einer Produktfamilie, die einen Messbereich (L, D in mm) abdeckt – kleinste passende, sonst größte
export function seriesFor(fam, L = 0, D = 0) {
  const list = SERIES[fam];
  return list.find(s => s.L >= L && (!s.D || s.D >= D)) || list[list.length - 1];
}
