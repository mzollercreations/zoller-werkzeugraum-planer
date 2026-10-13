// Prozedurale CNC-Maschinen des Kunden (kein Hersteller-CAD nötig). Ursprung = Mitte der Grundfläche auf dem Boden,
// Bedienseite zeigt nach +Z. Jede Maschine hat eine Signalsäule (userData.andon) und einen Steuerungsbildschirm
// (userData.screen), die der Planer je nach Ansicht (heute / mit ZOLLER) umschaltet.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const M = {};
function mats() {
  if (M.body) return M;
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  M.body = phys({ color: 0xdfe2e4, roughness: .38, clearcoat: .35, clearcoatRoughness: .22 });
  M.body2 = phys({ color: 0xd2d6d9, roughness: .42, clearcoat: .2 });
  M.dark = phys({ color: 0x2b2e32, roughness: .5, clearcoat: .15 });
  M.base = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: .7 });
  M.cavity = new THREE.MeshStandardMaterial({ color: 0x3d4247, roughness: .65 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xaeb4b8, roughness: .28, metalness: .9 });
  M.glass = phys({ color: 0x9fb4c0, roughness: .04, metalness: 0, transparent: true, opacity: .28, envMapIntensity: 1.6, depthWrite: false });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: .9 });
  M.andonOff = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: .3, transparent: true, opacity: .85 });
  M.green = new THREE.MeshStandardMaterial({ color: 0x1f9d55, emissive: 0x22c55e, emissiveIntensity: 2.2, roughness: .3 });
  M.amber = new THREE.MeshStandardMaterial({ color: 0xc58a00, emissive: 0xffb000, emissiveIntensity: 2.2, roughness: .3 });
  M.red = new THREE.MeshStandardMaterial({ color: 0xa31515, emissive: 0xff2b2b, emissiveIntensity: 2.0, roughness: .3 });
  return M;
}
const accentCache = new Map();
function accentMat(hex) {
  if (!accentCache.has(hex)) accentCache.set(hex, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: .32, clearcoat: .5 }));
  return accentCache.get(hex);
}

// abgerundeter Quader (senkrechte Kanten rund), Ursprung unten mittig
const rboxCache = new Map();
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
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ------------------------------------------------------------------ Steuerungsbildschirm (Canvas)
const screenCache = new Map();
export function screenTexture(controlName, state, lang = 'de') {
  const k = controlName + '|' + state + '|' + lang;
  if (screenCache.has(k)) return screenCache.get(k);
  const c = document.createElement('canvas'); c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 192); grd.addColorStop(0, '#1d2a36'); grd.addColorStop(1, '#0d141b');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#2e4456'; g.fillRect(0, 0, 256, 22);
  g.fillStyle = '#cfe3f2'; g.font = '600 11px Helvetica, Arial'; g.fillText(controlName || 'CNC', 8, 15);
  g.font = '10px Helvetica, Arial'; g.fillStyle = '#8fb2cc';
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
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  screenCache.set(k, t);
  return t;
}

// Typenschild mit Hersteller und Baureihe
function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#16181b'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#f2f4f5'; g.font = '600 30px "T-Star", Helvetica, Arial'; g.textBaseline = 'middle';
  const w = Math.min(480, g.measureText(text).width);
  g.fillText(text, (512 - w) / 2, 34, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function andon(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  mesh(new THREE.CylinderGeometry(.012, .012, .22, 8), M.steel, 0, .11, 0, g);
  const segs = [];
  [M.red, M.amber, M.green].forEach((_, i) => {
    const s = mesh(new THREE.CylinderGeometry(.045, .045, .07, 16), M.andonOff, 0, .52 - i * .075, 0, g);
    s.castShadow = false; s.userData.keep = true; segs.push(s);
  });
  mesh(new THREE.CylinderGeometry(.03, .045, .03, 16), M.dark, 0, .58, 0, g);
  return segs;     // [rot, gelb, grün]
}

function panel(parent, x, y, z, rotY, ctrlName, lang) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g);
  mesh(box(.06, .5, .06), M.dark, 0, -.25, -.1, g);
  const body = mesh(box(.56, .7, .1), M.dark, 0, .2, 0, g);
  body.rotation.x = -.12;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.42, .315), new THREE.MeshBasicMaterial({ map: screenTexture(ctrlName, 'before', lang), toneMapped: false }));
  scr.position.set(0, .3, .052); scr.rotation.x = -.12; scr.userData.keep = true; g.add(scr);
  mesh(box(.46, .18, .02), M.base, 0, -.02, .058, g).rotation.x = -.12;
  return scr;
}

