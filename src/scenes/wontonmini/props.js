// props.js — street corner furniture: tables & stools (one with dinner leftovers),
// footprints, street lamp, utility pole + sagging wires, road sign, guardrail,
// trash bin, umbrella stand, wall-leaning bicycle, vending machine, notice board
import * as THREE from 'three';
import { toon, outline } from './toon.js';

const SNOW = 0xe2eaf6;

export function buildProps(scene) {
  buildTableSet(scene, 0.35, -1.05, 0, true);   // sidewalk A — finished-dinner table
  buildTableSet(scene, 1.15, 1.7, Math.PI / 2, false); // sidewalk B — empty table
  buildSnowyStool(scene, 1.5, -0.75);
  buildFootprints(scene);
  buildStreetLamp(scene);
  buildUtilityPole(scene);
  buildRoadSign(scene);
  buildGuardrail(scene);
  buildTrashBin(scene, -3.55, 3.15);
  buildUmbrellaStand(scene, -3.05, 1.05);
  buildBicycle(scene);
  buildVendingMachine(scene);
  buildNoticeBoard(scene);
}

// ---------- folding table + plastic stools ----------
function buildTableSet(scene, x, z, ry, withDinner) {
  const g = new THREE.Group();
  g.position.set(x, 0.115, z);
  g.rotation.y = ry;

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.045, 0.85), toon(0xb8c0c8));
  top.position.y = 0.7;
  top.castShadow = true;
  g.add(top);
  outline(top, 0.014);
  // crossed folding legs
  const legMat = toon(0x59606c);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.86, 6), legMat);
      leg.position.set(sx * 0.3, 0.34, 0);
      leg.rotation.x = sz * 0.28;
      g.add(leg);
    }
  }

  // stools (two per table)
  const stoolPos = withDinner ? [[-0.65, 0.15], [0.6, -0.5]] : [[-0.6, -0.3], [0.55, 0.5]];
  for (const [dx, dz] of stoolPos) {
    const st = new THREE.Group();
    st.position.set(dx, 0, dz);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 12), toon(0xc0392b));
    seat.position.y = 0.42;
    seat.castShadow = true;
    st.add(seat);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.42, 6), toon(0x8a4b52));
      l.position.set(Math.cos(a) * 0.12, 0.21, Math.sin(a) * 0.12);
      l.rotation.z = Math.cos(a) * 0.14;
      l.rotation.x = -Math.sin(a) * 0.14;
      st.add(l);
    }
    g.add(st);
  }

  if (withDinner) {
    // finished bowl (empty, rim-stained)
    const bowl = buildBowl(0.13, 0x5c8ac0);
    bowl.position.set(-0.12, 0.72, 0.08);
    bowl.rotation.z = 0.06;
    g.add(bowl);
    // chopsticks resting across the rim
    for (const off of [-0.012, 0.012]) {
      const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 6), toon(0xc9b28a));
      ck.rotation.z = Math.PI / 2;
      ck.rotation.y = 0.5;
      ck.position.set(-0.12 + off, 0.79, 0.08 + off * 3);
      g.add(ck);
    }
    // half bottle of chili oil
    const oil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 0.2, 10),
      toon(0xd4551e, { transparent: true, opacity: 0.85 })
    );
    oil.position.set(0.2, 0.83, -0.12);
    const oilCap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), toon(0x3a3f4a));
    oilCap.position.set(0.2, 0.95, -0.12);
    g.add(oil, oilCap);
    // chopstick holder with chopsticks
    const holder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.04, 0.13, 10, 1, true),
      toon(0x9c4a3c, { side: THREE.DoubleSide })
    );
    holder.position.set(0.28, 0.785, 0.18);
    g.add(holder);
    for (let i = 0; i < 5; i++) {
      const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 5), toon(0xd8c49c));
      const a = -0.5 + i * 0.25;
      ck.position.set(0.28 + Math.cos(a) * 0.02, 0.88, 0.18 + Math.sin(a) * 0.02);
      ck.rotation.x = (Math.random() - 0.5) * 0.16;
      ck.rotation.z = (Math.random() - 0.5) * 0.16;
      g.add(ck);
    }
    // crumpled napkin
    const napkin = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), toon(0xefeae0));
    napkin.position.set(-0.3, 0.735, -0.18);
    g.add(napkin);
  }

  scene.add(g);
}

