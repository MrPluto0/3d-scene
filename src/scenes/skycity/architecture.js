// src/scenes/skycity/architecture.js — 天空之城：白石王城 + 长桥
// 全部程序化：墙身 / 柱廊 / 拱窗 / 玫瑰窗 / 飞扶壁 / 铜绿穹顶 / 露台 / 雉堞 / 长桥。
import * as THREE from 'three';
import {
  GeoKit, InstanceKit, stdMat, BillboardField, puffTexture, weatherGeometry, addSurfaceNoise, lerp, clamp, smoothstep, TAU,
} from './kit.js';
import { topHeight } from './terrain.js';

/* ---------------- 调色板 ---------------- */
const WALLS = [0xf1e5cd, 0xebdcc1, 0xf6ecda, 0xe5d7be, 0xefe2c8];
const TRIM = 0xfbf5e8;
const GOLD = 0xd8a648;
const COPPER = 0x4e8c7e;
const COPPER_DARK = 0x35635a;
const ROOF_TILE = 0xa9553f;
const DARK = 0x1a1d24;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _d = new THREE.Object3D();

function mkPos(x, y, z) { return new THREE.Vector3(x, y, z); }
function mkMat(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _v.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

/* ---------------- 基础几何（只造一次） ---------------- */
function archShape(w, h) {
  // 底边在 y=0，圆拱顶到 y=h；拱半径 = w/2
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}

function makeWindowGeos() {
  const outer = archShape(1.0, 1.5);
  const hole = archShape(0.82, 1.33);
  outer.holes.push(hole);
  const ring = new THREE.ExtrudeGeometry(outer, { depth: 0.11, bevelEnabled: false, curveSegments: 10 });
  const kit = new GeoKit();
  kit.addM(ring, 0xffffff, new THREE.Matrix4());
  // 中梃 + 窗台
  kit.add(new THREE.BoxGeometry(0.055, 1.06, 0.10), 0xffffff, 0, 0.55, 0.05);
  kit.add(new THREE.BoxGeometry(0.055, 0.62, 0.08), 0xffffff, -0.22, 0.31, 0.05);
  kit.add(new THREE.BoxGeometry(0.055, 0.62, 0.08), 0xffffff, 0.22, 0.31, 0.05);
  kit.add(new THREE.BoxGeometry(1.16, 0.10, 0.18), 0xffffff, 0, -0.05, 0.05);
  const frame = kit.toGeometry();

  const pane = new THREE.ExtrudeGeometry(archShape(0.80, 1.30), {
    depth: 0.05, bevelEnabled: false, curveSegments: 8,
  });
  pane.translate(0, 0.02, -0.035);
  return { frame, pane };
}

/** 拱券环（柱廊用），宽 1.3 / 高 2.2，中空 */
function makeArchRingGeo() {
  const outer = archShape(1.3, 2.2);
  const hole = archShape(1.02, 2.05);
  outer.holes.push(hole);
  const ring = new THREE.ExtrudeGeometry(outer, { depth: 0.34, bevelEnabled: false, curveSegments: 12 });
  // 拱券外缘再加一道线脚
  const kit = new GeoKit();
  kit.addM(ring, 0xffffff, new THREE.Matrix4());
  kit.add(new THREE.BoxGeometry(1.5, 0.14, 0.42), 0xffffff, 0, 2.2, 0.02);
  return kit.toGeometry();
}

function makeColumnGeo() {
  const kit = new GeoKit();
  kit.add(new THREE.BoxGeometry(0.34, 0.12, 0.34), 0xffffff, 0, 0.06, 0);
  kit.add(new THREE.CylinderGeometry(0.11, 0.14, 0.9, 10), 0xffffff, 0, 0.5, 0);
  kit.add(new THREE.CylinderGeometry(0.13, 0.11, 0.06, 10), 0xffffff, 0, 0.98, 0);
  kit.add(new THREE.BoxGeometry(0.32, 0.12, 0.32), 0xffffff, 0, 1.05, 0);
  const g = kit.toGeometry();
  g.translate(0, 0, 0);
  return g;
}

function makeBalusterGeo() {
  const pts = [];
  pts.push(new THREE.Vector2(0.055, 0));
  pts.push(new THREE.Vector2(0.075, 0.05));
  pts.push(new THREE.Vector2(0.045, 0.14));
  pts.push(new THREE.Vector2(0.075, 0.26));
  pts.push(new THREE.Vector2(0.055, 0.38));
  pts.push(new THREE.Vector2(0.075, 0.44));
  const g = new THREE.LatheGeometry(pts, 8);
  return g;
}

const GEO = {
  window: makeWindowGeos(),
  arch: makeArchRingGeo(),
  column: makeColumnGeo(),
  baluster: makeBalusterGeo(),
  plane: new THREE.PlaneGeometry(1, 1),
  merlon: new THREE.BoxGeometry(1, 1, 1),
};

/* ---------------- 窗批次 ---------------- */
class WindowBatch {
  constructor() {
    this.frames = [];
    this.lit = [];
    this.dark = [];
  }
  add(matrix, { lit = false, warm = 1 } = {}) {
    this.frames.push({ m: matrix, c: null });
    if (lit) {
      const c = new THREE.Color().setRGB(
        (1.9 + Math.random() * 1.2) * warm,
        (1.15 + Math.random() * 0.7) * warm,
        (0.42 + Math.random() * 0.3) * warm
      );
      this.lit.push({ m: matrix, c });
    } else {
      const c = new THREE.Color().setRGB(0.022, 0.030, 0.045);
      this.dark.push({ m: matrix, c });
    }
  }
  build(parent) {
    // 框
    const frameMat = stdMat(0xffffff, {
      roughness: 0.86, metalness: 0.0, vertexColors: false, envMapIntensity: 0.7,
    });
    if (this.frames.length) {
      const im = new THREE.InstancedMesh(GEO.window.frame, frameMat, this.frames.length);
      for (let i = 0; i < this.frames.length; i++) {
        im.setMatrixAt(i, this.frames[i].m);
        const c = new THREE.Color(TRIM).offsetHSL(0, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.06);
        im.setColorAt(i, c);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      parent.add(im);
    }
    // 亮窗（HDR 暖光，吃 Bloom）
    if (this.lit.length) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const im = new THREE.InstancedMesh(GEO.window.pane, mat, this.lit.length);
      for (let i = 0; i < this.lit.length; i++) {
        im.setMatrixAt(i, this.lit[i].m);
        im.setColorAt(i, this.lit[i].c);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      parent.add(im);
    }
    // 暗窗（反天光）
    if (this.dark.length) {
      const mat = stdMat(0xffffff, {
        roughness: 0.16, metalness: 0.55, vertexColors: false, envMapIntensity: 1.8,
      });
      const im = new THREE.InstancedMesh(GEO.window.pane, mat, this.dark.length);
      for (let i = 0; i < this.dark.length; i++) {
        im.setMatrixAt(i, this.dark[i].m);
        im.setColorAt(i, this.dark[i].c);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      parent.add(im);
    }
  }
}

/* ==========================================================================
   城建器
   ========================================================================== */

function createBuilder(rand) {
  return {
    rand,
    stone: new GeoKit(),
    trim: new GeoKit(),
    metal: new GeoKit(),
    roof: new GeoKit(),
    windows: new WindowBatch(),
    columns: new InstanceKit(GEO.column),
    arches: new InstanceKit(GEO.arch),
    balusters: new InstanceKit(GEO.baluster),
    merlons: new InstanceKit(GEO.merlon),
    panes: [],
    orbs: [],
  };
}

function pickWall(B) {
  const c = new THREE.Color(WALLS[Math.floor(B.rand() * WALLS.length)]);
  c.offsetHSL((B.rand() - 0.5) * 0.012, (B.rand() - 0.5) * 0.04, (B.rand() - 0.5) * 0.05);
  return c;
}
const trimC = () => new THREE.Color(TRIM);
const goldC = () => new THREE.Color(GOLD).offsetHSL(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.08);
const copperC = () => new THREE.Color(COPPER).offsetHSL(0, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.06);

/* ---------- 通用构件 ---------- */

/** 圆环栏杆：两道石环 + 一圈瓶形栏杆 */
function ringBalustrade(B, x, y, z, r, n = 24, h = 0.55) {
  const rail = new THREE.TorusGeometry(r, 0.045, 5, Math.max(20, n * 2));
  rail.rotateX(Math.PI / 2);
  B.trim.addM(rail, trimC(), new THREE.Matrix4().makeTranslation(x, y + h, z));
  const rail2 = new THREE.TorusGeometry(r, 0.06, 5, Math.max(20, n * 2));
  rail2.rotateX(Math.PI / 2);
  B.trim.addM(rail2, trimC(), new THREE.Matrix4().makeTranslation(x, y + 0.03, z));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    B.balusters.add(mkMat(x + Math.cos(a) * r, y + 0.05, z + Math.sin(a) * r, 0, 1, h / 0.44, 1),
      trimC());
  }
}

/** 直线栏杆 */
function lineBalustrade(B, x0, z0, x1, z1, y, step = 0.55, h = 0.55) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    B.balusters.add(mkMat(x0 + dx * t, y + 0.05, z0 + dz * t, 0, 1, h / 0.44, 1), trimC());
  }
  // 上下横杆
  for (const yy of [y + 0.03, y + h]) {
    B.trim.add(new THREE.BoxGeometry(0.075, 0.075, len), trimC(),
      (x0 + x1) / 2, yy, (z0 + z1) / 2, { ry: yaw });
  }
}

