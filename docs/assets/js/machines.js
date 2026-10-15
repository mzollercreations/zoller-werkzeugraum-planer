// Prozedurale CNC-Maschinen des Kunden (kein Hersteller-CAD nötig). Ursprung = Mitte der Grundfläche auf dem Boden,
// Bedienseite zeigt nach +Z. Jede Maschinenart hat ihre typische Bauform (Türen, Fenster mit Arbeitsraum, Magazin,
// Späneförderer, Schaltschrank, Bedienpult); Farben und Schriftzug folgen der Farbwelt des Herstellers (ohne Logos).
// Jede Maschine hat eine Signalsäule (userData.andon) und einen Steuerungsbildschirm (userData.screen), die der Planer
// je nach Ansicht (heute / mit ZOLLER) umschaltet.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// ------------------------------------------------------------------ Farbwelten der Hersteller (Lack, Unterbau, Zierleiste, Schrift)
const STYLES = {
  dmgmori:  { body: '#eceeef', door: '#2b2e33', lower: '#2b2e33', trim: '#1b1d20', text: '#1b1d20', panel: 'tall', doorDark: true },
  hermle:   { body: '#d9dde0', door: '#d9dde0', lower: '#5b6268', trim: '#5b6268', text: '#3d4247', panel: 'arm' },
  haas:     { body: '#c9ccce', door: '#c9ccce', lower: '#2a2c2e', trim: '#b5201c', text: '#b5201c', panel: 'pendant' },
  mazak:    { body: '#f0f1f1', door: '#f0f1f1', lower: '#465564', trim: '#2e5f8a', text: '#2e5f8a', panel: 'integrated' },
  okuma:    { body: '#f1f0ea', door: '#f1f0ea', lower: '#3a3f3c', trim: '#2d7a4f', text: '#2d7a4f', panel: 'integrated' },
  makino:   { body: '#e3e6e9', door: '#e3e6e9', lower: '#26375f', trim: '#21409a', text: '#21409a', panel: 'arm' },
  matsuura: { body: '#e8ebee', door: '#e8ebee', lower: '#2e3a48', trim: '#1f6fb2', text: '#1f6fb2', panel: 'arm' },
  grob:     { body: '#dfe2e4', door: '#2b2e32', lower: '#2b2e32', trim: '#c41e2a', text: '#c41e2a', panel: 'tall', doorDark: true },
  chiron:   { body: '#e9ecee', door: '#e9ecee', lower: '#30363c', trim: '#0f5aa6', text: '#0f5aa6', panel: 'arm' },
  heller:   { body: '#e2e5e7', door: '#e2e5e7', lower: '#2c3640', trim: '#003b70', text: '#003b70', panel: 'integrated' },
  index:    { body: '#e6e9eb', door: '#e6e9eb', lower: '#37404a', trim: '#004f9f', text: '#004f9f', panel: 'integrated' },
  traub:    { body: '#e6e9eb', door: '#e6e9eb', lower: '#37404a', trim: '#00508f', text: '#00508f', panel: 'integrated' },
  citizen:  { body: '#eef0f1', door: '#eef0f1', lower: '#3b4652', trim: '#00468c', text: '#00468c', panel: 'integrated' },
  star:     { body: '#eef0f1', door: '#eef0f1', lower: '#3b4652', trim: '#0065b3', text: '#0065b3', panel: 'integrated' },
  doosan:   { body: '#eef0f2', door: '#eef0f2', lower: '#2f3842', trim: '#0a5aa8', text: '#0a5aa8', panel: 'integrated' },
  brother:  { body: '#e9ebed', door: '#e9ebed', lower: '#2f3640', trim: '#1a3c7a', text: '#1a3c7a', panel: 'integrated' },
  spinner:  { body: '#eef0f1', door: '#eef0f1', lower: '#33383d', trim: '#c8102e', text: '#c8102e', panel: 'arm' },
  emco:     { body: '#eef0f1', door: '#eef0f1', lower: '#33383d', trim: '#d71920', text: '#d71920', panel: 'integrated' },
  liebherr: { body: '#e2e4e5', door: '#e2e4e5', lower: '#4a4f54', trim: '#f6c300', text: '#3a3f44', panel: 'arm' },
  fanucrobo:{ body: '#efe9c6', door: '#efe9c6', lower: '#3a3a36', trim: '#f2c500', text: '#3a3a36', panel: 'integrated' },
  kern:     { body: '#e4e6e8', door: '#e4e6e8', lower: '#3c3c3c', trim: '#3c3c3c', text: '#3c3c3c', panel: 'arm' },
  starrag:  { body: '#e3e6e9', door: '#e3e6e9', lower: '#2b3a4b', trim: '#00447c', text: '#00447c', panel: 'pendant' },
};
const DEFAULT_STYLE = { body: '#e4e7e9', door: '#e4e7e9', lower: '#33383d', trim: null, text: null, panel: 'arm' };