function buildBowl(r, color) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(0.03 + t * (r - 0.03), t * 0.09));
  }
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 16),
    toon(color, { side: THREE.DoubleSide })
  );
  return bowl;
}

// empty stool wearing a cushion of snow
function buildSnowyStool(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0.115, z);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 12), toon(0x35507a));
  seat.position.y = 0.42;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), toon(SNOW));
  cap.scale.y = 0.42;
  cap.position.y = 0.445;
  g.add(seat, cap);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.2;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.42, 6), toon(0x44506a));
    l.position.set(Math.cos(a) * 0.12, 0.21, Math.sin(a) * 0.12);
    l.rotation.z = Math.cos(a) * 0.14;
    l.rotation.x = -Math.sin(a) * 0.14;
    g.add(l);
  }
  scene.add(g);
}

// dark footprints leading from the road to the dinner table
function buildFootprints(scene) {
  const geo = new THREE.CircleGeometry(0.055, 10);
  const mat = toon(0x31394a);
  const from = new THREE.Vector3(0.55, 0, -3.6);
  const to = new THREE.Vector3(0.38, 0, -1.35);
  const steps = 13;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const p = from.clone().lerp(to, t);
    const side = i % 2 === 0 ? 1 : -1;
    const fp = new THREE.Mesh(geo, mat);
    fp.rotation.x = -Math.PI / 2;
    fp.scale.set(1, 1.7, 1);
    fp.position.set(p.x + side * 0.11, p.z < -1.7 ? 0.046 : 0.126, p.z);
    fp.rotation.z = side * 0.25;
    scene.add(fp);
  }
}

// ---------- street lamp (cold light pressing in from the corner) ----------
function buildStreetLamp(scene) {
  const g = new THREE.Group();
  g.position.set(1.1, 0.115, -1.1);
  const metal = toon(0x2c313c);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.12, 10), metal);
  base.position.y = 0.06;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.1, 8), metal);
  pole.position.y = 1.62;
  pole.castShadow = true;
  // curved arm reaching over the road corner
  const armCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 3.1, 0),
    new THREE.Vector3(0.35, 3.15, -0.35),
    new THREE.Vector3(0.7, 3.0, -0.7)
  );
  const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 12, 0.025, 6), metal);
  g.add(base, pole, arm);
  // lamp head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.24), metal);
  head.position.set(0.7, 2.94, -0.7);
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.02, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xeaf2ff })
  );
  lens.position.set(0.7, 2.875, -0.7);
  g.add(head, lens);
  outline(head, 0.015);
  scene.add(g);

  const spot = new THREE.SpotLight(0xd6e4ff, 55, 15, 0.55, 0.65, 2);
  spot.position.set(1.8, 3.05, -1.8);
  spot.target.position.set(1.1, 0, -2.8);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.002;
  scene.add(spot, spot.target);
}

