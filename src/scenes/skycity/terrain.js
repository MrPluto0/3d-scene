// src/scenes/skycity/terrain.js — 浮岛岩体、草甸、植被、巨树、远景浮岛
import * as THREE from 'three';
import {
  GeoKit, InstanceKit, BillboardField, stdMat,
  mulberry32, fbm2, valueNoise2, smoothstep, clamp, lerp, TAU,
  leafTexture, grassTexture, flowerTexture, puffTexture, streakTexture,
} from './kit.js';

export const ISLE_R = 10.6;
export const ISLE_DEPTH = 22;
/** 城区高台中心（岛上坐标） */
export const CITY_CENTER = new THREE.Vector2(1.8, -1.2);

const C = {
  rockTop: 0x7a4e32,
  strata: [0xd2ad7d, 0xc1996a, 0xddc39c, 0xb0855c, 0xc9a678, 0xb58f63],
  moss: [0x5f8f47, 0x6f9e50, 0x7fae57, 0x54803f, 0x8cb862],
  lawn: [0x6f9e50, 0x7cab57, 0x679349, 0x86b25b, 0x5c8744],
  leaf: [0x3f6b33, 0x4c7c3a, 0x5b8d42, 0x6b9e4a, 0x365f2c, 0x78a851],
  leafWarm: [0x93a956, 0x9fb45e, 0xaebd69],
  trunk: 0x6a4a33,
  vine: 0x46663a,
  vineLeaf: [0x5f8f42, 0x6f9e4c, 0x527d3a],
  stone: [0xefe3cc, 0xe6d8bd, 0xf3ead6],
};

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _dummy = new THREE.Object3D();

function rndColor(rand, list, k = 0.05) {
  const c = new THREE.Color(list[Math.floor(rand() * list.length) % list.length]);
  c.offsetHSL((rand() - 0.5) * 0.015, (rand() - 0.5) * 0.06, (rand() - 0.5) * k);
  return c;
}

/* ==========================================================================
   主岛顶面高度场（草甸 / 城区高台 / 水池洼地）
   ========================================================================== */

export function topHeight(x, z) {
  const r = Math.hypot(x, z);
  const rn = r / ISLE_R;

  // 起伏草甸
  let h = fbm2(x * 0.20 + 3.1, z * 0.20 - 1.7, 3) * 0.55
        + fbm2(x * 0.55 - 8.2, z * 0.55 + 2.4, 2) * 0.18;
  // 外缘向下收（草皮包边）
  h -= smoothstep(0.80, 1.02, rn) * 1.55;

  // 城区高台：中心抬平（王城全部落在平地上）
  const dc = Math.hypot(x - CITY_CENTER.x, z - CITY_CENTER.y);
  const flat = smoothstep(8.4, 6.6, dc);
  h = lerp(h, 0.22, flat);

  // 水池洼地（岛南侧草坡）
  const dp = Math.hypot(x + 2.2, z - 6.6);
  h -= 0.85 * (1 - smoothstep(0.9, 2.8, dp));

  // 溪流浅槽：从水池向西南岩缘
  const t = clamp((-x - 2.6) / 4.0, 0, 1);
  const sx = lerp(-2.6, -6.6, t);
  const sz = lerp(7.2, 9.6, t);
  if (x < -2.4 && x > -8.2) {
    const ds = Math.hypot(x - sx, z - sz);
    h -= 0.2 * (1 - smoothstep(0.1, 0.7, ds));
  }

  return h;
}

/* ==========================================================================
   岩体：分层倒水滴 + 竖向侵蚀 + 面片层理色
   ========================================================================== */

function isleRadius(t) {
  if (t <= 0.28) return 1.0 - 0.10 * (t / 0.28);
  const u = (t - 0.28) / 0.72;
  return 0.90 * Math.pow(1 - u, 0.82) + 0.02;
}

function rockRadiusMul(theta, t, seed = 0) {
  let m = 1;
  // 大尺度不规则
  m += 0.055 * fbm2(theta * 1.7 + seed, t * 4.2, 3);
  // 层理平台：每 1/8 高度向外凸一层
  const band = t * 8;
  m += 0.030 * smoothstep(0.5, 0.98, band - Math.floor(band)) * (1 - t * 0.55);
  // 竖向侵蚀沟
  m += 0.040 * Math.sin(theta * 7.0 + t * 2.2) * (0.35 + 0.65 * smoothstep(0.05, 0.4, t));
  m += 0.022 * Math.sin(theta * 15.0 - t * 4.0) * smoothstep(0.1, 0.6, t);
  return m;
}