/** 雉堞墙 */
function crenelWall(B, x0, z0, x1, z1, y, h = 1.15, thick = 0.42) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  B.stone.add(new THREE.BoxGeometry(thick, h, len), pickWall(B), (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, { ry: yaw });
  B.trim.add(new THREE.BoxGeometry(thick + 0.12, 0.1, len), trimC(), (x0 + x1) / 2, y + h, (z0 + z1) / 2, { ry: yaw });
  const n = Math.max(1, Math.floor(len / 0.72));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const mx = x0 + dx * t, mz = z0 + dz * t;
    B.merlons.add(mkMat(mx, y + h + 0.28, mz, yaw, 0.42, 0.56, 0.34), pickWall(B));
  }
  // 每隔一段加扶壁
  const nb = Math.max(1, Math.floor(len / 2.6));
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb;
    B.stone.add(new THREE.BoxGeometry(thick + 0.5, h * 0.9, 0.5), pickWall(B).multiplyScalar(0.94),
      x0 + dx * t, y + h * 0.45, z0 + dz * t, { ry: yaw });
  }
}

/** 一段楼梯（沿 +z 方向上/下） */
function stairs(B, x, z, w, y0, y1, steps, yaw = 0) {
  const dy = (y1 - y0) / steps;
  const run = 0.34;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    B.stone.add(new THREE.BoxGeometry(w, Math.abs(dy) + 0.18, run + 0.02),
      pickWall(B).multiplyScalar(0.96 + t * 0.06),
      x, y0 + dy * (i + 0.5) + 0.09, z + (i - steps / 2) * run, { ry: yaw });
  }
}

/** 洋葱穹顶 + 顶饰 */
function dome(B, x, y, z, r, h, color) {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const rr = Math.sin(t * Math.PI * 0.5) * r;
    const yy = Math.cos(t * Math.PI * 0.5) * h;
    // 洋葱形：下半段外鼓
    const bulge = 1 + Math.sin(t * Math.PI) * 0.16;
    pts.push(new THREE.Vector2(Math.max(0.01, rr * bulge), yy));
  }
  B.metal.addM(new THREE.LatheGeometry(pts, 18), color || copperC(),
    new THREE.Matrix4().makeTranslation(x, y, z));
  // 金顶尖
  B.metal.add(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6), goldC(), x, y + h + 0.2, z);
  B.metal.add(new THREE.SphereGeometry(0.11, 8, 6), goldC(), x, y + h + 0.48, z);
  B.metal.add(new THREE.ConeGeometry(0.06, 0.5, 6), goldC(), x, y + h + 0.95, z);
}

