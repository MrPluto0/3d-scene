// src/scenes/skyCityScene.js — 天空之城 v3：暮色云海上的浮空城（v2 重写 + 可见性修复）。
// 纯 three.js 代码几何（无 GLB / 无 Blender / 无新依赖）：
//   · 主岛岩体：6 层收分岩层环，逐层角向噪声扰动（层间错相位）+ 顶点径向伪噪声位移，
//     侧面挂 InstancedMesh 风化碎石与垂藤（TubeGeometry 渐细），锥尖嵌青蓝晶体簇；
//   · 建筑生成器：26 栋随机组合（1-3 层堆叠收分 / 拱形发光窗 / 门廊雨搭 / 阳台 /
//     尖锥·四坡·露台·圆顶四式屋顶 / 踢脚+檐口线脚 / 调色板+微噪声）+ 2 座地标塔；
//   · 中心主塔：6 级收分塔身，每级环形平台+栏杆+拱窗列，4 道飞扶壁（贝塞尔管），
//     顶端晶体簇 + 冲天光柱（顶点色加法渐隐 + 微脉动）；
//   · 台地垛口（InstancedMesh 缺口节奏）+ 台缘灯柱；断续符文式三道光环（弧段
//     InstancedMesh + 段端符文钉），主环挂 5 粒发光浮石（位移岩+微光环）；
//   · 6 座卫星岛（位移岩+草顶+拱窗小屋/垂树），2 座垂瀑（顶点色缎带），主岛间石拱桥；
//   · 三层团簇云海（每团 4-8 球 InstancedMesh，层速不同，云下更暗）。
// 三渲二配方：MeshToonMaterial 3 级 gradientMap / 关键物件 inverted hull 描边 /
// UnrealBloomPass 0.5 档 + ACES + 冷色雾 / emissive 拱窗保背光面可读。
// v3 可见性修复（默认视距下肉眼可辨）：全景机位拉近（主体放大 ~20%，尖顶/层理/桥岛同框）；
//   岩体沉积色带（暖岩/冷岩/赭岩按世界 y 分带交替顶点色 + 位移幅度 +23%）+ 侧后冷色轮廓光；
//   拱窗加浅色石拱框（与窗同位形 InstancedMesh，读成「带框拱窗」而非光点）；光柱加长至穿出
//   画外、双层加亮（外层大直径低透明 + 内层细亮芯过 bloom）；飞扶壁半径 ×1.9、弧线外扩并
//   落到台地墩座；符文环长短段节奏化 + 段端刻度钉加长 + 主环转暖金；浮石 ×1.5、锥尖晶体更亮
//   带亮芯、垂藤加长尾端亮绿、瀑布宽 ×1.3；贴岛碎云下移并避开默认视线不遮岩。
// 接口：initSkyCity(container) → { setView(name), setOrbit(on), dispose() }，
// dispose 彻底（RAF / 监听 / geometry / material / texture / renderer / canvas），
// StrictMode 双挂载与路由切换安全。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* 四个机位预设：全景 / 仰视光柱 / 平视云海 / 贴环看城（v3：全景拉近，主体占高约 45-55%） */
const VIEWS = {
  iso:   { pos: [23.2, 13.4, 29.2], tgt: [0, 5.5, 0] },
  beam:  { pos: [9.5, -2.5, 15],   tgt: [0, 14, 0] },
  cloud: { pos: [36, -9, -4],      tgt: [0, 3, 0] },
  ring:  { pos: [15.2, 8.6, 4.2],  tgt: [0, 5, 0] },
};