function buildRock(R, depth, rand) {
  const RINGS = 118, SEG = 124;
  const profile = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    profile.push(new THREE.Vector2(Math.max(0.03, isleRadius(t) * R), -t * depth));
  }
  const geo = new THREE.LatheGeometry(profile, SEG);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const theta = Math.atan2(z, x);
    const t = clamp(-y / depth, 0, 1);
    const m = rockRadiusMul(theta, t);
    const rr = Math.hypot(x, z) * m;
    const jitterY = Math.sin(theta * 6 + t * 13) * 0.16 * (0.3 + t);
    pos.setXYZ(i, Math.cos(theta) * rr, y + jitterY, Math.sin(theta) * rr);
  }
  geo.computeVertexNormals();

  const flat = geo.toNonIndexed();
  const fp = flat.attributes.position;
  const colors = new Float32Array(fp.count * 3);
  const strata = C.strata.map((h) => new THREE.Color(h));
  const topSoil = new THREE.Color(C.rockTop);
  const tmp = new THREE.Color();
  const deep = new THREE.Color(0x77573c);

  for (let f = 0; f < fp.count; f += 3) {
    const cx = (fp.getX(f) + fp.getX(f + 1) + fp.getX(f + 2)) / 3;
    const cy = (fp.getY(f) + fp.getY(f + 1) + fp.getY(f + 2)) / 3;
    const cz = (fp.getZ(f) + fp.getZ(f + 1) + fp.getZ(f + 2)) / 3;
    const theta = Math.atan2(cz, cx);
    const t = clamp(-cy / depth, 0, 1);
    const n = valueNoise2(cx * 1.9 + 7, cz * 1.9 - 3);
    const n2 = valueNoise2(theta * 2.4 + 11, t * 8.5);
    // 层理：近水平的薄沉积层 + 层底暗缝
    const bandF = -cy * 0.92 + n * 0.12;
    const band = Math.floor(bandF);
    const frac = bandF - band;
    tmp.copy(strata[((band % strata.length) + strata.length) % strata.length]);
    // 顶部一层：薄土壤
    if (t < 0.03) tmp.copy(topSoil).lerp(strata[0], t / 0.03);
    // 层内渐变 + 层缝压暗
    tmp.offsetHSL(0, (n2 - 0.5) * 0.04, (n - 0.5) * 0.06 + (frac - 0.5) * 0.03);
    const seam = 0.9 + 0.1 * smoothstep(0.02, 0.25, frac);
    // 竖向侵蚀沟
    const groove = 0.92 + 0.1 * (0.5 + 0.5 * Math.sin(theta * 15 + n2 * 2.5));
    // 越深越暗、越冷
    tmp.lerp(deep, t * 0.28);
    tmp.multiplyScalar(seam * groove * (0.92 + n * 0.16));
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3] = tmp.r;
      colors[(f + k) * 3 + 1] = tmp.g;
      colors[(f + k) * 3 + 2] = tmp.b;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();

  const mesh = new THREE.Mesh(flat, stdMat(0xffffff, {
    roughness: 1.0, vertexColors: true, flatShading: true, envMapIntensity: 0.35,
  }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ==========================================================================
   顶面草甸
   ========================================================================== */

function buildTopSurface(rand) {
  const RINGS = 44, SEG = 120;
  const verts = [];
  const colors = [];
  const indices = [];
  const lawn = C.lawn.map((h) => new THREE.Color(h));
  const rimGreen = new THREE.Color(0x88a84f);
  const dirt = new THREE.Color(0x8c7448);
  const tmp = new THREE.Color();

  // ri 0 为中心（用极密环避开退化）：从 0 开始
  for (let ri = 0; ri <= RINGS; ri++) {
    const rn = ri / RINGS;
    const r = Math.pow(rn, 0.92) * ISLE_R;
    for (let si = 0; si < SEG; si++) {
      const a = (si / SEG) * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = topHeight(x, z);
      verts.push(x, y, z);

      const dc = Math.hypot(x - CITY_CENTER.x, z - CITY_CENTER.y);
      if (dc < 3.9) {
        // 城区：浅色石铺地（供建筑基座压住，露出的边也算庭院）
        tmp.setHex(0xd9cbb0).offsetHSL(0, 0, (rand() - 0.5) * 0.05);
      } else if (dc < 4.8) {
        tmp.copy(lawn[Math.floor(rand() * lawn.length)]).lerp(new THREE.Color(0xd3c3a2), 0.35 + rand() * 0.3);
      } else {
        const n = valueNoise2(x * 0.5 + 2, z * 0.5 - 5);
        tmp.copy(lawn[Math.floor(rand() * lawn.length)]);
        tmp.lerp(rimGreen, smoothstep(0.72, 1.0, rn) * 0.45);
        tmp.lerp(dirt, (1 - n) * 0.18 * smoothstep(0.55, 1.0, rn));
        tmp.offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.07);
      }
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let ri = 0; ri < RINGS; ri++) {
    for (let si = 0; si < SEG; si++) {
      const a = ri * SEG + si;
      const b = ri * SEG + ((si + 1) % SEG);
      const c = (ri + 1) * SEG + si;
      const d = (ri + 1) * SEG + ((si + 1) % SEG);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, stdMat(0xffffff, {
    roughness: 0.96, vertexColors: true, envMapIntensity: 0.4,
  }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/* ==========================================================================
   植被
   ========================================================================== */

function buildTrunks(rand, list, kit) {
  // list: {x,z,h,r,lean,theta}
  for (const tr of list) {
    const y0 = topHeight(tr.x, tr.z);
    const seg = 4;
    let px = tr.x, pz = tr.z;
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg, t1 = (s + 1) / seg;
      const r0 = lerp(tr.r, tr.r * 0.35, t0);
      const r1 = lerp(tr.r, tr.r * 0.35, t1);
      const h = tr.h / seg;
      const yy = y0 + tr.h * ((t0 + t1) / 2);
      const off = Math.sin(t0 * 2.4) * tr.lean;
      kit.add(new THREE.CylinderGeometry(r1, r0, h * 1.04, 7), new THREE.Color(C.trunk).offsetHSL(0, 0, (rand() - 0.5) * 0.06),
        px + Math.cos(tr.theta) * off, yy, pz + Math.sin(tr.theta) * off);
    }
  }
}

/** 树冠叶簇：把广告牌加入 leafField */
function addCanopy(field, rand, cx, cy, cz, rx, ry, rz, count, size, warmBias = 0.15) {
  const leafPalette = C.leaf.map((h) => new THREE.Color(h));
  const warmPalette = C.leafWarm.map((h) => new THREE.Color(h));
  for (let i = 0; i < count; i++) {
    const u = rand() * TAU;
    const v = Math.acos(2 * rand() - 1);
    const rr = 0.55 + Math.pow(rand(), 0.55) * 0.5;
    const nx = Math.sin(v) * Math.cos(u) * rr;
    const ny = Math.cos(v) * rr;
    const nz = Math.sin(v) * Math.sin(u) * rr;
    const x = cx + nx * rx;
    const y = cy + ny * ry;
    const z = cz + nz * rz;
    const lit = clamp(0.5 + ny * 0.5 + (x > 0 ? 0.12 : 0), 0, 1);
    const useWarm = rand() < warmBias * lit;
    const c = (useWarm ? warmPalette[Math.floor(rand() * warmPalette.length)]
      : leafPalette[Math.floor(rand() * leafPalette.length)]).clone();
    c.offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08 + lit * 0.05);
    field.add({
      x, y, z,
      sx: size * (0.75 + rand() * 0.6),
      sy: size * (0.62 + rand() * 0.5),
      rot: rand() * TAU,
      color: c,
      opacity: 0.94,
      phase: rand(),
    });
  }
}

function buildBigTree(rand, x, z, leafField, trunkKit, rootKit) {
  const y0 = topHeight(x, z);
  const H = 8.2;
  const theta = 0.6;
  // 主干（分段渐细，带轻微倾斜）
  const segs = 6;
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs;
    const r0 = lerp(1.15, 0.34, Math.pow(t0, 0.8));
    const r1 = lerp(1.15, 0.34, Math.pow(t1, 0.8));
    const off = Math.sin(t0 * Math.PI) * 0.55;
    trunkKit.add(
      new THREE.CylinderGeometry(r1, r0 * 1.02, (H / segs) * 1.06, 9),
      new THREE.Color(C.trunk).offsetHSL(0, (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.05),
      x + off, y0 + (t0 + t1) / 2 * H, z + off * 0.4
    );
  }
  // 主枝
  const branches = [
    [1.6, 3.2, 0.9, 3.6, 0.30], [-1.9, 2.8, -0.6, 3.9, 0.28],
    [0.4, 2.2, 2.1, 3.4, 0.26], [-0.6, 2.4, -2.2, 3.2, 0.24],
  ];
  for (const [bx, by, bz, bl, br] of branches) {
    const start = new THREE.Vector3(x + 0.3, y0 + H * 0.72 + by * 0.4, z + 0.2);
    const end = new THREE.Vector3(x + bx * 1.5, y0 + H + by, z + bz * 1.5);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.5, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    trunkKit.addM(new THREE.TubeGeometry(curve, 6, br, 6, false), new THREE.Color(C.trunk), new THREE.Matrix4());
  }

  // 树冠：一整团大椭球 + 顶部两层收拢（细叶广告牌，量大所以体积足）
  addCanopy(leafField, rand, x, y0 + H + 2.2, z, 5.5, 2.9, 5.5, 3000, 1.5, 0.3);
  addCanopy(leafField, rand, x + 0.3, y0 + H + 4.4, z - 0.3, 3.5, 1.9, 3.5, 900, 1.34, 0.34);
  addCanopy(leafField, rand, x - 0.2, y0 + H + 5.8, z + 0.2, 2.1, 1.3, 2.1, 260, 1.18, 0.36);

  // 板根 + 沿岩缘下垂的根（不飞出岛缘）
  const rimA = Math.atan2(z, x);
  for (let i = 0; i < 6; i++) {
    const a = rimA + (i - 2.5) * 0.11 + (rand() - 0.5) * 0.06;
    const len = 1.2 + rand() * 1.6;
    const p0 = new THREE.Vector3(x + Math.cos(a) * 0.55, y0 + 0.25, z + Math.sin(a) * 0.55);
    const p1 = new THREE.Vector3(Math.cos(a) * 9.95, y0 - 0.35, Math.sin(a) * 9.95);
    const p2 = new THREE.Vector3(Math.cos(a + 0.03) * (10.15 + rand() * 0.15), y0 - 0.9 - len * 2.2, Math.sin(a + 0.03) * (10.15 + rand() * 0.15));
    rootKit.addM(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 8, 0.15, 6, false),
      new THREE.Color(C.trunk).multiplyScalar(0.85), new THREE.Matrix4());
  }
}

function buildLawnProps(rand, top, leafField, grassField) {
  // 草丛
  for (let i = 0; i < 2400; i++) {
    const a = rand() * TAU;
    const r = Math.sqrt(rand()) * ISLE_R * 1.004;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const dc = Math.hypot(x - CITY_CENTER.x, z - CITY_CENTER.y);
    if (dc < 3.5) continue;
    const y = topHeight(x, z);
    const green = new THREE.Color(C.lawn[Math.floor(rand() * C.lawn.length)]).offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.12);
    // 边缘草更长更黄
    const edge = smoothstep(0.82, 1.0, r / ISLE_R);
    grassField.add({
      x, y: y + 0.05, z,
      sx: 0.22 + rand() * 0.26 + edge * 0.18,
      sy: 0.26 + rand() * 0.3 + edge * 0.3,
      rot: (rand() - 0.5) * 0.35,
      color: green.lerp(new THREE.Color(0x8a9550), edge * 0.55),
      opacity: 0.95,
      phase: rand(),
    });
  }
  // 小花
  const flowerCols = [0xffffff, 0xffe9c9, 0xffd6e2, 0xd9e7ff, 0xfff3b8];
  for (let i = 0; i < 520; i++) {
    const a = rand() * TAU;
    const r = 2.5 + Math.sqrt(rand()) * (ISLE_R - 2.6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const dc = Math.hypot(x - CITY_CENTER.x, z - CITY_CENTER.y);
    if (dc < 3.6) continue;
    const y = topHeight(x, z);
    leafField.add({
      x, y: y + 0.2, z,
      sx: 0.22 + rand() * 0.24,
      sy: 0.22 + rand() * 0.24,
      rot: rand() * TAU,
      color: new THREE.Color(flowerCols[Math.floor(rand() * flowerCols.length)]),
      opacity: 0.95,
      phase: rand(),
    });
  }
  // 散布小石头
  const stones = new GeoKit();
  for (let i = 0; i < 46; i++) {
    const a = rand() * TAU;
    const r = 3.2 + Math.sqrt(rand()) * (ISLE_R - 3.2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - CITY_CENTER.x, z - CITY_CENTER.y) < 3.2) continue;
    const y = topHeight(x, z);
    const s = 0.18 + rand() * 0.42;
    stones.add(new THREE.DodecahedronGeometry(s, 0), new THREE.Color(0x9a8a72).offsetHSL(0, 0, (rand() - 0.5) * 0.1),
      x, y + s * 0.25, z, { rx: rand(), ry: rand() * TAU, rz: rand() });
  }
  const stoneMesh = stones.build(stdMat(0xffffff, { roughness: 1, vertexColors: true, flatShading: true }));
  if (stoneMesh) top.add(stoneMesh);
}

/* ==========================================================================
   主岛
   ========================================================================== */

export function buildMainIsland(rand) {
  const group = new THREE.Group();
  const rockMat = stdMat(0xffffff, { roughness: 1, vertexColors: true, flatShading: true, envMapIntensity: 0.35 });
  const leafField = new BillboardField(leafTexture(), {
    fogColor: new THREE.Color(0xe9c8a4), fogDensity: 0.0038, opacity: 1,
  });
  const grassField = new BillboardField(grassTexture(), {
    fogColor: new THREE.Color(0xe9c8a4), fogDensity: 0.0038, opacity: 1,
  });

  // 岩体
  group.add(buildRock(ISLE_R, ISLE_DEPTH, rand));

  // 草甸顶面
  const top = buildTopSurface(rand);
  group.add(top);

  // 树干集合
  const trunkKit = new GeoKit();
  const rootKit = new GeoKit();

  // 巨树（岛西侧）
  const treeX = -9.0, treeZ = -1.2;
  buildBigTree(rand, treeX, treeZ, leafField, trunkKit, rootKit);

  // 岛上中景树
  const treeSpots = [
    [-8.4, -5.6, 3.4, 0.22], [8.2, 5.4, 2.8, 0.18], [-4.2, -8.6, 3.0, 0.2],
    [8.6, -6.4, 2.6, 0.17], [-9.4, 6.6, 2.4, 0.18], [5.2, 8.0, 2.4, 0.16],
    [-9.6, -0.6, 2.6, 0.17], [0.4, 8.6, 2.5, 0.17],
  ];
  const trunkList = [];
  for (const [tx, tz, th, tr] of treeSpots) {
    const y = topHeight(tx, tz);
    trunkList.push({ x: tx, z: tz, h: th * 1.7, r: tr, lean: 0.35, theta: rand() * TAU });
    addCanopy(leafField, rand, tx, y + th * 1.55, tz, th * 0.95, th * 0.72, th * 0.95, 180, th * 0.42, 0.22);
  }
  // 灌木
  for (let i = 0; i < 34; i++) {
    const a = rand() * TAU;
    const r = 3.6 + rand() * (ISLE_R - 4.2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - CITY_CENTER.x, z - CITY_CENTER.y) < 3.2) continue;
    const y = topHeight(x, z);
    addCanopy(leafField, rand, x, y + 0.5, z, 0.8 + rand() * 0.7, 0.55 + rand() * 0.4, 0.8 + rand() * 0.7, 42, 0.4, 0.15);
  }

  buildTrunks(rand, trunkList, trunkKit);
  const trunks = trunkKit.build(stdMat(0xffffff, { roughness: 1, vertexColors: true }));
  if (trunks) group.add(trunks);
  const roots = rootKit.build(stdMat(0xffffff, { roughness: 1, vertexColors: true }));
  if (roots) group.add(roots);

  // 岩缘垂藤
  const vineKit = new GeoKit();
  const vineLeafPositions = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 30) * TAU + rand() * 0.35;
    const yTop = topHeight(Math.cos(a) * ISLE_R * 0.97, Math.sin(a) * ISLE_R * 0.97) - 0.3;
    const len = 1.6 + rand() * 4.4;
    const r0 = ISLE_R * (0.965 + rand() * 0.03);
    const p0 = new THREE.Vector3(Math.cos(a) * r0, yTop, Math.sin(a) * r0);
    const p1 = new THREE.Vector3(Math.cos(a + 0.05) * (r0 + 0.55), yTop - len * 0.42, Math.sin(a + 0.05) * (r0 + 0.55));
    const p2 = new THREE.Vector3(Math.cos(a + 0.1) * (r0 - 0.35), yTop - len, Math.sin(a + 0.1) * (r0 - 0.35));
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    vineKit.addM(new THREE.TubeGeometry(curve, 8, 0.045, 5, false), new THREE.Color(C.vine), new THREE.Matrix4());
    for (let j = 0; j < 4; j++) {
      const pt = curve.getPoint(0.2 + j * 0.17);
      vineLeafPositions.push({ p: pt, s: 0.35 + rand() * 0.4 });
    }
  }
  const vines = vineKit.build(stdMat(0xffffff, { roughness: 1, vertexColors: true }));
  if (vines) group.add(vines);
  for (const v of vineLeafPositions) {
    leafField.add({
      x: v.p.x, y: v.p.y, z: v.p.z,
      sx: v.s, sy: v.s,
      rot: rand() * TAU,
      color: new THREE.Color(C.vineLeaf[Math.floor(rand() * C.vineLeaf.length)]),
      opacity: 0.95, phase: rand(),
    });
  }

  // 草坪点缀
  buildLawnProps(rand, top, leafField, grassField);

  const leafMesh = leafField.build({ sway: 0.05, flutter: 0.035 });
  leafMesh.renderOrder = 5;
  group.add(leafMesh);
  const grassMesh = grassField.build({ sway: 0.03, flutter: 0.02 });
  grassMesh.renderOrder = 4;
  group.add(grassMesh);

  return {
    group, top, leafField, grassField,
    treeAnchor: new THREE.Vector3(treeX, topHeight(treeX, treeZ) + 9.5, treeZ),
    heightAt: topHeight,
  };
}

