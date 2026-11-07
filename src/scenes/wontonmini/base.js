// base.js — pedestal, corner roads, sidewalks, snow, crosswalk, parking lines, drain,
// backdrop buildings with the dark alley gap at the NW corner
import * as THREE from 'three';
import { toon, rng, makeGlowPatch } from './toon.js';

const SNOW = 0xdde6f4;      // bright slightly-blue snow
const SIDEWALK = 0x828ba0;  // muted concrete
const ASPHALT = 0x1b2130;   // dark wet asphalt

export function buildBase(scene) {
  const rand = rng(20260129);

  // ---- pedestal ("collectible model" base) ----
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(10.6, 0.6, 10.6),
    toon(0x10141f)
  );
  plinth.position.y = -0.3;
  scene.add(plinth);

  // ---- roads (L-shape street corner) ----
  // Road A: east-west, z ∈ [-5, -1.7];  Road B: north-south, x ∈ [1.7, 5]
  const roadMat = new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.3, metalness: 0.3 });
  const roadA = new THREE.Mesh(new THREE.BoxGeometry(10.1, 0.04, 3.34), roadMat);
  roadA.position.set(0, 0.02, -3.33);
  const roadB = new THREE.Mesh(new THREE.BoxGeometry(3.34, 0.04, 10.1), roadMat);
  roadB.position.set(3.33, 0.02, 0);
  for (const r of [roadA, roadB]) { r.receiveShadow = true; scene.add(r); }

  // ---- sidewalks (0.1 high, snow-dusted) ----
  const walkMat = toon(SIDEWALK);
  const walkA = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.1, 1.2), walkMat); // along road A
  walkA.position.set(-1.85, 0.05, -1.1);
  const walkB = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 6.7), walkMat); // along road B
  walkB.position.set(1.1, 0.05, 1.85);
  for (const w of [walkA, walkB]) { w.receiveShadow = true; scene.add(w); }

  // snow dusting on sidewalks (slightly inset patches)
  const snowMat = toon(SNOW);
  const snowA = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.035, 1.02), snowMat);
  snowA.position.set(-1.85, 0.108, -1.1);
  const snowB = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.035, 6.5), snowMat);
  snowB.position.set(1.1, 0.108, 1.85);
  for (const s of [snowA, snowB]) { s.receiveShadow = true; scene.add(s); }

  // ---- inner block (snow-covered ground, raised curb) ----
  const block = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.16, 5.5), snowMat);
  block.position.set(-2.25, 0.08, 2.25);
  block.receiveShadow = true;
  scene.add(block);

  // scattered snow mounds on the block
  const moundGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(moundGeo, snowMat);
    const s = 0.16 + rand() * 0.3;
    m.scale.set(s * (0.8 + rand() * 0.6), s * 0.45, s * (0.8 + rand() * 0.6));
    m.position.set(-4.6 + rand() * 4.1, 0.16, 0 + rand() * 3.4);
    if (m.position.x > -0.6 && m.position.z < 1.6) m.position.x -= 0.8; // keep stall area clear
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---- crosswalk (piano keys, long axis along traffic = x) ----
  const paintMat = toon(0xaeb9cf, { transparent: true, opacity: 0.85 });
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.012, 0.42), paintMat);
    bar.position.set(-3.1, 0.045, -4.5 + i * 0.85);
    scene.add(bar);
  }

  // ---- parking stall lines on road B ----
  for (const x of [2.0, 3.35]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 2.3), paintMat);
    l.position.set(x, 0.045, 1.4);
    scene.add(l);
  }
  const lend = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.012, 0.05), paintMat);
  lend.position.set(2.67, 0.045, 2.55);
  scene.add(lend);

  // ---- drain + wet patch at road A gutter ----
  const wet = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.006, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 0.15, metalness: 0.4 })
  );
  wet.position.set(-1.0, 0.043, -1.85);
  scene.add(wet);
  const drain = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.34), toon(0x0a0e16));
  drain.position.set(-1.0, 0.05, -1.85);
  scene.add(drain);
  const barMat = toon(0x4a5262);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.3), barMat);
    b.position.set(-1.24 + i * 0.12, 0.055, -1.85);
    scene.add(b);
  }

  buildBuildings(scene, rand);
}