/* mulberry32 种子随机：每次加载布局一致，截图可复现 */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 角度差归一到 [-pi, pi]（视线留白用） */
function angDist(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function initSkyCity(container) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  let disposed = false;
  const rand = mulberry32(20261031);
  const tickers = [];   // 每帧更新回调（dt, t）
  const dummy = new THREE.Object3D();

  /* ---------- renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;   // composer 多 pass：手动按帧重置，info 才是全帧总量
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x454e77, 0.0045);   // 暮色冷雾，拉开纵深

  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 900);
  camera.position.set(...VIEWS.iso.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...VIEWS.iso.tgt);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 6;
  controls.maxDistance = 140;
  controls.maxPolarAngle = Math.PI * 0.68;   // 允许压到云层边缘看岛底晶体，但不整个钻进云下
  controls.autoRotateSpeed = 0.45;

  /* ---------- 灯光：暖色低角度落日主光 + 冷蓝半球（置低防发灰）+ 暗侧冷补 + 底部填充 ---------- */
  const sun = new THREE.DirectionalLight(0xffb070, 1.7);
  sun.position.set(60, 22, -38);             // 仰角约 17° 的低角度落日
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 44;  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x5a7ab8, 0x1e2746, 0.64);
  scene.add(hemi);

  const coldFill = new THREE.DirectionalLight(0x4a5f8f, 0.35);  // 暗侧冷补：背光面不死黑
  coldFill.position.set(-40, 30, 40);
  scene.add(coldFill);

  const rimLight = new THREE.DirectionalLight(0x8ab2e8, 0.8);   // v3 侧后冷色轮廓光：暗面岩层边缘可读
  rimLight.position.set(-42, 7, -10);
  scene.add(rimLight);

  const frontFill = new THREE.DirectionalLight(0xa8b4d8, 0.58); // v3 机位侧低强度冷补：正面暗面岩层色带读得出
  frontFill.position.set(26, 6, 30);
  scene.add(frontFill);

  const underFill = new THREE.DirectionalLight(0x3a5a8f, 0.3);  // 底面冷蓝填充：正下方视角可读
  underFill.position.set(0, -40, 12);
  scene.add(underFill);

  /* ---------- 三渲二材质底座 ---------- */
  const gradientMap = (() => {
    const tex = new THREE.DataTexture(new Uint8Array([70, 150, 235]), 3, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  })();
  const toon = (color, opt = {}) =>
    new THREE.MeshToonMaterial({ color, gradientMap, flatShading: true, ...opt });
  /* 顶点色 toon：所有 merge 出来的多部件网格共用（岩体/建筑/塔/桥/岛一律一套材质） */
  const toonVC = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, vertexColors: true, flatShading: true });

  /* inverted hull 描边：BackSide 深色壳，顶点沿法线外扩；厚度显式给，按物件分档 */
  const OUTLINE_COLOR = 0x0e1120;
  const outlineMats = new Map();
  function addOutline(mesh, th) {
    if (!mesh.geometry || !mesh.geometry.attributes.normal) return;
    const key = th.toFixed(3);
    let mat = outlineMats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\ttransformed += normal * ' + key + ';'
        );
      };
      outlineMats.set(key, mat);
    }
    const o = new THREE.Mesh(mesh.geometry, mat);
    o.castShadow = o.receiveShadow = false;
    mesh.add(o);
  }

  /* ---------- 通用小工具 ---------- */
  /* 给几何体铺一层顶点色（merge 前必须，材质 vertexColors） */
  function colored(geo, color) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  /* 白色顶点色：让 InstancedMesh 的 instanceColor 在所有 three 版本都生效 */
  function whiteAttr(geo) { return colored(geo, new THREE.Color(1, 1, 1)); }
  /* 单位几何模板（clone 后矩阵变换再 merge，draw call 不随部件数增长） */
  const GEO = {
    box:  new THREE.BoxGeometry(1, 1, 1),
    cone6: new THREE.ConeGeometry(1, 1, 6),
    cone4: new THREE.ConeGeometry(1, 1, 4),
    sph:  new THREE.SphereGeometry(1, 10, 7),
    hemi: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  /* 取模板 → 平移/旋转/缩放 → 上色（返回新几何，准备 merge） */
  function P(geo, color, x, y, z, o = {}) {
    const g = geo.clone();
    const sx = o.sx !== undefined ? o.sx : 1;
    const sy = o.sy !== undefined ? o.sy : sx;
    const sz = o.sz !== undefined ? o.sz : sx;
    const e = new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(e),
      new THREE.Vector3(sx, sy, sz)
    );
    g.applyMatrix4(m);
    return colored(g, color);
  }
  /* 调色板取色 + 微噪声（外墙「米白/赤陶/灰岩/淡青」微扰动） */
  function vary(hex, k = 0.05) {
    const c = new THREE.Color(hex);
    c.offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.08, (rand() - 0.5) * k);
    return c;
  }
  /* 管体半径渐细：按 y 把 x/z 收缩（藤蔓/飞扶壁用） */
  function taperTube(geo, s0, s1) {
    geo.computeBoundingBox();
    const minY = geo.boundingBox.min.y, maxY = geo.boundingBox.max.y;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - minY) / Math.max(maxY - minY, 1e-4);
      const s = THREE.MathUtils.lerp(s0, s1, t);
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
    }
    geo.computeVertexNormals();
    return geo;
  }
  /* 岩层位移：角向轮廓扰动（层间错相位）+ 径向多层伪噪声 + 竖向微扰 = 嶙峋层理 */
  function displaceRock(geo, { amp = 0.13, bump = 0.07, phase = 0 }) {
    geo.computeBoundingBox();
    const minY = geo.boundingBox.min.y, maxY = geo.boundingBox.max.y;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;                        // 盖面圆心不动
      const th = Math.atan2(z, x);
      const v = (y - minY) / Math.max(maxY - minY, 1e-4);
      /* 角向噪声（不同频率叠加，phase 决定层间错相位） */
      const nAng = Math.sin(th * 3 + phase) * 0.45
                 + Math.sin(th * 5 + phase * 1.7 + v * 4.0) * 0.30
                 + Math.sin(th * 8 - phase * 0.8 + v * 7.0) * 0.18
                 + Math.cos(th * 2 - phase * 1.3) * 0.25;
      const s = 1 + amp * nAng * (0.65 + 0.35 * v);
      x *= s; z *= s;
      /* 径向（≈法向）第二层伪噪声：塑出岩瘤与凹坑 */
      const r2 = Math.hypot(x, z);
      const bumpAmp = bump * (Math.sin(th * 7 + y * 2.3 + phase * 2.1) * 0.5
                            + Math.sin(th * 13 + y * 4.1 - phase) * 0.25
                            + Math.cos(th * 4 - y * 1.5 + phase * 0.7) * 0.35);
      const k = (r2 + bumpAmp) / r2;
      x *= k; z *= k;
      /* 竖向微扰：层理上下错动 */
      y += (Math.sin(th * 5 + y * 1.3 + phase * 3.1) - 0.5) * bump * 0.6;
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  /* 碎石/浮石位移：球状径向伪噪声（Icosahedron 用） */
  function displacedChunk(geo, amp, phase) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, y, z);
      if (r < 1e-4) continue;
      const th = Math.atan2(z, x), ph = y / r;
      const n = Math.sin(th * 3 + phase) * 0.4
              + Math.sin(th * 5 + ph * 4 + phase * 1.7) * 0.3
              + Math.cos(th * 2 - ph * 3 - phase) * 0.3;
      const k = 1 + amp * n;
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  }
  /* v3 沉积色带：按面片量化分带（亮暖砂 / 暗冷梅 / 赭岩节奏 亮-暗-中-暗，逐三角形单色
     → 带缘锐利），明度差拉大 —— 背光面 toon 压平后仍读得出条带；逐面微噪保留岩感 */
  const STRATA = [0xdcb47c, 0x6a5480, 0xc08a5f, 0x6a5480].map((h) => new THREE.Color(h));
  function strataPaint(geo, bandH = 1.05) {
    const g = geo.index ? geo.toNonIndexed() : geo;   // 逐三角形上色：带缘不被顶点插值糊掉
    const pos = g.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let f = 0; f < pos.count; f += 3) {
      const yC = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
      const band = Math.floor((yC + 22) / bandH);
      tmp.copy(STRATA[((band % 4) + 4) % 4]);
      tmp.offsetHSL((rand() - 0.5) * 0.015, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.05);
      for (let k = 0; k < 3; k++) { arr[(f + k) * 3] = tmp.r; arr[(f + k) * 3 + 1] = tmp.g; arr[(f + k) * 3 + 2] = tmp.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  /* ---------- InstancedMesh 收集池（窗/栏杆柱/垛口/灯柱/碎石；帧率友好） ---------- */
  const winList = [];    // {m, c} 拱形发光窗（HDR 颜色喂 bloom）
  const postList = [];   // 栏杆柱矩阵
  const merlonList = []; // 垛口矩阵
  const lampEntries = []; // 灯柱 {x,y,z}（杆+灯头两个 InstancedMesh 共用位形）
  const debrisList = []; // 主岩碎石矩阵

  const WIN_COLORS = () => {
    const r = rand();
    if (r < 0.58) return new THREE.Color(2.1, 1.15, 0.48);   // 暖橙主档（v3 微降，框可读）
    if (r < 0.74) return new THREE.Color(1.6, 0.88, 0.4);    // 暖橙次档
    if (r < 0.86) return new THREE.Color(1.3, 1.75, 2.3);   // 少量冷白
    return new THREE.Color(0.09, 0.08, 0.11);               // 部分熄灭
  };
  function pushWin(list, pm, x, y, z, yaw, sx, sy, color) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, 1);
    dummy.updateMatrix();
    list.push({ m: pm.clone().multiply(dummy.matrix), c: color || WIN_COLORS() });
  }
  function pushPost(list, pm, x, y, z, sy = 1) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, sy, 1);
    dummy.updateMatrix();
    list.push(pm.clone().multiply(dummy.matrix));
  }
  function matAt(px, py, pz, ry) {
    dummy.position.set(px, py, pz);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  }
  function buildInstanced(geo, mat, list, parent, { shadow = false, colors = false } = {}) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      im.setMatrixAt(i, it.m || it);
      if (colors && it.c) im.setColorAt(i, it.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;          // 实例散布远超模板几何包围球，关裁剪防整批消失
    im.castShadow = shadow;
    im.receiveShadow = shadow;
    parent.add(im);
    return im;
  }

  /* ---------- 天空：暮色渐变内壁球 + 星 + 地平线暖光斑 ---------- */
  function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 1024;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0.00, '#070d1f');
    grad.addColorStop(0.30, '#12203f');
    grad.addColorStop(0.50, '#274066');
    grad.addColorStop(0.62, '#4a5a7a');
    grad.addColorStop(0.71, '#8a5f62');
    grad.addColorStop(0.77, '#c87f4a');
    grad.addColorStop(0.81, '#ef9a4e');
    grad.addColorStop(0.84, '#f6b56a');
    grad.addColorStop(0.88, '#d98a52');
    grad.addColorStop(0.92, '#5c4150');
    grad.addColorStop(1.00, '#171727');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 1024);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const skyTex = makeSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(380, 32, 24),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  { /* 星星：只在高处，微冷白 */
    const N = 240, pos = new Float32Array(N * 3);
    let i = 0;
    while (i < N) {
      const u = rand() * 2 - 1, ph = rand() * Math.PI * 2;
      const y = u;
      if (y < 0.28) continue;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(ph) * r * 330;
      pos[i * 3 + 1] = y * 330;
      pos[i * 3 + 2] = Math.sin(ph) * r * 330;
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9fc4ff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    })));
  }

  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const glowTex = makeGlowTexture();
  { /* 落日方向的暖光斑（加法 sprite，撑住地平线的金） */
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff9d55, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sunGlow.position.set(237, 92, -150);
    sunGlow.scale.set(200, 200, 1);
    scene.add(sunGlow);
  }

  /* ---------- 主城容器（整体极缓沉浮） ---------- */
  const islandRoot = new THREE.Group();
  scene.add(islandRoot);
  const worldBob = new THREE.Group();
  islandRoot.add(worldBob);

  /* ---------- 1. 主岛岩体：6 层收分位移岩层，merge 成一件（v3 沉积色带 + 位移 +23%） ---------- */
  const LAYERS = [  // [顶半径, 底半径, 高, 底面 y] —— 逐层收分 + 微外挑出层理台缘
    [7.0, 6.2, 2.6, -2.6],
    [6.3, 5.3, 2.8, -5.4],
    [5.4, 4.3, 3.0, -8.4],
    [4.4, 3.2, 3.2, -11.6],
    [3.3, 2.0, 3.4, -15.0],
    [2.1, 0.9, 2.6, -17.6],
  ];
  {
    const parts = LAYERS.map((s, i) => {
      const geo = displaceRock(
        new THREE.CylinderGeometry(s[0], s[1], s[2], 16, 8),
        { amp: 0.16, bump: 0.092, phase: i * 2.399 + 0.7 }   // 黄金角错相位；v3 位移幅度 +23%
      );
      return strataPaint(geo.translate(0, s[3] + s[2] / 2, 0));
    });
    const rock = new THREE.Mesh(mergeGeometries(parts), toonVC);
    rock.castShadow = rock.receiveShadow = true;
    worldBob.add(rock);
    addOutline(rock, 0.07);
  }

  /* 侧面风化崩落碎石：一块位移岩模板 instanced 10 次（8-12 块） */
  {
    const geo = whiteAttr(displacedChunk(new THREE.IcosahedronGeometry(1, 1), 0.3, 3.3));
    const mat = toon(0x6b5a6e, { vertexColors: true });
    for (let i = 0; i < 10; i++) {
      const li = 1 + Math.floor(rand() * 4);
      const L = LAYERS[li];
      const a = rand() * Math.PI * 2;
      const rm = (L[0] + L[1]) / 2 * (1 + 0.1 * Math.sin(a * 3 + li));
      const s = 0.24 + rand() * 0.4;
      dummy.position.set(Math.cos(a) * rm, L[3] + L[2] * (0.15 + rand() * 0.7), Math.sin(a) * rm);
      dummy.rotation.set(rand() * 3, rand() * 6, rand() * 3);
      dummy.scale.set(s, s * (0.7 + rand() * 0.6), s);
      dummy.updateMatrix();
      debrisList.push({ m: dummy.matrix.clone(), c: vary(0x76657a, 0.08) });
    }
    buildInstanced(geo, mat, debrisList, worldBob, { shadow: true, colors: true });
  }

  /* 垂根/藤蔓：贝塞尔管渐细 + 叶簇，merge 成一件（v3 加长加亮，尾端亮绿发光梢；
     挂在层理台缘下方 —— 半径取各层底半径 + 外挑，保证在位移岩面之外可见） */
  {
    const parts = [];
    const tips = [];   // 藤梢亮绿小灯（单独 MeshBasic 合并，HDR 色喂 bloom）
    const vineC = new THREE.Color(0x5e7a4c);
    const leafC = [new THREE.Color(0x74c46e), new THREE.Color(0x8ad67e)];
    /* 层缘挂点：[台缘 y, 该处岩面基半径, 外挑量] —— 三层台缘轮转，藤幕不连成一片 */
    const ANCHORS = [[-2.5, 6.25, 0.62], [-5.3, 5.35, 0.55], [-8.3, 4.35, 0.48]];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
      const [ay, ar, out] = ANCHORS[i % 3];
      const r0 = ar + out;                                // 位移岩面（±10%）之外
      const len = 4.2 + rand() * 3.2;                     // v3 ×~1.5 加长
      const p0 = new THREE.Vector3(Math.cos(a) * r0, ay, Math.sin(a) * r0);
      const p1 = new THREE.Vector3(Math.cos(a) * (r0 + 0.35), ay - len * 0.55, Math.sin(a) * (r0 + 0.35));
      const p2 = new THREE.Vector3(Math.cos(a) * (r0 - 0.55), ay - len, Math.sin(a) * (r0 - 0.55));
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const tube = taperTube(new THREE.TubeGeometry(curve, 9, 0.1, 5, false), 1, 0.35);
      parts.push(colored(tube, vineC));
      for (let j = 0; j < 5; j++) {  // 藤上叶簇（v3 加大加密：默认视距下读得出绿）
        const p = curve.getPoint(0.22 + j * 0.19);
        const lr = 0.22 + rand() * 0.13;
        parts.push(P(GEO.sph, leafC[Math.floor(rand() * 2)], p.x, p.y, p.z, { sx: lr, sy: lr * 0.85, sz: lr }));
      }
      tips.push(p2);   // 尾端亮绿梢
    }
    const vines = new THREE.Mesh(mergeGeometries(parts), toonVC);
    vines.castShadow = true;
    worldBob.add(vines);
    const tipMesh = new THREE.Mesh(
      mergeGeometries(tips.map((p) => P(GEO.sph, new THREE.Color(0.55, 1.9, 0.7), p.x, p.y, p.z, { sx: 0.14, sy: 0.2, sz: 0.14 }))),
      new THREE.MeshBasicMaterial({ vertexColors: true })
    );
    worldBob.add(tipMesh);
  }

  /* 锥尖晶体簇：4-5 颗八面体随机嵌合（不是单球），青蓝 emissive + 一颗亮芯 + 点光 + 辉光 */
  const crystalCyan = new THREE.MeshToonMaterial({
    color: 0x0e2a33, gradientMap,
    emissive: new THREE.Color(0.55, 1.9, 2.4), emissiveIntensity: 2.2,
  });
  {
    /* 嵌在岩尖收口下方（岩底 -17.6）：上半嵌岩、下半外露，亮芯悬在尖下空中 —— 低角度可见 */
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + rand() * 0.28, 0), crystalCyan);
      const a = rand() * Math.PI * 2, rr = 0.3 + rand() * 0.45;
      c.position.set(Math.cos(a) * rr, -17.2 - rand() * 0.8, Math.sin(a) * rr);
      c.rotation.set((rand() - 0.5) * 0.9, rand() * 3, (rand() - 0.5) * 0.9);
      c.scale.set(1, 1.5 + rand() * 0.8, 1);
      worldBob.add(c);
    }
    /* v3 亮芯：尖下空中一颗 HDR 青蓝八面体（岩体之外不被遮挡），过 bloom 阈值成星点 */
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 3.4, 4.0) })
    );
    core.position.set(0, -18.5, 0);
    core.scale.set(1, 1.7, 1);
    worldBob.add(core);
    const coreLight = new THREE.PointLight(0x66d8ff, 3.6, 18, 1.8);
    coreLight.position.set(0, -18.8, 0);       // 岩尖下方岩体外，真正照亮锥底与晶体
    worldBob.add(coreLight);
    const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x7fe0ff, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    coreGlow.position.set(0, -18.2, 0);
    coreGlow.scale.set(7, 7, 1);
    worldBob.add(coreGlow);
    tickers.push((dt, t) => {
      crystalCyan.emissiveIntensity = 2.2 + 0.45 * Math.sin(t * 1.1);
    });
  }

  /* ---------- 4. 台地与垛口：三层同心台地 + 缺口节奏垛口 + 台缘灯柱 ---------- */
  const STONE = [0x9a8d80, 0x8a7f76, 0x93877c];
  const TERRACES = [   // [顶半径, 底半径, 高, 底面 y]
    [6.75, 6.95, 1.0, 0.0],
    [4.8, 5.0, 1.2, 1.0],
    [3.0, 3.2, 1.2, 2.2],
  ];
  {
    const parts = [];
    TERRACES.forEach((s, i) => {
      const geo = new THREE.CylinderGeometry(s[0], s[1], s[2], 28);
      parts.push(colored(geo, vary(STONE[i], 0.03)).translate(0, s[3] + s[2] / 2, 0));
      /* 台缘矮墙带 */
      const band = new THREE.CylinderGeometry(s[0] + 0.06, s[0] + 0.06, 0.34, 28);
      parts.push(colored(band, vary(STONE[(i + 1) % 3], 0.03)).translate(0, s[3] + s[2] + 0.17, 0));
    });
    /* 台地间踏步（两处，朝向默认机位留白口） */
    for (const az of [0.9, 3.9]) {
      for (let k = 0; k < 3; k++) {
        const r = 5.35 - k * 0.18;
        const hh = 0.4;
        parts.push(P(GEO.box, vary(STONE[1], 0.03),
          Math.cos(az) * r, 1.0 + k * hh + hh / 2 - 0.05, Math.sin(az) * r,
          { sx: 0.72, sy: hh, sz: 0.34, ry: -az }));
      }
    }
    const terraces = new THREE.Mesh(mergeGeometries(parts), toonVC);
    terraces.castShadow = terraces.receiveShadow = true;
    worldBob.add(terraces);
    addOutline(terraces, 0.045);

    /* 垛口：三圈 InstancedMesh，随机跳槽出缺口节奏（不是整环） */
    const merlonGeo = new THREE.BoxGeometry(0.5, 0.42, 0.3);
    TERRACES.forEach((s, i) => {
      const rr = s[0] + 0.06;
      const n = Math.round(rr * 2 * Math.PI / 1.25);
      for (let k = 0; k < n; k++) {
        if (rand() < 0.26) continue;                       // 缺口
        const a = (k / n) * Math.PI * 2 + rand() * 0.06;
        dummy.position.set(Math.cos(a) * rr, s[3] + s[2] + 0.34 + 0.21, Math.sin(a) * rr);
        dummy.rotation.set(0, -a, 0);
        dummy.scale.set(1, 0.85 + rand() * 0.4, 1);
        dummy.updateMatrix();
        merlonList.push(dummy.matrix.clone());
      }
    });
    /* 台缘灯柱：每层 8-12 根（杆 + 暖光小球头） */
    const lampN = [10, 9, 8];
    TERRACES.forEach((s, i) => {
      const rr = s[0] - 0.45;
      for (let k = 0; k < lampN[i]; k++) {
        const a = (k / lampN[i]) * Math.PI * 2 + 0.3 / (i + 1);
        lampEntries.push({ x: Math.cos(a) * rr, y: s[3] + s[2], z: Math.sin(a) * rr });
      }
    });
  }

  /* ---------- 2. 建筑生成器：部件随机组合，禁止两栋完全一样 ---------- */
  const WALLS = [0xe3d5bc, 0xd9c6a8, 0xc98f6e, 0xb8a992, 0x9fb4be, 0xcbb49a];
  const ROOFS = [0x4e7d93, 0x8a4f44, 0x5a6b78, 0xa65b44, 0x3e6e63];
  const FACES = [
    { yaw: 0, ax: 'z', sign: 1 },
    { yaw: Math.PI / 2, ax: 'x', sign: 1 },
    { yaw: Math.PI, ax: 'z', sign: -1 },
    { yaw: -Math.PI / 2, ax: 'x', sign: -1 },
  ];
  /* makeBuilding：生成一栋（局部坐标），返回 mesh（位形由 pm 拆解）。
     winTarget：拱窗实例池（主城走全局池随城沉浮，卫星岛走岛局部池随岛沉浮） */
  function makeBuilding(s, pm, { maxLayers = 3, tall = false } = {}, winTarget = winList) {
    const parts = [];
    const wallC = vary(WALLS[Math.floor(rand() * WALLS.length)]);
    const roofC = vary(ROOFS[Math.floor(rand() * ROOFS.length)]);
    const trimC = vary(0xe8e0d0, 0.06);
    const clothC = vary(0xc98a6b, 0.08);

    /* 主体 1-3 层堆叠，逐层微收 */
    const layers = 1 + Math.floor(rand() * maxLayers);
    const w = (0.8 + rand() * 0.5) * s, d = (0.8 + rand() * 0.5) * s;
    let y = 0; const dims = [];
    let wi = w, di = d;
    for (let li = 0; li < layers; li++) {
      const h = (0.55 + rand() * 0.5) * s * (tall ? 1.3 : 1);
      parts.push(P(GEO.box, wallC, 0, y + h / 2, 0, { sx: wi, sy: h, sz: di }));
      parts.push(P(GEO.box, trimC, 0, y + 0.05 * s, 0, { sx: wi + 0.09 * s, sy: 0.1 * s, sz: di + 0.09 * s }));   // 踢脚线
      parts.push(P(GEO.box, trimC, 0, y + h + 0.03 * s, 0, { sx: wi + 0.1 * s, sy: 0.06 * s, sz: di + 0.1 * s })); // 檐口带
      dims.push({ y0: y, h, w: wi, d: di });
      y += h + 0.05 * s;
      wi *= 0.9 + rand() * 0.06;
      di *= 0.9 + rand() * 0.06;
    }
    const top = dims[dims.length - 1];
    const topY = y;

    /* 拱形发光窗：每层每面 1-2 扇，总量 4-10（暖橙为主少量冷白部分熄灭）。
       窗高自适应墙高，垂直居中，保证不戳穿踢脚/檐口 */
    let winCount = 0;
    for (const L of dims) {
      for (const f of FACES) {
        const faceLen = f.ax === 'z' ? L.w : L.d;
        const cols = faceLen > 0.95 * s ? 2 : 1;
        for (let ci = 0; ci < cols; ci++) {
          if (rand() < 0.2) continue;
          const off = cols === 1 ? (rand() - 0.5) * 0.12 * s : (ci === 0 ? -1 : 1) * faceLen * 0.23;
          const sxw = s * (1.1 + rand() * 0.3);
          const syw = Math.min(s * (1.1 + rand() * 0.3), Math.max(0.55 * s, (L.h - 0.16 * s) / 0.3));
          const wy = L.y0 + Math.max(0.08 * s, (L.h - 0.3 * syw) * 0.5);
          const lx = f.ax === 'z' ? off : f.sign * (L.w / 2 + 0.02);
          const lz = f.ax === 'z' ? f.sign * (L.d / 2 + 0.02) : off;
          pushWin(winTarget, pm, lx, wy, lz, f.yaw, sxw, syw);
          winCount++;
        }
      }
    }
    /* 保底 4 扇（正面补齐） */
    while (winCount < 4) {
      const syw = Math.min(s, Math.max(0.55 * s, (dims[0].h - 0.16 * s) / 0.3));
      pushWin(winTarget, pm, (rand() - 0.5) * top.w * 0.4, dims[0].y0 + Math.max(0.08 * s, (dims[0].h - 0.3 * syw) * 0.5), dims[0].d / 2 + 0.02, 0, s, syw);
      winCount++;
    }

    /* 门 + 门廊（小盒 + 坡顶雨搭）：门高自适应首层墙高 */
    {
      const doorSy = Math.min(1.9, Math.max(1.1, (dims[0].h - 0.2 * s) / 0.3));
      pushWin(winTarget, pm, 0, 0.05 * s, dims[0].d / 2 + 0.02, 0, 1.15, doorSy, new THREE.Color(0.26, 0.18, 0.13));
    }
    if (rand() < 0.62) {
      const pd = dims[0].d / 2;
      parts.push(P(GEO.box, wallC, 0, 0.16 * s, pd + 0.1 * s, { sx: 0.34 * s, sy: 0.3 * s, sz: 0.2 * s }));        // 门斗
      parts.push(P(GEO.box, clothC, 0, 0.48 * s, pd + 0.2 * s, { sx: 0.46 * s, sy: 0.035 * s, sz: 0.3 * s, rx: 0.32 })); // 坡顶雨搭
      parts.push(P(GEO.box, trimC, -0.17 * s, 0.24 * s, pd + 0.3 * s, { sx: 0.03 * s, sy: 0.4 * s, sz: 0.03 * s }));   // 雨搭柱
      parts.push(P(GEO.box, trimC, 0.17 * s, 0.24 * s, pd + 0.3 * s, { sx: 0.03 * s, sy: 0.4 * s, sz: 0.03 * s }));
    }

    /* 阳台：悬挑板 + 栏杆柱（进全局池）+ 顶栏（merged） */
    if (rand() < 0.58 && dims.length >= 1) {
      const L = dims[Math.min(1, dims.length - 1)];
      const side = FACES[1 + Math.floor(rand() * 3)];
      const bx = side.ax === 'x' ? side.sign * (L.w / 2 + 0.16 * s) : 0;
      const bz = side.ax === 'z' ? side.sign * (L.d / 2 + 0.16 * s) : 0;
      parts.push(P(GEO.box, trimC, bx, L.y0 + L.h + 0.03 * s, bz, { sx: 0.34 * s, sy: 0.045 * s, sz: 0.5 * L.d, ry: side.ax === 'x' ? Math.PI / 2 : 0 }));
      parts.push(P(GEO.box, trimC,
        bx + (side.ax === 'x' ? side.sign * 0.15 * s : 0), L.y0 + L.h + 0.14 * s,
        bz + (side.ax === 'z' ? side.sign * 0.2 * s : 0),
        { sx: 0.36 * s, sy: 0.03 * s, sz: 0.04 * s, ry: side.ax === 'x' ? Math.PI / 2 : 0 }));
      for (let k = -1; k <= 1; k++) {
        const ox = side.ax === 'x' ? side.sign * 0.28 * s : k * 0.16 * s;
        const oz = side.ax === 'z' ? side.sign * 0.34 * s : k * 0.16 * s;
        pushPost(postList, pm, bx + ox, L.y0 + L.h + 0.09 * s, bz + oz, 0.14 * s / 0.5);
      }
    }

    /* 屋顶四式：尖锥 / 四坡 / 平顶露台矮墙 / 圆顶 */
    const roofType = Math.floor(rand() * 4);
    const rh = (0.5 + rand() * 0.5) * s;
    if (roofType === 0) {
      parts.push(P(GEO.cone6, roofC, 0, topY + rh / 2, 0, { sx: top.w * 0.58, sy: rh, sz: top.d * 0.58 }));
      parts.push(P(GEO.cone6, trimC, 0, topY + rh + 0.07 * s, 0, { sx: 0.05 * s, sy: 0.16 * s, sz: 0.05 * s }));
    } else if (roofType === 1) {
      parts.push(P(GEO.cone4, roofC, 0, topY + rh * 0.72 / 2, 0, { sx: top.w * 0.56, sy: rh * 0.72, sz: top.d * 0.56, ry: Math.PI / 4 }));
      parts.push(P(GEO.cone4, trimC, 0, topY + rh * 0.72 + 0.05 * s, 0, { sx: 0.05 * s, sy: 0.12 * s, sz: 0.05 * s, ry: Math.PI / 4 }));
    } else if (roofType === 2) {
      const pw = top.w / 2 + 0.05 * s, pdd = top.d / 2 + 0.05 * s, phh = 0.15 * s;
      parts.push(P(GEO.box, wallC, 0, topY + phh / 2, pdd, { sx: 2 * pw, sy: phh, sz: 0.05 * s }));
      parts.push(P(GEO.box, wallC, 0, topY + phh / 2, -pdd, { sx: 2 * pw, sy: phh, sz: 0.05 * s }));
      parts.push(P(GEO.box, wallC, pw, topY + phh / 2, 0, { sx: 0.05 * s, sy: phh, sz: 2 * pdd }));
      parts.push(P(GEO.box, wallC, -pw, topY + phh / 2, 0, { sx: 0.05 * s, sy: phh, sz: 2 * pdd }));
      parts.push(P(GEO.box, roofC, pw * 0.35, topY + 0.11 * s + 0.1 * s, -pdd * 0.35, { sx: 0.28 * s, sy: 0.2 * s, sz: 0.28 * s })); // 露台小亭
      parts.push(P(GEO.cone6, trimC, pw * 0.35, topY + 0.11 * s + 0.24 * s, -pdd * 0.35, { sx: 0.2 * s, sy: 0.1 * s, sz: 0.2 * s }));
    } else {
      parts.push(P(GEO.hemi, roofC, 0, topY, 0, { sx: top.w * 0.56, sy: rh * 0.8, sz: top.d * 0.56 }));
      parts.push(P(GEO.sph, trimC, 0, topY + rh * 0.8 + 0.02, 0, { sx: 0.045 * s, sy: 0.045 * s, sz: 0.045 * s }));
    }
    /* 烟囱（坡顶才有） */
    if ((roofType === 0 || roofType === 1) && rand() < 0.45) {
      parts.push(P(GEO.box, wallC, top.w * 0.3, topY + rh * 0.55 + 0.1 * s, top.d * 0.25, { sx: 0.1 * s, sy: 0.34 * s, sz: 0.1 * s }));
      parts.push(P(GEO.box, trimC, top.w * 0.3, topY + rh * 0.55 + 0.28 * s, top.d * 0.25, { sx: 0.14 * s, sy: 0.04 * s, sz: 0.14 * s }));
    }

    const mesh = new THREE.Mesh(mergeGeometries(parts), toonVC);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    pm.decompose(p, q, sc);
    mesh.position.copy(p);
    mesh.quaternion.copy(q);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  /* 地标塔：多边形塔身 + 瞭望台 + 灯球（2 座） */
  const beaconMats = [];
  function makeLandmark(s, pm) {
    const parts = [];
    const wallC = vary(0xd6c4aa);
    const roofC = vary(0x8a4f44);
    const trimC = vary(0xe8e0d0, 0.05);
    const H = 3.6 * s;
    /* 三段六棱塔身收分 */
    parts.push(P(new THREE.CylinderGeometry(0.52 * s, 0.62 * s, H * 0.5, 6), wallC, 0, H * 0.25, 0));
    parts.push(P(new THREE.CylinderGeometry(0.4 * s, 0.5 * s, H * 0.32, 6), wallC, 0, H * 0.5 + H * 0.16, 0));
    parts.push(P(new THREE.CylinderGeometry(0.32 * s, 0.38 * s, H * 0.18, 6), wallC, 0, H * 0.82 + H * 0.09, 0));
    parts.push(P(GEO.box, trimC, 0, 0.06 * s, 0, { sx: 1.36 * s, sy: 0.12 * s, sz: 1.36 * s }));
    parts.push(P(GEO.box, trimC, 0, H * 0.5, 0, { sx: 1.08 * s, sy: 0.07 * s, sz: 1.08 * s }));
    /* 瞭望台：外挑平台 + 围栏 + 坡顶 */
    parts.push(P(new THREE.CylinderGeometry(0.62 * s, 0.5 * s, 0.2 * s, 6), trimC, 0, H * 0.96, 0));
    parts.push(P(new THREE.TorusGeometry(0.56 * s, 0.03 * s, 5, 12).rotateX(Math.PI / 2), trimC, 0, H + 0.1 * s, 0));
    parts.push(P(GEO.cone6, roofC, 0, H + 0.48 * s, 0, { sx: 0.62 * s, sy: 0.7 * s, sz: 0.62 * s }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      pushPost(postList, pm, Math.cos(a) * 0.56 * s, H + 0.02 * s, Math.sin(a) * 0.56 * s, 0.2 * s / 0.5);
    }
    /* 塔身拱窗列：三面各 2 扇（半径贴各段塔壁实际收分，不浮空不埋墙） */
    for (let f = 0; f < 3; f++) {
      const a = f * (Math.PI * 2 / 3) + 0.4;
      for (let r = 0; r < 2; r++) {
        const fy = 0.25 + r * 0.24;                       // 塔高比例
        const tier = fy < 0.5 ? 0 : fy < 0.82 ? 1 : 2;    // 所在三段
        const tierSpan = [0.5, 0.32, 0.18][tier];
        const tierBase = [0, 0.5, 0.82][tier];
        const tf = (fy - tierBase) / tierSpan;            // 段内比例
        const rBot = [0.62, 0.5, 0.38][tier] * s;
        const rTop = [0.52, 0.4, 0.32][tier] * s;
        const wallR = THREE.MathUtils.lerp(rBot, rTop, tf);
        pushWin(winList, pm, Math.cos(a) * (wallR + 0.02), H * fy, Math.sin(a) * (wallR + 0.02), -a + Math.PI / 2, 1.1, 1.1);
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), toonVC);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    pm.decompose(p, q, sc);
    mesh.position.copy(p);
    mesh.quaternion.copy(q);
    mesh.castShadow = mesh.receiveShadow = true;
    /* 灯球：emissive 脉动 */
    const bMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.6) });
    beaconMats.push(bMat);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 8, 6), bMat);
    beacon.position.copy(p).add(new THREE.Vector3(0, H + 0.92 * s, 0).applyQuaternion(q));
    return { mesh, beacon };
  }

  /* 沿环布置：角度随机留白，保主塔视线（默认机位方位 ~0.9rad 留口） */
  function ringPlace({ n, r, y, sMin, sMax, tallP, protect }) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.25;
      if (protect && angDist(a, protect) < 0.3 && rand() < 0.85) continue;
      if (rand() < 0.06) continue;
      const s = sMin + rand() * (sMax - sMin);
      const pm = matAt(Math.cos(a) * r, y, Math.sin(a) * r, -a + Math.PI / 2 + (rand() - 0.5) * 0.5);
      worldBob.add(makeBuilding(s, pm, { maxLayers: rand() < 0.45 ? 2 : 3, tall: rand() < tallP }));
    }
  }
  ringPlace({ n: 13, r: 5.7, y: 1.0, sMin: 0.9, sMax: 1.25, tallP: 0.25, protect: 0.9 });  // 外圈
  ringPlace({ n: 9, r: 3.8, y: 2.2, sMin: 1.0, sMax: 1.35, tallP: 0.5 });                  // 中圈
  ringPlace({ n: 6, r: 2.0, y: 3.4, sMin: 1.05, sMax: 1.3, tallP: 0.7 });                  // 内圈贴塔
  { /* 两座地标塔（外圈/中圈各一） */
    const spots = [
      { a: 2.2, r: 5.7, y: 1.0, s: 1.0 },
      { a: 5.1, r: 3.8, y: 2.2, s: 0.8 },
    ];
    for (const sp of spots) {
      const pm = matAt(Math.cos(sp.a) * sp.r, sp.y, Math.sin(sp.a) * sp.r, -sp.a + Math.PI / 2);
      const { mesh, beacon } = makeLandmark(sp.s, pm);
      worldBob.add(mesh, beacon);
      addOutline(mesh, 0.035);
    }
  }
  tickers.push((dt, t) => {
    for (const m of beaconMats) {
      const k = 0.65 + 0.35 * Math.sin(t * 1.6);
      m.color.setRGB(2.6 * k + 0.6, 1.5 * k + 0.35, 0.6 * k + 0.15);
    }
  });

  /* ---------- 3. 中心主塔：6 级收分 + 环形平台 + 拱窗列 + 飞扶壁 + 光柱 ---------- */
  {
    const parts = [];
    const towerC = vary(0xcdbfa8);
    const trimC = vary(0x4a7286);
    const LV = 6, H0 = 3.4, LH = 1.95;
    const radAt = (i) => THREE.MathUtils.lerp(1.55, 0.72, i / LV);
    /* 基座 */
    parts.push(colored(new THREE.CylinderGeometry(1.72, 1.9, 0.9, 12), trimC).translate(0, H0 + 0.45, 0));
    parts.push(colored(new THREE.CylinderGeometry(1.5, 1.62, 0.7, 12), towerC).translate(0, H0 + 1.25, 0));
    const idPM = new THREE.Matrix4();     // 主塔位于原点：窗直接世界坐标
    for (let i = 0; i < LV; i++) {
      const yb = H0 + 1.6 + i * LH;
      const r0 = radAt(i), r1 = radAt(i + 1);
      parts.push(colored(new THREE.CylinderGeometry(r1 * 1.02, r0 * 1.04, LH, 12), towerC).translate(0, yb + LH / 2, 0));
      /* 环形平台 + 檐口 + 栏杆环 */
      parts.push(colored(new THREE.CylinderGeometry(r1 + 0.36, r1 + 0.2, 0.16, 14), trimC).translate(0, yb + LH + 0.08, 0));
      parts.push(colored(new THREE.TorusGeometry(r1 + 0.3, 0.035, 5, 18).rotateX(Math.PI / 2), trimC).translate(0, yb + LH + 0.5, 0));
      const posts = 10;
      for (let k = 0; k < posts; k++) {
        const a = (k / posts) * Math.PI * 2 + i * 0.3;
        pushPost(postList, idPM, Math.cos(a) * (r1 + 0.3), yb + LH + 0.16, Math.sin(a) * (r1 + 0.3), 0.34 / 0.5);
      }
      /* 拱窗发光列：每级 6 扇绕塔（半径取窗高处的塔壁实际半径 + 微外贴） */
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + i * 0.26;
        const wf = 0.55;                                   // 窗在级内的高度比例
        const wallR = THREE.MathUtils.lerp(r0 * 1.04, r1 * 1.02, wf);
        pushWin(winList, idPM, Math.cos(a) * (wallR + 0.02), yb + LH * wf, Math.sin(a) * (wallR + 0.02), -a + Math.PI / 2, 1.7, 1.7);
      }
    }
    const topY = H0 + 1.6 + LV * LH;      // ≈ 16.7
    /* 顶部尖锥 */
    parts.push(P(GEO.cone6, trimC, 0, topY + 1.1, 0, { sx: 1.05, sy: 2.2, sz: 1.05 }));
    parts.push(P(GEO.cone6, towerC, 0, topY + 2.5, 0, { sx: 0.62, sy: 1.4, sz: 0.62 }));
    /* 4 道飞扶壁：贝塞尔管从塔身弧出，搭到内台地缘（v3 半径 ×1.9、弧线更外扩、落墩座） */
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI / 2) + 0.42;
      const p0 = new THREE.Vector3(Math.cos(a) * 1.26, 9.6, Math.sin(a) * 1.26);   // 微嵌入塔壁（塔壁 r≈1.26）
      const p1 = new THREE.Vector3(Math.cos(a) * 3.7, 9.2, Math.sin(a) * 3.7);     // 控制点外扩 = 受力弧
      const p2 = new THREE.Vector3(Math.cos(a) * 3.15, 3.7, Math.sin(a) * 3.15);   // 落到台地墩座顶
      const tube = taperTube(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 12, 0.19, 7, false), 1, 0.6);
      parts.push(colored(tube, trimC));
      /* 台地墩座：扶壁落点的受力墩（嵌进台缘） */
      parts.push(P(GEO.box, towerC, Math.cos(a) * 3.15, 3.35, Math.sin(a) * 3.15, { sx: 0.72, sy: 0.7, sz: 0.72, ry: -a }));
    }
    const tower = new THREE.Mesh(mergeGeometries(parts), toonVC);
    tower.castShadow = tower.receiveShadow = true;
    worldBob.add(tower);
    addOutline(tower, 0.04);

    /* 顶端晶体簇（4 颗暖白青）+ 点光 */
    const crystalWarm = new THREE.MeshToonMaterial({
      color: 0x3a4450, gradientMap,
      emissive: new THREE.Color(1.0, 0.93, 0.78), emissiveIntensity: 2.8,
    });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.3 + rand() * 0.2, 0), crystalWarm);
      const a = rand() * Math.PI * 2, rr = rand() * 0.4;
      c.position.set(Math.cos(a) * rr, topY + 3.5 + rand() * 0.7, Math.sin(a) * rr);
      c.rotation.set((rand() - 0.5) * 0.7, rand() * 3, (rand() - 0.5) * 0.7);
      c.scale.set(1, 1.6 + rand() * 0.7, 1);
      worldBob.add(c);
    }
    const crystalLight = new THREE.PointLight(0xffe8c0, 3.0, 18, 1.8);
    crystalLight.position.set(0, topY + 3.6, 0);
    worldBob.add(crystalLight);
    tickers.push((dt, t) => {
      const p = 0.5 + 0.5 * Math.sin(t * 0.9);
      crystalWarm.emissiveIntensity = 1.8 + 0.6 * p;
      crystalLight.intensity = 1.8 + 0.9 * p;
    });

    /* 冲天光柱：加法混合圆柱，顶点色沿高度渐隐（加法下色→黑即透明），微脉动。
       v3：加长至 60 穿出画外；双层 —— 外层大直径低透明 + 内层细亮芯（HDR 过 bloom） */
    function beamMesh(rTop, rBot, h, cBottom, yBase) {
      const geo = new THREE.CylinderGeometry(rTop, rBot, h, 14, 6, true);
      const pos = geo.attributes.position;
      const arr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const f = 1 - (pos.getY(i) + h / 2) / h;      // 底 1 → 顶 0
        const ff = f * f * 0.7 + f * 0.3;             // v3 衰减更缓：中上段仍可见，仅顶端渐隐
        arr[i * 3] = cBottom.r * ff;
        arr[i * 3 + 1] = cBottom.g * ff;
        arr[i * 3 + 2] = cBottom.b * ff;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = yBase + h / 2;
      worldBob.add(m);
      return mat;
    }
    const beamOuterMat = beamMesh(0.85, 0.5, 60, new THREE.Color(1.35, 1.18, 0.82), topY + 3.2);
    const beamInnerMat = beamMesh(0.3, 0.2, 60, new THREE.Color(2.3, 2.05, 1.5), topY + 3.2);
    tickers.push((dt, t) => {
      const p = 0.5 + 0.5 * Math.sin(t * 0.55);
      beamOuterMat.opacity = 0.5 + 0.22 * p;
      beamInnerMat.opacity = 0.6 + 0.3 * p;
    });
  }

  /* ---------- 5. 断续符文光环 ×3：弧段 InstancedMesh + 段端符文钉，主环挂浮石 ----------
     v3：段长长短节奏化（短钉/长段交替为主），段端刻度钉加长更亮、垂直于环面 */
  function makeRuneRing({ radius, tube, y, hdr, tiltX, tiltZ, spin, withStones }) {
    const tilt = new THREE.Group();
    tilt.position.y = y;
    tilt.rotation.set(tiltX, 0, tiltZ);   // 各环不同倾角（主环微倾破对称）
    scene.add(tilt);
    const spinG = new THREE.Group();
    tilt.add(spinG);
    const arcLens = [0.3, 1.25, 2.2];   // 短钉 / 中段 / 长段
    const buckets = [[], [], []];
    const studs = [];
    let a = rand() * Math.PI * 2;
    const a0 = a;
    while (a - a0 < Math.PI * 2 - 0.3) {
      const b = rand() < 0.45 ? 0 : (rand() < 0.68 ? 2 : 1);   // 长短交替为主，中段少量
      const arc = arcLens[b] * (0.8 + rand() * 0.5);
      if (a - a0 + arc > Math.PI * 2) break;
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      buckets[b].push(dummy.matrix.clone())
      for (const aa of [a, a + arc]) {  // 段端符文钉（沿环面法向立起的刻度钉）
        dummy.position.set(Math.cos(aa) * radius, 0, Math.sin(aa) * radius);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1.6 + rand() * 1.2, 1);
        dummy.updateMatrix();
        studs.push({ m: dummy.matrix.clone() });
      }
      a += arc + 0.16 + rand() * 0.55;   // 段长/间隙节奏
    }
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    arcLens.forEach((arcLen, b) => {
      if (!buckets[b].length) return;
      const n = Math.max(8, Math.round(arcLen * 20));
      const geo = whiteAttr(new THREE.TorusGeometry(radius, tube, 6, n, arcLen).rotateX(Math.PI / 2));
      const im = new THREE.InstancedMesh(geo, arcMat, buckets[b].length);
      buckets[b].forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      spinG.add(im);
    });
    if (studs.length) {
      const sMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
      const sGeo = whiteAttr(new THREE.OctahedronGeometry(tube * 3.0, 0));
      const im = new THREE.InstancedMesh(sGeo, sMat, studs.length);
      studs.forEach((it, i) => {
        im.setMatrixAt(i, it.m);
        im.setColorAt(i, new THREE.Color(hdr[0] * 1.6, hdr[1] * 1.6, hdr[2] * 1.6));
      });
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      spinG.add(im);
    }
    tickers.push((dt) => { spinG.rotation.y += spin * dt; });   // 反向慢旋
    if (withStones) makeFloatStones(spinG, radius, tube);
    return spinG;
  }
  /* 主环浮石：位移岩 + 自身微光环 torus，随环公转 + 各自沉浮（v3 ×1.5 放大、光环加粗提亮） */
  const haloStones = [];
  function makeFloatStones(spinG, radius, tube) {
    const stoneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.4, 2.1) });
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.55, 1.9, 1.6), transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6 + rand() * 0.3;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      const r = 0.42 + rand() * 0.33;                       // v3 ×1.5
      const rock = new THREE.Mesh(displacedChunk(new THREE.IcosahedronGeometry(r, 1), 0.3, rand() * 10), stoneMat);
      rock.rotation.y = rand() * 6;
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(r * 1.6, 0.035, 6, 26).rotateX(Math.PI / 2 + (rand() - 0.5) * 0.6),
        haloMat
      );
      g.add(rock, halo);
      spinG.add(g);
      haloStones.push({ g, y0: -(tube + r + 0.34), ph: rand() * Math.PI * 2 });
    }
    tickers.push((dt, t) => {
      for (const st of haloStones) st.g.position.y = st.y0 + Math.sin(t * 0.7 + st.ph) * 0.2;
    });
  }
  /* 主环 v3 转暖金（浮石保持青绿对比） */
  const ring1 = makeRuneRing({ radius: 11, tube: 0.16, y: 3.2, hdr: [2.7, 1.85, 0.65], tiltX: 0.1, tiltZ: -0.06, spin: 0.1, withStones: true });
  makeRuneRing({ radius: 13.8, tube: 0.13, y: 7.6, hdr: [2.6, 1.8, 0.8], tiltX: -0.08, tiltZ: 0.12, spin: -0.065, withStones: false });
  makeRuneRing({ radius: 8.6, tube: 0.11, y: -2.8, hdr: [0.9, 1.5, 2.6], tiltX: 0.14, tiltZ: 0.05, spin: 0.045, withStones: false });

  /* ---------- 6. 卫星岛 ×6：位移岩 + 草顶 + 拱窗小屋/垂树；2 座垂瀑；主岛间石拱桥 ---------- */
  const CLOUD_TOP = -14.4;
  const isleWinBatches = [];   // 各岛拱窗局部池（等 winGeo 建好后统一落地，挂到各岛组随岛沉浮）
  function makeIsle({ ang, dist, baseY, s, kind, hasFall, synced }) {
    const g = new THREE.Group();
    g.position.set(Math.cos(ang) * dist, baseY, Math.sin(ang) * dist);
    g.rotation.y = rand() * Math.PI * 2;
    scene.add(g);
    /* 岩体：三层小号位移岩 merge（v3 沉积色带 + 位移 +21%） */
    const parts = [];
    const RL = [
      [s * 1.05, s * 0.8, s * 0.9, -s * 0.9],
      [s * 0.85, s * 0.5, s * 0.9, -s * 1.8],
      [s * 0.55, s * 0.05, s * 1.0, -s * 2.8],
    ];
    RL.forEach((L, i) => {
      const geo = displaceRock(new THREE.CylinderGeometry(L[0], L[1], L[2], 12, 4), { amp: 0.17, bump: 0.095, phase: i * 2.4 + ang });
      parts.push(strataPaint(geo.translate(0, L[3] + L[2] / 2, 0), s * 0.5 + 0.3));
    });
    /* 草顶 + 檐土 */
    parts.push(colored(new THREE.CylinderGeometry(s * 1.12, s * 1.02, s * 0.26, 12), vary(0x5f8a5a, 0.06)).translate(0, s * 0.13, 0));
    parts.push(colored(new THREE.CylinderGeometry(s * 1.14, s * 1.1, s * 0.1, 12), vary(0x6b5a50, 0.04)).translate(0, s * 0.3, 0));
    /* 垂树：2-3 层锥 + 球冠（入 parts 一起 merge） */
    function tree(x, z, ts) {
      parts.push(colored(new THREE.CylinderGeometry(0.05 * ts, 0.08 * ts, 0.4 * ts, 5), vary(0x4a3a30, 0.03)).translate(x, s * 0.35 + 0.2 * ts, z));
      parts.push(P(GEO.cone6, vary(0x3f6b4f, 0.05), x, s * 0.35 + 0.62 * ts, z, { sx: 0.4 * ts, sy: 0.55 * ts, sz: 0.4 * ts }));
      parts.push(P(GEO.cone6, vary(0x4a7a5c, 0.05), x, s * 0.35 + 0.95 * ts, z, { sx: 0.3 * ts, sy: 0.45 * ts, sz: 0.3 * ts }));
      parts.push(P(GEO.sph, vary(0x5a8a62, 0.05), x, s * 0.35 + 1.22 * ts, z, { sx: 0.2 * ts, sy: 0.16 * ts, sz: 0.2 * ts }));
    }
    if (kind.includes('tree')) tree(s * 0.5, -s * 0.3, s);
    if (kind === 'trees') { tree(-s * 0.5, s * 0.1, s * 0.85); tree(s * 0.15, s * 0.5, s * 0.7); }
    /* 岛体 merge：岩层已逐面非索引化，其余部件统一 toNonIndexed 再合并（索引混用会 merge 失败） */
    const isle = new THREE.Mesh(
      mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))),
      toonVC
    );
    isle.castShadow = isle.receiveShadow = true;
    g.add(isle);
    addOutline(isle, 0.035);

    /* 岛内小屋（带拱窗）：窗入岛局部池，随岛沉浮不脱节 */
    const localWins = [];
    if (kind.includes('tower') || kind.includes('house')) {
      const pm = new THREE.Matrix4().makeTranslation(0, s * 0.35, 0);
      const b = makeBuilding(s * 0.62, pm, { maxLayers: 2, tall: kind.includes('tower') }, localWins);
      g.add(b);
    }
    if (kind === 'tree+house') {
      const pm2 = new THREE.Matrix4().makeTranslation(s * 0.75, s * 0.35, s * 0.45);
      const b2 = makeBuilding(s * 0.5, pm2, { maxLayers: 1 }, localWins);
      g.add(b2);
    }
    if (localWins.length) isleWinBatches.push({ list: localWins, parent: g });
    /* 垂瀑：弯曲缎带（顶点色上亮下透，加法混合） + 云面雾斑 */
    if (hasFall) {
      const fall = baseY + 0.2 - CLOUD_TOP;
      const out = new THREE.Vector3(Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y));  // 岛局部 +x 方向的世界向量
      const wPos = g.position;
      for (let ri = 0; ri < 2; ri++) {
        const p0 = new THREE.Vector3(s * 1.0, 0, (ri - 0.5) * 0.14 * s);
        const p1 = new THREE.Vector3(s * 1.45, -fall * 0.5, (ri - 0.5) * 0.3 * s);
        const p2 = new THREE.Vector3(s * 1.7, -fall, (ri - 0.5) * 0.5 * s);
        g.add(makeRibbon(new THREE.QuadraticBezierCurve3(p0, p1, p2), 0.22 * s, 0.12 * s));   // v3 宽 ×1.3
      }
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xbfe0ff, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      mist.position.set(
        wPos.x + out.x * s * 1.7, CLOUD_TOP + 0.6, wPos.z + out.z * s * 1.7
      );
      mist.scale.set(2.6 * s, 1.2 * s, 1);
      scene.add(mist);
      tickers.push((dt, t) => { mist.material.opacity = 0.3 + 0.14 * Math.sin(t * 1.3 + ang); });
    }
    /* 沉浮：桥接岛与主城同步（石拱桥两端不脱开），其余岛错相位 */
    if (synced) {
      tickers.push((dt, t) => { g.position.y = baseY + Math.sin(t * 0.22 + 1.0) * 0.15; });
    } else {
      floaters.push({ g, baseY, ph: rand() * Math.PI * 2, amp: 0.4 + rand() * 0.28, sp: 0.4 + rand() * 0.25 });
    }
    return g;
  }
  /* 垂瀑缎带：自定义 BufferGeometry，顶点色沿程衰减（加法混合 → 底端渐透明） */
  function makeRibbon(curve, w0, w1) {
    const SEGS = 14;
    const pos = [], col = [], idx = [];
    const p0 = curve.v0, p2 = curve.v2;
    const side = new THREE.Vector3().subVectors(p2, p0).cross(new THREE.Vector3(0, 1, 0)).normalize();
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      const c = curve.getPoint(t);
      const w = THREE.MathUtils.lerp(w0, w1, t);
      const f = Math.pow(1 - t, 1.6);       // 上亮下透
      const r = 0.06 + 0.8 * f, gg = 0.08 + 0.95 * f, b = 0.1 + 1.1 * f;
      pos.push(c.x - side.x * w, c.y, c.z - side.z * w, c.x + side.x * w, c.y, c.z + side.z * w);
      col.push(r, gg, b, r, gg, b);
      if (i < SEGS) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    return new THREE.Mesh(geo, mat);
  }
  const floaters = [];
  /* [方位角, 距主岛心, 基准高度, 体量, 内容, 瀑布, 桥接同步] —— 手工布点避免均匀对称。
     v3：0 号桥接岛微升微移（默认近景机位下仍入画），5 号浮岛外推（避免近景遮挡） */
  const ISLES = [
    [0.55, 17.5, -1.4, 1.0, 'tower+tree', true, true],
    [2.20, 20, 2.5, 1.3, 'tower', false, false],
    [3.60, 14, -6.0, 0.8, 'trees', false, false],
    [4.60, 22, -1.0, 1.15, 'tower', true, false],
    [5.50, 18, 4.0, 0.9, 'tree+house', false, false],
    [1.35, 29, 6.5, 0.7, 'tree', false, false],
  ];
  const isleGroups = ISLES.map((it) => makeIsle({
    ang: it[0], dist: it[1], baseY: it[2], s: it[3], kind: it[4], hasFall: it[5], synced: it[6],
  }));
  tickers.push((dt, t) => {
    for (const f of floaters) f.g.position.y = f.baseY + Math.sin(t * f.sp + f.ph) * f.amp;
  });

  /* 石拱桥：主岛 ↔ 最近卫星岛（0 号）；桥面压扁管 + 双下拱 + 栏杆柱 InstancedMesh */
  {
    const bridgeG = new THREE.Group();
    scene.add(bridgeG);
    tickers.push((dt, t) => { bridgeG.position.y = Math.sin(t * 0.22 + 1.0) * 0.15; });  // 与主城沉浮严格同步
    const isle0 = ISLES[0];
    const iPos = new THREE.Vector3(Math.cos(isle0[0]) * isle0[1], isle0[2], Math.sin(isle0[0]) * isle0[1]);
    const dir = new THREE.Vector3(iPos.x, 0, iPos.z).normalize();
    const A = dir.clone().multiplyScalar(6.55).setY(1.05);
    const B = iPos.clone().sub(dir.clone().multiplyScalar(1.15 * isle0[3])).setY(isle0[2] + 0.5);
    const mid = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.35, 0));
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    const parts = [];
    /* 桥面：压扁管（y 压 0.32 成石板） */
    const deck = new THREE.TubeGeometry(curve, 24, 0.55, 10, false);
    deck.computeBoundingBox();
    {
      const posA = deck.attributes.position;
      const minYd = deck.boundingBox.min.y, maxYd = deck.boundingBox.max.y;
      for (let i = 0; i < posA.count; i++) {
        const ty = (posA.getY(i) - minYd) / Math.max(maxYd - minYd, 1e-4);
        const sy = THREE.MathUtils.lerp(1.06, 0.94, ty) * 0.32;
        posA.setY(i, (posA.getY(i) - (minYd + maxYd) / 2) * sy + (minYd + maxYd) / 2);
      }
      deck.computeVertexNormals();
    }
    parts.push(colored(deck, vary(0x8a7f76, 0.03)));
    /* 双下拱（承重弧） + 端头桥堡 */
    for (const off of [-0.16, 0.16]) {
      const nrm = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(off);
      const c2 = new THREE.QuadraticBezierCurve3(
        A.clone().add(nrm).add(new THREE.Vector3(0, -0.42, 0)),
        mid.clone().add(nrm).add(new THREE.Vector3(0, -1.15, 0)),
        B.clone().add(nrm).add(new THREE.Vector3(0, -0.42, 0))
      );
      parts.push(colored(taperTube(new THREE.TubeGeometry(c2, 16, 0.085, 6, false), 1, 0.7), vary(0x766a63, 0.03)));
    }
    for (const P3 of [A, B]) {
      parts.push(P(GEO.box, vary(0x6f645e, 0.03), P3.x, P3.y - 0.1, P3.z, { sx: 0.7, sy: 0.5, sz: 0.7 }));
    }
    const bridge = new THREE.Mesh(mergeGeometries(parts), toonVC);
    bridge.castShadow = bridge.receiveShadow = true;
    bridgeG.add(bridge);
    addOutline(bridge, 0.03);
    /* 栏杆柱：沿桥两侧 */
    const posts = [];
    const nrm = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const c = curve.getPoint(t);
      for (const sgn of [-1, 1]) {
        const p = c.clone().add(nrm.clone().multiplyScalar(sgn * 0.44)).add(new THREE.Vector3(0, 0.28, 0));
        dummy.position.copy(p);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 0.56 / 0.5, 1);
        dummy.updateMatrix();
        posts.push(dummy.matrix.clone());
      }
    }
    const postGeo = new THREE.BoxGeometry(0.055, 0.5, 0.055);
    const pim = new THREE.InstancedMesh(postGeo, toon(0x9a8d80), posts.length);
    posts.forEach((m, i) => pim.setMatrixAt(i, m));
    pim.instanceMatrix.needsUpdate = true;
    pim.frustumCulled = false;
    pim.castShadow = true;
    bridgeG.add(pim);
  }

  /* ---------- 7. 云海：三层团簇（每团 4-8 球 InstancedMesh），层速不同，云下更暗 ---------- */
  function cloudLayer({ y, n, rMin, rMax, sMin, sMax, tint, speed, avoidAz }) {
    const g = new THREE.Group();
    scene.add(g);
    const list = [];
    for (let i = 0; i < n; i++) {
      const ca = rand() * Math.PI * 2;
      if (avoidAz !== undefined && angDist(ca, avoidAz) < 0.6) continue;   // v3：避开默认视线方位，不遮岩锥
      const cr = Math.sqrt(THREE.MathUtils.lerp(rMin * rMin, rMax * rMax, rand()));
      const cx = Math.cos(ca) * cr, cz = Math.sin(ca) * cr;
      const k = 4 + Math.floor(rand() * 5);           // 每团 4-8 球
      const cs = sMin + rand() * (sMax - sMin);
      for (let j = 0; j < k; j++) {
        const sSz = cs * (0.5 + rand() * 0.8);
        dummy.position.set(cx + (rand() - 0.5) * cs * 1.7, y + (rand() - 0.35) * cs * 0.3, cz + (rand() - 0.5) * cs * 1.7);
        dummy.rotation.set(0, rand() * 6.28, 0);
        dummy.scale.set(sSz, sSz * (0.36 + rand() * 0.2), sSz * (0.75 + rand() * 0.5));   // 扁率随机
        dummy.updateMatrix();
        list.push({ m: dummy.matrix.clone(), c: new THREE.Color(tint).multiplyScalar(0.82 + rand() * 0.3) });
      }
    }
    const geo = whiteAttr(new THREE.SphereGeometry(1, 12, 9));
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, vertexColors: true });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    g.add(im);
    tickers.push((dt) => { g.rotation.y += speed * dt; });   // 层速不同（含反向）
  }
  cloudLayer({ y: -14.6, n: 13, rMin: 6, rMax: 55, sMin: 3.2, sMax: 6.2, tint: 0xf0dcd2, speed: 0.004 });   // 上层：暖白粉顶光，连成海
  cloudLayer({ y: -19.6, n: 10, rMin: 10, rMax: 68, sMin: 4.5, sMax: 8.5, tint: 0x565c7d, speed: 0.0026 }); // 下层：压暗压深
  /* 贴岛底碎云：v3 下移收小 + 避开默认机位方位（atan2(29.2, 23.2) ≈ 0.9），岩体层理不被遮 */
  cloudLayer({ y: -12.9, n: 8, rMin: 8, rMax: 26, sMin: 1.6, sMax: 2.6, tint: 0xb9bfd6, speed: -0.006, avoidAz: 0.9 });

  /* 主城整体极缓沉浮（幅度刻意小于小岛，稳） */
  tickers.push((dt, t) => { worldBob.position.y = Math.sin(t * 0.22 + 1.0) * 0.15; });

  /* ---------- 全局 InstancedMesh 落地（窗 / 栏杆柱 / 垛口 / 灯柱 / 碎石已在岩体段落建） ---------- */
  const winGeo = (() => {   // 拱形窗：矩形 + 半圆顶（方块+半圆柱顶的几何化转写）
    const w = 0.17, hh = 0.3, r = w / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-r, 0);
    sh.lineTo(-r, hh - r);
    sh.absarc(0, hh - r, r, Math.PI, 0, true);
    sh.lineTo(r, 0);
    sh.closePath();
    return whiteAttr(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 6 }));
  })();
  /* v3 拱窗石框：外拱 − 内拱的环带描边（比窗大一圈，浅色石色 + 微自发光），
     与窗共用同一实例位形列表 —— 一份矩阵两份几何，远看读成「带框拱窗」而非光点 */
  const frameGeo = (() => {
    const w = 0.17, hh = 0.3, r = w / 2;
    const R = 0.19, top = 0.44, base = -0.05;   // 外拱：半宽 ×2.2、总高 ×1.47、下探出门槛
    const outer = new THREE.Shape();
    outer.moveTo(-R, base);
    outer.lineTo(-R, top - R);
    outer.absarc(0, top - R, R, Math.PI, 0, true);
    outer.lineTo(R, base);
    outer.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-r, 0);
    hole.lineTo(-r, hh - r);
    hole.absarc(0, hh - r, r, Math.PI, 0, true);
    hole.lineTo(r, 0);
    hole.closePath();
    outer.holes.push(hole);
    return whiteAttr(new THREE.ExtrudeGeometry(outer, { depth: 0.048, bevelEnabled: false, curveSegments: 6 }));
  })();
  const frameMat = new THREE.MeshToonMaterial({
    color: 0xe0d0a8, gradientMap, emissive: 0x6b5330, emissiveIntensity: 1.35,
  });
  /* 窗后暗色垫板：亮窗与浅框之间的暗环 —— 无论奶油墙还是赤陶墙，带框拱窗都读得出 */
  const backGeo = (() => {
    const R = 0.145, top = 0.365, base = -0.03;
    const sh = new THREE.Shape();
    sh.moveTo(-R, base);
    sh.lineTo(-R, top - R);
    sh.absarc(0, top - R, R, Math.PI, 0, true);
    sh.lineTo(R, base);
    sh.closePath();
    return whiteAttr(new THREE.ExtrudeGeometry(sh, { depth: 0.036, bevelEnabled: false, curveSegments: 6 }));
  })();
  const backMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  buildInstanced(backGeo, backMat, winList, worldBob);
  buildInstanced(winGeo, winMat, winList, worldBob, { colors: true });
  buildInstanced(frameGeo, frameMat, winList, worldBob);
  for (const batch of isleWinBatches) {
    buildInstanced(backGeo, backMat, batch.list, batch.parent);
    buildInstanced(winGeo, winMat, batch.list, batch.parent, { colors: true });
    buildInstanced(frameGeo, frameMat, batch.list, batch.parent);
  }
  buildInstanced(new THREE.BoxGeometry(0.035, 0.5, 0.035), toon(0xd8cfbf), postList, worldBob, { shadow: true });
  buildInstanced(new THREE.BoxGeometry(0.5, 0.42, 0.3), toon(0x8a7f76), merlonList, worldBob, { shadow: true });
  { /* 灯柱：杆 + 暖光小球头（两套 InstancedMesh 同位形） */
    const poleList = lampEntries.map((e) => matAt(e.x, e.y + 0.31, e.z, 0));
    buildInstanced(new THREE.CylinderGeometry(0.035, 0.05, 0.62, 6), toon(0x3a3f4a), poleList, worldBob, { shadow: true });
    const headList = lampEntries.map((e) => matAt(e.x, e.y + 0.66, e.z, 0));
    buildInstanced(new THREE.SphereGeometry(0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.6) }), headList, worldBob);
  }

  /* ---------- 后期：UnrealBloom（阈值卡在 1.0，只让窗/晶体/光环过曝） ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.44, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- 机位补间飞行（easeInOutQuad） ---------- */
  let fly = null;
  function flyTo(v, dur = 1.7) {
    fly = {
      t: 0, dur,
      p0: camera.position.clone(), p1: new THREE.Vector3(...v.pos),
      t0: controls.target.clone(), t1: new THREE.Vector3(...v.tgt),
    };
  }

  /* ---------- resize ---------- */
  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let rafId = 0;
  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (fly) {
      fly.t += dt / fly.dur;
      const k = fly.t >= 1 ? 1 : (fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2);
      camera.position.lerpVectors(fly.p0, fly.p1, k);
      controls.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.t >= 1) fly = null;
    }
    for (const fn of tickers) fn(dt, t);
    controls.update();
    renderer.info.reset();   // 帧首重置 → render 后读到的是整帧（含所有 pass）的真实总量
    composer.render();
  }
  rafId = requestAnimationFrame(tick);

  /* 调试/验收句柄（与站点 window.__bgm 同约定） */
  window.__skyCity = {
    camera, controls, scene,
    tri: () => renderer.info.render.triangles,
    calls: () => renderer.info.render.calls,
  };

  /* ---------- teardown：StrictMode 双挂载与路由切换不漏 ---------- */
  const TEX_SLOTS = ['map', 'emissiveMap', 'alphaMap'];
  function disposeMaterial(m) {
    for (const slot of TEX_SLOTS) if (m[slot]) m[slot].dispose();
    m.dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    delete window.__skyCity;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    controls.dispose();
    composer.dispose();

    const seenGeo = new Set();
    scene.traverse((obj) => {
      if (obj.isInstancedMesh) obj.dispose();      // 释放 instanceMatrix / instanceColor
      if (obj.geometry && !seenGeo.has(obj.geometry)) { seenGeo.add(obj.geometry); obj.geometry.dispose(); }
      if (obj.material) {
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) disposeMaterial(m);
      }
    });
    gradientMap.dispose();

    renderer.dispose();
    renderer.forceContextLoss();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return {
    setView(name) {
      const v = VIEWS[name];
      if (!v || disposed) return;
      controls.autoRotate = false;
      flyTo(v);
    },
    setOrbit(on) {
      if (disposed) return;
      controls.autoRotate = !!on;
    },
    dispose,
  };
}