/** 塔尖（细长八角尖顶 + 金球） */
function spire(B, x, y, z, r, h, color) {
  B.metal.add(new THREE.CylinderGeometry(r * 0.5, r, h, 8), color || pickWall(B), x, y + h / 2, z);
  B.metal.add(new THREE.ConeGeometry(r * 0.55, h * 0.55, 8), color || pickWall(B), x, y + h + h * 0.27, z);
  B.metal.add(new THREE.SphereGeometry(r * 0.2, 8, 6), goldC(), x, y + h * 1.58, z);
}

/** 圆柱上一圈拱窗 */
function ringWindows(B, cx, cz, r, y, count, w, h, phase, litProb) {
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * TAU;
    const yaw = Math.PI / 2 - a;
    B.windows.add(mkMat(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, yaw, w, h / 1.5, 1),
      { lit: Math.random() < litProb });
  }
}

/* ==========================================================================
   主塔（王城核心）
   ========================================================================== */

function buildKeep(B, x, z) {
  const PY = 0.22;
  // 台基
  B.stone.add(new THREE.CylinderGeometry(3.15, 3.45, 0.55, 24), pickWall(B).multiplyScalar(0.92), x, PY + 0.28, z);
  B.stone.add(new THREE.CylinderGeometry(2.95, 3.15, 0.5, 24), pickWall(B), x, PY + 0.8, z);

  let y = PY + 1.05;

  // —— 一层塔身 ——
  const t1h = 3.5;
  B.stone.add(new THREE.CylinderGeometry(2.14, 2.26, t1h, 24), pickWall(B), x, y + t1h / 2, z);
  // 竖向壁柱
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.12;
    B.trim.add(new THREE.BoxGeometry(0.17, t1h * 0.96, 0.26),
      trimC(), x + Math.cos(a) * 2.2, y + t1h * 0.5, z + Math.sin(a) * 2.2, { ry: -a + Math.PI / 2 });
  }
  ringWindows(B, x, z, 2.24, y + 0.95, 8, 0.72, 1.15, 0.15, 0.5);
  // 腰线
  B.trim.add(new THREE.CylinderGeometry(2.36, 2.3, 0.22, 24), trimC(), x, y + t1h, z);
  y += t1h + 0.22;

  // —— 二层（带环形露台） ——
  const t2h = 3.3;
  B.stone.add(new THREE.CylinderGeometry(1.78, 1.9, 0.24, 24), pickWall(B), x, y + 0.12, z);
  ringBalustrade(B, x, y + 0.24, z, 1.98, 20, 0.5);
  y += 0.3;
  B.stone.add(new THREE.CylinderGeometry(1.72, 1.84, t2h, 24), pickWall(B), x, y + t2h / 2, z);
  ringWindows(B, x, z, 1.86, y + 0.9, 8, 0.62, 1.0, 0.4, 0.55);
  B.trim.add(new THREE.CylinderGeometry(1.94, 1.88, 0.2, 24), trimC(), x, y + t2h, z);
  y += t2h + 0.2;

  // —— 三层（带露台） ——
  const t3h = 2.9;
  B.stone.add(new THREE.CylinderGeometry(1.42, 1.52, 0.22, 24), pickWall(B), x, y + 0.11, z);
  ringBalustrade(B, x, y + 0.22, z, 1.6, 18, 0.46);
  y += 0.28;
  B.stone.add(new THREE.CylinderGeometry(1.36, 1.44, t3h, 20), pickWall(B), x, y + t3h / 2, z);
  ringWindows(B, x, z, 1.48, y + 0.8, 8, 0.5, 0.86, 0.2, 0.65);
  B.trim.add(new THREE.CylinderGeometry(1.56, 1.5, 0.2, 20), trimC(), x, y + t3h, z);
  y += t3h + 0.2;

  // —— 钟楼（开敞柱廊 + 铜绿穹顶） ——
  const belfryH = 1.9;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.16;
    B.columns.add(mkMat(x + Math.cos(a) * 1.18, y, z + Math.sin(a) * 1.18, 0, 0.9, belfryH / 1.05, 0.9), trimC());
  }
  B.trim.add(new THREE.CylinderGeometry(1.42, 1.34, 0.22, 20), trimC(), x, y + belfryH + 0.05, z);
  // 钟室内的暗部
  B.stone.add(new THREE.CylinderGeometry(1.06, 1.06, belfryH, 12), new THREE.Color(0x3a3a3c), x, y + belfryH / 2, z);
  B.windows.add(mkMat(x, y + belfryH * 0.58, z + 1.06, 0, 1.1, 1.0, 1), { lit: true, warm: 1.1 });
  y += belfryH + 0.28;
  dome(B, x, y, z, 1.32, 1.55, copperC());
  y += 2.1;

  // —— 飞扶壁 + 四角尖塔 ——
  const pinnacleH = 5.2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const px = x + Math.cos(a) * 2.95, pz = z + Math.sin(a) * 2.95;
    // 小塔身
    B.stone.add(new THREE.CylinderGeometry(0.46, 0.58, pinnacleH, 8), pickWall(B), px, PY + pinnacleH / 2 + 0.4, pz);
    for (let k = 0; k < 3; k++) {
      B.trim.add(new THREE.CylinderGeometry(0.58, 0.56, 0.13, 8), trimC(), px, PY + 1.4 + k * 1.5, pz);
    }
    B.metal.add(new THREE.ConeGeometry(0.5, 1.5, 8), copperC(), px, PY + pinnacleH + 1.15, pz);
    B.metal.add(new THREE.SphereGeometry(0.1, 8, 6), goldC(), px, PY + pinnacleH + 2.05, pz);
    // 飞扶壁：从二层墙拱到小塔
    const y0 = PY + t1h + 2.6;
    const p0 = mkPos(x + Math.cos(a) * 1.85, y0, z + Math.sin(a) * 1.85);
    const p1 = mkPos(x + Math.cos(a) * 2.35, y0 + 0.45, z + Math.sin(a) * 2.35);
    const p2 = mkPos(px, PY + 3.35, pz);
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    B.stone.addM(new THREE.TubeGeometry(curve, 8, 0.16, 6, false), pickWall(B), new THREE.Matrix4());
  }

  return { y: y + 1.0, topY: PY + pinnacleH + 2.1 };
}

