// 3D-Halle des Planers: Werkzeugraum aus offiziellen ZOLLER-CAD-Modellen + Maschinenhalle mit den Kundenmaschinen.
// Koordinaten: X nach rechts, Z zum Betrachter, Y nach oben, Meter. Rückwand bei z = WALL_Z.
// Gegen Flackern: Kamera-Nah-/Fernebene folgen dem Abstand (Tiefenauflösung), alle Bodenmarkierungen liegen mit
// polygonOffset in fester Reihenfolge über dem Boden, Bildschirme haben Abstand zur Front, keine Flächen liegen deckungsgleich.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { DRACOLoader } from '../vendor/DRACOLoader.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { buildMachine, setMachineState, oldShelf, oldBench, screenTexture } from './machines.js';
import { PRODUCTS, STEPS } from './knowledge.js';

const WALL_Z = -6;
const WALL_H = 6.5;
const YELLOW = 0xf0e600;
const LINE_ORDER = ['inspect', 'store', 'assemble', 'shrink', 'balance', 'measure', 'supply'];
const MACHINE_ORDER = ['5ax', 'vmc', 'hmc', 'turnmill', 'lathe', 'swiss', 'multispindle', 'vtl', 'grinder', 'gear', 'boring', 'gantry', 'other'];
const ZID_NEAR = 14;          // ab diesem Abstand (m) zeigt die Halle die leichte »zidCode«-Fassung
const ease = (t) => 1 - Math.pow(1 - t, 3);
const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeBack = (t) => { const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// Materialbibliothek für die CAD-Klassen (wie cad/zoller_cad.py, als PBR für three.js)
const CLS = {
  darkgrey: { color: '#35383b', roughness: .42, clearcoat: .15, clearcoatRoughness: .25 },
  whitealu: { color: '#a9acab', roughness: .34, metalness: .72, clearcoat: .35, clearcoatRoughness: .12 },
  yellow: { color: '#f0dc00', roughness: .3, clearcoat: .6, clearcoatRoughness: .06 },
  blackplastic: { color: '#141516', roughness: .45 }, pa6: { color: '#111317', roughness: .55 },
  anodized: { color: '#1e2124', roughness: .32, metalness: .85 }, steel: { color: '#b9bdc0', roughness: .3, metalness: 1 },
  whiteplastic: { color: '#e6e4dc', roughness: .35, clearcoat: .2 }, paper: { color: '#e0ded6', roughness: .6 },
  wood: { color: '#c8a679', roughness: .5 }, worktop: { color: '#232426', roughness: .55 }, bellows: { color: '#18191b', roughness: .78 },
  blackoxide: { color: '#2a2826', roughness: .35, metalness: .9 }, brass: { color: '#c9a14a', roughness: .25, metalness: 1 },
  glossblack: { color: '#0d0e10', roughness: .16, clearcoat: 1, clearcoatRoughness: .03 }, zinc: { color: '#9da6ab', roughness: .33, metalness: 1 },
  red: { color: '#c8140f', roughness: .3, clearcoat: .5 }, chrome: { color: '#9a9e9c', roughness: .12, metalness: .95 },
  teal: { color: '#1fa58a', roughness: .4 }, blue: { color: '#1a3fae', roughness: .35, clearcoat: .4 },
  led: { color: '#3ccf6a', roughness: .3, emissive: '#22c55e', emissiveIntensity: 1.6 },
};

function canvasTex(w, h, draw, aniso = 8) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}
// Bodenmarkierung: liegt immer über dem Boden und über tieferen Markierungen (kein z-fighting, auch aus der Ferne)
function decal(mat, layer) {
  mat.polygonOffset = true; mat.polygonOffsetFactor = -1 - layer; mat.polygonOffsetUnits = -4 * (layer + 1);
  return mat;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export class Hall {
  constructor(el, opt) {
    this.el = el; this.opt = opt; this.base = opt.base || '';
    this.loop = this.loop.bind(this);
    this.t = opt.t || ((k) => k);
    this.mode = 'after'; this.flowOn = true; this.labelsOn = true;
    this.anims = []; this.devices = new Map(); this.machines = new Map(); this.labels = [];
    this.templates = new Map(); this.photoTex = new Map(); this.zids = [];
    this.canvas = el.querySelector('canvas');
    this.labelLayer = el.querySelector('[data-labels]');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.maxPR = Math.min(window.devicePixelRatio || 1, 2); this.pr = this.maxPR;
    r.setPixelRatio(this.pr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .92;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = false;
    this.aniso = r.capabilities.getMaxAnisotropy();
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(0xeef0f2);
    sc.fog = new THREE.Fog(0xeef0f2, 110, 320);
    const pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
    sc.environmentIntensity = .75;
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 700);
    this.camera.position.set(-10, 26, 46);
    const c = this.controls = new OrbitControls(this.camera, this.canvas);
    c.enableDamping = true; c.dampingFactor = .08; c.maxPolarAngle = 1.42; c.minDistance = 1.6; c.maxDistance = 220;
    c.screenSpacePanning = true; c.target.set(10, 0, 0);
    c.addEventListener('change', () => this.kick());
    c.addEventListener('start', () => { this.stopTour(); this.camAnim = null; this.lastView = null; c.autoRotate = false; });
    // Licht
    sc.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bb, .85));
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e2, 2.1);
    sun.castShadow = true; const sm = window.innerWidth > 900 ? 4096 : 2048; sun.shadow.mapSize.set(sm, sm);
    sun.shadow.bias = -.0005; sun.shadow.normalBias = .035;
    sc.add(sun); sc.add(sun.target);
    const fill = new THREE.DirectionalLight(0xe8f0ff, .55); fill.position.set(40, 20, -30); sc.add(fill);
    this.root = new THREE.Group(); this.root.name = 'ZOLLER_Werkzeugraum'; sc.add(this.root);
    this.envG = new THREE.Group(); this.root.add(this.envG);
    this.zoneG = new THREE.Group(); this.root.add(this.zoneG);
    this.devG = new THREE.Group(); this.root.add(this.devG);
    this.macG = new THREE.Group(); this.root.add(this.macG);
    this.oldG = new THREE.Group(); this.root.add(this.oldG);
    this.afterG = new THREE.Group(); this.root.add(this.afterG);
    this.flowG = new THREE.Group(); sc.add(this.flowG);
    this.buildFloor();
    // Lader
    const draco = new DRACOLoader(); draco.setDecoderPath(this.base + 'assets/vendor/draco/');
    this.gltf = new GLTFLoader(); this.gltf.setDRACOLoader(draco);
    this.texLoader = new THREE.TextureLoader();
    this.lib = {};
    for (const [k, v] of Object.entries(CLS)) this.lib[k] = new THREE.MeshPhysicalMaterial({ ...v, color: new THREE.Color(v.color), ...(v.emissive ? { emissive: new THREE.Color(v.emissive) } : {}), side: THREE.DoubleSide });   // CAD-Flächen sind nicht einheitlich orientiert
    // Interaktion
    this.ray = new THREE.Raycaster();
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const hit = this.pick(e); if (hit && this.opt.onPick) this.opt.onPick(hit);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const h = this.pick(e); this.canvas.style.cursor = h ? 'pointer' : '';
    });
    new ResizeObserver(() => this.resize()).observe(el);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick(); });
    this.clock = new THREE.Clock(); this.frameTimes = []; this.prSlow = 0; this.prFast = 0; this.prChanges = 0;
    this.resize();
    this.kick();
  }

  // ---------------------------------------------------------------- Grundausstattung der Halle
  buildFloor() {
    // geschliffener Industrieboden: nur weiche, großflächige Wolken (keine feinen Punkte oder Linien, die aus der Ferne flimmern)
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tex = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#d3d6d8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) {
        const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 220, light = rnd() < .5;
        for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {      // nahtlos kachelbar
          const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gr.addColorStop(0, light ? 'rgba(255,255,255,.035)' : 'rgba(110,116,122,.035)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
      g.strokeStyle = 'rgba(120,126,132,.22)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);    // Dehnfuge alle 8 m
    }, this.aniso);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(75, 75);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: tex, roughness: .58, metalness: 0, envMapIntensity: .55 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'floor';
    this.envG.add(floor);
    this.floor = floor;
    this.wallMat = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: .9 });
    this.colMat = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: .6, metalness: .3 });
    this.laneMat = decal(new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: .62 }), 0);
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ea, roughness: .05, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide });
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: .5, metalness: .4 });
    this.mullionMat = new THREE.MeshStandardMaterial({ color: 0xb9bfc4, roughness: .4, metalness: .6 });
    this.zoneMat = decal(new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: .5, metalness: .05, envMapIntensity: .7 }), 0);
    this.yellowMat = decal(new THREE.MeshBasicMaterial({ color: YELLOW }), 1);
    this.lineMat = decal(new THREE.MeshStandardMaterial({ color: YELLOW, roughness: .4, emissive: 0x3a3700 }), 2);
    this.shadowTex = canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(.6, 'rgba(0,0,0,.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    this.blobMat = decal(new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: .5 }), 3);
  }

  blob(w, d) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.35 + .6, d * 1.35 + .6), this.blobMat);
    m.rotation.x = -Math.PI / 2; m.position.y = .002; m.renderOrder = 1; m.userData.blob = true;
    return m;
  }

  // ---------------------------------------------------------------- Modelle
  async template(cad) {
    if (this.templates.has(cad)) return this.templates.get(cad);
    const p = (async () => {
      const man = this.opt.models[cad];
      const g = await this.gltf.loadAsync(this.base + man.file);
      const obj = g.scene;
      let scr = null;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        const cls = (o.material.name || '').replace('zc_', '');
        if (cls === 'screen') {
          if (!scr) {
            const tex = this.texLoader.load(this.base + man.screen, () => this.kick()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso;
            scr = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });   // einige Bildschirmflächen haben umgekehrte Windung
            scr.userData.screen = true;
          }
          o.material = scr; o.castShadow = false;
        } else {
          o.material = this.lib[cls] || this.lib.darkgrey; o.castShadow = true;
        }
        o.receiveShadow = true;
      });
      obj.userData.size = man.size;
      return obj;
    })().catch((e) => { console.warn('Modell', cad, e); return null; });
    this.templates.set(cad, p);
    return p;
  }

  photo(pid) {
    const pr = PRODUCTS[pid];
    const g = new THREE.Group();
    const h = pr.h || 1.8;
    const key = pr.img;
    let tex = this.photoTex.get(key);
    if (!tex) { tex = this.texLoader.load(this.base + 'img/p/' + key + '.webp', () => this.kick()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso; this.photoTex.set(key, tex); }
    const aspect = this.opt.aspects?.[key] || 1.2;
    const w = h * aspect;
    const y0 = pr.table ? .82 : .05;
    const pw = Math.max(Math.min(w * .9, pr.foot?.[0] || w), .6), pd = Math.max(.5, (pr.foot?.[1] || 1) * .8);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(pw, pr.table ? .04 : .05, pd), this.frameMat);
    plinth.position.y = y0 - .025; plinth.receiveShadow = true; plinth.castShadow = true; g.add(plinth);
    if (pr.table) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, y0, .05), this.frameMat); leg.position.set(sx * (pw / 2 - .06), y0 / 2, sz * (pd / 2 - .06)); g.add(leg); }
    // Foto als Aufsteller, der sich zur Kamera dreht (nie als dünne Karte von der Seite)
    const board = new THREE.Group(); board.name = 'board'; board.position.y = y0; g.add(board);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: .55 }));
    m.position.y = h / 2; m.castShadow = true; board.add(m);
    g.userData.size = [Math.max(pw, w * .7), h + y0, pd];
    g.userData.photo = true; g.board = board;
    return g;
  }

  // ---------------------------------------------------------------- Plan übernehmen
  // plan = { devices: [{key, pid}], machines: [{key, type, brandId, brand, model, accent, controlName, label, group, zid, custom}], software: [pid], lang }
  async setPlan(plan) {
    this.plan = plan;
    const need = new Set();
    for (const d of plan.devices) { const pr = PRODUCTS[d.pid]; if (pr.cad) need.add(pr.cad); }
    if (plan.machines.some(m => m.zid)) { need.add('zidcode_lo'); need.add('zidcode'); }
    const wait = [...need].map(c => this.template(c).catch(() => null));
    if (this.opt.onProgress) {
      let done = 0; wait.forEach(p => p.then(() => this.opt.onProgress(++done / wait.length)));
      if (!wait.length) this.opt.onProgress(1);
    }
    await Promise.all(wait);
    if (plan !== this.plan) return;      // inzwischen neuer Plan
    // --- Geräte
    const seen = new Set();
    let i = 0;
    for (const d of plan.devices) {
      seen.add(d.key);
      if (this.devices.has(d.key)) continue;
      const pr = PRODUCTS[d.pid];
      let obj;
      if (pr.cad) { const t = await this.template(pr.cad); obj = t ? t.clone() : this.photo(d.pid); if (t) obj.userData.size = t.userData.size; }
      else obj = this.photo(d.pid);
      const holder = new THREE.Group(); holder.add(obj);
      const sz = obj.userData.size || [1, 1.5, 1];
      holder.add(this.blob(sz[0], sz[2]));
      holder.userData = { pick: { kind: 'device', pid: d.pid, key: d.key }, size: sz, pid: d.pid, step: pr.step, photo: !!obj.userData.photo, cad: obj.userData.photo ? null : pr.cad };
      holder.board = obj.board || null;
      holder.scale.setScalar(.001);
      this.devG.add(holder);
      this.devices.set(d.key, holder);
      holder.userData.spawn = i++ * .06;
    }
    for (const [k, o] of this.devices) if (!seen.has(k)) { this.devG.remove(o); this.devices.delete(k); }
    // --- Maschinen
    const mseen = new Set();
    const zFull = this.opt.models.zidcode ? await this.template('zidcode') : null;
    const zLo = this.opt.models.zidcode_lo ? await this.template('zidcode_lo') : zFull;
    for (const m of plan.machines) {
      mseen.add(m.key);
      const sig = [m.type, m.brandId, m.model, m.accent, m.controlName, m.label, m.zid, m.custom ? m.custom.uuid : ''].join('|');
      const ex = this.machines.get(m.key);
      if (ex && ex.userData.sig === sig) { ex.userData.info = m; continue; }
      if (ex) this.macG.remove(ex);
      const g = new THREE.Group();
      let body;
      if (m.custom) { body = m.custom.clone(); body.userData = { custom: true }; }
      else body = buildMachine(m.type, { brandId: m.brandId, brand: m.brand, model: m.model, accent: m.accent, controlName: m.controlName, label: m.label, lang: plan.lang });
      body.userData.phase = Math.random() * 2;
      g.add(body);
      const bb = new THREE.Box3().setFromObject(body);
      const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
      g.add(this.blob(size[0], size[2]));
      if (m.zid && zLo) {
        // »zidCode« neben der Bedienseite: aus der Nähe das volle CAD-Modell, aus der Ferne die leichte Fassung
        const lod = new THREE.LOD();
        if (zFull) lod.addLevel(zFull.clone(), 0);
        lod.addLevel(zLo.clone(), zFull ? ZID_NEAR : 0);
        lod.userData.zid = true; lod.scale.setScalar(.001);
        lod.position.set(bb.max.x - .55, 0, bb.max.z + .55); lod.rotation.y = -.25;
        lod.userData.pick = { kind: 'zid', pid: m.zid, key: m.key + ':zid', machine: m.key };
        // gelber Ring am Boden – auch aus der Ferne zu erkennen
        const ring = new THREE.Mesh(new THREE.RingGeometry(.42, .5, 40), decal(new THREE.MeshBasicMaterial({ color: YELLOW }), 2));
        ring.rotation.x = -Math.PI / 2; ring.position.set(lod.position.x, .003, lod.position.z); ring.userData.afterOnly = true; ring.userData.zidRing = true;
        g.add(lod, ring); g.userData.zidObj = lod; g.userData.zidRing = ring;
      }
      g.userData = { ...g.userData, pick: { kind: 'machine', key: m.key, group: m.group }, info: m, body, size, bb, sig, center: [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2] };
      g.scale.setScalar(ex ? 1 : .001);
      if (!ex) g.userData.spawn = Math.random() * .3;
      this.macG.add(g);
      this.machines.set(m.key, g);
    }
    for (const [k, o] of this.machines) if (!mseen.has(k)) { this.macG.remove(o); this.machines.delete(k); }
    this.zids = [...this.machines.values()].filter(m => m.userData.zidObj);
    const before = JSON.stringify(this.bounds?.hall || null);
    this.layout();
    if (this.lastView && JSON.stringify(this.bounds.hall) !== before) this.view(this.lastView);
    this.applyMode(true);
    this.renderer.shadowMap.needsUpdate = true;
    this.arCache = null;
    this.kick();
    if (this.opt.onPlan) this.opt.onPlan();
    return this.bounds;
  }

  // ---------------------------------------------------------------- Layout
  layout() {
    const devs = [...this.devices.values()];
    const order = (o) => LINE_ORDER.indexOf(o.userData.step);
    devs.sort((a, b) => order(a) - order(b) || PRODUCTS[a.userData.pid].step.localeCompare(PRODUCTS[b.userData.pid].step) || a.userData.pid.localeCompare(b.userData.pid));
    const GAP = .75, GROUP = 1.4;
    const carts = devs.filter(d => d.userData.pid === 'toolcart');
    const atMachine = devs.filter(d => PRODUCTS[d.userData.pid].atMachine);
    const lineDevs = devs.filter(d => !carts.includes(d) && !atMachine.includes(d));
    const colItems = lineDevs.filter(d => ['inspect', 'store'].includes(d.userData.step));
    const colLen = colItems.reduce((a, d) => a + d.userData.size[0] + GAP, 0);
    const lMode = colLen > 7.5;
    const rowItems = lMode ? lineDevs.filter(d => !colItems.includes(d)) : lineDevs;
    const stations = [];     // {step, objs}
    const addStation = (step, ...objs) => {
      let s = stations.find(x => x.step === step && x === stations[stations.length - 1]) || stations.find(x => x.step === step);
      if (!s) { s = { step, objs: [] }; stations.push(s); }
      s.objs.push(...objs);
    };
    let x = 1.6, colDepth = 0;
    let zCol0 = 0;
    const path = [];
    if (lMode) {
      colDepth = Math.max(...colItems.map(d => d.userData.size[2]));
      // Spalte an der linken Wand, Front nach +X; vorne beginnt der Rücklauf (Prüfen), dann Lager nach hinten
      const ordered = [...colItems].sort((a, b) => order(a) - order(b));
      const total = ordered.reduce((a, d) => a + d.userData.size[0], 0) + GAP * (ordered.length - 1);
      let z = WALL_Z + 2.6 + total;      // vorderes Ende der Spalte
      zCol0 = z;
      for (const d of ordered) {
        const w = d.userData.size[0], dp = d.userData.size[2];
        d.userData.target = [.5 + dp / 2, z - w / 2, Math.PI / 2];
        z -= w + GAP;
        addStation(d.userData.step, d);
      }
      x = .5 + colDepth + 3.2;
    }
    const rowDepth = Math.max(1, ...rowItems.map(d => d.userData.size[2]));
    const frontZ = WALL_Z + .5 + rowDepth;
    let prev = null;
    for (const d of rowItems) {
      if (prev && prev !== d.userData.step) x += GROUP - GAP;
      const w = d.userData.size[0], dp = d.userData.size[2];
      d.userData.target = [x + w / 2, frontZ - dp / 2, 0];
      x += w + GAP;
      prev = d.userData.step;
      addStation(d.userData.step, d);
    }
    const rowEnd = x - GAP + 1.4;
    const pathZ = frontZ + 1.0;
    const TW = Math.max(rowEnd + .6, 12);
    const toolZ1 = Math.max(pathZ + (carts.length ? 4.2 : 2.8), lMode ? zCol0 + 1.6 : 0, WALL_Z + 7.5);
    // Werkzeugwagen parken an der Tür zur Halle
    carts.forEach((d, i) => { d.userData.target = [TW - 1.8 - i * 1.9, pathZ + 1.9, 0]; });
    if (carts.length) addStation('supply', ...carts);
    if (lMode) path.push([.5 + colDepth + 1.1, zCol0 - .4], [.5 + colDepth + 1.1, pathZ]);
    else path.push([1.2, pathZ]);
    path.push([TW - .8, pathZ]);
    // --- Maschinen
    const ms = [...this.machines.values()];
    ms.sort((a, b) => MACHINE_ORDER.indexOf(a.userData.info.type) - MACHINE_ORDER.indexOf(b.userData.info.type) || (a.userData.info.order || 0) - (b.userData.info.order || 0));
    const N = ms.length;
    const perRow = Math.max(2, Math.min(8, Math.round(Math.sqrt(N * 1.5))));
    const xM0 = TW + 4.2;
    let rowBack = WALL_Z + .6, mxMax = xM0;
    const aisles = [];
    for (let r = 0; r * perRow < N; r++) {
      const row = ms.slice(r * perRow, (r + 1) * perRow);
      const depth = Math.max(...row.map(m => m.userData.size[2]));
      let mx = xM0;
      for (const m of row) {
        const s = m.userData.size, bb = m.userData.bb;
        const front = rowBack + depth;          // Front aller Maschinen einer Reihe auf einer Linie
        m.userData.target = [mx - bb.min.x, front - bb.max.z, 0];
        mx += s[0] + 1.5;
      }
      mxMax = Math.max(mxMax, mx);
      const az = rowBack + depth + 1.5 + (row.some(m => m.userData.zidObj) ? .8 : 0);
      aisles.push(az);
      rowBack = az + 1.9;
    }
    atMachine.forEach((d, i) => {
      const w = d.userData.size[0], dp = d.userData.size[2];
      d.userData.target = [mxMax + w / 2 + .2 + i * (w + 1), (aisles[0] ?? 0) - 1.5 - dp / 2, 0];
      mxMax += w + 1.2;
      addStation('supply', d);
    });
    // Weg durch die Gänge (Schlangenlinie)
    if (aisles.length) {
      path.push([xM0 - 1.6, pathZ]);
      aisles.forEach((az, i) => {
        const a = [xM0 - 1.6, az], b = [mxMax - .8, az];
        if (i % 2 === 0) path.push(a, b); else path.push(b, a);
      });
    }
    this.path = path;
    const hall = { x0: -1, x1: Math.max(mxMax + 2, TW + 6), z0: WALL_Z, z1: Math.max(toolZ1, rowBack + 1.5) };
    this.bounds = { hall, tool: { x0: 0, x1: TW, z0: WALL_Z, z1: toolZ1 }, machines: { x0: xM0 - 1, x1: mxMax, z0: WALL_Z, z1: rowBack }, stations, TW, lMode, aisles, xM0, mxMax };
    this.buildZone();
    this.buildPath();
    this.buildOld();
    this.buildLabels(stations);
    // Sonne + Schattenkamera auf die Halle
    const cx = (hall.x0 + hall.x1) / 2, cz = (hall.z0 + hall.z1) / 2, R = Math.max(hall.x1 - hall.x0, hall.z1 - hall.z0) * .62 + 6;
    this.sun.position.set(cx + 14, 45, cz + 16); this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
    // Ziele anfahren (animiert)
    const all = [...devs, ...ms];
    for (const o of all) {
      const [tx, tz, ry] = o.userData.target;
      if (o.userData.placed) this.animate(o, { x: tx, z: tz, ry }, .7);
      else { o.position.set(tx, 0, tz); o.rotation.y = ry; o.userData.placed = true; }
    }
  }

  animate(o, to, dur) {
    const from = { x: o.position.x, z: o.position.z, ry: o.rotation.y };
    this.anims.push({ t0: performance.now(), dur: dur * 1000, step: (k) => {
      const e = ease(k); o.position.x = from.x + (to.x - from.x) * e; o.position.z = from.z + (to.z - from.z) * e; o.rotation.y = from.ry + (to.ry - from.ry) * e;
    }, done: () => { this.renderer.shadowMap.needsUpdate = true; this.arCache = null; } });
    this.kick();
  }

  // Wand, Säulen, Logo, Software-Bildschirm, Werkzeugraum-Fläche, Glaswand
  buildZone() {
    this.zoneG.clear();
    const { tool, hall, TW } = this.bounds;
    const w = tool.x1 - tool.x0, d = tool.z1 - tool.z0;
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.zoneMat);
    zone.rotation.x = -Math.PI / 2; zone.position.set(tool.x0 + w / 2, .001, tool.z0 + d / 2); zone.receiveShadow = true; zone.renderOrder = 1; this.zoneG.add(zone);
    this.zone = zone;
    const strip = (x, z, sx, sz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), this.yellowMat); m.rotation.x = -Math.PI / 2; m.position.set(x, .002, z); m.renderOrder = 2; this.zoneG.add(m); return m; };
    strip(tool.x0 + w / 2, tool.z1 - .05, w, .1); strip(tool.x0 + .05, tool.z0 + d / 2, .1, d); strip(tool.x1 - .05, tool.z0 + d / 2, .1, d);
    // Rückwand über die ganze Halle + linke Wand
    const H = WALL_H, x0 = hall.x0 - 4, x1 = hall.x1 + 4;
    const back = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, H, .3), this.wallMat);
    back.position.set((x0 + x1) / 2, H / 2, WALL_Z - .15); back.receiveShadow = true; this.zoneG.add(back);
    // weißes Band oben: als flacher Körper 2 cm vor der Wand (nicht deckungsgleich)
    const band = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.25, .02), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, emissive: 0xffffff, emissiveIntensity: .25 }));
    band.position.set((x0 + x1) / 2, H - .95, WALL_Z + .01); this.zoneG.add(band);
    const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, .3, .05), this.frameMat);
    base.position.set((x0 + x1) / 2, .15, WALL_Z + .025); this.zoneG.add(base);
    // Logo und Bildschirm festlegen, dann die Säulen so setzen, dass keine davor steht
    const signW = 4.2, signH = signW * 87.296 / 382.031;
    const signX = Math.max(signW / 2 + 1, Math.min(TW / 2, 10));
    const scrW = 3.4, scrH = 1.9125;
    let scrX = null;
    if (this.plan.software.length) {
      scrX = Math.max(TW - 3.2, signX + signW / 2 + 1.2 + scrW / 2);
    }
    const keepOut = [[signX - signW / 2 - .5, signX + signW / 2 + .5]];
    if (scrX !== null) keepOut.push([scrX - scrW / 2 - .55, scrX + scrW / 2 + .55]);
    const cols = [];
    for (let x = hall.x0 - 3; x <= hall.x1 + 4; x += 7.2) {
      let cx = x;
      for (const [a, b] of keepOut) if (cx > a && cx < b) cx = (cx - a < b - cx) ? a - .25 : b + .25;
      for (const [a, b] of keepOut) if (cx > a && cx < b) cx = null;
      if (cx === null || cols.some(c => Math.abs(c - cx) < 2)) continue;
      cols.push(cx);
      const col = new THREE.Mesh(new THREE.BoxGeometry(.42, H, .42), this.colMat); col.position.set(cx, H / 2, WALL_Z + .22); col.castShadow = true; this.zoneG.add(col);
    }
    this.columns = cols;
    if (this.opt.logo) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), new THREE.MeshBasicMaterial({ map: this.opt.logo, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      sign.position.set(signX, H - .95, WALL_Z + .03); this.zoneG.add(sign);
      this.signX = signX;
    }
    // Fahr- und Gehwege zwischen den Maschinenreihen
    for (const az of this.bounds.aisles || []) {
      const ax0 = this.bounds.xM0 - 2.6, ax1 = this.bounds.mxMax + .4, aw = ax1 - ax0;
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(aw, 2.4), this.laneMat); lane.rotation.x = -Math.PI / 2; lane.position.set(ax0 + aw / 2, .001, az); lane.receiveShadow = true; lane.renderOrder = 1; this.zoneG.add(lane);
      strip(ax0 + aw / 2, az - 1.2, aw, .07); strip(ax0 + aw / 2, az + 1.2, aw, .07);
    }
    const left = new THREE.Mesh(new THREE.BoxGeometry(.3, H, hall.z1 - hall.z0 + 6), this.wallMat);
    left.position.set(hall.x0 - 4.15, H / 2, (hall.z0 + hall.z1) / 2 + 3); left.receiveShadow = true; this.zoneG.add(left);
    // Glaswand Werkzeugraum (rechts, mit Tür auf Höhe des Weges)
    const gw = (x, z, len, rot) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.8), this.glassMat); g.position.set(x, 1.4, z); g.rotation.y = rot; g.renderOrder = 3; g.userData.glass = true; this.zoneG.add(g);
      const top = new THREE.Mesh(new THREE.BoxGeometry(rot ? .05 : len, .05, rot ? len : .05), this.mullionMat); top.position.set(x, 2.8, z); this.zoneG.add(top);
      for (let k = -len / 2; k <= len / 2 + .01; k += Math.max(1.2, len / Math.ceil(len / 2.4))) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.8, .05), this.mullionMat);
        post.position.set(rot ? x : x + k, 1.4, rot ? z + k : z); this.zoneG.add(post);
      }
    };
    const pz = this.path[this.path.length > 1 ? 1 : 0][1];
    const door0 = pz - 1.3, door1 = pz + 1.3;
    if (door0 - WALL_Z > .2) gw(TW, (WALL_Z + door0) / 2, door0 - WALL_Z, Math.PI / 2);
    if (tool.z1 - door1 > .2) gw(TW, (door1 + tool.z1) / 2, tool.z1 - door1, Math.PI / 2);
    // Schriftzug am Boden
    const label = this.t('room.area').toUpperCase();
    const floorTxt = canvasTex(1024, 128, (g, cw, ch) => { g.fillStyle = 'rgba(240,230,0,.9)'; g.font = '700 84px "T-Star", Helvetica, Arial'; g.textBaseline = 'middle'; g.fillText(label, 10, ch / 2 + 4, cw - 20); }, this.aniso);
    const ft = new THREE.Mesh(new THREE.PlaneGeometry(7, .875), decal(new THREE.MeshBasicMaterial({ map: floorTxt, transparent: true, depthWrite: false }), 2));
    ft.rotation.x = -Math.PI / 2; ft.position.set(tool.x0 + .5 + 3.5, .002, tool.z1 - .75); ft.renderOrder = 2; this.zoneG.add(ft);
    // Software: großer Leitstand-Bildschirm an der Rückwand (eigenes, scharfes Bild mit den Maschinen des Kunden)
    this.afterG.clear(); this.softAnchor = null; this.softScreen = null;
    if (scrX !== null) {
      const sy = 3.3;
      const fr = new THREE.Mesh(new THREE.BoxGeometry(scrW + .14, scrH + .14, .07), this.frameMat); fr.position.set(scrX, sy, WALL_Z + .055);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.5, .3, .06), this.frameMat); arm.position.set(scrX, sy, WALL_Z + .03);
      const tex = this.tmsTexture();
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(scrW, scrH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      scr.position.set(scrX, sy, WALL_Z + .093);
      this.afterG.add(arm, fr, scr);
      this.softScreen = scr;
      this.softAnchor = new THREE.Vector3(scrX, sy + scrH / 2 + .35, WALL_Z + .1);
      this.softCenter = new THREE.Vector3(scrX, sy, WALL_Z + .1);
    }
  }

  // Leitstand-Bildschirm: TMS-Übersicht mit den Maschinen und Geräten des Kunden (Canvas, 2048 × 1152)
  tmsTexture() {
    const t = this.t, plan = this.plan;
    const ms = plan.machines, groups = [];
    for (const m of ms) { let g = groups.find(x => x.group === m.group); if (!g) groups.push(g = { group: m.group, label: m.label || t('mt.' + m.type), n: 0, ctl: m.controlName, zid: m.zid }); g.n++; }
    const soft = plan.software.map(p => t('prod.' + p)).join(' · ');
    return canvasTex(2048, 1152, (g, W, H) => {
      const F = '"T-Star", Helvetica, Arial';
      g.fillStyle = '#0d141b'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#16212b'; g.fillRect(0, 0, W, 104);
      g.fillStyle = '#f0e600'; g.fillRect(0, 100, W, 4);
      g.fillStyle = '#ffffff'; g.font = `700 50px ${F}`; g.textBaseline = 'middle'; g.fillText('ZOLLER TMS', 48, 54);
      g.fillStyle = '#8fb2cc'; g.font = `400 34px ${F}`; g.fillText(soft, 400, 56, 1100);
      g.fillStyle = '#22c55e'; g.beginPath(); g.arc(W - 330, 54, 14, 0, 7); g.fill();
      g.fillStyle = '#cfe3f2'; g.font = `500 32px ${F}`; g.fillText('Live · z.One', W - 300, 56);
      // Kennzahlen
      const tools = plan.tools || 0, ready = Math.round(tools * .82), inMachine = tools - ready;
      const kpi = [[String(tools), t('scr.tools')], [String(ready), t('scr.ready')], [String(inMachine), t('scr.inmachine')], ['0', t('scr.errors')]];
      kpi.forEach(([v, l], i) => {
        const x = 48 + i * 490, y = 140;
        g.fillStyle = '#16212b'; roundRect(g, x, y, 460, 170, 18); g.fill();
        g.fillStyle = i === 3 ? '#22c55e' : '#ffffff'; g.font = `700 76px ${F}`; g.textBaseline = 'alphabetic'; g.fillText(v, x + 30, y + 98);
        g.fillStyle = '#8fb2cc'; g.font = `400 30px ${F}`; g.fillText(l, x + 30, y + 146, 400);
      });
      // Maschinenliste
      const x0 = 48, y0 = 350, rowH = 74, rows = Math.min(groups.length, 9);
      g.fillStyle = '#16212b'; roundRect(g, x0, y0, 1180, 760, 18); g.fill();
      g.fillStyle = '#8fb2cc'; g.font = `500 30px ${F}`; g.fillText(t('scr.machines'), x0 + 30, y0 + 52);
      for (let i = 0; i < rows; i++) {
        const gr = groups[i], y = y0 + 90 + i * rowH;
        g.fillStyle = i % 2 ? '#13202a' : '#182633'; g.fillRect(x0 + 20, y, 1140, rowH - 8);
        g.fillStyle = '#ffffff'; g.font = `600 32px ${F}`; g.fillText(`${gr.n}× ${gr.label}`, x0 + 40, y + 46, 560);
        g.fillStyle = '#8fb2cc'; g.font = `400 26px ${F}`; g.fillText(gr.ctl || '', x0 + 620, y + 46, 260);
        g.fillStyle = gr.zid ? '#14532d' : '#3b2f0b'; roundRect(g, x0 + 900, y + 14, 240, 40, 20); g.fill();
        g.fillStyle = gr.zid ? '#86efac' : '#fcd34d'; g.font = `600 24px ${F}`; g.fillText(gr.zid ? '✓ ' + t('scr.synced') : t('scr.manual'), x0 + 920, y + 42, 210);
      }
      // Lagerplatz-Raster (»keeper«) + Standzeit
      const x1 = 1260, w1 = W - x1 - 48;
      g.fillStyle = '#16212b'; roundRect(g, x1, y0, w1, 360, 18); g.fill();
      g.fillStyle = '#8fb2cc'; g.font = `500 30px ${F}`; g.fillText(t('scr.storage'), x1 + 30, y0 + 52);
      let k = 0;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) {
        const on = (k++ * 7919) % 11 > 2;
        g.fillStyle = on ? '#2b4a63' : '#1b2a36'; roundRect(g, x1 + 30 + c * 58, y0 + 80 + r * 64, 48, 52, 8); g.fill();
        if (k === 17) { g.strokeStyle = '#f0e600'; g.lineWidth = 5; roundRect(g, x1 + 30 + c * 58, y0 + 80 + r * 64, 48, 52, 8); g.stroke(); }
      }
      g.fillStyle = '#16212b'; roundRect(g, x1, y0 + 390, w1, 370, 18); g.fill();
      g.fillStyle = '#8fb2cc'; g.font = `500 30px ${F}`; g.fillText(t('scr.life'), x1 + 30, y0 + 442);
      for (let i = 0; i < 6; i++) {
        const v = [.82, .64, .91, .38, .73, .55][i], y = y0 + 480 + i * 44;
        g.fillStyle = '#1b2a36'; g.fillRect(x1 + 30, y, w1 - 60, 26);
        g.fillStyle = v < .45 ? '#f59e0b' : '#22c55e'; g.fillRect(x1 + 30, y, (w1 - 60) * v, 26);
      }
    }, this.aniso);
  }

  buildPath() {
    this.flowG.clear();
    const P = this.path; if (P.length < 2) return;
    const segs = [];
    let L = 0;
    for (let i = 1; i < P.length; i++) {
      const [x0, z0] = P[i - 1], [x1, z1] = P[i];
      const len = Math.hypot(x1 - x0, z1 - z0); if (len < .01) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len + .12, .12), this.lineMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
      m.position.set((x0 + x1) / 2, .003, (z0 + z1) / 2); m.renderOrder = 3; this.flowG.add(m);
      segs.push({ x0, z0, x1, z1, len, L0: L }); L += len;
    }
    this.route = { segs, L };
    // Werkzeug-Impulse entlang des Weges
    const n = Math.max(8, Math.min(70, Math.round(L / 2.2)));
    const geo = new THREE.SphereGeometry(.11, 12, 8);
    this.pulseMat = new THREE.MeshBasicMaterial({ color: YELLOW, toneMapped: false });
    this.pulses = new THREE.InstancedMesh(geo, this.pulseMat, n); this.pulses.frustumCulled = false;
    this.flowG.add(this.pulses);
    // Datenfluss: Bögen vom Einstellgerät zu jeder »zidCode«-Station, Datenpakete laufen darauf
    const pre = [...this.devices.values()].find(d => d.userData.step === 'measure');
    this.arcs = [];
    this.packets = null;
    if (pre && this.zids.length) {
      const arcMat = this.arcMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: .22, depthWrite: false, toneMapped: false });
      for (const m of this.zids) {
        // hoch über den Maschinen, senkrecht auf die Station herab – schneidet keine Maschine
        const [tx, tz] = pre.userData.target, z = m.userData.zidObj;
        const p0 = new THREE.Vector3(tx, 2.2, tz), zp = new THREE.Vector3(m.userData.target[0] + z.position.x, 1.75, m.userData.target[1] + z.position.z);
        const H = 4.6 + p0.distanceTo(zp) * .03;
        const curve = new THREE.CubicBezierCurve3(p0, new THREE.Vector3(tx, H, tz), new THREE.Vector3(zp.x, H, zp.z), zp);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, .009, 5, false), arcMat); tube.userData.afterOnly = true; tube.renderOrder = 4;
        this.flowG.add(tube);
        this.arcs.push({ curve, m });
      }
      this.packets = new THREE.InstancedMesh(new THREE.SphereGeometry(.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, toneMapped: false }), Math.min(30, this.arcs.length * 2));
      this.packets.frustumCulled = false; this.flowG.add(this.packets);
    }
    // »zidCode«-Plaketten über den Stationen: konstante Bildschirmgröße, damit sie auch aus der Ferne sichtbar sind
    this.badges = [];
    if (this.zids.length) {
      const tex = this.zidBadgeTexture();
      for (const m of this.zids) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: true, transparent: true, toneMapped: false }));
        sp.scale.set(.05, .05 * 128 / 400, 1); sp.renderOrder = 6; sp.userData.afterOnly = true; sp.userData.badge = m;
        this.flowG.add(sp); this.badges.push(sp);
      }
    }
    // Stationsnummern am Boden
    this.bounds.stations.forEach((s) => {
      const num = this.plan.stepNo?.[s.step] || STEPS.indexOf(s.step) + 1;
      const tex = canvasTex(128, 128, (g) => { g.fillStyle = '#f0e600'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#000'; g.font = '700 70px "T-Star", Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 64, 70); });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(.36, 32), decal(new THREE.MeshBasicMaterial({ map: tex, transparent: true }), 4));
      disc.rotation.x = -Math.PI / 2; disc.renderOrder = 5;
      const c = this.stationCenter(s);
      const col = s.objs[0].userData.target[2] !== 0;
      const carts = s.objs.every(o => o.userData.pid === 'toolcart');
      disc.position.set(col ? this.path[0][0] + .55 : c.x, .004, col ? c.z : carts ? c.z + .95 : this.path[this.bounds.lMode ? 1 : 0][1] + .55);
      disc.userData.afterOnly = true;
      this.flowG.add(disc);
    });
  }

  zidBadgeTexture() {
    return canvasTex(400, 128, (g) => {
      g.fillStyle = '#f0e600'; roundRect(g, 4, 4, 392, 120, 60); g.fill();
      g.fillStyle = '#000';
      // Scan-Symbol (Ecken + Linie)
      g.lineWidth = 9; g.strokeStyle = '#000';
      const x = 34, y = 30, s = 68;
      for (const [ax, ay, dx, dy] of [[x, y, 1, 1], [x + s, y, -1, 1], [x, y + s, 1, -1], [x + s, y + s, -1, -1]]) { g.beginPath(); g.moveTo(ax, ay + dy * 20); g.lineTo(ax, ay); g.lineTo(ax + dx * 20, ay); g.stroke(); }
      g.fillRect(x + 8, y + s / 2 - 4, s - 16, 8);
      g.font = '700 58px "T-Star", Helvetica, Arial'; g.textBaseline = 'middle'; g.fillText('zidCode', 128, 68, 250);
    }, this.aniso);
  }

  // geplante Menge eines Produkts an einer Station (im Raum stehen evtl. weniger Exemplare)
  stationQty(s, name) {
    const objs = s.objs.filter(o => this.t('prod.' + o.userData.pid) === name);
    return Math.max(objs.length, this.plan.qty?.[objs[0]?.userData.pid] || 0);
  }
  stationCenter(s) {
    let x = 0, z = 0, dx = 0;
    for (const o of s.objs) { x += o.userData.target[0]; z += o.userData.target[1]; dx = Math.max(dx, o.userData.size[2] / 2); }
    x /= s.objs.length; z /= s.objs.length;
    return { x, z, dx };
  }

  buildOld() {
    this.oldG.clear();
    const { tool } = this.bounds;
    const n = Math.max(3, Math.floor((tool.x1 - tool.x0 - 4) / 2.6));
    for (let i = 0; i < n; i++) { const s = oldShelf(i + 1); s.position.set(1.6 + i * 2.5, 0, WALL_Z + .8); this.oldG.add(s); }
    const b = oldBench(); b.position.set(Math.min(tool.x1 - 3, 6), 0, WALL_Z + 4.2); this.oldG.add(b);
    const b2 = oldBench(); b2.position.set(Math.min(tool.x1 - 3, 6) + 3, 0, WALL_Z + 4.2); b2.rotation.y = .1; this.oldG.add(b2);
    this.oldG.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.oldG.visible = this.mode === 'before';
  }

  // ---------------------------------------------------------------- Beschriftung (HTML)
  buildLabels(stations) {
    this.labelLayer.innerHTML = '';
    this.labels = [];
    const t = this.t;
    stations.forEach((s) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'tag tag--station'; el.style.opacity = '0';
      const names = [...new Set(s.objs.map(o => t('prod.' + o.userData.pid)))];
      const counts = names.map(n => { const c = this.stationQty(s, n); return c > 1 ? `${n} ×${c}` : n; });
      el.innerHTML = `<b>${this.plan.stepNo?.[s.step] || STEPS.indexOf(s.step) + 1}</b><span><em>${t('step.' + s.step)}</em>${counts.join(' · ')}</span>`;
      el.addEventListener('click', () => this.opt.onPick && this.opt.onPick({ kind: 'station', step: s.step }));
      this.labelLayer.appendChild(el);
      const c = this.stationCenter(s);
      const h = Math.max(...s.objs.map(o => o.userData.size[1]));
      this.labels.push({ el, pos: new THREE.Vector3(c.x, h + .45, c.z), kind: 'station', step: s.step });
    });
    // Maschinengruppen
    const groups = new Map();
    for (const m of this.machines.values()) {
      const gid = m.userData.info.group; if (!groups.has(gid)) groups.set(gid, []); groups.get(gid).push(m);
    }
    for (const [gid, arr] of groups) {
      const info = arr[0].userData.info;
      const el = document.createElement('button'); el.type = 'button'; el.className = 'tag tag--machine'; el.style.opacity = '0';
      el.innerHTML = `<span><em>${arr.length > 1 ? arr.length + '× ' : ''}${info.label || t('mt.' + info.type)}</em>${info.controlName || ''}${info.zid ? ' · ' + t('prod.' + info.zid) : ''}</span>`;
      el.addEventListener('click', () => this.opt.onPick && this.opt.onPick({ kind: 'machine', key: arr[0].userData.info.key, group: gid }));
      this.labelLayer.appendChild(el);
      const m0 = arr[0];
      const [tx, tz] = m0.userData.target;
      this.labels.push({ el, pos: new THREE.Vector3(tx + m0.userData.center[0], m0.userData.size[1] + .5, tz + m0.userData.center[1]), kind: 'machine' });
    }
    if (this.softAnchor && this.plan.software.length) {
      const el = document.createElement('div'); el.className = 'tag tag--soft'; el.style.opacity = '0';
      el.innerHTML = `<span><em>${t('step.software')}</em>${this.plan.software.map(p => t('prod.' + p)).join(' · ')}</span>`;
      this.labelLayer.appendChild(el);
      this.labels.push({ el, pos: this.softAnchor.clone(), kind: 'soft' });
    }
    this.labelLayer.classList.toggle('is-off', !this.labelsOn);
  }

  updateLabels() {
    if (!this.labelsOn || !this.labels.length) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const v = this._lv || (this._lv = new THREE.Vector3());
    const camPos = this.camera.position;
    const shown = [];
    for (const l of this.labels) {
      v.copy(l.pos).project(this.camera);
      const vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      const d = camPos.distanceTo(l.pos);
      const far = l.kind === 'machine' ? d > 75 : d > 130;
      const show = vis && !far && (l.kind === 'machine' || this.mode === 'after');
      if (show) shown.push({ l, x: (v.x * .5 + .5) * w, y: (-v.y * .5 + .5) * h });
      else { l.el.style.opacity = '0'; l.el.style.pointerEvents = 'none'; }
    }
    // Überlappungen auflösen: Stationen zuerst (vorne vor hinten) und bei Bedarf nach oben gestapelt,
    // Maschinenschilder, die ein anderes Schild verdecken würden, treten zurück
    shown.sort((a, b) => (a.l.kind === 'machine') - (b.l.kind === 'machine') || b.y - a.y);
    const placed = [];
    for (const it of shown) {
      const l = it.l;
      if (!l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
      const x0 = it.x - l.w / 2, x1 = it.x + l.w / 2;
      let y = it.y, ok = true;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find(r => x0 < r.x1 + 4 && x1 > r.x0 - 4 && y - l.h < r.y1 + 3 && y > r.y0 - 3);
        if (!hit) break;
        if (l.kind === 'machine' || k === 5) { ok = false; break; }
        y = hit.y0 - 4;
      }
      l.el.style.opacity = ok ? '' : '0';
      l.el.style.pointerEvents = ok ? '' : 'none';
      if (!ok) continue;
      placed.push({ x0, x1, y0: y - l.h, y1: y });
      l.el.style.transform = `translate(${it.x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  // ---------------------------------------------------------------- Heute / mit ZOLLER
  setMode(mode) { this.mode = mode; this.applyMode(); }
  applyMode() {
    const after = this.mode === 'after';
    this.oldG.visible = !after;
    this.afterG.visible = after;
    this.flowG.children.forEach((o) => { if (o.userData.afterOnly) o.visible = after; });
    let i = 0;
    for (const d of this.devices.values()) {
      const target = after ? 1 : .001;
      if (Math.abs(d.scale.x - target) > .01) this.scaleTo(d, target, (d.userData.spawn ?? i * .05), after);
      d.userData.spawn = 0; i++;
    }
    for (const m of this.machines.values()) {
      if (m.scale.x < .5) this.scaleTo(m, 1, m.userData.spawn || 0, true);
      m.userData.spawn = 0;
      const z = m.userData.zidObj;
      if (z) this.scaleTo(z, after ? 1 : .001, .2, after);
      if (m.userData.zidRing) m.userData.zidRing.visible = after;
    }
    if (this.pulseMat) this.pulseMat.color.set(after ? YELLOW : 0xff4d3d);
    this.lineMat.color.set(after ? YELLOW : 0x9aa0a6); this.lineMat.emissive.set(after ? 0x3a3700 : 0x000000);
    this.renderer.shadowMap.needsUpdate = true;
    this.kick();
  }

  scaleTo(o, s, delay = 0, back = true) {
    const s0 = o.scale.x;
    this.anims.push({ t0: performance.now() + delay * 1000, dur: back ? 750 : 380, step: (k) => {
      const e = back ? easeBack(k) : ease(k); o.scale.setScalar(Math.max(.001, s0 + (s - s0) * e)); o.visible = o.scale.x > .002;
    }, done: () => { this.renderer.shadowMap.needsUpdate = true; } });
    this.kick();
  }

  setFlow(on) { this.flowOn = on; this.flowG.visible = on; this.kick(); }
  setLabels(on) { this.labelsOn = on; this.labelLayer.classList.toggle('is-off', !on); if (on) this.updateLabels(); this.kick(); }

  // ---------------------------------------------------------------- Kamera
  frame(box, dir = [.32, .62, 1], dur = 1.3, margin = .9) {
    // kürzester Abstand, bei dem alle Ecken des Bereichs (bis 2,8 m Höhe) ins Bild passen
    const c = new THREE.Vector3((box.x0 + box.x1) / 2, .6, (box.z0 + box.z1) / 2);
    const pts = [];
    for (const x of [box.x0, box.x1]) for (const z of [box.z0, box.z1]) for (const y of [0, 2.8]) pts.push(new THREE.Vector3(x, y, z));
    const d = new THREE.Vector3(...dir).normalize();
    const cam = this.camera.clone();
    const fits = (dist) => {
      cam.position.copy(c).addScaledVector(d, dist); cam.lookAt(c); cam.updateMatrixWorld();
      return pts.every((p) => { const v = p.clone().project(cam); return v.z < 1 && Math.abs(v.x) <= margin && Math.abs(v.y) <= margin * .92; });
    };
    let lo = 2, hi = 500;
    for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    this.flyTo(c.clone().addScaledVector(d, hi), c, dur);
  }
  flyTo(pos, target, dur = 1.3) {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    this.camAnim = { p0, t0, p1: pos.clone(), t1: target.clone(), start: performance.now(), dur: Math.max(1, dur * 1000) };
    this.kick();
  }
  view(name) {
    this.lastView = name;
    const b = this.bounds; if (!b) return;
    if (name === 'toolroom') this.frame(b.tool, [.12, .5, 1]);
    else if (name === 'hall') this.frame(b.machines, [-.2, .62, 1]);
    else this.frame(b.hall, [.12, .62, 1]);
  }
  focusStation(step) {
    this.lastView = null;
    const s = this.bounds?.stations.find(x => x.step === step);
    if (!s) return false;
    const c = this.stationCenter(s);
    const col = s.objs[0].userData.target[2] !== 0;
    const spread = Math.max(3, ...s.objs.map(o => Math.abs(o.userData.target[col ? 1 : 0] - (col ? c.z : c.x)) * 2 + o.userData.size[0]));
    const dist = 3.2 + spread * 1.05;
    const target = new THREE.Vector3(c.x, 1.0, c.z);
    const pos = col ? new THREE.Vector3(c.x + dist, 2.6 + dist * .25, c.z + dist * .35) : new THREE.Vector3(c.x + dist * .25, 2.6 + dist * .25, c.z + dist);
    this.flyTo(pos, target, 1.4);
    return true;
  }
  focusMachine(key) {
    this.lastView = null;
    const m = this.machines.get(key); if (!m) return;
    const [tx, tz] = m.userData.target;
    const c = new THREE.Vector3(tx + m.userData.center[0], 1.2, tz + m.userData.center[1]);
    this.flyTo(c.clone().add(new THREE.Vector3(2.5, 2.6, 6.5)), c, 1.3);
  }
  zidWorld(m) { const z = m.userData.zidObj; return new THREE.Vector3(m.userData.target[0] + z.position.x, 0, m.userData.target[1] + z.position.z); }
  // Nahaufnahme einer »zidCode«-Station mit Scan: Laser, Bildschirm zeigt die Daten, Steuerung meldet »übernommen«
  focusZid(i = 0, scan = true) {
    this.lastView = null;
    const m = this.zids[i]; if (!m) return false;
    const p = this.zidWorld(m);
    const target = new THREE.Vector3(p.x - .35, 1.15, p.z - .2);
    this.flyTo(new THREE.Vector3(p.x + 1.6, 2.0, p.z + 2.9), target, 1.5);
    if (scan) this.scan(m);
    return true;
  }
  scan(m) {
    const z = m.userData.zidObj, body = m.userData.body;
    if (!z) return;
    // eigener Bildschirm für diese Station (die anderen bleiben beim Scan-Bild)
    if (!this.zidDataTex) { this.zidDataTex = this.texLoader.load(this.base + 'models/tex/screen_zid_data.webp', () => this.kick()); this.zidDataTex.colorSpace = THREE.SRGBColorSpace; this.zidDataTex.anisotropy = this.aniso; }
    const screens = [];
    z.traverse((o) => { if (o.isMesh && o.material?.userData?.screen) { if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; } screens.push(o); } });
    const scanMap = screens[0]?.material.map;
    setMachineState(body, 'before', 0); body.userData.lockState = true;
    if (!this.laser) {
      const g = new THREE.CylinderGeometry(.004, .004, 1, 6); g.rotateZ(Math.PI / 2); g.translate(.5, 0, 0);
      this.laser = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: .9, toneMapped: false }));
      this.flowG.add(this.laser);
    }
    const zp = this.zidWorld(m);
    this.laser.position.set(zp.x + .05, 1.05, zp.z + .12); this.laser.rotation.set(0, Math.PI * .75, -.25); this.laser.scale.set(.6, 1, 1); this.laser.visible = false;
    const t0 = performance.now();
    this.anims.push({ t0, dur: 2600, step: (k) => {
      this.laser.visible = k > .15 && k < .55 && Math.floor(k * 40) % 2 === 0;
      if (k > .55) { for (const s of screens) if (this.zidDataTex) s.material.map = this.zidDataTex; setMachineState(body, 'after', 0); }
    }, done: () => { this.laser.visible = false; body.userData.lockState = false; } });
    clearTimeout(this.scanBack);
    this.scanBack = setTimeout(() => { for (const s of screens) if (scanMap) s.material.map = scanMap; this.kick(); }, 9000);
    this.kick();
  }
  focusSoftware() {
    if (!this.softCenter) return false;
    this.lastView = null;
    const c = this.softCenter;
    this.flyTo(new THREE.Vector3(c.x + .6, c.y - .3, c.z + 6.2), new THREE.Vector3(c.x, c.y - .1, c.z), 1.5);
    return true;
  }
  tour(onStep) {
    this.stopTour();
    const stops = this.bounds.stations.map(s => ({ step: s.step }));
    if (this.zids.length) stops.push({ zid: true });
    if (this.machines.size) stops.push({ hall: true });
    if (this.softCenter) stops.push({ soft: true });
    stops.push({ overview: true });
    let i = 0;
    const next = () => {
      if (i >= stops.length) { this.tourTimer = null; onStep && onStep(null); return; }
      const s = stops[i++];
      if (s.step) this.focusStation(s.step); else if (s.zid) this.focusZid(0, true); else if (s.hall) this.view('hall'); else if (s.soft) this.focusSoftware(); else this.view('overview');
      onStep && onStep(s);
      this.tourTimer = setTimeout(next, s.overview ? 2600 : s.zid ? 7000 : 4600);
    };
    next();
  }
  stopTour() { if (this.tourTimer) { clearTimeout(this.tourTimer); this.tourTimer = null; this.opt.onTourEnd && this.opt.onTourEnd(); } }

  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hits = this.ray.intersectObjects([...this.devG.children, ...this.macG.children], true);
    for (const h of hits) {
      if (h.object.userData.blob || h.object.userData.zidRing) continue;
      let o = h.object;
      while (o) { if (o.userData?.pick && o.visible !== false && o.scale.x > .5) return o.userData.pick; o = o.parent; }
    }
    return null;
  }

  // ---------------------------------------------------------------- Laufzeit
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    for (const l of this.labels || []) l.w = 0;      // Schildgrößen neu messen
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < .8 ? 50 : 36;
    this.camera.updateProjectionMatrix();
    this.applyShift();
    this.kick();
  }
  setShift(f) { this.shift = f; this.applyShift(); this.kick(); }
  setAutoRotate(on) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = .35; this.kick(); }
  applyShift() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (this.shift && w) this.camera.setViewOffset(w, h, -this.shift * w, 0, w, h); else this.camera.clearViewOffset();
  }
  kick() { if (!this.raf && !this.xrActive) this.raf = requestAnimationFrame(this.loop); }
  // Nah- und Fernebene folgen dem Abstand zum Ziel: gleichbleibend hohe Tiefenauflösung, kein Flackern aus der Ferne
  clip() {
    const d = this.camera.position.distanceTo(this.controls.target);
    const near = Math.min(1.5, Math.max(.05, d * .02)), far = Math.max(220, d * 6 + 200);
    if (Math.abs(near - this.camera.near) / this.camera.near > .08 || Math.abs(far - this.camera.far) / this.camera.far > .08) {
      this.camera.near = near; this.camera.far = far; this.camera.updateProjectionMatrix();
    }
  }
  loop() {
    this.raf = 0;
    const now = performance.now();
    const dt = Math.min(.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    let busy = false;
    if (this.camAnim) {
      const a = this.camAnim; const k = Math.min(1, (now - a.start) / a.dur); const e = easeIO(k);
      this.camera.position.lerpVectors(a.p0, a.p1, e); this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (k >= 1) this.camAnim = null; busy = true;
    }
    if (this.anims.length) {
      this.anims = this.anims.filter(a => {
        const k = (now - a.t0) / a.dur; if (k < 0) return true;
        a.step(Math.min(1, k)); if (k >= 1) { a.done && a.done(); return false; } return true;
      });
      busy = true;
    }
    if (this.controls.autoRotate && (this.camAnim || matchMedia('(prefers-reduced-motion: reduce)').matches)) this.controls.autoRotate = false;
    const changed = this.controls.update();
    if (this.controls.autoRotate) busy = true;
    this.clip();
    const cam = this.camera.position;
    // Foto-Aufsteller zur Kamera drehen
    for (const d of this.devices.values()) {
      const b = d.board; if (!b) continue;
      b.rotation.y = Math.atan2(cam.x - d.position.x, cam.z - d.position.z) - d.rotation.y;
    }
    // Maschinen-Signalsäulen
    for (const m of this.machines.values()) if (!m.userData.body.userData.lockState) setMachineState(m.userData.body, this.mode === 'after' ? 'after' : 'before', t);
    // »zidCode«-Plaketten: über der Station, ab mittlerer Entfernung eingeblendet
    if (this.badges) for (const sp of this.badges) {
      const m = sp.userData.badge, p = this.zidWorld(m);
      sp.position.set(p.x, 2.05, p.z);
      const d = cam.distanceTo(sp.position);
      sp.material.opacity = Math.max(0, Math.min(1, (d - 7) / 6));
      sp.visible = this.mode === 'after' && sp.material.opacity > .02 && (m.userData.zidObj?.scale.x || 0) > .5;
    }
    // Werkzeugfluss
    if (this.flowOn && this.route && this.pulses && !document.hidden) {
      const after = this.mode === 'after';
      const n = this.pulses.count, L = this.route.L, speed = after ? 2.4 : .8;
      const mtx = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), sc = this._sc || (this._sc = new THREE.Vector3()), pos = this._pos || (this._pos = new THREE.Vector3());
      const visible = after ? n : Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const s = ((t * speed + i * L / n) % L + L) % L;
        const seg = this.route.segs.find(g => s >= g.L0 && s <= g.L0 + g.len) || this.route.segs[0];
        const k = (s - seg.L0) / seg.len;
        const x = seg.x0 + (seg.x1 - seg.x0) * k, z = seg.z0 + (seg.z1 - seg.z0) * k;
        sc.setScalar(i < visible ? (after ? 1 : .8) : .0001);
        mtx.compose(pos.set(x, .16 + Math.sin(t * 4 + i) * .02, z), q, sc);
        this.pulses.setMatrixAt(i, mtx);
      }
      this.pulses.instanceMatrix.needsUpdate = true;
      if (this.packets) {
        const pn = this.packets.count, cam = this.camera.position;
        // vor dem Leitstand (Nahansicht Software) treten Bögen und Pakete zurück, damit der Bildschirm frei bleibt
        const dimSoft = this.softCenter ? THREE.MathUtils.clamp((cam.distanceTo(this.softCenter) - 6.5) / 4, 0, 1) : 1;
        this.arcMat.opacity = .22 * (.18 + .82 * dimSoft);
        for (let i = 0; i < pn; i++) {
          const a = this.arcs[i % this.arcs.length];
          const k = ((t * .3 + i / pn) % 1);
          a.curve.getPoint(k, pos);
          const near = THREE.MathUtils.clamp((pos.distanceTo(cam) - 1.5) / 3, 0, 1) * dimSoft;
          sc.setScalar(after && near > .05 ? near : .0001);
          mtx.compose(pos, q, sc);
          this.packets.setMatrixAt(i, mtx);
        }
        this.packets.instanceMatrix.needsUpdate = true;
      }
      busy = true;
    }
    if (this.mode === 'before' && this.machines.size) busy = true;     // blinkende Signalsäulen
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    // adaptive Auflösung mit Hysterese (kein Hin- und Herspringen, das wie Flackern wirkt)
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 60) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length; this.frameTimes = [];
      this.prSlow = avg > .030 ? this.prSlow + 1 : 0;
      this.prFast = avg < .012 ? this.prFast + 1 : 0;
      if (this.prSlow >= 2 && this.pr > 1) { this.pr = Math.max(1, this.pr - .25); this.prSlow = 0; this.prChanges++; this.renderer.setPixelRatio(this.pr); this.resize(); }
      else if (this.prFast >= 5 && this.pr < this.maxPR && this.prChanges < 4) { this.pr = Math.min(this.maxPR, this.pr + .25); this.prFast = 0; this.prChanges++; this.renderer.setPixelRatio(this.pr); this.resize(); }
    }
    if (busy || changed) this.kick();
  }

  // ---------------------------------------------------------------- Export: Bild + GLB
  snapshot(w = 1600, h = 900, view = 'hall') {
    // eigenes Bild im Format w×h: Bereich sofort einpassen, danach Kamera und Größe zurück
    const pr = this.renderer.getPixelRatio();
    const cam = this.camera, keep = { pos: cam.position.clone(), tgt: this.controls.target.clone(), fov: cam.fov, near: cam.near, far: cam.far };
    const labels = this.labelsOn;
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    cam.clearViewOffset(); cam.aspect = w / h; cam.fov = 34; cam.updateProjectionMatrix();
    if (this.bounds) {
      const anim = this.camAnim;
      const box = view === 'tool' ? this.bounds.tool : this.bounds.hall;
      this.frame(box, view === 'tool' ? [.12, .5, 1] : [.12, .62, 1], 0, .96);
      const a = this.camAnim; this.camAnim = anim;
      if (a) { cam.position.copy(a.p1); cam.lookAt(a.t1); this.controls.target.copy(a.t1); }
    }
    this.clip();
    this.renderer.render(this.scene, cam);
    const url = this.canvas.toDataURL('image/jpeg', .9);
    cam.position.copy(keep.pos); cam.fov = keep.fov; this.controls.target.copy(keep.tgt); cam.lookAt(keep.tgt);
    this.renderer.setPixelRatio(pr); this.resize(); this.clip();
    this.labelsOn = labels;
    return url;
  }
  exportRoot(toolroomOnly = false) {
    const g = new THREE.Group(); g.name = 'ZOLLER_Werkzeugraum';
    const parts = toolroomOnly ? [...this.devG.children.filter(o => !PRODUCTS[o.userData.pid]?.atMachine), this.zone]
                               : [...this.devG.children, ...this.macG.children, ...this.zoneG.children.filter(o => o.isMesh && !o.userData.glass)];
    for (const o of parts) {
      if (!o) continue;
      if (o.scale.x < .5) continue;
      const c = o.clone(true);
      c.traverse(x => { if (x.isMesh && x.userData.blob) x.visible = false; });
      g.add(c);
    }
    return g;
  }
  async exportGLB() {
    const { GLTFExporter } = await import('../vendor/GLTFExporter.js');
    const root = this.exportRoot();
    return new Promise((res, rej) => new GLTFExporter().parse(root, (buf) => res(new Blob([buf], { type: 'model/gltf-binary' })), rej, { binary: true, onlyVisible: true }));
  }

  // ---------------------------------------------------------------- Export: AR (USDZ für AR Quick Look auf iPhone/iPad)
  // Geräte kommen als vorbereitete USDC-Dateien (docs/ar, zweiseitige Flächen, echte Materialien und Bildschirme) und werden
  // im Paket nur referenziert; Boden, Foto-Aufsteller und Kundenmaschinen erzeugt der three.js-USDZ-Exporter.
  // kind 'room': Werkzeugraum in Originalgröße; 'hall': ganze Halle als Modell im Maßstab 1:20.
  async buildUSDZ(kind = 'room') {
    if (!this.bounds) throw new Error('no plan');
    const key = kind + '|' + this.planKey();
    if (this.arCache?.key === key) return this.arCache.blob;
    const { USDZExporter } = await import('../vendor/USDZExporter.js');
    const { unzipSync, zipSync, strToU8, strFromU8 } = await import('../vendor/fflate.module.js');
    const room = kind === 'room';
    const S = room ? 1 : 1 / 20;
    const b = room ? this.bounds.tool : this.bounds.hall;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const toLocal = new THREE.Matrix4().makeScale(S, S, S).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
    const rest = new THREE.Group();
    const refs = [];
    const devs = [...this.devG.children].filter(o => o.scale.x > .5 && (!room || !PRODUCTS[o.userData.pid]?.atMachine));
    for (const h of devs) {
      h.updateMatrixWorld(true);
      const cad = h.userData.cad;
      if (cad && this.opt.models[cad]?.ar) { refs.push({ cad, m: toLocal.clone().multiply(h.matrixWorld) }); continue; }
      if (h.userData.photo) {
        // Foto-Aufsteller: Vorder- und Rückseite, frontal ausgerichtet
        const c = h.clone(true); c.traverse(x => { if (x.isMesh && x.userData.blob) x.visible = false; });
        const bd = c.getObjectByName('board'); if (bd) bd.rotation.y = 0;
        const flat = [];
        c.traverse(x => { if (x.isMesh && x.material?.alphaTest) flat.push(x); });
        for (const p of flat) { const back = p.clone(); back.rotation.y = Math.PI; back.position.z -= .002; p.parent.add(back); }
        c.applyMatrix4(toLocal.clone().multiply(h.parent.matrixWorld));
        rest.add(c);
      }
    }
    // Boden: ein Bild mit Werkzeugraum-Fläche, Rand, Schriftzug und Stationsnummern (eine Fläche, kein z-fighting)
    rest.add(this.arFloor(b, toLocal, room));
    if (!room) {
      for (const m of this.macG.children) {
        if (m.scale.x < .5) continue;
        m.updateMatrixWorld(true);
        const c = new THREE.Group();
        m.userData.body.traverse((x) => {
          if (!x.isMesh) return;
          const mesh = new THREE.Mesh(x.geometry, this.arMaterial(x.material));
          mesh.applyMatrix4(x.matrixWorld); c.add(mesh);
        });
        c.applyMatrix4(toLocal);
        rest.add(c);
        const z = m.userData.zidObj;
        if (z && this.opt.models.zidcode?.ar && z.scale.x > .5) { z.updateMatrixWorld(true); refs.push({ cad: 'zidcode', m: toLocal.clone().multiply(z.matrixWorld) }); }
      }
    }
    rest.updateMatrixWorld(true);
    const arr = await new USDZExporter().parseAsync(rest, { quickLookCompatible: true, maxTextureSize: 4096 });
    const files = unzipSync(arr);
    let usda = strFromU8(files['model.usda']);
    const END = '\n\t\t}\n\t}\n}\n\n';
    const at = usda.indexOf(END);
    const fmt = (e) => `( (${e[0]}, ${e[1]}, ${e[2]}, ${e[3]}), (${e[4]}, ${e[5]}, ${e[6]}, ${e[7]}), (${e[8]}, ${e[9]}, ${e[10]}, ${e[11]}), (${e[12]}, ${e[13]}, ${e[14]}, ${e[15]}) )`;
    const xf = refs.map((r, i) => `\n\t\t\tdef Xform "ZOLLER_${r.cad}_${i}" (\n\t\t\t\tprepend references = @./devices/${r.cad}.usdc@\n\t\t\t)\n\t\t\t{\n\t\t\t\tmatrix4d xformOp:transform = ${fmt(r.m.elements)}\n\t\t\t\tuniform token[] xformOpOrder = ["xformOp:transform"]\n\t\t\t}\n`).join('');
    usda = usda.slice(0, at) + xf + usda.slice(at);
    const out = { 'model.usda': strToU8(usda) };
    for (const [k, v] of Object.entries(files)) if (k !== 'model.usda') out[k] = v;
    // Gerätedateien + Bildschirmbilder dazuladen
    const need = [...new Set(refs.map(r => r.cad))];
    await Promise.all(need.map(async (cad) => {
      const ar = this.opt.models[cad].ar;
      out[`devices/${cad}.usdc`] = new Uint8Array(await (await fetch(this.base + ar.file)).arrayBuffer());
      for (const tx of ar.tex || []) out['devices/tex/' + tx.split('/').pop()] = new Uint8Array(await (await fetch(this.base + tx)).arrayBuffer());
    }));
    // 64-Byte-Ausrichtung jeder Datei im unkomprimierten Paket (Vorgabe für USDZ, wie im three.js-Exporter)
    let offset = 0;
    const zipIn = {};
    for (const name of Object.keys(out)) {
      const file = out[name];
      offset += 34 + name.length;
      const mod = offset & 63;
      if (mod !== 4) { zipIn[name] = [file, { extra: { 12345: new Uint8Array(64 - mod) } }]; offset += 64 - mod; } else zipIn[name] = file;
      offset += file.length;
    }
    const blob = new Blob([zipSync(zipIn, { level: 0 })], { type: 'model/vnd.usdz+zip' });
    this.arCache = { key, blob };
    return blob;
  }
  planKey() {
    return [...this.devG.children].filter(o => o.scale.x > .5).map(o => o.userData.pid + '@' + o.position.x.toFixed(2) + ',' + o.position.z.toFixed(2)).join(';') + '|' +
           [...this.macG.children].map(m => m.userData.sig + '@' + m.position.x.toFixed(2)).join(';');
  }
  // three.js-Material → für USDZ geeignetes Material (MeshBasic → leuchtend, sonst Standard/Physical übernehmen)
  arMaterial(mat) {
    if (mat.isMeshStandardMaterial) return mat;
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: mat.map || null, map: mat.map || null, roughness: .4, transparent: mat.transparent, opacity: mat.opacity });
    if (!mat.map) { m.color.copy(mat.color || new THREE.Color(0xffffff)); m.emissive.copy(mat.color || new THREE.Color(0)); }
    return m;
  }
  // Raum 1:1: nur gelbes Bodenband, Weg und Stationsschilder (freigestellt) – die Geräte stehen auf dem echten Hallenboden.
  // Halle 1:20: Bodenplatte mit Gängen als Tischmodell.
  arFloor(b, toLocal, room) {
    const w = b.x1 - b.x0 + (room ? .6 : 2), d = b.z1 - b.z0 + (room ? .6 : 2);
    const ppm = Math.min(room ? 120 : 60, 4096 / Math.max(w, d));
    const cw = Math.round(w * ppm), ch = Math.round(d * ppm);
    const ox = b.x0 - (room ? .3 : 1), oz = b.z0 - (room ? .3 : 1);
    const X = (x) => (x - ox) * ppm, Z = (z) => (z - oz) * ppm;
    const tool = this.bounds.tool, t = this.t;
    const FONT = '"T-Star", Helvetica, Arial';
    const tex = canvasTex(cw, ch, (g) => {
      if (!room) {
        g.fillStyle = '#d3d6d8'; g.fillRect(0, 0, cw, ch);
        const ax0 = this.bounds.xM0 - 2.6, aw = (this.bounds.mxMax + .4 - ax0) * ppm;
        for (const az of this.bounds.aisles || []) { g.fillStyle = '#bfc4c8'; g.fillRect(X(ax0), Z(az - 1.2), aw, 2.4 * ppm); g.fillStyle = '#f0e600'; g.fillRect(X(ax0), Z(az - 1.2), aw, .07 * ppm); g.fillRect(X(ax0), Z(az + 1.13), aw, .07 * ppm); }
        g.fillStyle = '#2c2f33'; g.fillRect(X(tool.x0), Z(tool.z0), (tool.x1 - tool.x0) * ppm, (tool.z1 - tool.z0) * ppm);
      }
      g.fillStyle = '#f0e600';
      const k = .1 * ppm;
      g.fillRect(X(tool.x0), Z(tool.z1) - k, (tool.x1 - tool.x0) * ppm, k);
      g.fillRect(X(tool.x0), Z(tool.z0), k, (tool.z1 - tool.z0) * ppm);
      g.fillRect(X(tool.x1) - k, Z(tool.z0), k, (tool.z1 - tool.z0) * ppm);
      if (room) g.fillRect(X(tool.x0), Z(tool.z0), (tool.x1 - tool.x0) * ppm, k);
      // Weg
      g.strokeStyle = '#f0e600'; g.lineWidth = Math.max(2, .12 * ppm); g.lineJoin = 'round'; g.beginPath();
      this.path.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke();
      g.fillStyle = '#f0e600'; g.font = `700 ${Math.round(.7 * ppm)}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillText(t('room.area').toUpperCase(), X(tool.x0 + .5), Z(tool.z1 - .75), 7 * ppm);
      if (!room) return;
      // Stationsschilder am Boden (wie im 3D-Raum: Nummer am Weg, darunter Schritt und Geräte)
      const pz = this.path[this.bounds.lMode ? 1 : 0][1];
      for (const st of this.bounds.stations) {
        if (st.objs.some(o => PRODUCTS[o.userData.pid]?.atMachine)) continue;
        const num = String(this.plan.stepNo?.[st.step] || STEPS.indexOf(st.step) + 1);
        const c = this.stationCenter(st);
        const col = st.objs[0].userData.target[2] !== 0;
        const carts = st.objs.every(o => o.userData.pid === 'toolcart');
        const px = col ? this.path[0][0] + .55 : c.x, pzz = col ? c.z : carts ? c.z + .95 : pz + .55;
        const names = [...new Set(st.objs.map(o => t('prod.' + o.userData.pid)))];
        const line = names.map(n => { const q = this.stationQty(st, n); return q > 1 ? `${n} ×${q}` : n; }).join(' · ');
        const head = t('step.' + st.step).toUpperCase();
        g.save(); g.translate(X(px), Z(pzz)); if (col) g.rotate(-Math.PI / 2);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const maxW = 3.4 * ppm;
        g.font = `700 ${Math.round(.26 * ppm)}px ${FONT}`; const w1 = Math.min(maxW, g.measureText(head).width);
        g.font = `500 ${Math.round(.18 * ppm)}px ${FONT}`; const w2 = Math.min(maxW, g.measureText(line).width);
        const pw = Math.max(w1, w2) + .36 * ppm;
        g.fillStyle = '#16181b'; roundRect(g, -pw / 2, .44 * ppm, pw, .7 * ppm, .12 * ppm); g.fill();
        g.fillStyle = '#f0e600'; g.beginPath(); g.arc(0, 0, .36 * ppm, 0, 7); g.fill();
        g.fillStyle = '#111'; g.font = `700 ${Math.round(.42 * ppm)}px ${FONT}`; g.fillText(num, 0, .03 * ppm);
        g.fillStyle = '#f0e600'; g.font = `700 ${Math.round(.26 * ppm)}px ${FONT}`; g.fillText(head, 0, .66 * ppm, maxW);
        g.fillStyle = '#fff'; g.font = `500 ${Math.round(.18 * ppm)}px ${FONT}`; g.fillText(line, 0, .95 * ppm, maxW);
        g.restore();
      }
    }, 1);
    tex.flipY = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial(room ? { map: tex, roughness: .7, alphaTest: .5 } : { map: tex, roughness: .6 }));
    m.rotation.x = -Math.PI / 2; m.position.set(ox + w / 2, .002, oz + d / 2);
    m.updateMatrix();
    m.applyMatrix4(toLocal);
    return m;
  }
}