// ---------- utility pole + sagging wires ----------
function buildUtilityPole(scene) {
  const g = new THREE.Group();
  g.position.set(-3.9, 0.115, -1.05);
  const wood = toon(0x5a4a3c);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.5, 8), wood);
  pole.position.y = 1.75;
  pole.castShadow = true;
  const crossarm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), wood);
  crossarm.position.y = 3.05;
  const crossarm2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), wood);
  crossarm2.position.y = 2.75;
  g.add(pole, crossarm, crossarm2);
  // insulators
  for (const x of [-0.45, 0, 0.45]) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.06, 6), toon(0x8a94a2));
    ins.position.set(x, 3.1, 0);
    g.add(ins);
  }
  scene.add(g);

  // wires: sagging QuadraticBezierCurve3 → TubeGeometry
  const wireMat = toon(0x151820);
  const wires = [
    // pole → west building wall
    [new THREE.Vector3(-3.9, 3.08, -1.05), new THREE.Vector3(-4.45, 2.5, 0.2), new THREE.Vector3(-4.8, 2.3, 1.4)],
    // pole → north building wall
    [new THREE.Vector3(-3.9, 3.08, -1.05), new THREE.Vector3(-3.7, 2.7, 1.6), new THREE.Vector3(-3.4, 2.9, 4.58)],
    // crossarm tip sag
    [new THREE.Vector3(-4.35, 3.05, -1.05), new THREE.Vector3(-3.9, 2.95, -1.0), new THREE.Vector3(-3.45, 3.05, -1.05)]
  ];
  for (const [a, b, c] of wires) {
    const curve = new THREE.QuadraticBezierCurve3(a, b, c);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.012, 5), wireMat);
    scene.add(tube);
  }
}

function buildRoadSign(scene) {
  const g = new THREE.Group();
  g.position.set(-2.9, 0.115, -1.35);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 2.1, 6), toon(0x6a7382));
  pole.position.y = 1.05;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.02), toon(0x2e6b5a));
  plate.position.y = 1.95;
  plate.rotation.y = 0.35;
  g.add(pole, plate);
  scene.add(g);
}

// pedestrian guardrail around the intersection corner
function buildGuardrail(scene) {
  const metal = toon(0x8a94a2);
  const post = () => new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.68, 6), metal);
  const segs = [
    { cx: 1.1, cz: -1.58, ry: 0, len: 1.1 },
    { cx: 1.58, cz: -1.1, ry: Math.PI / 2, len: 0.95 }
  ];
  for (const s of segs) {
    const g = new THREE.Group();
    g.position.set(s.cx, 0.115, s.cz);
    g.rotation.y = s.ry;
    for (const dx of [-s.len / 2, 0, s.len / 2]) {
      const p = post();
      p.position.set(dx, 0.34, 0);
      g.add(p);
    }
    for (const y of [0.28, 0.55]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(s.len + 0.08, 0.035, 0.03), metal);
      bar.position.y = y;
      g.add(bar);
    }
    scene.add(g);
  }
}

function buildTrashBin(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0.16, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.55, 12), toon(0x3d4a42));
  body.position.y = 0.275;
  body.castShadow = true;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), toon(0x2f3a34));
  lid.position.y = 0.575;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.285, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), toon(SNOW));
  cap.scale.y = 0.3;
  cap.position.y = 0.6;
  g.add(body, lid, cap);
  outline(body, 0.016);
  scene.add(g);
}

function buildUmbrellaStand(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0.16, z);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.35, 10), toon(0x4a5262));
  bucket.position.y = 0.175;
  g.add(bucket);
  const umbCols = [0x2e3440, 0x8c2f2f, 0x33455c];
  for (let i = 0; i < 3; i++) {
    const u = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.045, 0.85, 7), toon(umbCols[i]));
    const a = i * 2.2;
    u.position.set(Math.cos(a) * 0.05, 0.62, Math.sin(a) * 0.05);
    u.rotation.z = Math.cos(a) * 0.22;
    u.rotation.x = -Math.sin(a) * 0.22;
    g.add(u);
  }
  scene.add(g);
}