/* ==========================================================================
   大殿（柱廊 + 露台 + 双穹顶）
   ========================================================================== */

function buildHall(B, cx, cz, ry = 0) {
  const PY = 0.22;
  const W = 5.0, D = 2.7, H = 3.4;
  const g = new THREE.Group();

  // 台基
  B.stone.add(new THREE.BoxGeometry(W + 1.0, 0.5, D + 1.4), pickWall(B).multiplyScalar(0.92), cx, PY + 0.25, cz, { ry });
  B.stone.add(new THREE.BoxGeometry(W + 0.6, 0.3, D + 1.0), pickWall(B), cx, PY + 0.62, cz, { ry });

  const rot = (lx, lz) => ({ x: cx + lx * Math.cos(ry) + lz * Math.sin(ry), z: cz - lx * Math.sin(ry) + lz * Math.cos(ry) });
  const y0 = PY + 0.78;

  // 主墙身
  B.stone.add(new THREE.BoxGeometry(W, H, D), pickWall(B), cx, y0 + H / 2, cz, { ry });
  // 转角壁柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = rot(sx * (W / 2 - 0.08), sz * (D / 2 - 0.08));
    B.trim.add(new THREE.BoxGeometry(0.3, H, 0.3), trimC(), p.x, y0 + H / 2, p.z, { ry });
  }
  // 檐口
  B.trim.add(new THREE.BoxGeometry(W + 0.35, 0.22, D + 0.35), trimC(), cx, y0 + H, cz, { ry });
  B.stone.add(new THREE.BoxGeometry(W + 0.5, 0.14, D + 0.5), pickWall(B).multiplyScalar(0.95), cx, y0 + H - 0.2, cz, { ry });

  // 二层拱窗（正面长边 + 两端）
  const fz = rot(0, D / 2 + 0.01);
  const yawF = ry; // 局部 +z 面
  for (let i = 0; i < 5; i++) {
    const lx = -W / 2 + (i + 0.5) * (W / 5);
    const p = rot(lx, D / 2 + 0.01);
    B.windows.add(mkMat(p.x, y0 + 1.5, p.z, yawF + 0, 0.62, 1.05 / 1.5, 1), { lit: i % 3 !== 1 });
  }
  const yawB = ry + Math.PI;
  for (let i = 0; i < 4; i++) {
    const lx = -W / 2 + (i + 0.5) * (W / 4);
    const p = rot(lx, -D / 2 - 0.01);
    B.windows.add(mkMat(p.x, y0 + 1.5, p.z, yawB, 0.55, 1.0 / 1.5, 1), { lit: i % 2 === 0 });
  }
  // 两端窄窗
  for (const sx of [-1, 1]) {
    const p = rot(sx * (W / 2 + 0.01), 0);
    const yaw = ry + (sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    B.windows.add(mkMat(p.x, y0 + 1.6, p.z, yaw, 0.6, 1.1 / 1.5, 1), { lit: true });
  }

  // 屋顶露台 + 双穹顶 + 栏杆
  const roofY = y0 + H + 0.11;
  B.stone.add(new THREE.BoxGeometry(W + 0.7, 0.16, D + 0.7), pickWall(B), cx, roofY, cz, { ry });
  const corners = [
    rot(-W / 2 + 0.5, D / 2 - 0.4), rot(W / 2 - 0.5, D / 2 - 0.4),
    rot(-W / 2 + 0.5, -D / 2 + 0.4), rot(W / 2 - 0.5, -D / 2 + 0.4),
  ];
  // 四角小穹顶亭
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    B.stone.add(new THREE.CylinderGeometry(0.42, 0.5, 1.15, 10), pickWall(B), c.x, roofY + 0.58, c.z);
    dome(B, c.x, roofY + 1.15, c.z, 0.55, 0.62, i < 2 ? copperC() : copperC());
  }
  // 中央屋脊 + 两个大穹顶庙亭
  for (const lx of [-W * 0.23, W * 0.23]) {
    const p = rot(lx, 0);
    B.stone.add(new THREE.CylinderGeometry(0.55, 0.64, 1.5, 10), pickWall(B), p.x, roofY + 0.75, p.z);
    dome(B, p.x, roofY + 1.5, p.z, 0.72, 0.8);
  }

  // 正面柱廊（局部 +z 面外 0.85）
  const portY = y0;
  const portZ = D / 2 + 0.95;
  const p0 = rot(-W / 2 + 0.2, portZ);
  const p1 = rot(W / 2 - 0.2, portZ);
  const bays = 4;
  for (let i = 0; i <= bays; i++) {
    const t = i / bays;
    const lx = lerp(-W / 2 + 0.2, W / 2 - 0.2, t);
    const p = rot(lx, portZ);
    B.columns.add(mkMat(p.x, portY, p.z, ry, 1.05, 1.55, 1.05), trimC());
  }
  for (let i = 0; i < bays; i++) {
    const t = (i + 0.5) / bays;
    const lx = lerp(-W / 2 + 0.2, W / 2 - 0.2, t);
    const p = rot(lx, portZ);
    B.arches.add(mkMat(p.x, portY + 1.62, p.z, ry, 0.92, 0.78, 1), trimC());
  }
  // 柱廊顶 = 一层露台
  B.stone.add(new THREE.BoxGeometry(W + 0.2, 0.2, 1.9), pickWall(B), rot(0, D / 2 + 0.9).x, portY + 2.55, rot(0, D / 2 + 0.9).z, { ry });
  lineBalustrade(B,
    rot(-W / 2, D / 2 + 1.75).x, rot(-W / 2, D / 2 + 1.75).z,
    rot(W / 2, D / 2 + 1.75).x, rot(W / 2, D / 2 + 1.75).z,
    portY + 2.65, 0.62, 0.5);
  // 柱廊暗部（门洞）
  B.panes.push({ x: rot(0, D / 2 + 0.02).x, y: y0 + 0.82, z: rot(0, D / 2 + 0.02).z, w: W * 0.55, h: 1.65, ry });
  // 正面台阶
  stairs(B, rot(0, D / 2 + 2.1).x, rot(0, D / 2 + 2.1).z, W * 0.75, portY - 0.02, PY + 0.3, 4, ry);

  return { roofY };
}

