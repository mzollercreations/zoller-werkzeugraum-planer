// 3D-Halle des Planers: Werkzeugraum aus offiziellen ZOLLER-CAD-Modellen + Maschinenhalle mit den Kundenmaschinen.
// Koordinaten: X nach rechts, Z zum Betrachter, Y nach oben, Meter. Rückwand bei z = WALL_Z.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { DRACOLoader } from '../vendor/DRACOLoader.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { buildMachine, setMachineState, oldShelf, oldBench } from './machines.js';
import { PRODUCTS, STEPS } from './knowledge.js';

const WALL_Z = -6;
const YELLOW = 0xf0e600;
const LINE_ORDER = ['inspect', 'store', 'assemble', 'shrink', 'balance', 'measure', 'supply'];
const MACHINE_ORDER = ['5ax', 'vmc', 'hmc', 'turnmill', 'lathe', 'swiss', 'grinder', 'other'];
const ease = (t) => 1 - Math.pow(1 - t, 3);
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
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export class Hall {
  constructor(el, opt) {
    this.el = el; this.opt = opt; this.base = opt.base || '';
    this.loop = this.loop.bind(this);
    this.t = opt.t || ((k) => k);
    this.mode = 'after'; this.flowOn = true; this.labelsOn = true;
    this.anims = []; this.devices = new Map(); this.machines = new Map(); this.labels = [];
    this.templates = new Map(); this.photoTex = new Map();
    this.canvas = el.querySelector('canvas');
    this.labelLayer = el.querySelector('[data-labels]');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.maxPR = Math.min(window.devicePixelRatio || 1, 2); this.pr = this.maxPR;
    r.setPixelRatio(this.pr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .9;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = false;
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(0xeef0f2);
    sc.fog = new THREE.Fog(0xeef0f2, 90, 260);
    const pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
    sc.environmentIntensity = .75;
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 700);
    this.camera.position.set(-10, 26, 46);
    const c = this.controls = new OrbitControls(this.camera, this.canvas);
    c.enableDamping = true; c.dampingFactor = .08; c.maxPolarAngle = 1.42; c.minDistance = 2.2; c.maxDistance = 220;
    c.screenSpacePanning = true; c.target.set(10, 0, 0);
    c.addEventListener('change', () => this.kick());
    c.addEventListener('start', () => { this.stopTour(); this.camAnim = null; this.lastView = null; });
    // Licht
    sc.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bb, .85));
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e2, 2.1);
    sun.castShadow = true; sun.shadow.mapSize.set(window.innerWidth > 900 ? 4096 : 2048, window.innerWidth > 900 ? 4096 : 2048);
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
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
    for (const [k, v] of Object.entries(CLS)) this.lib[k] = new THREE.MeshPhysicalMaterial({ ...v, color: new THREE.Color(v.color), side: THREE.DoubleSide });   // CAD-Flächen sind nicht einheitlich orientiert
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
    this.clock = new THREE.Clock(); this.frameTimes = [];
    this.resize();
    this.kick();
  }

  // ---------------------------------------------------------------- Grundausstattung der Halle
  buildFloor() {
    const tex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#d2d5d7'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '120,125,130'},${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.strokeStyle = 'rgba(150,155,160,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(100, 100);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: tex, roughness: .62, metalness: 0, envMapIntensity: .6 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'floor';
    this.envG.add(floor);
    this.floor = floor;
    this.wallMat = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: .9 });
    this.colMat = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: .6, metalness: .3 });
    this.laneMat = new THREE.MeshStandardMaterial({ color: 0xc2c6c9, roughness: .7 });
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ea, roughness: .05, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide });
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: .5, metalness: .4 });
    this.zoneMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: .55, metalness: .05, envMapIntensity: .7 });
    this.yellowMat = new THREE.MeshBasicMaterial({ color: YELLOW });
    this.lineMat = new THREE.MeshStandardMaterial({ color: YELLOW, roughness: .4, emissive: 0x3a3700 });
    this.shadowTex = canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(.6, 'rgba(0,0,0,.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
  }

  blob(w, d) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.35 + .6, d * 1.35 + .6), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: .55 }));
    m.rotation.x = -Math.PI / 2; m.position.y = .006; m.renderOrder = 1;
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
            const tex = this.texLoader.load(this.base + man.screen); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
            scr = new THREE.MeshStandardMaterial({ color: 0x020203, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.05, roughness: .08, metalness: 0 });
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
    if (!tex) { tex = this.texLoader.load(this.base + 'img/p/' + key + '.webp', () => this.kick()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; this.photoTex.set(key, tex); }
    const aspect = this.opt.aspects?.[key] || 1.2;
    const w = h * aspect;
    const y0 = pr.table ? .82 : .05;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w * .9, pr.foot?.[0] || 1), pr.table ? .04 : .05, Math.max(.6, (pr.foot?.[1] || 1) * .8)), this.frameMat);
    plinth.position.y = y0 - .025; plinth.receiveShadow = true; plinth.castShadow = true; g.add(plinth);
    if (pr.table) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, y0, .05), this.frameMat); leg.position.set(sx * (Math.max(w * .9, 1) / 2 - .06), y0 / 2, sz * .26); g.add(leg); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: .55 }));
    m.position.y = h / 2 + y0; m.castShadow = true; g.add(m);
    g.userData.size = [Math.max(w * .9, pr.foot?.[0] || 1), h + y0, Math.max(.6, (pr.foot?.[1] || 1) * .8)];
    g.userData.photo = true;
    return g;
  }

  // ---------------------------------------------------------------- Plan übernehmen
  // plan = { devices: [{key, pid}], machines: [{key, type, accent, controlName, label, group, zid, custom}], software: [pid], lang }
  async setPlan(plan) {
    this.plan = plan;
    const need = new Set();
    for (const d of plan.devices) { const pr = PRODUCTS[d.pid]; if (pr.cad) need.add(pr.cad); }
    if (plan.machines.some(m => m.zid)) need.add('zidcode');
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
      if (pr.cad) { const t = await this.template(pr.cad); obj = t ? t.clone() : this.photo(d.pid); obj.userData.size = t?.userData.size; }
      else obj = this.photo(d.pid);
      const holder = new THREE.Group(); holder.add(obj);
      const sz = obj.userData.size || [1, 1.5, 1];
      holder.add(this.blob(sz[0], sz[2]));
      holder.userData = { pick: { kind: 'device', pid: d.pid, key: d.key }, size: sz, pid: d.pid, step: pr.step, photo: !!obj.userData.photo };
      holder.scale.setScalar(.001);
      this.devG.add(holder);
      this.devices.set(d.key, holder);
      holder.userData.spawn = i++ * .06;
    }
    for (const [k, o] of this.devices) if (!seen.has(k)) { this.devG.remove(o); this.devices.delete(k); }
    // --- Maschinen
    const mseen = new Set();
    for (const m of plan.machines) {
      mseen.add(m.key);
      const sig = [m.type, m.accent, m.controlName, m.label, m.zid, m.custom ? m.custom.uuid : ''].join('|');
      const ex = this.machines.get(m.key);
      if (ex && ex.userData.sig === sig) { ex.userData.info = m; continue; }
      if (ex) this.macG.remove(ex);
      const g = new THREE.Group();
      let body;
      if (m.custom) { body = m.custom.clone(); body.userData = { custom: true }; }
      else body = buildMachine(m.type, { accent: m.accent, controlName: m.controlName, label: m.label, lang: plan.lang });
      body.userData.phase = Math.random() * 2;
      g.add(body);
      const bb = new THREE.Box3().setFromObject(body);
      const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
      g.add(this.blob(size[0], size[2]));
      if (m.zid) {
        const t = await this.template('zidcode');
        if (t) {
          const z = t.clone(); z.userData.zid = true; z.scale.setScalar(.001);
          z.position.set(bb.max.x + .42, 0, bb.max.z - .25); z.rotation.y = -.35;
          z.userData.pick = { kind: 'device', pid: m.zid, key: m.key + ':zid' };
          g.add(z); g.userData.zidObj = z;
        }
      }
      g.userData = { ...g.userData, pick: { kind: 'machine', key: m.key, group: m.group }, info: m, body, size, bb, sig, center: [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2] };
      g.scale.setScalar(ex ? 1 : .001);
      if (!ex) g.userData.spawn = Math.random() * .3;
      this.macG.add(g);
      this.machines.set(m.key, g);
    }
    for (const [k, o] of this.machines) if (!mseen.has(k)) { this.macG.remove(o); this.machines.delete(k); }
    const before = JSON.stringify(this.bounds?.hall || null);
    this.layout();
    if (this.lastView && JSON.stringify(this.bounds.hall) !== before) this.view(this.lastView);
    this.applyMode(true);
    this.renderer.shadowMap.needsUpdate = true;
    this.kick();
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
    const stations = [];     // {step, objs, center}
    const addStation = (step, ...objs) => {
      let s = stations.find(x => x.step === step && x === stations[stations.length - 1]) || stations.find(x => x.step === step);
      if (!s) { s = { step, objs: [] }; stations.push(s); }
      s.objs.push(...objs);
    };
    let x = 1.6, colDepth = 0;
    let zCol0 = 0, path = [];
    if (lMode) {
      colDepth = Math.max(...colItems.map(d => d.userData.size[2]));
      // Spalte an der linken Wand, Front nach +X; vorne beginnt der Rücklauf (Prüfen), dann Lager nach hinten
      let z = WALL_Z + 1.4 + 6;  // vorläufig, unten neu berechnet
      const ordered = [...colItems].sort((a, b) => order(a) - order(b));
      const total = ordered.reduce((a, d) => a + d.userData.size[0], 0) + GAP * (ordered.length - 1);
      z = WALL_Z + 2.6 + total;      // vorderes Ende der Spalte
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
    const toolZ1 = Math.max(pathZ + 2.6, lMode ? zCol0 + 1.6 : 0, WALL_Z + 9.5);
    // Werkzeugwagen parken an der Tür zur Halle
    carts.forEach((d, i) => { d.userData.target = [TW - 1.6 - i * 1.9, toolZ1 - 1.5, 0]; });
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
        const extra = m.userData.zidObj ? .95 : 0;
        // Front aller Maschinen einer Reihe auf einer Linie
        const front = rowBack + depth;
        m.userData.target = [mx - bb.min.x, front - bb.max.z, 0];
        mx += s[0] + extra + 1.5;
      }
      mxMax = Math.max(mxMax, mx);
      const az = rowBack + depth + 1.5;
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
    const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix();
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
    }, done: () => { this.renderer.shadowMap.needsUpdate = true; } });
    this.kick();
  }

  buildZone() {
    this.zoneG.clear();
    const { tool, hall, TW } = this.bounds;
    const w = tool.x1 - tool.x0, d = tool.z1 - tool.z0;
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.zoneMat);
    zone.rotation.x = -Math.PI / 2; zone.position.set(tool.x0 + w / 2, .004, tool.z0 + d / 2); zone.receiveShadow = true; this.zoneG.add(zone);
    const strip = (x, z, sx, sz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), this.yellowMat); m.rotation.x = -Math.PI / 2; m.position.set(x, .007, z); this.zoneG.add(m); };
    strip(tool.x0 + w / 2, tool.z1 - .05, w, .1); strip(tool.x0 + .05, tool.z0 + d / 2, .1, d); strip(tool.x1 - .05, tool.z0 + d / 2, .1, d);
    // Rückwand über die ganze Halle + linke Wand
    const H = 6.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(hall.x1 - hall.x0 + 8, H, .3), this.wallMat);
    back.position.set((hall.x0 + hall.x1) / 2, H / 2, WALL_Z - .15); back.receiveShadow = true; this.zoneG.add(back);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(hall.x1 - hall.x0 + 8, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    band.position.set((hall.x0 + hall.x1) / 2, H - .9, WALL_Z + .01); this.zoneG.add(band);
    const base = new THREE.Mesh(new THREE.BoxGeometry(hall.x1 - hall.x0 + 8, .3, .04), this.frameMat);
    base.position.set((hall.x0 + hall.x1) / 2, .15, WALL_Z + .02); this.zoneG.add(base);
    for (let x = hall.x0 - 3; x <= hall.x1 + 4; x += 7.2) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(.42, H, .42), this.colMat); col.position.set(x, H / 2, WALL_Z + .22); col.castShadow = true; this.zoneG.add(col);
    }
    // Fahr- und Gehwege zwischen den Maschinenreihen
    for (const az of this.bounds.aisles || []) {
      const x0 = this.bounds.xM0 - 2.6, x1 = this.bounds.mxMax + .4, w = x1 - x0;
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), this.laneMat); lane.rotation.x = -Math.PI / 2; lane.position.set(x0 + w / 2, .003, az); lane.receiveShadow = true; this.zoneG.add(lane);
      strip(x0 + w / 2, az - 1.2, w, .07); strip(x0 + w / 2, az + 1.2, w, .07);
    }
    const left = new THREE.Mesh(new THREE.BoxGeometry(.3, H, hall.z1 - hall.z0 + 6), this.wallMat);
    left.position.set(hall.x0 - 3.15, H / 2, (hall.z0 + hall.z1) / 2 + 3); left.receiveShadow = true; this.zoneG.add(left);
    // Glaswand Werkzeugraum (rechts, mit Tür auf Höhe des Weges) + vorne
    const gw = (x, z, len, rot) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.8), this.glassMat); g.position.set(x, 1.4, z); g.rotation.y = rot; g.renderOrder = 3; this.zoneG.add(g);
      const top = new THREE.Mesh(new THREE.BoxGeometry(rot ? .06 : len, .06, rot ? len : .06), this.frameMat); top.position.set(x, 2.8, z); this.zoneG.add(top);
    };
    const pz = this.path[this.path.length > 1 ? 1 : 0][1];
    const door0 = pz - 1.3, door1 = pz + 1.3;
    if (door0 - WALL_Z > .2) gw(TW, (WALL_Z + door0) / 2, door0 - WALL_Z, Math.PI / 2);
    if (tool.z1 - door1 > .2) gw(TW, (door1 + tool.z1) / 2, tool.z1 - door1, Math.PI / 2);
    gw(TW / 2, tool.z1, TW, 0);
    // Schriftzug am Boden + Wandschild
    const label = this.t('room.area').toUpperCase();
    const floorTxt = canvasTex(1024, 128, (g, cw, ch) => { g.fillStyle = 'rgba(240,230,0,.9)'; g.font = '700 84px "T-Star", Helvetica, Arial'; g.textBaseline = 'middle'; g.fillText(label, 10, ch / 2 + 4); });
    const ft = new THREE.Mesh(new THREE.PlaneGeometry(7, .875), new THREE.MeshBasicMaterial({ map: floorTxt, transparent: true, depthWrite: false }));
    ft.rotation.x = -Math.PI / 2; ft.position.set(tool.x0 + .5 + 3.5, .008, tool.z1 - .75); this.zoneG.add(ft);
    if (this.opt.logo) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .73), new THREE.MeshBasicMaterial({ map: this.opt.logo, transparent: true }));
      sign.position.set(Math.min(TW / 2, 9), 4.3, WALL_Z + .02); this.zoneG.add(sign);
    }
    // Software: großer Leitstand-Bildschirm an der Rückwand
    if (this.plan.software.length) {
      const tex = this.texLoader.load(this.base + 'models/tex/screen_tms_keeper.webp', () => this.kick()); tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.9), new THREE.MeshStandardMaterial({ color: 0x020203, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .95, roughness: .1 }));
      const sx = Math.max(TW - 4, 6);
      scr.position.set(sx, 3.6, WALL_Z + .06);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, .08), this.frameMat); fr.position.set(sx, 3.6, WALL_Z + .02);
      this.afterG.clear(); this.afterG.add(fr, scr);
      this.softAnchor = new THREE.Vector3(sx, 4.8, WALL_Z + .1);
    } else { this.softAnchor = null; this.afterG.clear(); }
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
      m.position.set((x0 + x1) / 2, .009, (z0 + z1) / 2); this.flowG.add(m);
      segs.push({ x0, z0, x1, z1, len, L0: L }); L += len;
    }
    this.route = { segs, L };
    // Werkzeug-Impulse entlang des Weges
    const n = Math.max(8, Math.min(70, Math.round(L / 2.2)));
    const geo = new THREE.SphereGeometry(.11, 12, 8);
    this.pulseMat = new THREE.MeshBasicMaterial({ color: YELLOW, toneMapped: false });
    this.pulses = new THREE.InstancedMesh(geo, this.pulseMat, n); this.pulses.frustumCulled = false;
    this.flowG.add(this.pulses);
    // Daten-Pakete: vom Einstellgerät zu den »zidCode«-Stationen
    const pre = [...this.devices.values()].find(d => d.userData.step === 'measure');
    const zids = [...this.machines.values()].filter(m => m.userData.zidObj);
    this.arcs = [];
    if (pre && zids.length) {
      for (const m of zids) this.arcs.push({ m, pre });
      this.packets = new THREE.InstancedMesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false }), Math.min(24, zids.length * 2));
      this.packets.frustumCulled = false; this.flowG.add(this.packets);
    } else this.packets = null;
    // Stationsnummern am Boden
    this.bounds.stations.forEach((s, i) => {
      const num = this.plan.stepNo?.[s.step] || STEPS.indexOf(s.step) + 1;
      const tex = canvasTex(128, 128, (g) => { g.fillStyle = '#f0e600'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#000'; g.font = '700 70px "T-Star", Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 64, 70); });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(.36, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      disc.rotation.x = -Math.PI / 2;
      const c = this.stationCenter(s);
      const col = s.objs[0].userData.target[2] !== 0;
      disc.position.set(col ? c.x + c.dx + .9 : c.x, .012, col ? c.z : this.path[this.bounds.lMode ? 1 : 0][1] + .55);
      if (col) disc.position.x = this.path[0][0] + .55;
      disc.userData.afterOnly = true;
      this.flowG.add(disc);
    });
  }

  stationCenter(s) {
    let x = 0, z = 0, w = 0, dx = 0;
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
      const counts = names.map(n => { const c = s.objs.filter(o => t('prod.' + o.userData.pid) === n).length; return c > 1 ? `${n} ×${c}` : n; });
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
    const v = new THREE.Vector3();
    const camPos = this.camera.position;
    for (const l of this.labels) {
      v.copy(l.pos).project(this.camera);
      const vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      const d = camPos.distanceTo(l.pos);
      const far = l.kind === 'machine' ? d > 70 : d > 120;
      const show = vis && !far && (l.kind === 'machine' || this.mode === 'after');
      l.el.style.opacity = show ? '' : '0';
      l.el.style.pointerEvents = show ? '' : 'none';
      if (show) l.el.style.transform = `translate(${(v.x * .5 + .5) * w}px, ${(-v.y * .5 + .5) * h}px) translate(-50%, -100%)`;
    }
  }

  // ---------------------------------------------------------------- Heute / mit ZOLLER
  setMode(mode) { this.mode = mode; this.applyMode(); }
  applyMode(initial) {
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
  setLabels(on) { this.labelsOn = on; this.labelLayer.classList.toggle('is-off', !on); this.kick(); }

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
    this.camAnim = { p0, t0, p1: pos, t1: target, start: performance.now(), dur: dur * 1000 };
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
  tour(onStep) {
    this.stopTour();
    const stops = this.bounds.stations.map(s => ({ step: s.step }));
    if (this.machines.size) stops.push({ hall: true });
    stops.push({ overview: true });
    let i = 0;
    const next = () => {
      if (i >= stops.length) { this.tourTimer = null; onStep && onStep(null); return; }
      const s = stops[i++];
      if (s.step) this.focusStation(s.step); else if (s.hall) this.view('hall'); else this.view('overview');
      onStep && onStep(s);
      this.tourTimer = setTimeout(next, s.overview ? 2500 : 4300);
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
      let o = h.object;
      while (o) { if (o.userData?.pick && o.visible !== false && o.scale.x > .5) return o.userData.pick; o = o.parent; }
    }
    return null;
  }

  // ---------------------------------------------------------------- Laufzeit
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < .8 ? 50 : 36;
    this.camera.updateProjectionMatrix();
    this.applyShift();
    this.kick();
  }
  setShift(f) { this.shift = f; this.applyShift(); this.kick(); }
  applyShift() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (this.shift && w) this.camera.setViewOffset(w, h, -this.shift * w, 0, w, h); else this.camera.clearViewOffset();
  }
  kick() { if (!this.raf) this.raf = requestAnimationFrame(this.loop); }
  loop() {
    this.raf = 0;
    const now = performance.now();
    const dt = Math.min(.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    let busy = false;
    if (this.camAnim) {
      const a = this.camAnim; const k = Math.min(1, (now - a.start) / a.dur); const e = ease(k);
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
    const changed = this.controls.update();
    // Maschinen-Signalsäulen
    for (const m of this.machines.values()) setMachineState(m.userData.body, this.mode === 'after' ? 'after' : 'before', t);
    // Werkzeugfluss
    if (this.flowOn && this.route && this.pulses && !document.hidden) {
      const after = this.mode === 'after';
      const n = this.pulses.count, L = this.route.L, speed = after ? 2.4 : .8;
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      const visible = after ? n : Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        let s = ((t * speed + i * L / n) % L + L) % L;
        const seg = this.route.segs.find(g => s >= g.L0 && s <= g.L0 + g.len) || this.route.segs[0];
        const k = (s - seg.L0) / seg.len;
        const x = seg.x0 + (seg.x1 - seg.x0) * k, z = seg.z0 + (seg.z1 - seg.z0) * k;
        const on = i < visible ? 1 : 0;
        sc.setScalar(on ? (after ? 1 : .8) : .0001);
        mtx.compose(new THREE.Vector3(x, .16 + Math.sin(t * 4 + i) * .02, z), q, sc);
        this.pulses.setMatrixAt(i, mtx);
      }
      this.pulses.instanceMatrix.needsUpdate = true;
      if (this.packets) {
        const pn = this.packets.count;
        for (let i = 0; i < pn; i++) {
          const a = this.arcs[i % this.arcs.length];
          const k = ((t * .35 + i / pn) % 1);
          const p0 = a.pre.position, z = a.m.userData.zidObj, m = a.m;
          const p1 = new THREE.Vector3().setFromMatrixPosition(z.matrixWorld);
          const x = p0.x + (p1.x - p0.x) * k, zz = p0.z + (p1.z - p0.z) * k;
          const y = 2.2 + Math.sin(k * Math.PI) * (3 + p0.distanceTo(p1) * .08) * (1 - (k > .97 ? 1 : 0));
          sc.setScalar(after ? 1 : .0001);
          mtx.compose(new THREE.Vector3(x, y * (1 - Math.pow(k, 12)) + 1.45 * Math.pow(k, 12), zz), q, sc);
          this.packets.setMatrixAt(i, mtx);
        }
        this.packets.instanceMatrix.needsUpdate = true;
      }
      busy = true;
    }
    if (this.mode === 'before' && this.machines.size) busy = true;     // blinkende Signalsäulen
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    // adaptive Auflösung
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 50) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length; this.frameTimes = [];
      if (avg > .026 && this.pr > 1) { this.pr = Math.max(1, this.pr - .25); this.renderer.setPixelRatio(this.pr); this.resize(); }
      else if (avg < .0135 && this.pr < this.maxPR) { this.pr = Math.min(this.maxPR, this.pr + .25); this.renderer.setPixelRatio(this.pr); this.resize(); }
    }
    if (busy || changed) this.kick();
  }

  // ---------------------------------------------------------------- Export
  snapshot(w = 1600) {
    const pr = this.renderer.getPixelRatio(), size = new THREE.Vector2(); this.renderer.getSize(size);
    const h = Math.round(w * size.y / size.x);
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/jpeg', .9);
    this.renderer.setPixelRatio(pr); this.resize();
    return url;
  }
  exportRoot() {
    const g = new THREE.Group(); g.name = 'ZOLLER_Werkzeugraum';
    for (const o of [...this.devG.children, ...this.macG.children, ...this.zoneG.children.filter(o => o.isMesh && o.material !== this.glassMat)]) {
      if (o.scale.x < .5) continue;
      const c = o.clone(true);
      c.traverse(x => { if (x.isMesh && x.material?.map === this.shadowTex) x.visible = false; });
      g.add(c);
    }
    return g;
  }
  async exportGLB() {
    const { GLTFExporter } = await import('../vendor/GLTFExporter.js');
    const root = this.exportRoot();
    return new Promise((res, rej) => new GLTFExporter().parse(root, (buf) => res(new Blob([buf], { type: 'model/gltf-binary' })), rej, { binary: true, onlyVisible: true }));
  }
  async exportUSDZ() {
    const { USDZExporter } = await import('../vendor/USDZExporter.js');
    const root = this.exportRoot();
    root.scale.setScalar(1);
    const arr = await new USDZExporter().parseAsync(root, { quickLookCompatible: true });
    return new Blob([arr], { type: 'model/vnd.usdz+zip' });
  }
}
