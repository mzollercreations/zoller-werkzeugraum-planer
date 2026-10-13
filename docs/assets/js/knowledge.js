// Fachwissen des Planers: Maschinentypen, Hersteller, Steuerungen, ZOLLER-Produkte, Prozessschritte, belegte Fakten.
// Alle Zahlen zu ZOLLER-Nutzen stammen aus Seiten der ZOLLER Webseite (Quellen in FACTS, Link über SITE + path).

export const SITE = 'https://mzollercreations.github.io/zoller-webseite';
export const SHOWROOM = 'https://mzollercreations.github.io/zoller-produktumgebung-3d/';

// ------------------------------------------------------------------ Maschinentypen (Kundenmaschinen)
// size: Breite × Tiefe × Höhe in m (prozedurales Modell), value: Richtwert Maschinenwert € (für die RWTH-Werkzeugkostenformel)
export const MTYPES = {
  vmc:      { size: [2.7, 2.4, 2.65], value: 180000, turning: 0,  holder: 'SK 40' },
  '5ax':    { size: [3.1, 3.0, 2.95], value: 480000, turning: 0,  holder: 'HSK-A63' },
  hmc:      { size: [3.4, 4.6, 3.0],  value: 650000, turning: 0,  holder: 'HSK-A100' },
  lathe:    { size: [3.6, 2.0, 2.05], value: 220000, turning: 1,  holder: 'VDI 40' },
  turnmill: { size: [4.2, 2.5, 2.7],  value: 520000, turning: .6, holder: 'Capto C6' },
  swiss:    { size: [2.6, 1.3, 1.85], value: 320000, turning: .9, holder: 'Spannzange' },
  grinder:  { size: [2.4, 2.2, 2.3],  value: 420000, turning: 0,  holder: 'HSK-A50' },
  other:    { size: [2.8, 2.4, 2.5],  value: 200000, turning: .3, holder: 'SK 40' },
};

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
    models: [[/\bdmu\s?-?\d+|monoblock|\bdmu\b/, '5ax'], [/\bdmc\s?\d+\s?h\b|\bnhx\b|\bdmc\s?\d+h/, 'hmc', 'siemens'], [/\bdmc\b|\bdmv\b|\bcmx\s?\d*\s?v|\bnvx\b|\bdmp\b/, 'vmc'],
             [/\bctx\b|\bnlx\b|\bclx\b|\bnzx\b|\balx\b|\bcmx\s?\d*\s?y/, 'lathe', 'siemens'], [/\bntx\b|\bctx\s?\w*\s?tc\b/, 'turnmill', 'siemens'], [/\bsprint\b|\bnzx-?s\b/, 'swiss', 'fanuc']] },
  { id: 'hermle', name: 'Hermle', re: /hermle/, type: '5ax', ctl: 'heidenhain', accent: '#5a6168', models: [[/\bc\s?\d{2}\b/, '5ax']] },
  { id: 'mazak', name: 'Mazak', re: /mazak|yamazaki/, type: 'vmc', ctl: 'mazak', accent: '#2e5f8a',
    models: [[/integrex/, 'turnmill'], [/variaxis|\bvariaxis\b/, '5ax'], [/\bhcn\b|\bfh-?\d+/, 'hmc'], [/quick\s?turn|\bqtn\b|\bqt\b|\bqtu\b|\bqte\b|\bsqt\b|mega\s?turn/, 'lathe'], [/\bvcn\b|\bvcu\b|\bvc-?\w*|\bvtc\b/, 'vmc'], [/syncrex/, 'swiss']] },
  { id: 'okuma', name: 'Okuma', re: /okuma/, type: 'vmc', ctl: 'okuma', accent: '#2d7a4f',
    models: [[/genos\s?m|\bmb-?\d+v|\bm\d{3}v/, 'vmc'], [/genos\s?l|\blb\s?\d+|\blu\s?\d+|\bl\d{3,4}\b|space\s?turn/, 'lathe'], [/\bmu-?\d+|\bmu\s?\d/, '5ax'], [/\bma-?\d+h|\bmb-?\d+h|\bmah\b/, 'hmc'], [/multus/, 'turnmill']] },
  { id: 'haas', name: 'Haas', re: /\bhaas\b/, type: 'vmc', ctl: 'haas', accent: '#b5201c',
    models: [[/\bvf-?\d+|\bminimill|\bdm-?\d|\bdt-?\d|\btm-?\d|\bvm-?\d/, 'vmc'], [/\bumc-?\d+/, '5ax'], [/\bec-?\d+/, 'hmc'], [/\bst-?\d+|\bds-?\d+|\btl-?\d/, 'lathe']] },
  { id: 'makino', name: 'Makino', re: /makino/, type: 'hmc', ctl: 'makino', accent: '#21409a',
    models: [[/\ba\s?\d{2}\s?nx|\ba\d{2}\b|\ba[0-9]+nx/, 'hmc'], [/\bd\s?\d{3}|\bda\s?\d{3}|\bv\s?\d{2}/, '5ax'], [/\bps\s?\d{2}|\bf\s?\d{1,2}\b|\bu\s?\d/, 'vmc']] },
  { id: 'matsuura', name: 'Matsuura', re: /matsuura/, type: '5ax', ctl: 'matsuura', accent: '#1f6fb2', models: [[/\bmam72|\bmx-?\d+|\bcublex/, '5ax'], [/\bh\.plus|\bmam\b/, 'hmc'], [/\bvx-?\d+/, 'vmc']] },
  { id: 'grob', name: 'GROB', re: /\bgrob\b/, type: '5ax', ctl: 'siemens', accent: '#c41e2a', models: [[/\bg\s?\d{3}|\bg\d{3}/, '5ax'], [/\bgmode\b/, 'turnmill']] },
  { id: 'chiron', name: 'CHIRON', re: /chiron/, type: 'vmc', ctl: 'siemens', accent: '#0f5aa6', models: [[/\bfz\s?\d+|\bdz\s?\d+|\bmill\s?\d+/, 'vmc'], [/\bfz\s?\d+\s?5x|\b5x\b/, '5ax']] },
  { id: 'heller', name: 'HELLER', re: /heller/, type: 'hmc', ctl: 'siemens', accent: '#003b70', models: [[/\bh\s?\d{4}|\bf\s?\d{4}|\bhf\s?\d{4}/, 'hmc'], [/\bc\s?\d{4}/, '5ax']] },
  { id: 'index', name: 'INDEX', re: /\bindex\b/, type: 'turnmill', ctl: 'siemens', accent: '#004f9f', models: [[/\bg\s?\d{3}|\bc\s?\d{3}|\br\s?\d{3}|\bmc\s?\d{3}/, 'turnmill'], [/\bms\s?\d{2}|\bmultiline|\bms\d{2}/, 'lathe'], [/\bb\s?\d{3}/, 'lathe']] },
  { id: 'traub', name: 'TRAUB', re: /traub/, type: 'swiss', ctl: 'siemens', accent: '#00508f', models: [[/\btnl\s?\d+|\btnk/, 'swiss'], [/\btnx\s?\d+|\btna\s?\d+/, 'lathe']] },
  { id: 'citizen', name: 'Citizen', re: /citizen|cincom|miyano/, type: 'swiss', ctl: 'mitsubishi', accent: '#00468c', models: [[/\bl\s?\d{2}|\bm\s?\d{2}|\bk\s?\d{2}|\ba\s?\d{2}|cincom/, 'swiss'], [/miyano|\bbnx|\bbnd|\bbne/, 'lathe']] },
  { id: 'star', name: 'Star', re: /star\s?micronics|\bstar\s+s[rbxw]-?\d/, type: 'swiss', ctl: 'fanuc', accent: '#0065b3', models: [[/\bsr-?\d+|\bsb-?\d+|\bsx-?\d+|\bsw-?\d+/, 'swiss']] },
  { id: 'tornos', name: 'Tornos', re: /\btornos(?=\s+(swiss|gt|st|dt|evodeco|multiswiss|multisigma|sigma|deco|sa\b))/, type: 'swiss', ctl: 'fanuc', accent: '#0f2d69', models: [[/swiss\s?(gt|st|dt|nano)|\bevodeco|\bmultiswiss/, 'swiss']] },
  { id: 'nakamura', name: 'Nakamura-Tome', re: /nakamura/, type: 'turnmill', ctl: 'fanuc', accent: '#004b8d', models: [[/\bntj|\bntx|\bwt-?\d+|\bntrx|\bsuper\s?ntj/, 'turnmill'], [/\bsc-?\d+|\bas-?\d+/, 'lathe']] },
  { id: 'emco', name: 'EMCO', re: /\bemco\b/, type: 'lathe', ctl: 'siemens', accent: '#d71920', models: [[/hyperturn|maxxturn|\bemcoturn/, 'lathe'], [/\bumill|\bmmv|\bmaxxmill|\bemcomill/, 'vmc']] },
  { id: 'spinner', name: 'SPINNER', re: /spinner/, type: 'lathe', ctl: 'siemens', accent: '#c8102e', models: [[/\btc\s?\d+|\btts|\bpd\s?\d+/, 'lathe'], [/\bu5|\bu\s?5-?\d+/, '5ax'], [/\bvc\s?\d+|\bmvc/, 'vmc']] },
  { id: 'doosan', name: 'DN Solutions', re: /doosan|dn\s?solutions/, type: 'vmc', ctl: 'fanuc', accent: '#0a5aa8', models: [[/\bpuma\b|\blynx\b|\bsmx\b/, 'lathe'], [/\bdnm\b|\bdvf\b|\bmynx\b/, 'vmc'], [/\bnhp\b|\bhc\s?\d+/, 'hmc']] },
  { id: 'hurco', name: 'Hurco', re: /hurco/, type: 'vmc', ctl: 'hurco', accent: '#003a70', models: [[/\bvm\s?\d+|\bvmx\s?\d+/, 'vmc'], [/\bvmx\s?\d+\s?u|\bvc\s?\d+\s?u/, '5ax'], [/\bts\s?\d|\btm\s?\d/, 'lathe']] },
  { id: 'brother', name: 'Brother', re: /\bbrother\b|speedio/, type: 'vmc', ctl: 'brother', accent: '#1a3c7a', models: [[/speedio|\bs\s?\d{3}x\d|\bm\s?\d{3}x\d/, 'vmc']] },
  { id: 'fanucrobo', name: 'FANUC', re: /robodrill/, type: 'vmc', ctl: 'fanuc', accent: '#f2c500', models: [[/robodrill/, 'vmc']] },
  { id: 'kern', name: 'KERN', re: /\bkern\b/, type: '5ax', ctl: 'heidenhain', accent: '#3c3c3c', models: [[/micro|pyramid|evo/, '5ax']] },
  { id: 'fehlmann', name: 'Fehlmann', re: /fehlmann/, type: '5ax', ctl: 'heidenhain', accent: '#d40f14', models: [[/versa/, '5ax'], [/picomax/, 'vmc']] },
  { id: 'starrag', name: 'Starrag', re: /starrag|heckert|bumotec/, type: '5ax', ctl: 'siemens', accent: '#00447c', models: [[/\bstc\b|\bhec\b|\blx\b|\bzt\b/, '5ax'], [/bumotec/, 'turnmill']] },
  { id: 'willemin', name: 'Willemin-Macodel', re: /willemin|macodel/, type: 'turnmill', ctl: 'fanuc', accent: '#c4161c', models: [[/\b\d{3}\b/, 'turnmill']] },
  { id: 'kitamura', name: 'Kitamura', re: /kitamura/, type: 'vmc', ctl: 'fanuc', accent: '#004c97', models: [[/mycenter\s?hx|\bhx\d+/, 'hmc'], [/mycenter|\bmedcenter/, 'vmc']] },
  { id: 'yasda', name: 'YASDA', re: /yasda/, type: '5ax', ctl: 'fanuc', accent: '#003f87', models: [[/\bytl|\bymc|\bpx/, '5ax']] },
  { id: 'quaser', name: 'Quaser', re: /quaser/, type: 'vmc', ctl: 'heidenhain', accent: '#d0021b', models: [[/\bux\s?\d+|\bur\s?\d+/, '5ax'], [/\bmv\s?\d+|\bmf\s?\d+/, 'vmc']] },
  { id: 'hyundai', name: 'Hyundai WIA', re: /hyundai|\bwia\b/, type: 'lathe', ctl: 'fanuc', accent: '#002c5f', models: [[/\bl\s?\d{3}|\bhd\s?\d+/, 'lathe'], [/\bkf\s?\d+|\bf\s?\d{3}/, 'vmc'], [/\bkh\s?\d+/, 'hmc']] },
  { id: 'liebherr', name: 'Liebherr', re: /liebherr/, type: 'grinder', ctl: 'siemens', accent: '#f6c300', models: [[/\blc\s?\d+|\blgg\b/, 'grinder']] },
  { id: 'emag', name: 'EMAG', re: /\bemag\b/, type: 'lathe', ctl: 'siemens', accent: '#003b7a', models: [[/\bvl\s?\d+|\bvsc\s?\d+|\bvt\s?\d+/, 'lathe']] },
  { id: 'walter', name: 'WALTER', re: /\bwalter\b(?=.*(helitronic|schleif|vision))|helitronic/, type: 'grinder', ctl: 'fanuc', accent: '#004a99', models: [[/helitronic/, 'grinder']] },
  { id: 'anca', name: 'ANCA', re: /\banca\b/, type: 'grinder', ctl: 'other', accent: '#00a3e0', models: [[/\bmx\d|\bfx\d|\bgx\d|\btx\d/, 'grinder']] },
  { id: 'vollmer', name: 'VOLLMER', re: /vollmer/, type: 'grinder', ctl: 'other', accent: '#e30613', models: [[/\bvgrind|\bvhybrid/, 'grinder']] },
  { id: 'schutte', name: 'SCHÜTTE', re: /sch(ü|ue|u)tte/, type: 'grinder', ctl: 'other', accent: '#004f9f', models: [[/\b\d{3}\s?linear|\bwu\s?\d+/, 'grinder']] },
  { id: 'rollomatic', name: 'Rollomatic', re: /rollomatic/, type: 'grinder', ctl: 'fanuc', accent: '#c00d1e', models: [[/grindsmart|\bshapesmart/, 'grinder']] },
  { id: 'gfms', name: 'GF Machining Solutions', re: /\bgf\b|mikron|agie|charmilles|machining\s?solutions/, type: '5ax', ctl: 'heidenhain', accent: '#00aab4', models: [[/\bmill\s?[ps]\s?\d+|\bhsm\s?\d+|\bmikron/, '5ax']] },
  { id: 'feeler', name: 'Feeler', re: /feeler/, type: 'vmc', ctl: 'fanuc', accent: '#00599c', models: [] },
  { id: 'leadwell', name: 'Leadwell', re: /leadwell/, type: 'vmc', ctl: 'fanuc', accent: '#00599c', models: [] },
  { id: 'kovosvit', name: 'Kovosvit MAS', re: /kovosvit|\bmas\b/, type: 'vmc', ctl: 'heidenhain', accent: '#004b93', models: [[/\bmcv\b|\bmcu\b/, 'vmc'], [/\bmcu\s?\d+\s?vt|\bmcu\s?\d+\s?5x/, '5ax'], [/\bsp\s?\d+|\bmultiax/, 'lathe']] },
  { id: 'weiler', name: 'WEILER', re: /\bweiler\b/, type: 'lathe', ctl: 'siemens', accent: '#00529b', models: [[/\be\s?\d{2}|\bv\s?\d{2}|\bdz\b/, 'lathe']] },
  { id: 'hwacheon', name: 'Hwacheon', re: /hwacheon/, type: 'lathe', ctl: 'fanuc', accent: '#003876', models: [[/\bhi-?tech|\bcutex/, 'lathe'], [/\bvesta|\bsirius|\bd2-?5ax/, 'vmc']] },
  { id: 'zayer', name: 'ZAYER', re: /zayer/, type: 'hmc', ctl: 'heidenhain', accent: '#004a8f', models: [] },
  { id: 'ibarmia', name: 'IBARMIA', re: /ibarmia/, type: '5ax', ctl: 'heidenhain', accent: '#d0021b', models: [] },
  { id: 'soraluce', name: 'SORALUCE', re: /soraluce/, type: 'hmc', ctl: 'heidenhain', accent: '#004c97', models: [] },
];