/* ==========================================================================
   城门楼 + 双塔
   ========================================================================== */

function buildGate(B, cx, cz, ry = Math.PI / 2) {
  const PY = 0.22;
  // 城墙 + 门洞拱
  const W = 2.4; // 门洞宽
  B.stone.add(new THREE.BoxGeometry(4.6, 4.0, 1.5), pickWall(B), cx, PY + 2.0, cz, { ry });
  B.trim.add(new THREE.BoxGeometry(4.9, 0.24, 1.8), trimC(), cx, PY + 4.0, cz, { ry });
  // 拱门洞（暗）
  const doorDir = { x: Math.sin(ry), z: Math.cos(ry) };
  B.panes.push({ x: cx + doorDir.x * 0.78, y: PY + 1.25, z: cz + doorDir.z * 0.78, w: 2.3, h: 2.5, ry });
  // 拱券
  B.arches.add(mkMat(cx + doorDir.x * 0.8, PY + 1.35, cz + doorDir.z * 0.8, ry, 1.9, 1.5, 1), trimC());
  // 双塔
  for (const side of [-1, 1]) {
    const off = side * 2.05;
    const tx = cx + Math.cos(ry) * off;
    const tz = cz - Math.sin(ry) * off;
    const H = 6.4;
    B.stone.add(new THREE.CylinderGeometry(0.78, 0.9, H, 12), pickWall(B), tx, PY + H / 2, tz);
    B.trim.add(new THREE.CylinderGeometry(0.93, 0.86, 0.2, 12), trimC(), tx, PY + H, tz);
    ringWindows(B, tx, tz, 0.86, PY + 2.2, 4, 0.42, 0.8, 0.3, 0.7);
    ringWindows(B, tx, tz, 0.86, PY + 4.3, 4, 0.36, 0.7, 0.0, 0.4);
    ringBalustrade(B, tx, PY + H + 0.12, tz, 0.95, 12, 0.4);
    dome(B, tx, PY + H + 0.6, tz, 0.82, 1.0, copperC());
    // 塔顶旗杆
    B.metal.add(new THREE.CylinderGeometry(0.02, 0.03, 1.6, 5), goldC(), tx, PY + H + 2.9, tz);
  }
}

/* ==========================================================================
   钟楼礼拜堂（方形坎帕尼莱）
   ========================================================================== */

function buildChapel(B, cx, cz) {
  const PY = 0.22;
  const W = 1.9, H = 9.5;
  B.stone.add(new THREE.BoxGeometry(W + 0.7, 0.6, W + 0.7), pickWall(B).multiplyScalar(0.93), cx, PY + 0.3, cz);
  B.stone.add(new THREE.BoxGeometry(W, H, W), pickWall(B), cx, PY + 0.6 + H / 2, cz);
  // 转角壁柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.trim.add(new THREE.BoxGeometry(0.22, H, 0.22), trimC(), cx + sx * W / 2, PY + 0.6 + H / 2, cz + sz * W / 2);
  }
  // 按层开窗
  for (let k = 0; k < 3; k++) {
    const y = PY + 2.2 + k * 2.6;
    for (const sz of [-1, 1]) {
      B.windows.add(mkMat(cx, y, cz + sz * (W / 2 + 0.01), sz > 0 ? 0 : Math.PI, 0.46, 0.95 / 1.5, 1),
        { lit: k !== 1 });
    }
    for (const sx of [-1, 1]) {
      B.windows.add(mkMat(cx + sx * (W / 2 + 0.01), y, cz, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0.46, 0.95 / 1.5, 1),
        { lit: false });
    }
    B.trim.add(new THREE.BoxGeometry(W + 0.25, 0.14, W + 0.25), trimC(), cx, y + 1.25, cz);
  }
  // 顶部敞廊 + 尖顶
  const topY = PY + 0.6 + H;
  B.trim.add(new THREE.BoxGeometry(W + 0.5, 0.22, W + 0.5), trimC(), cx, topY, cz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    B.columns.add(mkMat(cx + Math.cos(a) * 1.0, topY + 0.1, cz + Math.sin(a) * 1.0, 0, 0.85, 0.95, 0.85), trimC());
  }
  B.trim.add(new THREE.BoxGeometry(W + 0.4, 0.2, W + 0.4), trimC(), cx, topY + 1.2, cz);
  spire(B, cx, topY + 1.3, cz, 1.05, 3.2, copperC());
}

/* ==========================================================================
   露台花园 + 观景亭
   ========================================================================== */

/** 南缘观景台（小穹顶亭 + 栏杆 + 台阶） */
function buildBelvedere(B, cx, cz) {
  const topY = topHeight(cx, cz);
  const PY = 0.1;
  // 台基
  B.stone.add(new THREE.BoxGeometry(3.4, 0.7, 2.8), pickWall(B).multiplyScalar(0.96), cx, topY - 0.15, cz);
  B.trim.add(new THREE.BoxGeometry(3.55, 0.14, 2.95), trimC(), cx, topY + 0.2, cz);
  // 三面栏杆
  lineBalustrade(B, cx - 1.7, cz + 1.42, cx + 1.7, cz + 1.42, topY + 0.22, 0.55, 0.5);
  lineBalustrade(B, cx - 1.7, cz + 1.42, cx - 1.7, cz - 1.42, topY + 0.22, 0.55, 0.5);
  lineBalustrade(B, cx + 1.7, cz + 1.42, cx + 1.7, cz - 1.42, topY + 0.22, 0.55, 0.5);
  // 亭子
  const y0 = topY + 0.24;
  B.stone.add(new THREE.CylinderGeometry(0.95, 1.05, 0.35, 8), pickWall(B), cx, y0 + 0.17, cz);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    B.columns.add(mkMat(cx + Math.cos(a) * 0.8, y0 + 0.34, cz + Math.sin(a) * 0.8, 0, 0.85, 1.45, 0.85), trimC());
  }
  B.trim.add(new THREE.CylinderGeometry(1.0, 0.94, 0.16, 8), trimC(), cx, y0 + 1.82, cz);
  dome(B, cx, y0 + 1.9, cz, 0.95, 0.95);
  // 台阶（从北侧接草地）
  stairs(B, cx, cz - 2.0, 1.2, topY + 0.2, topY + 0.75, 3, 0);
}