// Materialklassen als Vertex-Attribute: Farbe (color) + Rauheit, Metall, Klarlack, Klarlack-Rauheit (rmc)
export function packAttrs(gm, v) {
  const n = gm.attributes.position.count, col = new Float32Array(n * 3), rmc = new Float32Array(n * 4);
  const c = new THREE.Color(v.color), r4 = [v.roughness ?? .5, v.metalness || 0, v.clearcoat || 0, v.clearcoatRoughness || 0];
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; rmc[i * 4] = r4[0]; rmc[i * 4 + 1] = r4[1]; rmc[i * 4 + 2] = r4[2]; rmc[i * 4 + 3] = r4[3]; }
  gm.setAttribute('color', new THREE.BufferAttribute(col, 3)); gm.setAttribute('rmc', new THREE.BufferAttribute(rmc, 4));
  return gm;
}
const PACK = new Map();
// Material, das Farbe/Rauheit/Metall/Klarlack aus den Vertex-Attributen liest ('cc': mit Klarlack-Schicht)
export function packMat(k, side = THREE.FrontSide) {
  const key = k + side;
  if (PACK.has(key)) return PACK.get(key);
  const m = k === 'cc' ? new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoat: 1, side }) : new THREE.MeshStandardMaterial({ vertexColors: true, side });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 rmc;\nvarying vec4 vRmc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRmc = rmc;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vRmc;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRmc.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRmc.y;')
      .replace('#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment
        .replace('material.clearcoat = clearcoat;', 'material.clearcoat = vRmc.z;')
        .replace('material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = vRmc.w;'));
  };
  m.customProgramCacheKey = () => 'zc-pack-' + k;
  m.userData.pack = k;
  PACK.set(key, m);
  return m;
}
// gebündeltes Mesh (packMat) für den Export wieder je Farbe/Oberfläche aufteilen – GLB und USDZ kennen keine
// Oberflächenwerte je Vertex. Je Geometrie nur einmal: Kopien (gleiches Gerät mehrfach) teilen Geometrie und Material,
// indizierte Teile teilen sich sogar Punkte und Normalen (nur der Index wird aufgeteilt). Liefert Meshes ohne eigene Lage.
const UNPACK = new WeakMap();
export function unpackMesh(mesh) {
  const g = mesh.geometry;
  if (!UNPACK.has(g)) {
    const idx = g.index ? g.index.array : null, col = g.attributes.color.array, rmc = g.attributes.rmc.array;
    const n = (idx ? idx.length : g.attributes.position.count) / 3, groups = new Map();
    for (let t = 0; t < n; t++) {
      const v = idx ? idx[t * 3] : t * 3;
      const k = [col[v * 3], col[v * 3 + 1], col[v * 3 + 2], rmc[v * 4], rmc[v * 4 + 1], rmc[v * 4 + 2], rmc[v * 4 + 3]].map(x => x.toFixed(4)).join();
      let a = groups.get(k); if (!a) groups.set(k, a = []); a.push(t);
    }
    const parts = [];
    for (const [k, ts] of groups) {
      const [r, gg, b, ro, me, cc, ccr] = k.split(',').map(Number);
      const geo = new THREE.BufferGeometry();
      if (idx) {
        geo.setAttribute('position', g.attributes.position); geo.setAttribute('normal', g.attributes.normal);
        const I = new Uint32Array(ts.length * 3); ts.forEach((t, i) => I.set(idx.subarray(t * 3, t * 3 + 3), i * 3)); geo.setIndex(new THREE.BufferAttribute(I, 1));
      } else {
        const pos = g.attributes.position.array, nrm = g.attributes.normal.array, P = new Float32Array(ts.length * 9), N = new Float32Array(ts.length * 9);
        ts.forEach((t, i) => { P.set(pos.subarray(t * 9, t * 9 + 9), i * 9); N.set(nrm.subarray(t * 9, t * 9 + 9), i * 9); });
        geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      }
      const o = { color: new THREE.Color(r, gg, b), roughness: ro, metalness: me, side: mesh.material.side };
      parts.push([geo, cc ? new THREE.MeshPhysicalMaterial({ ...o, clearcoat: cc, clearcoatRoughness: ccr }) : new THREE.MeshStandardMaterial(o)]);
    }
    UNPACK.set(g, parts);
  }
  return UNPACK.get(g).map(([geo, mat]) => new THREE.Mesh(geo, mat));
}

// ------------------------------------------------------------------ Materialien (je Farbe einmal)
const M = {};
const cache = new Map();
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
function mats() {
  if (M.dark) return M;
  M.dark = phys({ color: 0x2b2e32, roughness: .5, clearcoat: .15 });
  M.black = phys({ color: 0x141517, roughness: .4, clearcoat: .3 });
  M.base = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: .75 });
  M.cavity = new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: .6, metalness: .2 });
  M.cavityDark = new THREE.MeshStandardMaterial({ color: 0x2f3439, roughness: .7, metalness: .1 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xb5bbbf, roughness: .28, metalness: .9 });
  M.steelDark = new THREE.MeshStandardMaterial({ color: 0x6d757b, roughness: .35, metalness: .85 });
  M.glass = phys({ color: 0x9fb2be, roughness: .08, metalness: 0, transparent: true, opacity: .16, envMapIntensity: .45, depthWrite: false });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: .9 });
  M.cable = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: .8 });
  M.chips = new THREE.MeshStandardMaterial({ color: 0x8f969b, roughness: .5, metalness: .7 });
  M.warn = new THREE.MeshStandardMaterial({ color: 0xf0c400, roughness: .45 });
  M.andonOff = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: .3, transparent: true, opacity: .85 });
  M.green = new THREE.MeshStandardMaterial({ color: 0x1f9d55, emissive: 0x22c55e, emissiveIntensity: 2.2, roughness: .3 });
  M.amber = new THREE.MeshStandardMaterial({ color: 0xc58a00, emissive: 0xffb000, emissiveIntensity: 2.2, roughness: .3 });
  M.red = new THREE.MeshStandardMaterial({ color: 0xa31515, emissive: 0xff2b2b, emissiveIntensity: 2.0, roughness: .3 });
  return M;
}
function paint(hex, o = {}) {
  const k = hex + JSON.stringify(o);
  if (!cache.has(k)) cache.set(k, phys({ color: new THREE.Color(hex), roughness: .36, clearcoat: .35, clearcoatRoughness: .22, ...o }));
  return cache.get(k);
}

// ------------------------------------------------------------------ Geometrie-Helfer
const rboxCache = new Map();
// abgerundeter Quader (senkrechte Kanten rund), Ursprung unten mittig
export function rbox(w, h, d, r = .08) {
  const k = [w, h, d, r].map(v => v.toFixed(3)).join();
  if (rboxCache.has(k)) return rboxCache.get(k);
  r = Math.min(r, w / 2 - .001, d / 2 - .001);
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  rboxCache.set(k, g);
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 24) => new THREE.CylinderGeometry(r0, r1, h, n);
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
// Quader mit Mittelpunkt (x, y, z)
const B = (p, mat, w, h, d, x, y, z) => mesh(box(w, h, d), mat, x, y, z, p);