/* ==========================================================================
   桥头卫星岛 + 远景浮岛
   ========================================================================== */

function buildSmallIsland(rand, R, depth, kitStone, leafField, grassField, opts = {}) {
  const group = new THREE.Group();
  const rings = 26, seg = 48;
  const profile = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    profile.push(new THREE.Vector2(Math.max(0.02, isleRadius(t) * R), -t * depth));
  }
  const geo = new THREE.LatheGeometry(profile, seg);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const th = Math.atan2(z, x);
    const t = clamp(-y / depth, 0, 1);
    const m = 1 + 0.07 * fbm2(th * 2.4 + 4, t * 5, 3) + 0.03 * Math.sin(th * 6 + t * 3);
    pos.setXYZ(i, x * m, y + Math.sin(th * 5 + t * 9) * 0.2, z * m);
  }
  geo.computeVertexNormals();
  const flat = geo.toNonIndexed();
  const fp = flat.attributes.position;
  const arr = new Float32Array(fp.count * 3);
  const strata = C.strata.map((h) => new THREE.Color(h));
  const tmp = new THREE.Color();
  for (let f = 0; f < fp.count; f += 3) {
    const cy = (fp.getY(f) + fp.getY(f + 1) + fp.getY(f + 2)) / 3;
    const cx = (fp.getX(f) + fp.getX(f + 1) + fp.getX(f + 2)) / 3;
    const cz = (fp.getZ(f) + fp.getZ(f + 1) + fp.getZ(f + 2)) / 3;
    const t = clamp(-cy / depth, 0, 1);
    const n = valueNoise2(cx + 2, cz - 7);
    tmp.copy(strata[Math.floor((t * 7 + n * 0.4)) % strata.length]);
    tmp.lerp(new THREE.Color(0x5a3a26), t * 0.42);
    tmp.multiplyScalar(0.82 + n * 0.3);
    for (let k = 0; k < 3; k++) {
      arr[(f + k) * 3] = tmp.r; arr[(f + k) * 3 + 1] = tmp.g; arr[(f + k) * 3 + 2] = tmp.b;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  flat.computeVertexNormals();
  const rock = new THREE.Mesh(flat, stdMat(0xffffff, { roughness: 1, vertexColors: true, flatShading: true }));
  rock.castShadow = rock.receiveShadow = true;
  group.add(rock);

  // 草顶
  const cap = new THREE.CylinderGeometry(R * 0.995, R * 0.965, 1.4, 40, 2);
  const cp = cap.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i);
    const r = Math.hypot(x, z);
    const n = Math.sin(x * 1.6 + z * 0.9) * 0.1 + Math.cos(z * 1.9 - x * 0.5) * 0.08;
    cp.setY(i, cp.getY(i) + n * Math.min(1, r / R));
  }
  cap.computeVertexNormals();
  const capMesh = new THREE.Mesh(cap, stdMat(0xffffff, { roughness: 0.96, vertexColors: true }));
  capMesh.position.y = -0.05;
  const ca = cap.attributes.position;
  const capColors = new Float32Array(ca.count * 3);
  const lawn = C.lawn.map((h) => new THREE.Color(h));
  for (let i = 0; i < ca.count; i++) {
    const c = lawn[Math.floor(rand() * lawn.length)].clone().multiplyScalar(0.86).offsetHSL(0, 0, (rand() - 0.5) * 0.07);
    capColors[i * 3] = c.r; capColors[i * 3 + 1] = c.g; capColors[i * 3 + 2] = c.b;
  }
  cap.setAttribute('color', new THREE.BufferAttribute(capColors, 3));
  group.add(capMesh);

  // 少量树
  const trees = opts.trees !== undefined ? opts.trees : 3;
  for (let i = 0; i < trees; i++) {
    const a = rand() * TAU;
    const r = R * (0.35 + rand() * 0.5);
    const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
    const h = 1.6 + rand() * 2.2;
    kitStone.add(new THREE.CylinderGeometry(0.12, 0.2, h, 5),
      new THREE.Color(C.trunk), tx, h / 2, tz);
    addCanopy(leafField, rand, tx, h + 0.35, tz, 1.1 + rand() * 0.7, 0.9 + rand() * 0.4, 1.1 + rand() * 0.7, 90, 0.95, 0.2);
  }
  // 草簇点缀
  for (let i = 0; i < 260; i++) {
    const a = rand() * TAU;
    const r = Math.sqrt(rand()) * R * 0.96;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    grassField.add({
      x, y: 0.62, z,
      sx: 0.3 + rand() * 0.35, sy: 0.36 + rand() * 0.42,
      rot: (rand() - 0.5) * 0.3,
      color: new THREE.Color(C.lawn[Math.floor(rand() * C.lawn.length)]),
      opacity: 0.95, phase: rand(),
    });
  }

  return group;
}