/* ==========================================================================
   房屋群 / 遗迹
   ========================================================================== */

function gableRoof(B, x, y, z, w, d, h, ry, color) {
  // 三棱柱屋顶：脊线沿 z，随房屋旋转
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0);
  tri.lineTo(w / 2, 0);
  tri.lineTo(0, h);
  tri.closePath();
  const geo = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  B.roof.addM(geo, new THREE.Color(color).offsetHSL(0, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.06),
    mkMat(x, y, z, ry));
}

/** 台地边的小屋群（世界坐标，避开主塔 / 大殿 / 教堂） */
function buildHouses(B) {
  const PY = 0.22;
  const houses = [
    [-4.9, -6.3, 1.5, 1.3, 1.5, 0.35], [0.7, -8.2, 1.7, 1.4, 1.6, -0.2],
    [5.0, -7.5, 1.4, 1.2, 1.4, 0.5], [7.9, -4.5, 1.3, 1.3, 1.3, -0.35],
    [-6.5, -3.4, 1.3, 1.2, 1.25, 0.15], [7.9, -0.3, 1.2, 1.1, 1.2, 0.1],
  ];
  for (const [x, z, w, d, h, ry] of houses) {
    const gy = topHeight(x, z) + 0.02;
    // 基础（顺坡埋进草里，避免悬空）
    B.stone.add(new THREE.BoxGeometry(w * 0.96, 0.9, d * 0.96), pickWall(B).multiplyScalar(0.85), x, gy - 0.35, z, { ry });
    B.stone.add(new THREE.BoxGeometry(w, h, d), pickWall(B), x, gy + h / 2, z, { ry });
    B.trim.add(new THREE.BoxGeometry(w + 0.16, 0.12, d + 0.16), trimC(), x, gy + h, z, { ry });
    // 门 / 窗
    B.windows.add(mkMat(x + Math.sin(ry) * (d / 2 + 0.01), gy + 0.5, z + Math.cos(ry) * (d / 2 + 0.01), ry,
      0.42, 0.62 / 1.5, 1), { lit: Math.random() < 0.8 });
    gableRoof(B, x, gy + h + 0.04, z, w, d, 0.8, ry, ROOF_TILE);
    B.stone.add(new THREE.BoxGeometry(0.22, 0.72, 0.22), pickWall(B).multiplyScalar(0.9),
      x + w * 0.28 * Math.cos(ry), gy + h + 0.7, z - w * 0.28 * Math.sin(ry), { ry });
    B.orbs.push({ x: x + w * 0.28 * Math.cos(ry), y: gy + h + 1.05, z: z - w * 0.28 * Math.sin(ry), s: 0.04 });
  }
}

function buildRuins(B, cx, cz, ry) {
  const PY = 0.22;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lx = (t - 0.5) * 4.2;
    const x = cx + lx * Math.cos(ry);
    const z = cz - lx * Math.sin(ry);
    const gy = topHeight(x, z);
    const h = i === 2 ? 0.7 : 1.6 + Math.random() * 1.9;
    B.stone.add(new THREE.CylinderGeometry(0.26, 0.3, h, 8), pickWall(B).multiplyScalar(0.9), x, gy + h / 2, z);
    if (i % 2 === 0) {
      B.trim.add(new THREE.BoxGeometry(0.62, 0.14, 0.62), trimC(), x, gy + h, z);
      if (i === 0 || i === 4) {
        const yaw = Math.atan2(Math.cos(ry), -Math.sin(ry)) + Math.PI / 2;
        B.arches.add(mkMat(x, gy + h + 0.14, z, yaw, 0.82, 0.85, 1), pickWall(B).multiplyScalar(0.92));
      }
    }
  }
  // 倒塌的柱段
  for (let i = 0; i < 4; i++) {
    const rx = cx + (Math.random() - 0.5) * 4.4;
    const rz = cz + (Math.random() - 0.5) * 1.6;
    B.stone.add(new THREE.CylinderGeometry(0.26, 0.26, 1.2, 8), pickWall(B).multiplyScalar(0.88),
      rx, topHeight(rx, rz) + 0.24, rz, { rz: Math.PI / 2, ry: Math.random() * TAU });
  }
}

/* ==========================================================================
   灶台 / 灯柱 / 小物件
   ========================================================================== */

function lamp(B, x, y, z) {
  B.trim.add(new THREE.CylinderGeometry(0.07, 0.11, 1.7, 6), trimC(), x, y + 0.85, z);
  B.trim.add(new THREE.BoxGeometry(0.34, 0.08, 0.34), trimC(), x, y + 1.72, z);
  B.orbs.push({ x, y: y + 1.9, z, s: 0.15 });
}

/* ==========================================================================
   总装配：王城
   ========================================================================== */