// ------------------------------------------------------------------ Texturen (Canvas)
const screenCache = new Map();
export function screenTexture(controlName, state, lang = 'de') {
  const k = controlName + '|' + state + '|' + lang;
  if (screenCache.has(k)) return screenCache.get(k);
  const c = document.createElement('canvas'); c.width = 512; c.height = 384;
  const g = c.getContext('2d', { willReadFrequently: true }); g.scale(2, 2);
  const grd = g.createLinearGradient(0, 0, 0, 192); grd.addColorStop(0, '#1d2a36'); grd.addColorStop(1, '#0d141b');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#2e4456'; g.fillRect(0, 0, 256, 22);
  g.fillStyle = '#cfe3f2'; g.font = '600 11px Helvetica, Arial'; g.fillText(controlName || 'CNC', 8, 15);
  g.font = '10px Helvetica, Arial';
  const axes = [['X', '-124.882'], ['Y', '38.410'], ['Z', '212.005']];
  axes.forEach(([a, v], i) => { g.fillStyle = '#8fb2cc'; g.fillText(a, 10, 44 + i * 18); g.fillStyle = '#e6f2fb'; g.font = '600 12px Menlo, monospace'; g.fillText(v, 30, 44 + i * 18); g.font = '10px Helvetica, Arial'; });
  g.fillStyle = '#16212b'; g.fillRect(132, 30, 116, 72);
  g.fillStyle = '#8fb2cc'; g.fillText('T12   L / R', 140, 46);
  if (state === 'after') {
    g.fillStyle = '#e6f2fb'; g.font = '600 12px Menlo, monospace'; g.fillText('152.734', 140, 64); g.fillText('  5.002', 140, 80);
    g.fillStyle = '#22c55e'; g.beginPath(); g.arc(232, 72, 9, 0, 7); g.fill();
    g.strokeStyle = '#0d141b'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(227, 72); g.lineTo(231, 76); g.lineTo(238, 67); g.stroke();
    g.fillStyle = '#9fe6b8'; g.font = '10px Helvetica, Arial'; g.fillText(lang === 'de' ? 'Daten übernommen' : 'Data received', 140, 96);
  } else {
    g.fillStyle = '#e6f2fb'; g.font = '600 12px Menlo, monospace'; g.fillText('15_.7', 140, 64); g.fillStyle = '#ffb000'; g.fillRect(180, 54, 7, 12);
    g.fillStyle = '#ffcf66'; g.font = '10px Helvetica, Arial'; g.fillText(lang === 'de' ? 'Eingabe …' : 'Input …', 140, 96);
  }
  g.fillStyle = '#22313d'; for (let i = 0; i < 6; i++) g.fillRect(8 + i * 41, 166, 37, 18);
  g.fillStyle = '#2b4a63'; g.fillRect(8, 112, 240, 44);
  g.fillStyle = '#7fa6c3'; for (let i = 0; i < 4; i++) g.fillRect(14, 120 + i * 9, 40 + ((i * 53) % 150), 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  screenCache.set(k, t);
  return t;
}
// Schriftzug des Herstellers (nur Text, kein Logo) – transparent, in der Farbe der Marke
const letterCache = new Map();
function lettering(text, color, bg) {
  const k = text + color + bg;
  if (letterCache.has(k)) return letterCache.get(k);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 1024, 128); }
  g.fillStyle = color; g.font = '800 92px "T-Star", Helvetica, Arial'; g.textBaseline = 'middle';
  const w = Math.min(1000, g.measureText(text).width);
  g.fillText(text, (1024 - w) / 2, 68, 1000);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData = { w: w / 1024 };
  letterCache.set(k, t);
  return t;
}
function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#16181b'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#f2f4f5'; g.font = '600 30px "T-Star", Helvetica, Arial'; g.textBaseline = 'middle';
  const w = Math.min(480, g.measureText(text).width);
  g.fillText(text, (512 - w) / 2, 34, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ Baugruppen
function andon(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  mesh(cyl(.012, .012, .22, 8), M.steel, 0, .11, 0, g);
  const segs = [];
  [0, 1, 2].forEach((i) => {
    const s = mesh(cyl(.045, .045, .07, 16), M.andonOff, 0, .52 - i * .075, 0, g);
    s.castShadow = false; s.userData.keep = true; segs.push(s);
  });
  mesh(cyl(.03, .045, .03, 16), M.dark, 0, .58, 0, g);
  return segs;     // [rot, gelb, grün]
}
// Bedienpult: 'arm' (schwenkbar am Arm), 'pendant' (hängend), 'tall' (hohes Touch-Pult), 'integrated' (in der Front)
function controlPanel(parent, kind, x, y, z, rotY, ctl, lang, frame) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g);
  let sw = .42, sh = .315, tilt = -.12;
  if (kind === 'tall') {
    sw = .36; sh = .48; tilt = -.05;
    B(g, frame, .5, 1.1, .12, 0, .05, 0);
    B(g, M.base, .44, .2, .03, 0, -.33, .065).rotation.x = -.12;
  } else if (kind === 'pendant') {
    B(g, M.steelDark, .06, .6, .06, 0, .62, -.12);
    B(g, frame, .58, .72, .12, 0, .05, 0);
    B(g, M.base, .48, .17, .03, 0, -.2, .062);
  } else if (kind === 'integrated') {
    B(g, frame, .56, .9, .1, 0, .05, 0); tilt = -.08;
    B(g, M.base, .46, .2, .03, 0, -.25, .052);
  } else {
    B(g, M.steelDark, .06, .5, .06, 0, -.25, -.1);
    const body = B(g, frame, .56, .7, .1, 0, .2, 0); body.rotation.x = -.12;
    B(g, M.base, .46, .18, .02, 0, -.02, .058).rotation.x = -.12;
  }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: screenTexture(ctl, 'before', lang), toneMapped: false }));
  const sy = kind === 'tall' ? .28 : kind === 'pendant' ? .2 : kind === 'integrated' ? .2 : .3;
  scr.position.set(0, sy, kind === 'tall' ? .062 : .052 + (kind === 'arm' ? .004 : 0)); scr.rotation.x = tilt; scr.userData.keep = true; g.add(scr);
  return scr;
}
// Fenster mit Einblick in den Arbeitsraum: Rückwand an der Front, Laibung so tief wie die Tür, Glas vorn bündig
function windowWithInterior(parent, cx, cy, fz, w, h, kind, frameMat, depth = .24) {
  B(parent, M.cavityDark, w + .04, h + .04, .02, cx, cy, fz + .01);
  B(parent, frameMat, w + .1, .05, depth, cx, cy + h / 2 + .025, fz + depth / 2);
  B(parent, frameMat, w + .1, .05, depth, cx, cy - h / 2 - .025, fz + depth / 2);
  B(parent, frameMat, .05, h, depth, cx - w / 2 - .025, cy, fz + depth / 2);
  B(parent, frameMat, .05, h, depth, cx + w / 2 + .025, cy, fz + depth / 2);
  const z = fz + depth * .45, r = depth * .34;
  if (kind === 'mill' || kind === '5ax' || kind === 'hmc') {
    mesh(cyl(r * .8, r, h * .3), M.steelDark, cx + w * .06, cy + h * .28, z, parent);              // Spindelkopf
    mesh(cyl(r * .4, r * .25, h * .09), M.steel, cx + w * .06, cy + h * .085, z, parent);          // Aufnahme
    mesh(cyl(.012, .012, h * .1), M.steel, cx + w * .06, cy - h * .01, z, parent);                 // Werkzeug
    if (kind === '5ax') {
      B(parent, M.cavity, w * .66, h * .1, r * 1.2, cx, cy - h * .38, z);                         // Schwenkbrücke
      mesh(cyl(Math.min(w * .14, r * 1.1), Math.min(w * .14, r * 1.1), .05, 32), M.steel, cx, cy - h * .3, z, parent);    // Rundtisch
    } else if (kind === 'hmc') {
      B(parent, M.steel, w * .55, .05, r * 1.6, cx, cy - h * .36, z);
      B(parent, M.cavity, .22, h * .3, r * 1.2, cx - w * .1, cy - h * .18, z);                     // Spannturm
    } else {
      B(parent, M.steel, w * .72, .05, r * 1.6, cx, cy - h * .36, z);                              // Tisch
      B(parent, M.steelDark, .2, .07, r, cx - w * .12, cy - h * .3, z);                            // Schraubstock
    }
  } else if (kind === 'turn' || kind === 'turnmill' || kind === 'swiss') {
    const cr = kind === 'swiss' ? .08 : Math.min(.17, h * .3);
    const ch = mesh(cyl(cr, cr, .06, 28), M.steel, cx - w * .3, cy, fz + .06, parent); ch.rotation.x = Math.PI / 2;
    const tu = mesh(cyl(Math.min(.13, h * .24), Math.min(.13, h * .24), .05, 12), M.steelDark, cx + w * .2, cy + h * .08, fz + .06, parent); tu.rotation.x = Math.PI / 2;  // Revolver
    if (kind === 'turnmill') mesh(cyl(r * .6, r * .7, h * .32), M.steelDark, cx, cy + h * .26, z, parent);                    // Frässpindel (B-Achse)
  } else if (kind === 'grind') {
    const wh = mesh(cyl(.13, .13, .03, 32), M.steel, cx, cy + h * .12, fz + .07, parent); wh.rotation.x = Math.PI / 2;
    const wh2 = mesh(cyl(.09, .09, .03, 32), M.cavity, cx + .1, cy + h * .12, fz + .1, parent); wh2.rotation.x = Math.PI / 2;
    B(parent, M.steelDark, w * .5, .06, r, cx, cy - h * .3, z);
  } else if (kind === 'gear') {
    const hob = mesh(cyl(.06, .06, .22, 20), M.steel, cx - w * .1, cy + h * .1, z, parent); hob.rotation.z = Math.PI / 2 - .3;
    const wp = mesh(cyl(.16, .16, .05, 32), M.steelDark, cx + w * .15, cy - h * .2, fz + .06, parent); wp.rotation.x = Math.PI / 2;
  } else if (kind === 'vtl') {
    mesh(cyl(w * .36, w * .36, .1, 40), M.steel, cx, cy - h * .4, fz + depth * .5, parent).scale.z = (depth * .9) / (w * .72);
    B(parent, M.steelDark, .14, h * .5, r, cx + w * .12, cy + h * .05, z);
  } else if (kind === 'multi') {
    const dr = mesh(cyl(.26, .26, .08, 6), M.steelDark, cx - w * .15, cy, fz + .06, parent); dr.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = mesh(cyl(.03, .03, .1, 12), M.steel, cx - w * .15 + Math.cos(a) * .17, cy + Math.sin(a) * .17, fz + .12, parent); sp.rotation.x = Math.PI / 2; }
  }
  const gl = new THREE.Mesh(box(w, h, .012), M.glass); gl.position.set(cx, cy, fz + depth - .012); gl.renderOrder = 2; parent.add(gl);
}
// Schiebetüren: Türblatt um die Fensteröffnung, zwei Flügel mit Fuge und Griffen
function doors(parent, cx, y0, fz, w, h, winH, kind, st, depth = .24) {
  const doorMat = st.doorDark ? paint(st.door, { roughness: .3, clearcoat: .6 }) : paint(st.door);
  const ow = w * .74, oh = winH, wy = y0 + h * .58, zc = fz + depth / 2;
  const yb1 = wy - oh / 2 - .05, yt0 = wy + oh / 2 + .05, y1 = y0 + h;
  B(parent, doorMat, w, yb1 - y0, depth, cx, (y0 + yb1) / 2, zc);
  B(parent, doorMat, w, y1 - yt0, depth, cx, (yt0 + y1) / 2, zc);
  const sw = (w - ow) / 2 - .05;
  for (const s of [-1, 1]) B(parent, doorMat, sw, oh + .1, depth, cx + s * (ow / 2 + .05 + sw / 2), wy, zc);
  for (const [a, b] of [[y0, yb1], [yt0, y1]]) B(parent, M.base, .012, b - a, depth + .004, cx, (a + b) / 2, zc);   // Fuge
  for (const s of [-1, 1]) B(parent, M.steel, .03, h * .4, .04, cx + s * (ow / 2 + .05 + sw * .5), y0 + h * .5, fz + depth + .02);   // Griffe
  windowWithInterior(parent, cx, wy, fz, ow, oh, kind, st.doorDark ? M.black : M.dark, depth);
}
function magazineDrum(parent, x, y, z, r, h, mat) {
  mesh(cyl(r, r, h, 32), mat, x, y + h / 2, z, parent);
  mesh(cyl(r * .92, r * .92, .04, 32), M.dark, x, y + h + .02, z, parent);
}
function chipConveyor(parent, x, z, len, rotY = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; parent.add(g);
  const ramp = B(g, M.dark, .5, .14, len, 0, .55, 0); ramp.rotation.x = -.35;
  B(g, M.dark, .5, .6, .4, 0, .3, len / 2 - .1);
  const cart = B(g, M.steelDark, .7, .45, .55, 0, .26, len / 2 + .35);
  B(g, M.chips, .6, .06, .45, 0, .5, len / 2 + .35);
  mesh(cyl(.05, .05, .04, 12), M.rubber, -.28, .05, len / 2 + .12, g).rotation.z = Math.PI / 2;
  return cart;
}
function cabinet(parent, w, h, d, x, z, mat) {
  B(parent, mat, w, h, d, x, h / 2, z);
  B(parent, M.base, w * .9, .04, .02, x, h * .82, z + d / 2 + .005);
  B(parent, M.steel, .02, .2, .03, x + w * .38, h * .55, z + d / 2 + .02);
}
function brandOn(parent, text, color, x, y, z, width, rotY = 0) {
  if (!text || !color) return;
  const tex = lettering(text.toUpperCase(), color);
  const h = width / 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .5, depthWrite: false }));
  m.position.set(x, y, z); m.rotation.y = rotY; m.userData.keep = true; m.renderOrder = 1; parent.add(m);
}

