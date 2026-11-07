// stall.js — the wonton stall: canvas awning (snow-loaded, snow eaves), counter,
// pot + stove, spice rack, menu lightbox, bare bulb + bulb string, red lantern,
// gas tank, and the curled-up sleeping cat
import * as THREE from 'three';
import { toon, outline, makeStripeTexture, gradientMap } from './toon.js';

export function buildStall(scene) {
  const g = new THREE.Group();
  g.position.set(-1.4, 0.16, 1.9); // on the snow block, front facing -z (toward the road)

  const wood = toon(0x7a4a3a);       // warm worn wood
  const woodDark = toon(0x5b3628);
  const snowMat = toon(0xe2eaf6);

  // ---- counter ----
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.92, 0.85), wood);
  counter.position.set(0, 0.46, -0.1);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.06, 0.98), toon(0x8a5a44));
  counterTop.position.set(0, 0.95, -0.1);
  // front panel detail slats
  for (let i = 0; i < 5; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.02), woodDark);
    slat.position.set(0, 0.22 + i * 0.17, -0.53);
    g.add(slat);
  }
  g.add(counter, counterTop);
  outline(counter, 0.03);

  // ---- posts (front shorter than back → awning slopes up toward rear) ----
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 1, 10);
  const posts = [
    [-1.22, 1.15, -0.85, 2.3], [1.22, 1.15, -0.85, 2.3],   // front pair (center y, height)
    [-1.22, 1.275, 0.75, 2.55], [1.22, 1.275, 0.75, 2.55]  // rear pair
  ];
  for (const [x, y, z, h] of posts) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 10), woodDark);
    p.position.set(x, y, z);
    p.castShadow = true;
    g.add(p);
  }

  // ---- striped canvas awning (sloped) ----
  const slope = Math.atan2(0.35, 1.85); // rise 0.35 over depth 1.85
  const stripeTex = makeStripeTexture('#d96f36', '#efe4d0', 9);
  const awningMat = new THREE.MeshToonMaterial({ map: stripeTex, gradientMap: gradientMap });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.06, 1.92), awningMat);
  awning.position.set(0, 2.375, -0.08);
  awning.rotation.x = -slope; // front edge lower
  awning.castShadow = true;
  g.add(awning);
  // snow load on top of the awning
  const awnSnow = new THREE.Mesh(new THREE.BoxGeometry(3.12, 0.09, 1.98), snowMat);
  awnSnow.position.set(0, 0.075, 0);
  awnSnow.castShadow = true;
  awning.add(awnSnow);
  outline(awning, 0.025);

  // hanging snow eaves along the front edge (irregular clumps) — front is -z
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 11; i++) {
    const w = 0.14 + rnd() * 0.14;
    const d = 0.1 + rnd() * 0.1;
    const h = 0.07 + rnd() * 0.12;
    const clump = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), snowMat);
    clump.position.set(-1.42 + i * 0.285 + (rnd() - 0.5) * 0.06, -0.05 - h / 2, -0.92 + d / 2);
    awning.add(clump);
  }

  // ---- low back wall + shelf ----
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 0.07), wood);
  backWall.position.set(0, 0.75, 0.72);
  g.add(backWall);

  // ---- front burner cart (sticks out past the awning so steam rises clear) ----
  const cart = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.5), woodDark);
  cart.position.set(0.5, 0.35, -1.12);
  cart.castShadow = true;
  g.add(cart);
  const stove = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.44), toon(0x2b2a30));
  stove.position.set(0.5, 0.82, -1.18);
  g.add(stove, cart);
  // burner glow ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.02, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8a45 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.5, 0.95, -1.18);
  g.add(ring);

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.36, 20), toon(0x404754));
  pot.position.set(0.5, 1.12, -1.18);
  pot.castShadow = true;
  g.add(pot);
  outline(pot, 0.022);
  const potRim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.022, 8, 24), toon(0x22262f));
  potRim.rotation.x = Math.PI / 2;
  potRim.position.set(0.5, 1.3, -1.18);
  g.add(potRim);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), toon(0x22262f));
  knob.position.set(0.5, 1.34, -1.18);
  g.add(knob);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), toon(0x22262f));
    ear.position.set(0.5 + side * 0.32, 1.22, -1.18);
    g.add(ear);
  }
  const steamOrigin = new THREE.Vector3(0.5, 1.34, -1.18);
  g.localToWorld(steamOrigin);

  // ---- spice rack (on back wall) ----
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.26), woodDark);
  shelf.position.set(-0.3, 1.62, 0.58);
  g.add(shelf);
  const jarCols = [0xc0392b, 0x7a8c4e, 0xd9a441, 0xe8e0ce, 0xa0522d];
  for (let i = 0; i < 5; i++) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.15, 10), toon(jarCols[i]));
    jar.position.set(-0.85 + i * 0.28, 1.72, 0.58);
    g.add(jar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 10), toon(0x3a3f4a));
    cap.position.set(-0.85 + i * 0.28, 1.81, 0.58);
    g.add(cap);
  }

  // ---- hanging menu lightbox ----
  const menuCanvas = document.createElement('canvas');
  menuCanvas.width = 128; menuCanvas.height = 88;
  const mctx = menuCanvas.getContext('2d');
  mctx.fillStyle = '#ffe9c4'; mctx.fillRect(0, 0, 128, 88);
  mctx.fillStyle = '#8a4b2a'; mctx.font = 'bold 34px "PingFang SC", "Hiragino Sans GB", sans-serif';
  mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.fillText('馄饨', 64, 32);
  mctx.font = 'bold 24px "PingFang SC", sans-serif';
  mctx.fillText('¥6 / 碗', 64, 64);
  const menuTex = new THREE.CanvasTexture(menuCanvas);
  menuTex.colorSpace = THREE.SRGBColorSpace;
  const menuBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.44, 0.05),
    new THREE.MeshToonMaterial({
      color: 0xffffff, map: menuTex, emissive: 0xffdcae, emissiveIntensity: 0.9,
      emissiveMap: menuTex, gradientMap: gradientMap
    })
  );
  menuBox.position.set(-0.42, 1.86, -0.88);
  g.add(menuBox);
  outline(menuBox, 0.015);
  for (const side of [-1, 1]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 6), toon(0x2a2d36));
    cord.position.set(-0.42 + side * 0.2, 2.1, -0.9);
    g.add(cord);
  }

  // ---- bare bulb under the awning (main warm key light) ----
  const bulbCord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), toon(0x2a2d36));
  bulbCord.position.set(0.05, 2.02, -0.5);
  g.add(bulbCord);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd9a3 })
  );
  bulb.position.set(0.05, 1.85, -0.5);
  g.add(bulb);
  const bulbLight = new THREE.PointLight(0xffb066, 6, 9, 2);
  bulbLight.position.set(0.05, 1.85, -0.5);
  bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(512, 512);
  g.add(bulbLight);

  // ---- string of small bulbs along the front beam ----
  const bulbStrMat = new THREE.MeshBasicMaterial({ color: 0xffc48a });
  const nBulbs = 9;
  for (let i = 0; i < nBulbs; i++) {
    const t = i / (nBulbs - 1);
    const x = -1.25 + t * 2.5;
    const sag = Math.sin(t * Math.PI) * 0.09; // slight droop
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), bulbStrMat);
    b.position.set(x, 2.13 - sag, -0.94);
    g.add(b);
  }

  // ---- red lantern on the front-left post ----
  const lantern = new THREE.Group();
  lantern.position.set(-1.3, 1.62, -0.85);
  const lBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff5238 })
  );
  lBody.scale.set(1, 1.18, 1);
  const lCapT = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.035, 10), toon(0xd8a04a));
  lCapT.position.y = 0.17;
  const lCapB = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.035, 10), toon(0xd8a04a));
  lCapB.position.y = -0.17;
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), toon(0xd8a04a));
  tassel.position.y = -0.25;
  lantern.add(lBody, lCapT, lCapB, tassel);
  outline(lBody, 0.018);
  g.add(lantern);
  const lanternLight = new THREE.PointLight(0xff6a4a, 1.6, 4, 2);
  lanternLight.position.copy(lantern.position);
  g.add(lanternLight);

  // ---- gas tank behind the right post ----
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.62, 14), toon(0xc4523a));
  tank.position.set(1.55, 0.31, 0.35);
  const tankTop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.1, 10), toon(0x9c9ca8));
  tankTop.position.set(1.55, 0.67, 0.35);
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.7, 6), toon(0x30333c));
  hose.rotation.z = Math.PI / 2.4;
  hose.position.set(1.25, 0.72, 0.3);
  g.add(tank, tankTop, hose);
  outline(tank, 0.02);

  // ---- curled sleeping cat, left of the counter ----
  buildCat(g, -1.62, -0.35);

  scene.add(g);
  return { steamOrigin };
}

function buildCat(parent, x, z) {
  const cat = new THREE.Group();
  cat.position.set(x, 0, z);
  cat.rotation.y = 0.6;
  const fur = toon(0x1a1a22);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), fur);
  body.scale.set(1.15, 0.78, 1);
  body.position.y = 0.22;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), fur);
  head.position.set(0.24, 0.3, 0.1);
  head.rotation.z = -0.35;
  const earGeo = new THREE.ConeGeometry(0.05, 0.09, 6);
  const earL = new THREE.Mesh(earGeo, fur);
  earL.position.set(0.2, 0.44, 0.16);
  const earR = new THREE.Mesh(earGeo, fur);
  earR.position.set(0.3, 0.42, -0.02);
  const tail = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.05, 8, 16, Math.PI * 1.25),
    fur
  );
  tail.rotation.x = Math.PI / 2;
  tail.rotation.z = -0.4;
  tail.position.set(0.02, 0.16, -0.02);
  cat.add(body, head, earL, earR, tail);
  outline(body, 0.02);
  outline(head, 0.016);
  parent.add(cat);
}