// Fenster mit Einblick: dunkler Arbeitsraum + Spindel/Futter + Glas
function windowWithInterior(parent, cx, cy, fz, w, h, kind) {
  mesh(box(w + .1, h + .1, .03), M.dark, cx, cy, fz + .015, parent);
  mesh(box(w, h, .02), M.cavity, cx, cy, fz + .035, parent);
  if (kind === 'mill') {
    mesh(new THREE.CylinderGeometry(.09, .11, .32, 16), M.steel, cx + w * .05, cy + h * .22, fz + .05, parent);
    mesh(new THREE.CylinderGeometry(.018, .018, .12, 8), M.steel, cx + w * .05, cy + h * .02, fz + .05, parent);
    mesh(box(w * .7, .06, .03), M.steel, cx, cy - h * .3, fz + .05, parent);
  } else if (kind === 'turn') {
    const ch = mesh(new THREE.CylinderGeometry(.16, .16, .05, 24), M.steel, cx - w * .3, cy, fz + .055, parent); ch.rotation.x = Math.PI / 2;
    mesh(box(.22, .22, .03), M.dark, cx + w * .22, cy + h * .05, fz + .05, parent);
  } else if (kind === 'grind') {
    const wh = mesh(new THREE.CylinderGeometry(.12, .12, .03, 24), M.steel, cx, cy + h * .12, fz + .05, parent); wh.rotation.x = Math.PI / 2;
  }
  const gl = new THREE.Mesh(box(w, h, .012), M.glass); gl.position.set(cx, cy, fz + .075); gl.renderOrder = 2; parent.add(gl);
}