export function buildCitadel(rand) {
  const B = createBuilder(rand);
  const group = new THREE.Group();

  // 主塔
  const keep = buildKeep(B, 3.5, -2.6);
  // 大殿（正面朝 +z，略偏转）
  buildHall(B, -1.1, 0.6, -0.10);
  // 城门 + 双塔（朝东，接长桥）
  buildGate(B, 5.6, 1.5, Math.PI / 2);
  // 西南角钟楼
  buildChapel(B, -2.9, -4.2);
  // 南缘观景台
  buildBelvedere(B, 4.4, 5.4);
  // 台地边缘的房屋（补足体量）
  buildHouses(B);
  // 北缘遗迹
  buildRuins(B, 0.2, -6.0, 0.1);
  // 城墙（西 / 北 / 东三段；南面留给水景花园）
  crenelWall(B, -5.9, -5.8, -5.1, 2.2, -0.35, 1.25);
  crenelWall(B, -5.0, -6.6, 5.2, -7.4, -0.3, 1.15);
  crenelWall(B, 7.6, -6.4, 8.2, -1.0, -0.4, 1.2);
  crenelWall(B, 8.0, 1.6, 7.6, 4.6, -0.4, 1.2);
  // 城墙上的灯
  for (const [lx, lz] of [[-5.6, 2.6], [7.8, -2.4], [-5.4, -6.2], [4.8, -7.2]]) {
    lamp(B, lx, topHeight(lx, lz) + 0.02, lz);
  }

  /* ---- 落地 ---- */
  const stoneMat = addSurfaceNoise(stdMat(0xffffff, { roughness: 0.93, vertexColors: true, envMapIntensity: 0.5 }), { scale: 1.1, amp: 0.2, gradY0: -0.4, gradY1: 6 });
  const trimMat = addSurfaceNoise(stdMat(0xffffff, { roughness: 0.8, vertexColors: true, envMapIntensity: 0.62 }), { scale: 1.7, amp: 0.1, gradY0: -0.4, gradY1: 5 });
  const metalMat = stdMat(0xffffff, { roughness: 0.33, metalness: 0.8, vertexColors: true, envMapIntensity: 1.3, side: THREE.DoubleSide });
  const roofMat = stdMat(0xffffff, { roughness: 0.82, vertexColors: true, envMapIntensity: 0.5, side: THREE.DoubleSide });
  const darkMat = stdMat(0xffffff, { roughness: 1, vertexColors: true, envMapIntensity: 0.2 });

  const stoneMesh = B.stone.build(stoneMat);
  if (stoneMesh) {
    weatherGeometry(stoneMesh.geometry, { amp: 0.1, aoLo: 0.72, aoHi: 1.0, y0: -0.4, y1: 2.2, moss: 0.55 });
    group.add(stoneMesh);
  }
  const trimMesh = B.trim.build(trimMat);
  if (trimMesh) {
    weatherGeometry(trimMesh.geometry, { amp: 0.06, aoLo: 0.86, aoHi: 1.0, y0: 0.0, y1: 2.6 });
    group.add(trimMesh);
  }
  const metalMesh = B.metal.build(metalMat);
  if (metalMesh) group.add(metalMesh);
  const roofMesh = B.roof.build(roofMat);
  if (roofMesh) group.add(roofMesh);

  B.windows.build(group);

  // 柱廊
  const colMat = stdMat(0xffffff, { roughness: 0.85, vertexColors: false, envMapIntensity: 0.6 });
  const cols = B.columns.build(colMat);
  if (cols) group.add(cols);
  const archMat = stdMat(0xffffff, { roughness: 0.82, vertexColors: false, envMapIntensity: 0.62 });
  const arches = B.arches.build(archMat);
  if (arches) group.add(arches);
  const balMat = stdMat(0xffffff, { roughness: 0.84, vertexColors: false, envMapIntensity: 0.55 });
  const bals = B.balusters.build(balMat);
  if (bals) group.add(bals);

  // 门洞 / 柱廊暗面
  if (B.panes.length) {
    const paneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x241f19) });
    const kit = new GeoKit();
    for (const p of B.panes) {
      kit.addM(GEO.plane, 0xffffff, mkMat(p.x, p.y, p.z, p.ry || 0, p.w, p.h, 1));
    }
    const mesh = kit.build(paneMat, { castShadow: false, receiveShadow: false });
    if (mesh) group.add(mesh);
  }

  // 灯球（暖光 HDR）
  if (B.orbs.length) {
    const orbGeo = new THREE.SphereGeometry(1, 8, 6);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const im = new THREE.InstancedMesh(orbGeo, orbMat, B.orbs.length);
    const c = new THREE.Color().setRGB(2.4, 1.35, 0.5);
    B.orbs.forEach((o, i) => {
      im.setMatrixAt(i, mkMat(o.x, o.y, o.z, 0, o.s, o.s, o.s));
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }

  return { group, keepTop: keep.topY };
}

/* ==========================================================================
   长桥（多拱高架 + 栏杆 + 门口）
   ========================================================================== */

export function buildCausewayBridge(rand, A, Bpos) {
  // A: 起点（岛缘）, Bpos: 终点（卫星岛）
  const group = new THREE.Group();
  const stone = new GeoKit();
  const trim = new GeoKit();
  const balusters = new InstanceKit(GEO.baluster);
  const orbs = [];

  const dx = Bpos.x - A.x, dz = Bpos.z - A.z;
  const L = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const mid = new THREE.Vector3((A.x + Bpos.x) / 2, (A.y + Bpos.y) / 2, (A.z + Bpos.z) / 2);
  const arch = 0.75; // 桥面中拱

  // 桥面（微拱）
  const segs = 16;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const x = A.x + dx * t, z = A.z + dz * t;
    const y = lerp(A.y, Bpos.y, t) + Math.sin(t * Math.PI) * arch;
    stone.add(new THREE.BoxGeometry(2.1, 0.34, L / segs + 0.12), new THREE.Color(WALLS[i % WALLS.length]),
      x, y, z, { ry: yaw });
  }

  // 侧面拱墙：Shape 立面 + 掏 3 个拱洞
  const wallH = 3.4;
  const sh = new THREE.Shape();
  sh.moveTo(-L / 2 - 0.3, -wallH);
  sh.lineTo(L / 2 + 0.3, -wallH);
  sh.lineTo(L / 2 + 0.3, 0);
  sh.lineTo(-L / 2 - 0.3, 0);
  sh.closePath();
  const nArch = 3;
  const spring = -1.55;          // 拱脚高度
  const archR = 1.12;
  for (let i = 0; i < nArch; i++) {
    const hole = new THREE.Path();
    const ax = -L / 2 + (i + 0.5) * (L / nArch);
    hole.moveTo(ax - archR, -wallH + 0.35);
    hole.lineTo(ax - archR, spring);
    hole.absarc(ax, spring, archR, Math.PI, 0, true);
    hole.lineTo(ax + archR, -wallH + 0.35);
    hole.closePath();
    sh.holes.push(hole);
  }
  const wallGeo = new THREE.ExtrudeGeometry(sh, { depth: 1.9, bevelEnabled: false, curveSegments: 14 });
  wallGeo.translate(0, 0, -0.95);
  const wallMat4 = new THREE.Matrix4().compose(
    new THREE.Vector3(mid.x, mid.y + arch + 0.2, mid.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-dz, dx), 0)),
    new THREE.Vector3(1, 1, 1)
  );
  stone.addM(wallGeo, new THREE.Color(WALLS[1]), wallMat4);
  // 拱券外圈线脚（南北两面）
  const arcGeo = new THREE.TorusGeometry(archR + 0.09, 0.075, 5, 20, Math.PI);
  for (let i = 0; i < nArch; i++) {
    const ax = -L / 2 + (i + 0.5) * (L / nArch);
    for (const zOff of [-0.98, 0.98]) {
      const local = new THREE.Matrix4().makeTranslation(ax, spring, zOff);
      stone.addM(arcGeo, trimC(), wallMat4.clone().multiply(local));
    }
  }

  // 桥墩：每个拱脚向下伸进云里
  for (let i = 0; i <= nArch; i++) {
    const t = i / nArch;
    const ax = A.x + dx * t, az = A.z + dz * t;
    const yTop = lerp(A.y, Bpos.y, t) + Math.sin(t * Math.PI) * arch - 0.35;
    const h = yTop + 12.5;
    stone.add(new THREE.CylinderGeometry(0.5, 0.72, h, 9), new THREE.Color(WALLS[2]).multiplyScalar(0.78),
      ax, yTop - h / 2, az);
    trim.add(new THREE.CylinderGeometry(0.62, 0.56, 0.2, 9), trimC(), ax, yTop - 0.12, az);
  }

  // 栏杆
  const railN = Math.round(L / 0.5);
  for (let i = 0; i <= railN; i++) {
    const t = i / railN;
    const x = A.x + dx * t, z = A.z + dz * t;
    const y = lerp(A.y, Bpos.y, t) + Math.sin(t * Math.PI) * arch + 0.24;
    const nx = -Math.cos(yaw), nz = Math.sin(yaw);
    for (const s of [-1, 1]) {
      balusters.add(mkMat(x + nx * s * 1.0, y, z + nz * s * 1.0, 0, 1, 1.0, 1), trimC());
    }
  }
  // 栏杆扶手
  for (const s of [-1, 1]) {
    const nx = -Math.cos(yaw), nz = Math.sin(yaw);
    for (let i = 0; i < 8; i++) {
      const t0 = i / 8, t1 = (i + 1) / 8;
      const x0 = A.x + dx * t0 + nx * s, z0 = A.z + dz * t0 + nz * s;
      const x1 = A.x + dx * t1 + nx * s, z1 = A.z + dz * t1 + nz * s;
      const y0 = lerp(A.y, Bpos.y, t0) + Math.sin(t0 * Math.PI) * arch + 0.72;
      const y1 = lerp(A.y, Bpos.y, t1) + Math.sin(t1 * Math.PI) * arch + 0.72;
      const segLen = Math.hypot(x1 - x0, z1 - z0);
      trim.add(new THREE.BoxGeometry(0.09, 0.09, segLen + 0.03), trimC(),
        (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
        { ry: Math.atan2(x1 - x0, z1 - z0), rx: -Math.atan2(y1 - y0, segLen) });
    }
  }

  // 桥下云雾（把长桥墩藏进云里）
  {
    const mist = new BillboardField(puffTexture(128, 0.5), {
      fogColor: new THREE.Color(0xe9c8a4), fogDensity: 0.003, opacity: 1,
    });
    for (let i = 0; i < 34; i++) {
      const t = rand();
      const x = A.x + dx * t + (rand() - 0.5) * 4;
      const z = A.z + dz * t + (rand() - 0.5) * 4;
      const y = -4.5 - rand() * 7;
      mist.add({
        x, y, z,
        sx: 6 + rand() * 10, sy: 3 + rand() * 4.4,
        rot: (rand() - 0.5) * 0.5,
        color: new THREE.Color(0xf6e3cd).lerp(new THREE.Color(0xd9c6b6), rand() * 0.5),
        opacity: 0.22 + rand() * 0.3,
        phase: rand(),
      });
    }
    const mm = mist.build({ sway: 0.3 });
    mm.renderOrder = 3;
    group.add(mm);
    group.userData.mistField = mist;
  }

  // 桥头灯
  for (const t of [0.03, 0.5, 0.97]) {
    const x = A.x + dx * t, z = A.z + dz * t;
    const y = lerp(A.y, Bpos.y, t) + Math.sin(t * Math.PI) * arch + 0.2;
    for (const s of [-1, 1]) {
      const nx = -Math.cos(yaw), nz = Math.sin(yaw);
      trim.add(new THREE.CylinderGeometry(0.08, 0.12, 1.5, 6), trimC(), x + nx * s * 1.05, y + 0.75, z + nz * s * 1.05);
      orbs.push({ x: x + nx * s * 1.05, y: y + 1.62, z: z + nz * s * 1.05, s: 0.14 });
    }
  }

  const mat = addSurfaceNoise(stdMat(0xffffff, { roughness: 0.92, vertexColors: true, envMapIntensity: 0.5 }), { scale: 1.0, amp: 0.2 });
  const trimMat = addSurfaceNoise(stdMat(0xffffff, { roughness: 0.84, vertexColors: true, envMapIntensity: 0.6 }), { scale: 1.6, amp: 0.1 });
  const sm = stone.build(mat); if (sm) group.add(sm);
  const tm = trim.build(trimMat); if (tm) group.add(tm);
  const bm = balusters.build(stdMat(0xffffff, { roughness: 0.84, vertexColors: false, envMapIntensity: 0.55 })); if (bm) group.add(bm);

  if (orbs.length) {
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), orbs.length);
    const c = new THREE.Color().setRGB(2.2, 1.3, 0.55);
    orbs.forEach((o, i) => {
      im.setMatrixAt(i, mkMat(o.x, o.y, o.z, 0, o.s, o.s, o.s));
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }

  return { group, deckMid: mid.clone().setY(mid.y + arch) };
}