function buildBuildings(scene, rand) {
  const wallW = toon(0x4c5568);  // west wall — cool slate
  const wallN = toon(0x5a5361);  // north wall — warm-gray plum, muted

  // west wall: x ∈ [-5,-3.6..], z from -0.35 to 3.25 (gap to alley at corner)
  // (slightly shrunk + pushed back so it reads as backdrop, not a 1/3-frame monolith)
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.7, 3.6), wallW);
  w1.position.set(-5.0, 1.35, 1.45);
  // north wall: x from -3.6 to 0.5
  const w2 = new THREE.Mesh(new THREE.BoxGeometry(4.1, 3.4, 0.4), wallN);
  w2.position.set(-1.55, 1.7, 4.8);
  for (const w of [w1, w2]) { w.castShadow = true; w.receiveShadow = true; scene.add(w); }

  // snow caps on wall tops
  const snowMat = toon(0xdde6f4);
  const cap1 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 3.74), snowMat);
  cap1.position.set(-5.0, 2.77, 1.45);
  const cap2 = new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.14, 0.52), snowMat);
  cap2.position.set(-1.55, 3.47, 4.8);
  cap1.castShadow = cap2.castShadow = true;
  scene.add(cap1, cap2);

  // ---- dark alley at the NW corner of the base ----
  const alleyFloor = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.02, 1.5),
    toon(0x080b12)
  );
  alleyFloor.position.set(-4.2, 0.17, 4.2);
  scene.add(alleyFloor);
  // far walls of the alley (very dark, giving depth)
  const darkMat = toon(0x141926);
  const far1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.8, 1.5), darkMat);
  far1.position.set(-4.95, 1.4, 4.2);
  const far2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.8, 0.24), darkMat);
  far2.position.set(-4.2, 1.4, 4.95);
  scene.add(far1, far2);
  // one tiny cold service light deep in the alley (brightened so the alley reads)
  const slit = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.4, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xc4ddf8 })
  );
  slit.position.set(-4.76, 2.0, 4.7);
  scene.add(slit);
  const alleyLight = new THREE.PointLight(0x9fc4ee, 2.2, 4, 2);
  alleyLight.position.set(-4.55, 1.9, 4.4);
  scene.add(alleyLight);

  // ---- windows ----
  const darkWin = new THREE.MeshBasicMaterial({ color: 0x1d2740 });
  const dimWin = new THREE.MeshBasicMaterial({ color: 0x35486e });
  const warmWin = new THREE.MeshBasicMaterial({ color: 0xf5c689 });
  const winGeo = new THREE.BoxGeometry(0.34, 0.5, 0.04);

  // west wall windows (face +x)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const win = new THREE.Mesh(winGeo, pickWin(rand, darkWin, dimWin, warmWin));
      win.position.set(-4.78, 1.15 + row * 0.85, -0.1 + col * 0.75);
      scene.add(win);
    }
  }
  // north wall windows (face -z)
  const winGeoN = new THREE.BoxGeometry(0.34, 0.5, 0.04);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const win = new THREE.Mesh(winGeoN, pickWin(rand, darkWin, dimWin, warmWin));
      win.position.set(-3.25 + col * 0.85, 1.35 + row * 0.95, 4.58);
      scene.add(win);
    }
  }

  // ---- outer/back faces: scattered lived-in emissive windows ----
  // warm-orange / cool-white mix, random sizes, some switched off —
  // keeps the building mass readable from ANY orbit angle (fixes pitch-black back).
  scatterWindows(scene, rand, {
    axis: 'z', at: -5.215,                 // west wall outer face (-x)
    from: -0.15, to: 3.05, yMin: 0.5, yMax: 2.3, count: 9
  });
  scatterWindows(scene, rand, {
    axis: 'x', at: 5.015,                  // north wall outer face (+z)
    from: -3.35, to: 0.25, yMin: 0.55, yMax: 3.0, count: 12
  });

  // ---- fake wet-road reflections (glow patches under lights, added later by lights) ----
  makeGlowPatch(scene, new THREE.Vector3(1.1, 0.055, -2.7), 1.7, 3.2, 0xbfd6ff, 0.55);  // street lamp
  makeGlowPatch(scene, new THREE.Vector3(-1.3, 0.055, -2.6), 2.9, 3.1, 0xff9a55, 0.5);  // stall bulb
  makeGlowPatch(scene, new THREE.Vector3(-2.68, 0.19, 1.05), 1.05, 1.05, 0xff5a3a, 0.42); // lantern on snow
  makeGlowPatch(scene, new THREE.Vector3(-2.1, 0.19, 3.75), 1.25, 1.15, 0xffd9a8, 0.34); // vending machine
}

// scatter randomly-sized emissive windows across a flat wall face.
// cfg.axis = the horizontal world axis the face spans ('x' or 'z');
// cfg.at = the fixed coordinate of the face (windows face outward).
function scatterWindows(scene, rand, cfg) {
  const warm = [0xffab5e, 0xffc987, 0xffdda6, 0xff9d4d];
  const cool = [0xd7e7ff, 0xaecdf2, 0x8fb6de];
  const off = 0x18202f; // switched-off pane — still a touch lighter than the wall
  for (let i = 0; i < cfg.count; i++) {
    const r = rand();
    const col = r < 0.5 ? warm[(rand() * warm.length) | 0]
      : r < 0.82 ? cool[(rand() * cool.length) | 0]
      : off;
    const w = 0.24 + rand() * 0.26;
    const h = 0.34 + rand() * 0.28;
    const u = cfg.from + rand() * (cfg.to - cfg.from - w);
    const y = cfg.yMin + rand() * (cfg.yMax - cfg.yMin - h);
    const geo = cfg.axis === 'z'
      ? new THREE.BoxGeometry(0.04, h, w)   // on an x-facing wall
      : new THREE.BoxGeometry(w, h, 0.04);  // on a z-facing wall
    const win = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col }));
    if (cfg.axis === 'z') win.position.set(cfg.at, y, u + w / 2);
    else win.position.set(u + w / 2, y, cfg.at);
    scene.add(win);
  }
}

function pickWin(rand, dark, dim, warm) {
  const r = rand();
  if (r < 0.42) return dark;
  if (r < 0.72) return dim;
  return warm;
}