// ------------------------------------------------------------------ Branchen
export const INDUSTRIES = ['job', 'auto', 'aero', 'medical', 'mold', 'machinery', 'energy', 'toolmaker', 'precision'];

// ------------------------------------------------------------------ Prozessschritte im Werkzeugkreislauf
export const STEPS = ['store', 'assemble', 'shrink', 'balance', 'measure', 'supply', 'identify', 'inspect', 'software'];

// ------------------------------------------------------------------ ZOLLER-Produkte des Planers
// cad: Modell aus docs/models; img: freigestelltes Foto (docs/img/p) mit Höhe h (m) für Produkte ohne CAD;
// path: Seite der ZOLLER Webseite; showroom: Produkt-ID im 3D-Showroom; foot: Grundfläche B × T (m) für die Hallenplanung
export const PRODUCTS = {
  smile:          { step: 'measure', cad: 'smile', img: 'smile', path: '/produkte/einstellen-messen/vertikale-geraete/smile', showroom: 'smile', foot: [1.9, 0.95], cap: 70 },
  venturion:      { step: 'measure', cad: 'venturion', img: 'venturion', path: '/produkte/einstellen-messen/vertikale-geraete/venturion', showroom: 'venturion', foot: [2.35, 1.0], cap: 95 },
  venturion600:   { step: 'measure', cad: 'venturion600', img: 'venturion', path: '/produkte/einstellen-messen/vertikale-geraete/venturion', showroom: 'venturion', foot: [2.3, 1.0], cap: 90 },
  venturion800:   { step: 'measure', cad: 'venturion800', img: 'venturion', path: '/produkte/einstellen-messen/vertikale-geraete/venturion', showroom: 'venturion', foot: [2.65, 1.0], cap: 85 },
  hyperion:       { step: 'measure', img: 'hyperion', h: 1.75, path: '/produkte/einstellen-messen/horizontale-geraete/hyperion', showroom: 'hyperion', foot: [2.2, 1.1], cap: 90 },
  redomatic:      { step: 'shrink', cad: 'redomatic600', img: 'redomatic', path: '/produkte/schrumpftechnik/redomatic', showroom: 'redomatic', foot: [3.6, 1.95], cap: 120 },
  powershrink:    { step: 'shrink', cad: 'powershrink400', img: 'powershrink', path: '/produkte/schrumpftechnik/powershrink/modelle/powershrink-400', showroom: 'powershrink', foot: [1.1, 0.7] },
  toolbalancer:   { step: 'balance', cad: 'toolbalancer', img: 'toolbalancer', path: '/produkte/wuchttechnik/toolbalancer', showroom: 'toolbalancer', foot: [1.6, 2.05] },
  keeper:         { step: 'store', cad: 'keeper', img: 'keeper', path: '/produkte/toolmanagement/werkzeuglager/keeper', showroom: 'keeper', foot: [1.85, 1.55], cap: 420 },
  toolorganizer:  { step: 'store', cad: 'toolorganizer', img: 'toolorganizer', path: '/produkte/toolmanagement/werkzeuglager/toolorganizer', showroom: 'toolorganizer', foot: [0.85, 0.85] },
  twister:        { step: 'store', img: 'twister', h: 1.95, path: '/produkte/toolmanagement/werkzeuglager/twister', showroom: 'twister', foot: [1.6, 1.6] },
  autolock:       { step: 'store', img: 'autolock', h: 1.95, path: '/produkte/toolmanagement/werkzeuglager/autolock', showroom: 'autolock', foot: [1.1, 0.8] },
  toolstation:    { step: 'assemble', cad: 'toolstation', img: 'toolstation', path: '/produkte/toolmanagement/smart-cabinets/toolstation', showroom: 'toolstation', foot: [2.5, 0.9] },
  ztower:         { step: 'assemble', img: 'ztower', h: 2.0, path: '/produkte/toolmanagement/smart-cabinets/ztower', showroom: 'ztower', foot: [1.6, 1.4] },
  zidcode:        { step: 'identify', cad: 'zidcode', img: 'zidcode', path: '/produkte/toolmanagement/zidcode', showroom: 'zidcode', foot: [0.45, 0.5], perMachine: true },
  zidcode40:      { step: 'identify', cad: 'zidcode', img: 'zidcode', path: '/produkte/toolmanagement/zidcode/zidcode-40', showroom: 'zidcode', foot: [0.45, 0.5], perMachine: true },
  idchip:         { step: 'identify', img: 'idchip', h: .5, path: '/produkte/werkzeugaufnahmen/idchip', showroom: 'idchip', virtual: true },
  toolcart:       { step: 'supply', img: 'toolcart', h: 1.45, path: '/produkte/toolmanagement/smart-cabinets/toolcart', showroom: 'toolcart', foot: [1.3, 0.75] },
  loadbox:        { step: 'supply', img: 'loadbox', h: 2.1, path: '/produkte/automation/werkzeugbereitstellung/loadbox', showroom: 'loadbox', foot: [3.2, 2.4] },
  coramachineload:{ step: 'supply', img: 'coramachineload', h: 2.1, path: '/produkte/automation/werkzeuglogistik/coramachineload', showroom: 'coramachineload', foot: [2.6, 1.6], atMachine: true },
  robobox:        { step: 'measure', img: 'robobox', h: 2.25, path: '/produkte/automation/werkzeugvorbereitung/robobox', showroom: 'robobox', foot: [4.2, 2.6], cap: 480 },
  'roboset-2':    { step: 'inspect', img: 'roboset-2', h: 2.1, path: '/produkte/automation/werkzeuginspektion/roboset-2', showroom: 'roboset-2', foot: [2.6, 2.2] },
  genius:         { step: 'inspect', img: 'genius', h: 2.0, path: '/produkte/pruefen-messen/universal-messmaschinen/genius', showroom: 'genius', foot: [1.3, 1.3] },
  smartcheck:     { step: 'inspect', img: 'smartcheck', h: 1.9, path: '/produkte/pruefen-messen/universal-messmaschinen/smartcheck', showroom: 'smartcheck', foot: [2.0, 1.1] },
  pombasic:       { step: 'inspect', img: 'pombasic', h: .72, path: '/produkte/pruefen-messen/prozessorientiertes-messen/pombasic', showroom: 'pombasic', foot: [1.2, 0.8], table: true },
  'tms-starter':  { step: 'software', img: 'tms-core', soft: true, path: '/produkte/toolmanagement/tms-tool-management-solutions/softwarepakete/starter-lagerverwaltung', showroom: 'tms-starter' },
  'tms-silver':   { step: 'software', img: 'tms-core', soft: true, path: '/produkte/toolmanagement/tms-tool-management-solutions/softwarepakete/silver-betriebsorganisation', showroom: 'tms-silver' },
  'tms-gold':     { step: 'software', img: 'tms-core', soft: true, path: '/produkte/toolmanagement/tms-tool-management-solutions/softwarepakete/gold-shopfloormanagement', showroom: 'tms-gold' },
  zshopfloor:     { step: 'software', img: 'zshopfloor', soft: true, path: '/produkte/toolmanagement/software/add-on-zshopfloor', showroom: 'zshopfloor' },
  zcam:           { step: 'software', img: 'zcam-integration', soft: true, path: '/produkte/toolmanagement/software/add-on-zcam-integration', showroom: 'zcam-integration' },
  zconnectivity:  { step: 'software', img: 'zconnectivity', soft: true, path: '/produkte/toolmanagement/software/add-on-zconnectivity', showroom: 'zconnectivity' },
};

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
  robobox:   { path: '/produkte/automation/werkzeugvorbereitung/robobox/faq' },
  redo10:    { path: '/produkte/schrumpftechnik/redomatic/faq' },
  runout3:   { path: '/solutions/werkzeugaufnahmen' },
  tb04:      { path: '/produkte/wuchttechnik/toolbalancer' },
  ps27:      { path: '/produkte/schrumpftechnik/powershrink/faq' },
  keeper420: { path: '/produkte/toolmanagement/werkzeuglager/keeper/konfiguration' },
  roboset:   { path: '/unternehmen/reports-stories/detail/wirtschaftlich-in-serien-messen-mit-roboset-2' },
  hyp20:     { path: '/produkte/einstellen-messen/horizontale-geraete/hyperion' },
};

// Akzentfarbe → bei unbekannter Marke neutral
export const NEUTRAL_ACCENT = '#3a3f45';

export function brandById(id) { return BRANDS.find(b => b.id === id) || null; }
export function brandByName(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  return BRANDS.find(b => b.name.toLowerCase() === n) || BRANDS.find(b => b.re.test(n)) || null;
}