export function buildSatelliteIsland(rand, leafField, grassField) {
  const group = new THREE.Group();
  const stoneKit = new GeoKit();
  const g = buildSmallIsland(rand, 4.7, 13.5, stoneKit, leafField, grassField, { trees: 3 });
  group.add(g);
  const trunks = stoneKit.build(stdMat(0xffffff, { roughness: 1, vertexColors: true }));
  if (trunks) group.add(trunks);

  // 守望塔（石塔 + 拱窗 + 铜绿穹顶）
  const towerKit = new GeoKit();
  const goldKit = new GeoKit();
  const stone = (hex) => new THREE.Color(hex);
  const T = 5, towerH = 8.6;
  towerKit.add(new THREE.CylinderGeometry(1.06, 1.25, 1.0, 12), stone(0xded0b4), 0, 0.55, 0);
  towerKit.add(new THREE.CylinderGeometry(0.92, 1.06, towerH, 12), stone(0xefe3ca), 0, towerH / 2 + 0.5, 0);
  for (let i = 0; i < 4; i++) {
    const y = 2.3 + i * 2.0;
    towerKit.add(new THREE.CylinderGeometry(0.98, 0.98, 0.14, 12), stone(0xf6efdd), 0, y, 0);
  }
  towerKit.add(new THREE.CylinderGeometry(1.05, 0.95, 0.5, 12), stone(0xf6efdd), 0, towerH + 0.72, 0);
  // 穹顶
  const domePts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    domePts.push(new THREE.Vector2(Math.sin(t * Math.PI * 0.5) * 1.03 + 0.01, Math.cos(t * Math.PI * 0.5) * 1.25));
  }
  goldKit.addM(new THREE.LatheGeometry(domePts, 16), stone(0x4f8c7e), new THREE.Matrix4().makeTranslation(0, towerH + 0.95, 0));
  goldKit.add(new THREE.ConeGeometry(0.1, 0.9, 6), stone(0xd9a441), 0, towerH + 2.5, 0);
  group.add(towerKit.build(stdMat(0xffffff, { roughness: 0.92, vertexColors: true })));
  group.add(goldKit.build(stdMat(0xffffff, { roughness: 0.38, metalness: 0.65, vertexColors: true, envMapIntensity: 1.1 })));

  // 碎拱遗迹
  const ruin = new GeoKit();
  for (let i = 0; i < 2; i++) {
    const yaw = i * 1.5 + 0.4;
    const shape = new THREE.Shape();
    shape.moveTo(-1.3, 0); shape.lineTo(-1.3, 2.6); shape.lineTo(1.3, 2.6); shape.lineTo(1.3, 0);
    const hole = new THREE.Path();
    hole.absarc(0, 1.05, 0.95, 0, Math.PI, false);
    hole.lineTo(0.95, 0); hole.lineTo(-0.95, 0);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false, curveSegments: 10 });
    ruin.addM(geo, stone(0xd8c9ac), new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(yaw) * 2.0, 0.6, Math.sin(yaw) * 2.0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(0.8, 0.8, 0.8)
    ));
  }
  group.add(ruin.build(stdMat(0xffffff, { roughness: 1, vertexColors: true })));

  return group;
}