// Baugröße aus der Baureihe (Verfahrweg X in mm) – nur für Reihen mit eindeutiger Bezeichnung
const HAAS_VF = [0, 508, 762, 1016, 1270, 1270, 1626, 2134, 1626, 2134, 3048, 3048, 3810];
export function scaleFor(brandId, model, type) {
  if (!model) return 1;
  const m = model.toLowerCase();
  let x = 0, n;
  if ((n = m.match(/\bvf-?\s?(\d{1,2})/)) && brandId === 'haas') x = HAAS_VF[+n[1]] || 0;
  else if ((n = m.match(/\bumc-?\s?(\d{3,4})/))) x = +n[1];
  else if ((n = m.match(/\bc\s?(\d{2})\b/)) && brandId === 'hermle') x = (+n[1] - 2) * 20;
  else if ((n = m.match(/\bdm[ucvf]\s?-?(\d{2,3})/))) x = +n[1] * 10;
  if (!x) return 1;
  const ref = type === '5ax' ? 650 : 600;
  return Math.max(.85, Math.min(2.2, x / ref));
}

// ------------------------------------------------------------------ Maschine bauen
export function buildMachine(type, opt = {}) {
  mats();
  const st = { ...DEFAULT_STYLE, ...(STYLES[opt.brandId] || {}) };
  if (!STYLES[opt.brandId] && opt.accent) { st.trim = opt.accent; st.text = opt.accent; }
  const body = paint(st.body), lower = paint(st.lower, { roughness: .5, clearcoat: .1 }), trim = st.trim ? paint(st.trim, { roughness: .3, clearcoat: .5 }) : M.dark;
  const frame = M.black;
  const ctl = opt.controlName || 'CNC';
  const lang = opt.lang || 'de';
  const brandText = opt.brand || '';
  const sc = scaleFor(opt.brandId, opt.model, type);
  const g = new THREE.Group(); g.name = 'machine';
  let W, H, D, scr, segs;
  const plate = (y, z, w = 1.0, x = 0) => {
    if (!opt.label) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshStandardMaterial({ map: plateTexture(opt.label), roughness: .5 }));
    m.position.set(x, y, z + .004); m.userData.keep = true; g.add(m);
  };
  const enclosure = (w, h, d, r, z = 0, baseH = .7) => {
    B(g, M.base, w - .2, .12, d - .2, 0, .06, z);
    mesh(rbox(w, baseH, d, r), lower, 0, .12, z, g);
    mesh(rbox(w, h - baseH - .12, d, r), body, 0, .12 + baseH, z, g);
    mesh(rbox(w - .1, .06, d - .1, Math.max(.02, r - .05)), body, 0, h, z, g);              // Dachkante
    if (st.trim) B(g, trim, w * .985, .05, .02, 0, .12 + baseH + .03, z + d / 2 + .012);   // Zierleiste über dem Unterbau
  };
  switch (type) {
    case '5ax': {
      W = 3.1 * sc; H = 2.95 + (sc - 1) * .5; D = 3.0 + (sc - 1) * .8;
      enclosure(W, H, D, .3);
      const dw = Math.min(W * .55, 2.4);
      doors(g, -W * .12, .82, D / 2, dw, H - 1.25, (H - 1.25) * .62, '5ax', st);
      // Magazin links, Schaltschrank hinten, Späneförderer rechts
      mesh(rbox(.9, H * .85, 1.6, .2), body, -W / 2 - .45, 0, -.2, g);
      B(g, lower, .9, .1, 1.6, -W / 2 - .45, .05, -.2);
      cabinet(g, 1.3, 2.1, .6, W * .2, -D / 2 - .3, lower);
      chipConveyor(g, W / 2 + .3, .2, 1.3);
      scr = controlPanel(g, st.panel, W / 2 - .3, 1.35, D / 2 + .32, -.35, ctl, lang, frame);
      segs = andon(g, W / 2 - .25, H, -D / 2 + .3);
      brandOn(g, brandText, st.text, -W * .12, H - .22, D / 2 + .012, Math.min(1.4, dw * .6));
      plate(.45, D / 2, 1.1, -W * .12);
      break;
    }
    case 'hmc': {
      W = 3.4; H = 3.05; D = 3.6;
      B(g, M.base, W - .2, .12, D - 1.2, 0, .06, -.5);
      mesh(rbox(W, .8, D - 1.0, .12), lower, 0, .12, -.5, g);
      mesh(rbox(W, H - .92, D - 1.0, .12), body, 0, .92, -.5, g);
      if (st.trim) B(g, trim, W * .985, .05, .02, 0, H - .25, (D - 1.0) / 2 - .5 + .012);
      windowWithInterior(g, -.35, 1.7, (D - 1.0) / 2 - .5, 1.5, 1.2, 'hmc', frame);
      // Palettenwechsler vor der Maschine mit zwei Paletten und Spanntürmen
      mesh(cyl(.8, .85, .72, 36), lower, -.35, .36, 1.45, g);
      for (const s of [-1, 1]) {
        B(g, M.steel, .62, .08, .62, -.35 + s * .4, .76, 1.45);
        B(g, M.steelDark, .3, .55, .3, -.35 + s * .4, 1.08, 1.45);
      }
      B(g, M.warn, 1.9, .03, .03, -.35, .03, 2.35);
      // Kettenmagazin hinten, Späneförderer
      mesh(rbox(1.2, 2.6, 1.4, .08), body, W / 2 + .62, 0, -1.4, g);
      cabinet(g, 1.4, 2.2, .6, -.6, -D / 2 - .5, lower);
      chipConveyor(g, -W / 2 - .35, -.6, 1.5);
      scr = controlPanel(g, st.panel === 'tall' ? 'tall' : 'integrated', W / 2 - .25, 1.2, (D - 1.0) / 2 - .5 + .1, -.3, ctl, lang, frame);
      segs = andon(g, W / 2 - .3, H, -D / 2 + .1);
      brandOn(g, brandText, st.text, -.35, H - .45, (D - 1.0) / 2 - .5 + .012, 1.3);
      plate(.5, (D - 1.0) / 2 - .5, 1.1, -.35);
      break;
    }
    case 'gantry': {
      W = 7.6; H = 4.3; D = 4.6;
      B(g, M.base, W, .2, 2.6, 0, .1, 0);                                       // Maschinenbett
      B(g, M.steel, W - .6, .14, 2.0, 0, .9, 0);                                // Tisch
      B(g, lower, W - .4, .7, 2.3, 0, .55, 0);
      for (const s of [-1, 1]) {
        mesh(rbox(.8, H - .6, 1.0, .06), body, -1.0, 0, s * 1.65, g);          // Ständer
        if (st.trim) B(g, trim, .82, .05, .02, -1.0, H - 1.1, s * 1.65 + .51);
      }
      mesh(rbox(1.0, .8, 4.3, .06), body, -1.0, H - .8, 0, g);                 // Querbalken (Portal)
      B(g, lower, .6, 1.4, .6, -1.0, H - 1.5, .3);                              // Fräskopf
      mesh(cyl(.12, .14, .45), M.steelDark, -1.0, H - 2.35, .3, g);
      // Schutzwände mit Fenstern rund um den Tisch
      for (const s of [-1, 1]) {
        B(g, body, W, 1.6, .06, 0, 1.6, s * 1.45);
        const gl = new THREE.Mesh(box(W * .7, .8, .012), M.glass); gl.position.set(0, 1.75, s * 1.48); gl.renderOrder = 2; g.add(gl);
      }
      cabinet(g, 2.4, 2.2, .7, W / 2 - 1.4, -D / 2 + .1, lower);
      chipConveyor(g, -W / 2 - .3, 0, 2.0, Math.PI / 2);
      scr = controlPanel(g, 'pendant', W / 2 - .7, 1.3, 1.9, -.2, ctl, lang, frame);
      segs = andon(g, W / 2 - .4, 2.4, 1.45);
      brandOn(g, brandText, st.text, -1.0, H - .4, 2.17, 1.6);
      plate(1.0, 1.5, 1.2, 1.6);
      break;
    }
    case 'boring': {
      W = 6.4; H = 4.2; D = 4.8;
      B(g, M.base, W, .18, 1.6, 0, .09, -1.2);                                   // Ständerbett
      mesh(rbox(1.3, H - .2, 1.3, .06), body, -1.0, .18, -1.2, g);              // Ständer
      if (st.trim) B(g, trim, 1.32, .05, .02, -1.0, H - .6, -.54);
      B(g, lower, .9, .9, 1.6, -1.0, 2.0, -.2);                                  // Spindelkasten
      const ram = mesh(cyl(.16, .16, .9, 24), M.steelDark, -1.0, 2.0, .9, g); ram.rotation.x = Math.PI / 2;
      // Drehtisch vor dem Ständer
      B(g, lower, 2.0, .7, 2.0, 1.0, .35, 1.0);
      B(g, M.steel, 1.8, .1, 1.8, 1.0, .75, 1.0);
      B(g, M.steelDark, .7, .6, .5, 1.0, 1.1, 1.0);
      // Schutzzaun + Bedienerplattform
      for (const s of [-1, 1]) B(g, M.warn, .04, 1.1, 3.2, 2.4 + s * .02, .55, .6);
      B(g, M.warn, 4.8, 1.1, .04, .4, .55, 2.25);
      B(g, M.base, 1.2, .2, .8, -2.4, .1, .9);
      cabinet(g, 2.0, 2.2, .7, 2.2, -2.0, lower);
      scr = controlPanel(g, 'pendant', -2.4, 1.35, 1.1, .3, ctl, lang, frame);
      segs = andon(g, -1.5, H, -.55);
      brandOn(g, brandText, st.text, -1.0, H - .5, -.53, 1.1);
      plate(1.2, .22, 1.1, -2.4);
      break;
    }
    case 'vtl': {
      W = 4.4; H = 4.2; D = 4.0;
      enclosure(W, H, D, .14, 0, .9);
      doors(g, -.2, 1.0, D / 2, 2.6, H - 1.7, (H - 1.7) * .66, 'vtl', st);
      cabinet(g, 1.6, 2.2, .6, .6, -D / 2 - .3, lower);
      chipConveyor(g, W / 2 + .35, 0, 1.6);
      scr = controlPanel(g, 'pendant', W / 2 - .3, 1.4, D / 2 + .45, -.25, ctl, lang, frame);
      segs = andon(g, W / 2 - .25, H, -D / 2 + .3);
      brandOn(g, brandText, st.text, -.2, H - .3, D / 2 + .012, 1.5);
      plate(.5, D / 2, 1.2, -.2);
      break;
    }
    case 'lathe': case 'turnmill': {
      const tm = type === 'turnmill';
      W = tm ? 4.4 : 3.6; H = tm ? 2.75 : 2.1; D = tm ? 2.5 : 2.0;
      B(g, M.base, W - .2, .12, D - .2, 0, .06, 0);
      mesh(rbox(W, .8, D, .1), lower, 0, .12, 0, g);
      mesh(rbox(W, H - .92, D * .82, .1), body, 0, .92, -D * .09, g);
      if (tm) mesh(rbox(1.4, .35, 1.1, .1), body, .4, H, -D * .2, g);
      // schräge Front mit Schiebetür und Fenster
      const fw = new THREE.Group(); fw.position.set(-.25, .95, D / 2 - D * .18); fw.rotation.x = -.16; g.add(fw);
      doors(fw, 0, 0, 0, W * .56, H - 1.2, (H - 1.2) * .55, tm ? 'turnmill' : 'turn', st);
      if (st.trim) B(g, trim, W * .985, .045, .02, 0, H - .12, D / 2 - D * .18 + .012);
      if (tm) mesh(rbox(1.0, H - .4, 1.1, .1), body, -W / 2 - .5, 0, -.3, g);   // Magazin
      cabinet(g, 1.0, 1.9, .5, W * .2, -D / 2 - .25, lower);
      chipConveyor(g, W / 2 + .3, -.1, 1.4);
      scr = controlPanel(g, st.panel === 'tall' ? 'tall' : 'integrated', W / 2 - .35, 1.25, D / 2 + .08, -.3, ctl, lang, frame);
      segs = andon(g, W / 2 - .25, H, -D / 2 + .3);
      brandOn(g, brandText, st.text, -.25, H - .3, D / 2 - D * .18 + .015, 1.1);
      plate(.5, D / 2, 1.0, -.25);
      break;
    }
    case 'swiss': case 'multispindle': {
      const ms = type === 'multispindle';
      W = ms ? 5.2 : 2.6; H = ms ? 2.4 : 1.9; D = ms ? 2.3 : 1.35;
      B(g, M.base, W - .1, .14, D - .1, 0, .07, 0);
      mesh(rbox(W, H - .14, D, .1), body, 0, .14, 0, g);
      B(g, lower, W * .99, .6, .02, 0, .45, D / 2 + .011);
      doors(g, ms ? -.3 : .1, .75, D / 2, ms ? 2.6 : 1.4, H - 1.1, (H - 1.1) * .62, ms ? 'multi' : 'swiss', st);
      if (st.trim) B(g, trim, W * .98, .04, .02, 0, H - .1, D / 2 + .012);
      // Stangenlader links
      const lw = ms ? 4.2 : 3.4;
      mesh(rbox(lw, .55, .6, .08), body, -W / 2 - lw / 2 - .1, .6, 0, g);
      for (const x of [-W / 2 - .5, -W / 2 - lw + .3]) B(g, lower, .14, .6, .45, x, .3, 0);
      chipConveyor(g, W / 2 + .3, 0, ms ? 1.6 : 1.0);
      scr = controlPanel(g, 'integrated', W / 2 - .2, 1.2, D / 2 + .12, -.35, ctl, lang, frame);
      segs = andon(g, W / 2 - .2, H, -D / 2 + .2);
      brandOn(g, brandText, st.text, ms ? -.3 : .1, H - .32, D / 2 + .012, ms ? 1.3 : .9);
      plate(.3, D / 2 + .02, .9, ms ? -.3 : .1);
      break;
    }
    case 'grinder': case 'gear': {
      const gr = type === 'gear';
      W = gr ? 3.8 : 2.5; H = gr ? 2.7 : 2.3; D = gr ? 2.8 : 2.2;
      enclosure(W, H, D, .22, 0, 1.0);
      // schräges, großes Fenster oben
      const fw = new THREE.Group(); fw.position.set(gr ? -.3 : -.15, 1.7, D / 2 - .05); fw.rotation.x = -.22; g.add(fw);
      windowWithInterior(fw, 0, 0, 0, gr ? 1.6 : 1.25, gr ? 1.1 : .75, gr ? 'gear' : 'grind', frame);
      B(g, paint(st.door), gr ? 1.8 : 1.5, .9, .05, gr ? -.3 : -.15, .75, D / 2 + .025);
      if (gr) mesh(rbox(1.2, H + .3, 1.2, .1), body, W / 2 - .5, 0, -D / 2 + .5, g);     // hoher Ständer mit Fräskopf
      cabinet(g, 1.0, 2.0, .55, 0, -D / 2 - .28, lower);
      if (gr) chipConveyor(g, -W / 2 - .3, 0, 1.4);
      scr = controlPanel(g, 'integrated', W / 2 - .15, 1.25, D / 2 + .1, -.35, ctl, lang, frame);
      segs = andon(g, W / 2 - .2, gr ? H + .3 : H, -D / 2 + .25);
      brandOn(g, brandText, st.text, gr ? -.3 : -.15, H - .14, D / 2 + .012, .9);
      plate(.35, D / 2, 1.0, gr ? -.3 : -.15);
      break;
    }
    default: {    // Vertikal-Bearbeitungszentrum + sonstige
      W = 2.7 * sc; H = 2.65 + (sc - 1) * .4; D = 2.4 + (sc - 1) * .6;
      enclosure(W, H, D, .1, 0, .75);
      const dw = Math.min(W * .62, 2.6);
      doors(g, -W * .08, .87, D / 2, dw, H - 1.2, (H - 1.2) * .6, 'mill', st);
      magazineDrum(g, -W / 2 - .3, .95, -.35, .42, H - 1.1, body);
      cabinet(g, 1.0, 2.0, .55, W * .15, -D / 2 - .28, lower);
      chipConveyor(g, W / 2 + .3, -.1, 1.2);
      scr = controlPanel(g, st.panel, W / 2 - .2, 1.3, D / 2 + .3, -.35, ctl, lang, frame);
      segs = andon(g, W / 2 - .25, H, -D / 2 + .3);
      brandOn(g, brandText, st.text, -W * .08, H - .17, D / 2 + .012, Math.min(1.1, dw * .5));
      plate(.45, D / 2, 1.0, -W * .08);
    }
  }
  g.userData = { type, andon: segs, screen: scr, ctl, lang, W, H, D };
  return mergeByMaterial(g);
}

