// AR auf Android (Chrome mit ARCore) über WebXR: Boden erkennen, antippen, Werkzeugraum in Originalgröße hinstellen.
// iPhone/iPad nutzen stattdessen AR Quick Look (USDZ aus scene.js). Die Geräte werden aus der Halle geklont
// (gleiche Geometrien und Materialien, kein zweites Laden).
import * as THREE from 'three';
import { PRODUCTS } from './knowledge.js';

export async function startXR(hall, { t }) {
  if (!navigator.xr) throw new Error('WebXR');
  const r = hall.renderer;
  // Bedienoberfläche über dem Kamerabild
  const ui = document.createElement('div');
  ui.className = 'xr-ui';
  ui.innerHTML = `<p data-xr-hint>${t('ar.xr.find')}</p><div class="xr-ui__bar"><button type="button" class="btn btn--sm" data-xr-scale>1:1</button><button type="button" class="btn btn--yellow btn--sm" data-xr-close>${t('ui.close')}</button></div>`;
  document.body.appendChild(ui);
  const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'light-estimation'], domOverlay: { root: ui } });
  hall.xrActive = true;
  if (hall.raf) { cancelAnimationFrame(hall.raf); hall.raf = 0; }
  const keep = { autoClear: r.autoClear, shadow: r.shadowMap.enabled, pr: r.getPixelRatio() };
  r.xr.enabled = true;
  r.xr.setReferenceSpaceType('local');
  await r.xr.setSession(session);

  // eigene Szene: Werkzeugraum (ohne Maschinen) + Licht + Zielring
  const scene = new THREE.Scene();
  scene.environment = hall.scene.environment;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8a85, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2, 6, 3); scene.add(sun);
  const model = new THREE.Group(); model.visible = false; scene.add(model);
  const b = hall.bounds.tool, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  for (const h of hall.devG.children) {
    if (h.scale.x < .5 || PRODUCTS[h.userData.pid]?.atMachine) continue;
    const c = h.clone(true);
    c.position.x -= cx; c.position.z -= cz;
    model.add(c);
  }
  if (hall.zone) { const z = hall.zone.clone(); z.position.x -= cx; z.position.z -= cz; model.add(z); }
  const reticle = new THREE.Mesh(new THREE.RingGeometry(.12, .16, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0e600 }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  const camera = new THREE.PerspectiveCamera();

  const viewer = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource({ space: viewer });
  let scale = 1;
  const hint = ui.querySelector('[data-xr-hint]');
  ui.querySelector('[data-xr-scale]').addEventListener('click', (e) => {
    scale = scale === 1 ? .05 : 1; model.scale.setScalar(scale);
    e.currentTarget.textContent = scale === 1 ? '1:1' : '1:20';
  });
  ui.querySelector('[data-xr-close]').addEventListener('click', () => session.end());
  session.addEventListener('select', () => {
    if (!reticle.visible) return;
    model.position.setFromMatrixPosition(reticle.matrix);
    model.visible = true;
    hint.textContent = t('ar.xr.placed');
  });
  r.setAnimationLoop((time, frame) => {
    if (!frame) return;
    const ref = r.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitSource);
    if (hits.length) {
      const pose = hits[0].getPose(ref);
      reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix);
      if (!model.visible) hint.textContent = t('ar.xr.tap');
    } else reticle.visible = false;
    r.render(scene, camera);
  });
  session.addEventListener('end', () => {
    r.setAnimationLoop(null);
    r.xr.enabled = false;
    r.autoClear = keep.autoClear; r.setPixelRatio(keep.pr);
    hitSource.cancel?.();
    ui.remove();
    hall.xrActive = false;
    hall.resize(); hall.kick();
  });
}
