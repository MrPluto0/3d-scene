// src/scenes/skycity/kit.js — 天空之城重制版：程序化建模工具箱
// 确定性随机 / 噪声、Canvas 纹理、顶点色几何合并、实例化、广告牌粒子场。
// 所有纹理、几何都由代码生成，不依赖任何外部资源。
import * as THREE from 'three';

/* ==========================================================================
   1. 确定性随机 / 噪声
   ========================================================================== */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const TAU = Math.PI * 2;

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 2D 值噪声（无梯度，便宜，够用） */
export function valueNoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm2(x, y, oct = 4, lac = 2.03, gain = 0.5) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * (valueNoise2(x * f, y * f) * 2 - 1);
    f *= lac; amp *= gain;
  }
  return s;
}

/* ==========================================================================
   2. Canvas 纹理
   ========================================================================== */

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = opts.wrapS || THREE.ClampToEdgeWrapping;
  t.wrapT = opts.wrapT || THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = opts.anisotropy || 4;
  t.needsUpdate = true;
  return t;
}

/** 柔圆光斑（云 / 雾 / 光晕通用底图） */
export function puffTexture(size = 128, sharp = 0.42) {
  return canvasTexture(size, size, (g, S) => {
    const rg = g.createRadialGradient(S / 2, S / 2, S * 0.02, S / 2, S / 2, S * 0.5);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(sharp, 'rgba(255,255,255,0.72)');
    rg.addColorStop(0.8, 'rgba(255,255,255,0.18)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
  });
}

/** 积云纹理：顶部受光偏暖、底部偏冷，边缘带团块噪声 */
export function cloudTexture(size = 256) {
  return canvasTexture(size, size, (g, S) => {
    const rnd = mulberry32(0x5eaf10);
    g.clearRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 34; i++) {
      const a = rnd() * TAU;
      const r = Math.pow(rnd(), 0.62) * S * 0.24;
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r * 0.72;
      const rad = S * (0.10 + rnd() * 0.20);
      const grd = g.createRadialGradient(x, y, rad * 0.06, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.88)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.42)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    // 圆形遮罩，保证缩放时不出现硬边
    g.globalCompositeOperation = 'destination-in';
    const rg = g.createRadialGradient(S / 2, S / 2, S * 0.04, S / 2, S / 2, S * 0.5);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.7, 'rgba(255,255,255,0.85)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    // 体积感：上亮下冷
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(0, 0, 0, S);
    lg.addColorStop(0.00, '#fff8ec');
    lg.addColorStop(0.42, '#fdf3e4');
    lg.addColorStop(0.72, '#d9dfea');
    lg.addColorStop(1.00, '#aebcd2');
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    // 细碎丝缕
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 520; i++) {
      const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 3.5;
      g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.05})`;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }, { anisotropy: 8 });
}

/** 高空卷云：横向拉长的丝缕 */
export function wispTexture(size = 256) {
  return canvasTexture(size, size, (g, S) => {
    const rnd = mulberry32(0x9a71);
    g.clearRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const y = S * (0.3 + rnd() * 0.4);
      const x = S * (0.1 + rnd() * 0.8);
      const len = S * (0.15 + rnd() * 0.3);
      const th = S * (0.01 + rnd() * 0.03);
      const grd = g.createRadialGradient(x, y, 0, x, y, len);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.save();
      g.translate(x, y); g.scale(1, th / len);
      g.fillStyle = grd;
      g.beginPath(); g.arc(0, 0, len, 0, TAU); g.fill();
      g.restore();
    }
  });
}

/** 树冠 / 灌木叶簇（白色，实例色染色） */
export function leafTexture(size = 128) {
  return canvasTexture(size, size, (g, S) => {
    const rnd = mulberry32(0x1eaf);
    g.clearRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 64; i++) {
      const x = S * 0.5 + (rnd() - 0.5) * S * 0.78;
      const y = S * 0.5 + (rnd() - 0.5) * S * 0.78;
      const r = 3.2 + rnd() * 7.5;
      g.save();
      g.translate(x, y); g.rotate(rnd() * TAU);
      const grd = g.createRadialGradient(0, 0, 1, 0, 0, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.68)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(0, 0, r, r * 0.58, 0, 0, TAU); g.fill();
      g.restore();
    }
  });
}

/** 草簇（几片细长草叶） */
export function grassTexture(size = 128) {
  return canvasTexture(size, size, (g, S) => {
    const rnd = mulberry32(0x77a1);
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 9; i++) {
      const bx = S * (0.24 + rnd() * 0.52);
      const tipX = bx + (rnd() - 0.5) * S * 0.34;
      const h = S * (0.42 + rnd() * 0.5);
      const w = S * (0.022 + rnd() * 0.02);
      g.beginPath();
      g.moveTo(bx - w, S);
      g.quadraticCurveTo(bx - w * 0.4, S - h * 0.55, tipX, S - h);
      g.quadraticCurveTo(bx + w * 0.5, S - h * 0.5, bx + w, S);
      g.closePath();
      const grd = g.createLinearGradient(0, S, 0, S - h);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0.25)');
      g.fillStyle = grd;
      g.fill();
    }
  });
}

/** 小花簇 */
export function flowerTexture(size = 64) {
  return canvasTexture(size, size, (g, S) => {
    const rnd = mulberry32(0x3311);
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 7; i++) {
      const x = S * (0.3 + rnd() * 0.4), y = S * (0.3 + rnd() * 0.4);
      const r = 2.5 + rnd() * 4;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.beginPath();
        g.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(255,240,200,1)';
      g.beginPath(); g.arc(x, y, r * 0.4, 0, TAU); g.fill();
    }
  });
}

/** 瀑布水帘：竖向拉伸的白丝，纵向可循环 */
export function streakTexture(w = 64, h = 256) {
  return canvasTexture(w, h, (g, W, H) => {
    const rnd = mulberry32(0xfa11);
    g.clearRect(0, 0, W, H);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, 'rgba(255,255,255,0)');
    base.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    base.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    base.addColorStop(0.82, 'rgba(255,255,255,0.55)');
    base.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W;
      const ww = 1 + rnd() * 6;
      const y0 = -H * rnd();
      const len = H * (0.25 + rnd() * 0.8);
      const grd = g.createLinearGradient(0, y0, 0, y0 + len);
      const a = 0.25 + rnd() * 0.6;
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.35, `rgba(255,255,255,${a})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x, y0, ww, len);
      // 纵向循环：补一段在上方
      g.fillRect(x, y0 + H, ww, len);
    }
  }, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 4 });
}