// alle festen Teile einer Maschine je Material zu einem Mesh zusammenfassen (wenige Draw-Calls bei vielen Maschinen)
// Untexturierte, undurchsichtige Lacke und Metalle kommen in zwei Meshes (mit/ohne Klarlack), Farbe und Oberfläche als
// Vertex-Attribute (packMat) – aus ~15 Draw-Calls je Maschine werden so etwa 6.
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const groups = new Map(), drop = [];
  g.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    const mat = o.material;
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const ng = geo.index ? geo.toNonIndexed() : geo;
    const pk = mat.isMeshStandardMaterial && !mat.map && !mat.transparent && !mat.emissive.getHex() ? (mat.clearcoat ? 'cc' : 'std') : null;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k) || (pk && k === 'uv')) ng.deleteAttribute(k);
    if (pk) packAttrs(ng, mat);
    else if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    const key = pk ? packMat(pk) : mat;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ng);
    drop.push(o);
  });
  const keep = [];
  g.traverse((o) => { if (o.isMesh && o.userData.keep) keep.push(o); });
  for (const o of drop) o.removeFromParent();
  // leere Hilfsgruppen entfernen, behaltene Teile direkt unter die Maschine hängen
  for (const o of keep) { const wm = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); o.removeFromParent(); wm.decompose(o.position, o.quaternion, o.scale); g.add(o); }
  for (const c of [...g.children]) if (!c.isMesh) g.remove(c);
  for (const [mat, list] of groups) {
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.castShadow = mat !== M.glass; m.receiveShadow = true;
    if (mat === M.glass) m.renderOrder = 2;
    g.add(m);
  }
  return g;
}