export function buildDistantIslands(rand, leafField) {
  const group = new THREE.Group();
  const rockKit = new GeoKit();
  const stoneKit = new GeoKit();
  const metalKit = new GeoKit();
  const waterKit = new GeoKit();

  const strataC = C.strata.map((h) => new THREE.Color(h));
  const launcher = [0x8e9a84, 0x7f8f6c];

  const specs = [
    // x, y, z, R, tiltZ, tiltX, style
    [-96, 22, -118, 10.0, 0.06, -0.03, 'ruin'],
    [70, 32, -146, 6.6, -0.05, 0.04, 'tower'],
    [146, -2, -70, 8.2, 0.04, 0.02, 'tree'],
    [-166, -6, -34, 12.5, -0.03, 0.05, 'big'],
    [32, -22, -190, 6.2, 0.02, -0.05, 'tree'],
    [-60, 46, -178, 5.2, 0.06, 0.03, 'tower'],
    [196, 24, -168, 7.6, -0.04, -0.02, 'ruin'],
    [-130, 42, -216, 5.6, 0.03, 0.04, 'tree'],
    [108, -30, -124, 4.8, 0.05, 0.02, 'fall'],
    [-42, -36, -156, 4.4, -0.02, 0.05, 'tree'],
    [26, 58, -238, 4.6, 0.04, -0.04, 'tower'],
    [-196, 18, -126, 6.4, 0.03, 0.02, 'big'],
  ];

  const mtx = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  for (let si = 0; si < specs.length; si++) {
    const [x, y, z, R, tz, tx, style] = specs[si];
    const depth = R * 1.75;
    const tilt = new THREE.Matrix4();
    euler.set(tx, rand() * TAU, tz);
    quat.setFromEuler(euler);
    tilt.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(1, 1, 1));
    mtx.copy(tilt);

    /* ---- 岩体（不规则、带竖向侵蚀） ---- */
    const rings = 26, seg = 34;
    const profile = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const base = isleRadius(t) * R;
      const bulge = 1 + 0.10 * Math.sin(t * 9 + si) + 0.06 * Math.sin(t * 17 + si * 2.3);
      profile.push(new THREE.Vector2(Math.max(0.06, base * bulge), -t * depth));
    }
    const geo = new THREE.LatheGeometry(profile, seg);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const th = Math.atan2(vz, vx);
      const t = clamp(-vy / depth, 0, 1);
      const m = 1
        + 0.15 * fbm2(th * 1.6 + si * 3.1, t * 3.4, 3)
        + 0.05 * Math.sin(th * 9 + t * 6 + si)
        + 0.03 * Math.sin(th * 17 - t * 12);
      const yy = vy + Math.sin(th * 7 + t * 15 + si) * 0.35 * (0.3 + t);
      pos.setXYZ(i, vx * m, yy, vz * m);
    }
    geo.computeVertexNormals();
    const flat = geo.toNonIndexed();
    const fp = flat.attributes.position;
    const arr = new Float32Array(fp.count * 3);
    const tmp = new THREE.Color();
    for (let f = 0; f < fp.count; f += 3) {
      const cx = (fp.getX(f) + fp.getX(f + 1) + fp.getX(f + 2)) / 3;
      const cy = (fp.getY(f) + fp.getY(f + 1) + fp.getY(f + 2)) / 3;
      const cz = (fp.getZ(f) + fp.getZ(f + 1) + fp.getZ(f + 2)) / 3;
      const th = Math.atan2(cz, cx);
      const t = clamp(-cy / depth, 0, 1);
      const n = valueNoise2(cx * 0.4 + si * 3, cz * 0.4 - 7);
      const band = Math.floor(t * 10 + n * 0.6 + Math.sin(th * 2) * 0.2);
      tmp.copy(strataC[((band % strataC.length) + strataC.length) % strataC.length]);
      tmp.lerp(new THREE.Color(0x5b4a3a), 0.22 + t * 0.3);
      tmp.multiplyScalar(0.72 + n * 0.34);
      for (let k = 0; k < 3; k++) {
        arr[(f + k) * 3] = tmp.r; arr[(f + k) * 3 + 1] = tmp.g; arr[(f + k) * 3 + 2] = tmp.b;
      }
    }
    flat.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    flat.computeVertexNormals();
    flat.applyMatrix4(mtx);
    rockKit.addRaw(flat);

    /* ---- 草甸穹顶 ---- */
    const dome = new THREE.SphereGeometry(R * 1.02, 26, 9, 0, TAU, 0, Math.PI * 0.5);
    const dp = dome.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const vx = dp.getX(i), vy = dp.getY(i), vz = dp.getZ(i);
      const th = Math.atan2(vz, vx);
      const edge = 1 + 0.05 * Math.sin(th * 7 + si * 2) + 0.03 * Math.cos(th * 13 + si);
      dp.setXYZ(i, vx * edge, vy * 0.30 + 0.12, vz * edge);
    }
    dome.computeVertexNormals();
    const dcol = new Float32Array(dp.count * 3);
    const greens = C.lawn.map((h) => new THREE.Color(h));
    for (let i = 0; i < dp.count; i++) {
      const c = greens[Math.floor(rand() * greens.length)].clone().multiplyScalar(0.72 + rand() * 0.28);
      dcol[i * 3] = c.r; dcol[i * 3 + 1] = c.g; dcol[i * 3 + 2] = c.b;
    }
    dome.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
    dome.applyMatrix4(mtx);
    stoneKit.addRaw(dome);

    /* ---- 建筑 / 遗迹 ---- */
    const lStone = new GeoKit();
    const lMetal = new GeoKit();
    const stoneC = () => new THREE.Color(0xd9ccb4).multiplyScalar(0.78 + rand() * 0.22);
    const copper = () => new THREE.Color(0x4a7d72).multiplyScalar(0.8 + rand() * 0.25);

    if (style === 'tower' || style === 'big') {
      const nT = style === 'big' ? 2 : 1;
      for (let k = 0; k < nT; k++) {
        const a = rand() * TAU, r = R * (0.15 + rand() * 0.45);
        const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
        const h = R * (0.55 + rand() * 0.5);
        const tw = R * (0.075 + rand() * 0.045);
        lStone.add(new THREE.CylinderGeometry(tw * 0.82, tw, h, 9), stoneC(), tx, h / 2, tz);
        lStone.add(new THREE.CylinderGeometry(tw * 1.25, tw * 1.1, h * 0.08, 9), stoneC(), tx, h * 0.56, tz);
        lMetal.add(new THREE.ConeGeometry(tw * 1.25, h * 0.42, 9), copper(), tx, h + h * 0.2, tz);
        lMetal.add(new THREE.CylinderGeometry(tw * 0.14, tw * 0.18, h * 0.3, 5), new THREE.Color(0xc9a04a), tx, h + h * 0.55, tz);
      }
      // 周围矮墙
      const nW = 4;
      for (let k = 0; k < nW; k++) {
        const a = (k / nW) * TAU + rand() * 0.4;
        const r = R * (0.48 + rand() * 0.16);
        lStone.add(new THREE.BoxGeometry(R * 0.38, R * 0.11, R * 0.08), stoneC(),
          Math.cos(a) * r, R * 0.06, Math.sin(a) * r, { ry: -a + Math.PI / 2 });
      }
    } else if (style === 'ruin') {
      for (let k = 0; k < 4; k++) {
        const a = rand() * TAU, r = R * (0.2 + rand() * 0.4);
        const h = R * (0.18 + rand() * 0.4);
        const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
        lStone.add(new THREE.CylinderGeometry(R * 0.045, R * 0.055, h, 7), stoneC(), tx, h / 2, tz);
        if (k % 2 === 0) {
          lStone.add(new THREE.TorusGeometry(R * 0.13, R * 0.028, 4, 10, Math.PI), stoneC(),
            tx + R * 0.13, h, tz, { ry: rand() * TAU });
        }
      }
    }
    const lStoneGeo = lStone.toGeometry();
    if (lStoneGeo) { lStoneGeo.applyMatrix4(mtx); stoneKit.addRaw(lStoneGeo); }
    const lMetalGeo = lMetal.toGeometry();
    if (lMetalGeo) { lMetalGeo.applyMatrix4(mtx); metalKit.addRaw(lMetalGeo); }

    /* ---- 树 ---- */
    const nTrees = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < nTrees; k++) {
      const a = rand() * TAU, r = R * (0.16 + rand() * 0.62);
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      const h = R * (0.28 + rand() * 0.22);
      const v = new THREE.Vector3(lx, R * 0.2 + h, lz).applyMatrix4(mtx);
      const scale = R * 0.02;
      addCanopy(leafField, rand, v.x, v.y, v.z, R * 0.30, R * 0.22, R * 0.30, 22, R * 0.16, 0.12);
      lStone.add(new THREE.CylinderGeometry(0.05 * R * 0.4, 0.07 * R * 0.4, h, 5), new THREE.Color(0x5b4232),
        lx, R * 0.2 + h / 2, lz);
    }

    /* ---- 细瀑 ---- */
    if (style === 'fall' || style === 'big') {
      const a = rand() * TAU;
      const rx = Math.cos(a) * R * 0.95, rz = Math.sin(a) * R * 0.95;
      const sw = R * (0.14 + rand() * 0.1);
      const sh = R * (1.0 + rand() * 0.9);
      const sgeo = new THREE.BufferGeometry();
      const sp = [
        rx - sw, 0.05, rz, rx + sw, 0.05, rz,
        rx - sw * 1.6, -sh, rz, rx + sw * 1.6, -sh, rz,
      ];
      const suv = [0, 0, 1, 0, 0, 1, 1, 1];
      const scol = new Float32Array(12);
      for (let q = 0; q < 4; q++) { scol[q * 3] = 0.92; scol[q * 3 + 1] = 0.96; scol[q * 3 + 2] = 1; }
      sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      sgeo.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
      sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
      sgeo.setIndex([0, 2, 1, 1, 2, 3]);
      const sg = sgeo.toNonIndexed();
      sg.applyMatrix4(mtx);
      waterKit.addRaw(sg);
    }
  }

  const rockMesh = rockKit.build(stdMat(0xffffff, {
    roughness: 1, vertexColors: true, flatShading: true, envMapIntensity: 0.25,
  }));
  if (rockMesh) group.add(rockMesh);
  const stoneMesh = stoneKit.build(stdMat(0xffffff, { roughness: 0.98, vertexColors: true, envMapIntensity: 0.3 }));
  if (stoneMesh) group.add(stoneMesh);
  const metalMesh = metalKit.build(stdMat(0xffffff, { roughness: 0.45, metalness: 0.55, vertexColors: true, envMapIntensity: 0.9 }));
  if (metalMesh) group.add(metalMesh);
  if (waterKit.count) {
    const waterMesh = waterKit.build(new THREE.MeshBasicMaterial({
      map: streakTextureShared(), transparent: true, opacity: 0.5, depthWrite: false,
      vertexColors: true, side: THREE.DoubleSide,
    }), { castShadow: false, receiveShadow: false });
    if (waterMesh) group.add(waterMesh);
  }

  return group;
}

/** 远景细瀑共用的水流纹理 */
let _streak = null;
function streakTextureShared() {
  if (!_streak) _streak = streakTexture(32, 128);
  return _streak;
}

export { buildSmallIsland };