// bicycle leaning against the west wall, snow on the saddle
function buildBicycle(scene) {
  const g = new THREE.Group();
  g.position.set(-4.5, 0.16, 1.7);
  g.rotation.y = 0.5;
  g.rotation.z = 0.12; // lean into the wall
  const frame = toon(0x31506b);
  const tire = toon(0x1c1f28);
  const wheelGeo = new THREE.TorusGeometry(0.3, 0.028, 8, 24);
  const w1 = new THREE.Mesh(wheelGeo, tire); w1.position.set(-0.48, 0.3, 0);
  const w2 = new THREE.Mesh(wheelGeo, tire); w2.position.set(0.48, 0.3, 0);
  const tube = (p1, p2, r = 0.02) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 6), frame);
    m.position.copy(p1).add(p2).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  g.add(
    w1, w2,
    tube(V(-0.48, 0.3, 0), V(-0.1, 0.52, 0)),
    tube(V(-0.1, 0.52, 0), V(0.42, 0.5, 0)),
    tube(V(-0.48, 0.3, 0), V(-0.05, 0.32, 0)),
    tube(V(-0.05, 0.32, 0), V(0.48, 0.3, 0)),
    tube(V(0.42, 0.5, 0), V(0.55, 0.72, 0)),   // seat post
    tube(V(0.42, 0.5, 0), V(0.35, 0.78, 0))    // handle stem
  );
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.1), toon(0x2a2d36));
  saddle.position.set(0.56, 0.75, 0);
  const saddleSnow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.09), toon(SNOW));
  saddleSnow.position.set(0.56, 0.79, 0);
  const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6), toon(0x8a94a2));
  hbar.rotation.x = Math.PI / 2;
  hbar.position.set(0.35, 0.8, 0);
  g.add(saddle, saddleSnow, hbar);
  scene.add(g);
}

// old vending machine with a glowing panel, against the north wall
function buildVendingMachine(scene) {
  const g = new THREE.Group();
  g.position.set(-2.1, 0.16, 4.26);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.75, 0.68), toon(0x37415c));
  body.position.y = 0.875;
  body.castShadow = true;
  g.add(body);
  outline(body, 0.02);
  // top sign
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.22, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xffc490 })
  );
  sign.position.set(0, 1.62, -0.35);
  // glass front with rows of goods
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 1.0, 0.03),
    new THREE.MeshBasicMaterial({ color: 0x7ea6cc, transparent: true, opacity: 0.55 })
  );
  glass.position.set(-0.08, 0.95, -0.35);
  g.add(sign, glass);
  const goodsCols = [0xc0392b, 0xd9a441, 0xe8e0ce, 0x5f8a72, 0x8a5a9c];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.05), toon(goodsCols[(r + c) % 5]));
      b.position.set(-0.34 + c * 0.13, 0.68 + r * 0.28, -0.33);
      g.add(b);
    }
  }
  // dispense slot
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.04), toon(0x1c2230));
  slot.position.set(-0.14, 0.22, -0.35);
  g.add(slot);
  scene.add(g);
}

// wall notice board with hand-written price sheets
function buildNoticeBoard(scene) {
  const g = new THREE.Group();
  g.position.set(-0.55, 1.55, 4.56);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.56, 0.04), toon(0x3a3f4a));
  const papers = [
    [0xf1e6cf, -0.24, 0.08, 0.05], [0xd8cfae, -0.02, 0.05, -0.04],
    [0xcfd8ea, 0.2, 0.09, 0.03], [0xe8ddc0, -0.13, -0.13, -0.06],
    [0xefe7d2, 0.12, -0.12, 0.07]
  ];
  for (const [col, dx, dy, rot] of papers) {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.23),
      toon(col, { emissive: 0xffe2b8, emissiveIntensity: 0.18 })
    );
    p.position.set(dx, dy, -0.025);
    p.rotation.z = rot;
    g.add(p);
  }
  // little roof + snow
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.16), toon(0x2c313c));
  roof.position.y = 0.32;
  roof.rotation.x = 0.18;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 0.14), toon(SNOW));
  cap.position.y = 0.37;
  cap.rotation.x = 0.18;
  g.add(frame, roof, cap);
  scene.add(g);
}