export function buildMachine(type, opt = {}) {
  mats();
  const accent = accentMat(opt.accent || '#3a3f45');
  const ctl = opt.controlName || 'CNC';
  const lang = opt.lang || 'de';
  const g = new THREE.Group(); g.name = 'machine';
  let W, H, D, scr, segs;
  const plate = (y, z, w = 1.0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshStandardMaterial({ map: plateTexture(opt.label || ''), roughness: .5 }));
    m.position.set(0, y, z + .004); m.userData.keep = true; g.add(m);
  };
  switch (type) {
    case '5ax': {
      W = 3.0; H = 2.95; D = 2.9;
      mesh(box(W - .2, .16, D - .2), M.base, 0, .08, 0, g);
      mesh(rbox(W, .7, D, .32), M.dark, 0, .16, 0, g);
      mesh(rbox(W, H - .86, D, .32), M.body, 0, .86, 0, g);
      mesh(box(W * .98, .045, .02), accent, 0, H - .26, D / 2 + .01, g);
      windowWithInterior(g, -.25, 1.72, D / 2, 1.6, 1.15, 'mill');
      scr = panel(g, W / 2 - .28, 1.35, D / 2 + .38, -.35, ctl, lang);
      mesh(box(.7, .9, 1.6), M.body2, -W / 2 - .38, .45, -.3, g);
      mesh(box(.5, 1.1, .9), M.dark, W / 2 + .3, .55, -.6, g);
      segs = andon(g, W / 2 - .25, H, -D / 2 + .3);
      plate(H - .14, D / 2, 1.3);
      break;
    }
    case 'hmc': {
      W = 3.4; H = 3.0; D = 3.6;
      mesh(box(W - .2, .16, D - .2), M.base, 0, .08, -.3, g);
      mesh(rbox(W, H - .16, D - 1.0, .14), M.body, 0, .16, -.5, g);
      mesh(box(W * .98, .05, .02), accent, 0, H - .3, D / 2 - 1.0 + .01, g);
      windowWithInterior(g, -.35, 1.6, (D - 1.0) / 2 - .5, 1.5, 1.2, 'mill');
      // Palettenwechsler vor der Maschine
      mesh(new THREE.CylinderGeometry(.75, .8, .7, 32), M.dark, -.35, 0, 1.45, g).position.y = .35;
      mesh(box(.62, .08, .62), M.steel, -.35 - .38, .74, 1.45, g); mesh(box(.62, .08, .62), M.steel, -.35 + .38, .74, 1.45, g);
      mesh(box(.5, .5, .5), M.cavity, -.35 - .38, 1.03, 1.45, g);
      // Werkzeugmagazin hinten
      mesh(rbox(1.1, 2.5, 1.3, .06), M.body2, W / 2 + .55, 0, -1.2, g);
      scr = panel(g, W / 2 - .2, 1.35, (D - 1.0) / 2 - .5 + .4, -.4, ctl, lang);
      segs = andon(g, W / 2 - .3, H, -D / 2 + .1);
      plate(H - .15, (D - 1.0) / 2 - .5, 1.3);
      break;
    }
    case 'lathe': case 'turnmill': {
      const tm = type === 'turnmill';
      W = tm ? 4.2 : 3.6; H = tm ? 2.7 : 2.05; D = tm ? 2.5 : 2.0;
      mesh(box(W - .2, .16, D - .2), M.base, 0, .08, 0, g);
      mesh(rbox(W, .8, D, .1), M.dark, 0, .16, 0, g);
      mesh(rbox(W, H - .96, D * .82, .1), M.body, 0, .96, -D * .09, g);
      if (tm) mesh(rbox(1.3, .35, 1.0, .1), M.body2, .5, H, -D * .2, g);
      // schräges Fenster
      const fw = new THREE.Group(); fw.position.set(-.2, 1.42, D / 2 - D * .18); fw.rotation.x = -.18; g.add(fw);
      windowWithInterior(fw, 0, 0, 0, W * .5, H * .38, 'turn');
      mesh(box(W * .98, .045, .02), accent, 0, H - .12, D / 2 - D * .18 + .01, g);
      scr = panel(g, W / 2 - .35, 1.3, D / 2 + .1, -.3, ctl, lang);
      mesh(box(.6, .7, 1.4), M.body2, W / 2 + .32, .35, -.2, g);
      segs = andon(g, W / 2 - .25, H, -D / 2 + .3);
      plate(H - .3, D / 2 - D * .18, 1.2);
      break;
    }
    case 'swiss': {
      W = 2.6; H = 1.85; D = 1.3;
      mesh(box(W - .1, .14, D - .1), M.base, 0, .07, 0, g);
      mesh(rbox(W, H - .14, D, .1), M.body, 0, .14, 0, g);
      windowWithInterior(g, .1, 1.15, D / 2, 1.3, .55, 'turn');
      mesh(box(W * .98, .04, .02), accent, 0, H - .1, D / 2 + .01, g);
      // Stangenlader links
      mesh(rbox(3.2, .5, .55, .08), M.body2, -W / 2 - 1.6, .62, 0, g);
      for (const x of [-W / 2 - .5, -W / 2 - 2.7]) mesh(box(.12, .62, .4), M.dark, x, .31, 0, g);
      scr = panel(g, W / 2 - .15, 1.15, D / 2 + .3, -.4, ctl, lang);
      segs = andon(g, W / 2 - .2, H, -D / 2 + .2);
      plate(H - .26, D / 2, .9);
      break;
    }
    case 'grinder': {
      W = 2.4; H = 2.3; D = 2.2;
      mesh(box(W - .2, .16, D - .2), M.base, 0, .08, 0, g);
      mesh(rbox(W, 1.0, D, .2), M.dark, 0, .16, 0, g);
      mesh(rbox(W, H - 1.16, D, .2), M.body, 0, 1.16, 0, g);
      windowWithInterior(g, -.15, 1.65, D / 2, 1.2, .7, 'grind');
      mesh(box(W * .98, .04, .02), accent, 0, H - .1, D / 2 + .01, g);
      scr = panel(g, W / 2 - .1, 1.2, D / 2 + .32, -.4, ctl, lang);
      segs = andon(g, W / 2 - .2, H, -D / 2 + .25);
      plate(H - .25, D / 2, 1.0);
      break;
    }
    default: {    // vmc + sonstige
      W = 2.7; H = 2.65; D = 2.4;
      mesh(box(W - .2, .16, D - .2), M.base, 0, .08, 0, g);
      mesh(rbox(W, .75, D, .1), M.dark, 0, .16, 0, g);
      mesh(rbox(W, H - .91, D, .1), M.body, 0, .91, 0, g);
      mesh(box(W * .98, .045, .02), accent, 0, H - .22, D / 2 + .01, g);
      windowWithInterior(g, -.3, 1.6, D / 2, 1.3, 1.0, 'mill');
      scr = panel(g, W / 2 - .2, 1.3, D / 2 + .35, -.35, ctl, lang);
      mesh(box(.55, .75, 1.5), M.body2, W / 2 + .3, .375, -.3, g);
      segs = andon(g, W / 2 - .25, H, -D / 2 + .3);
      plate(H - .12, D / 2, 1.1);
    }
  }
  g.userData = { type, andon: segs, screen: scr, ctl, lang, W, H, D };
  return mergeByMaterial(g);
}

// alle festen Teile einer Maschine je Material zu einem Mesh zusammenfassen (wenige Draw-Calls bei vielen Maschinen)
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const groups = new Map(), drop = [];
  g.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const ng = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(ng);
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