export function setMachineState(group, state, t = 0) {
  mats();
  const u = group.userData;
  if (!u.andon) return;
  const [r, a, gr] = u.andon;
  if (state === 'after') { r.material = M.andonOff; a.material = M.andonOff; gr.material = M.green; }
  else if (state === 'idle') { r.material = M.andonOff; a.material = M.andonOff; gr.material = M.andonOff; }
  else { r.material = M.andonOff; gr.material = M.andonOff; a.material = (Math.floor(t * 1.6 + (u.phase || 0)) % 2) ? M.amber : M.andonOff; }
  if (u.screen && u.screenState !== state) {
    u.screen.material.map = screenTexture(u.ctl, state === 'after' ? 'after' : 'before', u.lang);
    u.screen.material.needsUpdate = true; u.screenState = state;
  }
}

// ------------------------------------------------------------------ altes Werkzeuglager für die Ansicht »Heute«
export function oldShelf(seed = 1) {
  mats();
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x6f7a84, roughness: .6, metalness: .4 });
  const board = new THREE.MeshStandardMaterial({ color: 0x8c949b, roughness: .7, metalness: .2 });
  const cardboard = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: .9 });
  const holder = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: .35, metalness: .8 });
  const W = 2.0, D = .6, H = 2.1;
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) mesh(box(.04, H, .04), frame, x, H / 2, z, g);
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 5; i++) {
    const y = .1 + i * .48;
    mesh(box(W, .03, D), board, 0, y, 0, g);
    let x = -W / 2 + .1;
    while (x < W / 2 - .2) {
      if (rnd() < .4) { const w = .25 + rnd() * .3, h = .15 + rnd() * .25; mesh(box(w, h, .4), cardboard, x + w / 2, y + .015 + h / 2, (rnd() - .5) * .1, g); x += w + .05; }
      else { mesh(new THREE.CylinderGeometry(.03, .05, .14, 10), holder, x + .05, y + .085, (rnd() - .5) * .3, g); x += .13; }
    }
  }
  return g;
}
export function oldBench() {
  mats();
  const g = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: .8 });
  const leg = new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: .6, metalness: .4 });
  mesh(box(2.2, .06, .8), top, 0, .9, 0, g);
  for (const x of [-1.0, 1.0]) for (const z of [-.33, .33]) mesh(box(.06, .9, .06), leg, x, .45, z, g);
  mesh(box(.5, .3, .35), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: .5 }), -.6, 1.08, -.1, g);   // Werkzeugkiste
  mesh(box(.3, .02, .21), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: .9 }), .4, .94, .1, g);     // Zettel
  return g;
}