/** 水面波纹（灰度图，供水面 shader 采样做扰动） */
export function waterNoiseTexture(size = 256) {
  return canvasTexture(size, size, (g, S) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const v = (fbm2(x / S * 6, y / S * 6, 4) * 0.5 + 0.5) * 255;
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, { linear: true, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
}

/** 远景薄雾带（横向极软） */
export function hazeTexture(size = 256) {
  return canvasTexture(size, size, (g, S) => {
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
    rg.addColorStop(0, 'rgba(255,255,255,0.5)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.16)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
  });
}

/* ==========================================================================
   3. 几何工具
   ========================================================================== */

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** 给几何体写入统一顶点色（Color 已在线性工作空间） */
export function colorize(geo, color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function composeMatrix(x = 0, y = 0, z = 0, o = {}) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  const sx = o.sx !== undefined ? o.sx : (o.s !== undefined ? o.s : 1);
  const sy = o.sy !== undefined ? o.sy : (o.s !== undefined ? o.s : sx);
  const sz = o.sz !== undefined ? o.sz : (o.s !== undefined ? o.s : sx);
  _v.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

/** 合并零件集合 → 单 Mesh。每个零件必须带 color 属性 */
export class GeoKit {
  constructor() { this.parts = []; }

  /** 以 XYZ + 缩放/旋转放置一个几何体并染色 */
  add(geo, color, x = 0, y = 0, z = 0, o = {}) {
    const g = geo.clone();
    g.applyMatrix4(composeMatrix(x, y, z, o));
    colorize(g, color);
    this.parts.push(g);
    return this;
  }

  /** 直接用矩阵放置 */
  addM(geo, color, matrix) {
    const g = geo.clone();
    g.applyMatrix4(matrix);
    colorize(g, color);
    this.parts.push(g);
    return this;
  }

  /** 已带顶点色的几何（可再乘一个颜色） */
  addRaw(geo, tint) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (tint) {
      const c = tint instanceof THREE.Color ? tint : new THREE.Color(tint);
      const col = g.attributes.color;
      if (col) {
        for (let i = 0; i < col.count; i++) {
          col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
        }
      }
    }
    this.parts.push(g);
    return this;
  }

  get count() { return this.parts.length; }

  /** 只合并成几何体（用于 InstancedMesh 的基几何） */
  toGeometry() {
    if (!this.parts.length) return null;
    return mergeSafe(this.parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  }

  build(material, { castShadow = true, receiveShadow = true } = {}) {
    if (!this.parts.length) return null;
    const geos = this.parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeSafe(geos);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

/** mergeGeometries 的安全版：丢掉不在所有几何中都存在的属性 */
function mergeSafe(geos) {
  if (geos.length === 1) return geos[0];
  let names = Object.keys(geos[0].attributes);
  for (const g of geos) names = names.filter((n) => g.attributes[n]);
  // 只保留 position / normal / uv / color
  names = names.filter((n) => ['position', 'normal', 'uv', 'color'].includes(n));
  const list = geos.map((g) => {
    const ng = new THREE.BufferGeometry();
    for (const n of names) ng.setAttribute(n, g.attributes[n]);
    return ng;
  });
  // 手动合并，避免依赖 BufferGeometryUtils
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const itemSize = list[0].attributes[n].itemSize;
    const arr = new Float32Array(total * itemSize);
    let off = 0;
    for (const g of list) {
      const a = g.attributes[n];
      arr.set(a.array.subarray(0, a.count * itemSize), off);
      off += a.count * itemSize;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, itemSize));
  }
  return out;
}

/** InstancedMesh 收集器 */
export class InstanceKit {
  constructor(geo) {
    this.geo = geo;
    this.items = [];
  }
  add(matrix, color) {
    this.items.push({ m: matrix, c: color });
    return this;
  }
  build(material, { castShadow = true, receiveShadow = true, tint = null } = {}) {
    if (!this.items.length) return null;
    const im = new THREE.InstancedMesh(this.geo, material, this.items.length);
    for (let i = 0; i < this.items.length; i++) {
      im.setMatrixAt(i, this.items[i].m);
      if (this.items[i].c) im.setColorAt(i, this.items[i].c);
      else if (tint) im.setColorAt(i, tint);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = castShadow;
    im.receiveShadow = receiveShadow;
    im.frustumCulled = false;
    return im;
  }
}

/* ==========================================================================
   4. 广告牌粒子场：一次 draw call 渲染成百上千个面向相机的贴图四边形
   ========================================================================== */

const BILLBOARD_VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec2 iScale;
  attribute float iRot;
  attribute vec3 iColor;
  attribute float iOpacity;
  attribute float iPhase;
  uniform float uTime;
  uniform float uSway;
  uniform float uFlutter;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vDepth;
  void main() {
    vec3 center = iPos;
    float ph = iPhase * 6.2831853;
    center.x += sin(uTime * 0.55 + ph) * uSway;
    center.z += cos(uTime * 0.47 + ph * 1.3) * uSway * 0.7;
    center.y += sin(uTime * 0.7 + ph * 0.8) * uSway * 0.35;
    vec4 mv = modelViewMatrix * vec4(center, 1.0);
    float rot = iRot + sin(uTime * 1.6 + ph) * uFlutter;
    float c = cos(rot), s = sin(rot);
    vec2 p = position.xy;
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    mv.xy += p * iScale;
    vUv = uv;
    vColor = iColor;
    vOpacity = iOpacity;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BILLBOARD_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vDepth;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float a = tex.a * vOpacity * uOpacity;
    if (a < 0.004) discard;
    vec3 col = tex.rgb * vColor;
    float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    col = mix(col, uFogColor, clamp(f, 0.0, 0.94));
    gl_FragColor = vec4(col, a);
  }
`;

export class BillboardField {
  /**
   * @param {THREE.Texture} map
   * @param {object} o { blending, fogColor, fogDensity, opacity, depthWrite, renderOrder }
   */
  constructor(map, o = {}) {
    this.map = map;
    this.items = [];
    this.opts = {
      blending: o.blending !== undefined ? o.blending : THREE.NormalBlending,
      fogColor: o.fogColor || new THREE.Color(0xe9c9a6),
      fogDensity: o.fogDensity !== undefined ? o.fogDensity : 0.0042,
      opacity: o.opacity !== undefined ? o.opacity : 1,
      depthWrite: o.depthWrite !== undefined ? o.depthWrite : false,
      renderOrder: o.renderOrder || 0,
      sway: 0,
      flutter: 0,
    };
    this.dirty = true;
    this.mesh = null;
  }

  /** @param {object} it {x,y,z,sx,sy,rot,color,opacity,phase} */
  add(it) {
    this.items.push({
      x: it.x || 0, y: it.y || 0, z: it.z || 0,
      sx: it.sx !== undefined ? it.sx : 1,
      sy: it.sy !== undefined ? it.sy : (it.sx !== undefined ? it.sx : 1),
      rot: it.rot || 0,
      color: it.color || null,
      opacity: it.opacity !== undefined ? it.opacity : 1,
      phase: it.phase !== undefined ? it.phase : Math.random(),
    });
    this.dirty = true;
    return this;
  }

  get count() { return this.items.length; }

  build({ sway = 0, flutter = 0 } = {}) {
    const n = this.items.length;
    if (!n) return null;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);

    const pos = new Float32Array(n * 3);
    const scale = new Float32Array(n * 2);
    const rot = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const opa = new Float32Array(n);
    const phase = new Float32Array(n);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      pos[i * 3] = it.x; pos[i * 3 + 1] = it.y; pos[i * 3 + 2] = it.z;
      scale[i * 2] = it.sx; scale[i * 2 + 1] = it.sy;
      rot[i] = it.rot;
      const c = it.color || white;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      opa[i] = it.opacity;
      phase[i] = it.phase;
    }
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(scale, 2));
    geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(rot, 1));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(col, 3));
    geo.setAttribute('iOpacity', new THREE.InstancedBufferAttribute(opa, 1));
    geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.instanceCount = n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.map },
        uFogColor: { value: this.opts.fogColor },
        uFogDensity: { value: this.opts.fogDensity },
        uOpacity: { value: this.opts.opacity },
        uTime: { value: 0 },
        uSway: { value: sway },
        uFlutter: { value: flutter },
      },
      vertexShader: BILLBOARD_VERT,
      fragmentShader: BILLBOARD_FRAG,
      transparent: true,
      depthWrite: this.opts.depthWrite,
      depthTest: true,
      blending: this.opts.blending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = this.opts.renderOrder;
    this.mesh = mesh;
    this.dirty = false;
    return mesh;
  }

  /** 每帧更新（时间用于摇摆 / 飘动） */
  update(t) {
    if (this.mesh) this.mesh.material.uniforms.uTime.value = t;
  }
}

/* ==========================================================================
   5. 材质工厂
   ========================================================================== */

export function stdMat(color = 0xffffff, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness !== undefined ? o.roughness : 0.94,
    metalness: o.metalness !== undefined ? o.metalness : 0,
    flatShading: !!o.flatShading,
    vertexColors: o.vertexColors !== undefined ? o.vertexColors : true,
    envMapIntensity: o.envMapIntensity !== undefined ? o.envMapIntensity : 0.35,
    emissive: o.emissive || 0x000000,
    emissiveIntensity: o.emissiveIntensity !== undefined ? o.emissiveIntensity : 1,
    side: o.side || THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity !== undefined ? o.opacity : 1,
    depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
    fog: o.fog !== undefined ? o.fog : true,
  });
}

export function glowMat(color, o = {}) {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: o.transparent !== undefined ? o.transparent : false,
    opacity: o.opacity !== undefined ? o.opacity : 1,
    side: o.side || THREE.FrontSide,
    depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
    vertexColors: !!o.vertexColors,
    toneMapped: false,
    fog: o.fog !== undefined ? o.fog : true,
    blending: o.blending || THREE.NormalBlending,
  });
  return m;
}

/** 石材风化：按面位置做明度斑驳、底部 AO、贴地苔痕 */
export function weatherGeometry(geo, o = {}) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  if (!pos || !col) return geo;
  const amp = o.amp !== undefined ? o.amp : 0.085;
  const aoLo = o.aoLo !== undefined ? o.aoLo : 0.8;
  const aoHi = o.aoHi !== undefined ? o.aoHi : 1.0;
  const y0 = o.y0 !== undefined ? o.y0 : -0.6;
  const y1 = o.y1 !== undefined ? o.y1 : 2.4;
  const moss = o.moss !== undefined ? o.moss : 0;
  const mossColor = new THREE.Color(o.mossColor || 0x6d7f4c);
  for (let f = 0; f < pos.count; f += 3) {
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    let k = 1 + amp * fbm2(cx * 0.85 + 7.3, cz * 0.85 - 2.1 + cy * 0.55, 2);
    k *= lerp(aoLo, aoHi, smoothstep(y0, y1, cy));
    if (moss > 0) {
      const m = moss * (1 - smoothstep(0.05, 1.5, cy)) * clamp(valueNoise2(cx * 1.3 + 4, cz * 1.3 - 2) * 1.2, 0, 1);
      for (let q = 0; q < 3; q++) {
        const c = new THREE.Color(col.getX(f + q), col.getY(f + q), col.getZ(f + q));
        c.multiplyScalar(k).lerp(mossColor, m * 0.55);
        col.setXYZ(f + q, c.r, c.g, c.b);
      }
      continue;
    }
    for (let q = 0; q < 3; q++) {
      col.setXYZ(f + q, col.getX(f + q) * k, col.getY(f + q) * k, col.getZ(f + q) * k);
    }
  }
  col.needsUpdate = true;
  return geo;
}

/** 给 MeshStandardMaterial 注入世界坐标噪声：打破大块平面的塑料感 */
export function addSurfaceNoise(mat, o = {}) {
  const scale = o.scale !== undefined ? o.scale : 1.2;
  const amp = o.amp !== undefined ? o.amp : 0.14;
  const gradY0 = o.gradY0 !== undefined ? o.gradY0 : -0.5;
  const gradY1 = o.gradY1 !== undefined ? o.gradY1 : 7.0;
  const key = `mottle_${scale}_${amp}_${gradY0}_${gradY1}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoiseScale = { value: scale };
    shader.uniforms.uNoiseAmp = { value: amp };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPosM = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPosM;
        uniform float uNoiseScale, uNoiseAmp;
        float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vn3(vec3 x) {
          vec3 i = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mott = vn3(vWPosM * uNoiseScale) * 0.65 + vn3(vWPosM * uNoiseScale * 3.7) * 0.35;
        diffuseColor.rgb *= 1.0 + (mott - 0.5) * uNoiseAmp;
        diffuseColor.rgb *= mix(${gradY0.toFixed(3)}, 1.0, smoothstep(0.0, 1.0, clamp((vWPosM.y - ${gradY0.toFixed(3)}) / ${(gradY1 - gradY0).toFixed(3)}, 0.0, 1.0)) * 0.35 + 0.65);`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** 释放一棵子树里的几何 / 材质 / 纹理 */
export function disposeObject(root) {
  const seenG = new Set();
  const seenM = new Set();
  const texSlots = ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap'];
  root.traverse((obj) => {
    if (obj.geometry && !seenG.has(obj.geometry)) { seenG.add(obj.geometry); obj.geometry.dispose(); }
    if (obj.isInstancedMesh && obj.dispose) obj.dispose();
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const m of mats) {
      if (!m || seenM.has(m)) continue;
      seenM.add(m);
      for (const s of texSlots) if (m[s]) m[s].dispose();
      if (m.uniforms) for (const k in m.uniforms) {
        const u = m.uniforms[k];
        if (u && u.value && u.value.isTexture) u.value.dispose();
      }
      m.dispose();
    }
  });
}
