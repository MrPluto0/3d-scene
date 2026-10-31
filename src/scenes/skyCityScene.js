// src/scenes/skyCityScene.js — 天空之城 v4：正午亮蓝云海浮空城（对照参考图完全重做）。
// 纯 three.js 代码几何（无 GLB / 无新依赖）。
//   · 天空：高饱和钴蓝→地平线浅白蓝渐变内壁球 + 暖白日斑；
//   · 云海：柔和圆形渐变纹理 Points 大点阵铺满岛下（一档 draw call），
//     天上另飘 6 朵大积云（sprite 簇）+ 瀑布落点弥漫雾斑；
//   · 主岛：倒水滴形岩体（Lathe 轮廓 + 层理色带 + 角向扰动），顶面草甸，
//     岩缘垂藤 + 悬挂根系；
//   · 建筑群：白/米白塔身 + 金色穹顶点缀、拱窗（暗蓝窗洞 + 米白石拱框）、
//     层叠塔身；中央大塔顶部一棵大树（干 + 三层球冠）；
//   · 瀑布：4 道半透明白缎带从岛缘坠入云海，落点雾斑 + 白色粒子溅沫；
//   · 桥：右侧长多拱石桥（桥面 + 连续拱洞 InstancedMesh）连向金色圆塔，
//     左后细长水晶尖塔群（半透明蓝白锥体）；
//   · 前景：左下角草坡（位移绿丘 + 白粉小花 InstancedMesh）。
// 光照：暖白正午 DirectionalLight + 蓝天 HemisphereLight，明亮通透（绝不暮色）。
// 接口：initSkyCity(container) → { setView(name), setOrbit(on), dispose() }。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* 四个机位预设：全景 / 瀑布 / 桥塔 / 云海 */
const VIEWS = {
  iso:    { pos: [23, 9.5, 34],  tgt: [1.5, 1.0, 0] },
  fall:   { pos: [7, -1.5, 18],  tgt: [-2, -4, 0] },
  bridge: { pos: [26, 7, 10],    tgt: [14, 2, 0] },
  cloud:  { pos: [2, -16, 40],   tgt: [0, -4, 0] },
};

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function initSkyCity(container) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  let disposed = false;
  const rand = mulberry32(20261031);
  const tickers = [];
  const dummy = new THREE.Object3D();

  /* ---------- renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 明亮天蓝雾（极淡，只拉纵深不变暗）
  scene.fog = new THREE.FogExp2(0xd4ecff, 0.0011);

  const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 900);
  camera.position.set(...VIEWS.iso.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...VIEWS.iso.tgt);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 6;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.autoRotateSpeed = 0.45;

  /* ---------- 灯光：正午暖白主光 + 蓝天环境光，明亮通透 ---------- */
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.5);   // 暖白正午（左上前，参照图主光向）
  sun.position.set(-42, 62, 33);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 44;  sun.shadow.camera.bottom = -36;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.15;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x8fb573, 0.55); // 蓝天 + 绿地反
  scene.add(hemi);

  const fill = new THREE.DirectionalLight(0xbfd9ff, 0.42);  // 阴影面冷补
  fill.position.set(-30, 20, 30);
  scene.add(fill);

  /* ---------- 材质底座：亮调 3 级 toon ---------- */
  const gradientMap = (() => {
    const tex = new THREE.DataTexture(new Uint8Array([128, 205, 255]), 3, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  })();
  const toon = (color, opt = {}) =>
    new THREE.MeshToonMaterial({ color, gradientMap, ...opt });
  const toonVC = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, vertexColors: true });

  /* ---------- 通用工具 ---------- */
  function colored(geo, color) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  const whiteAttr = (geo) => colored(geo, new THREE.Color(1, 1, 1));
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cone6: new THREE.ConeGeometry(1, 1, 6),
    cone12: new THREE.ConeGeometry(1, 1, 12),
    cone4: new THREE.ConeGeometry(1, 1, 4),
    sph: new THREE.SphereGeometry(1, 10, 7),
    hemi: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  };
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
  function vary(hex, k = 0.05) {
    const c = new THREE.Color(hex);
    c.offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.08, (rand() - 0.5) * k);
    return c;
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
    im.frustumCulled = false;
    im.castShadow = shadow;
    im.receiveShadow = shadow;
    parent.add(im);
    return im;
  }

  /* ---------- 天空：亮蓝渐变（天顶钴蓝 → 地平线浅白蓝） ---------- */
  function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 1024;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0.00, '#08287a');   // 天顶深钴蓝（高饱和）
    grad.addColorStop(0.28, '#0e46ad');
    grad.addColorStop(0.50, '#1f6cd0');
    grad.addColorStop(0.68, '#5aa6ea');
    grad.addColorStop(0.82, '#a8d4f5');
    grad.addColorStop(0.93, '#d5ebfb');
    grad.addColorStop(1.00, '#ecf5fd');   // 地平线浅白蓝
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

  /* 柔软圆形渐变纹理（云团 / 雾斑 / 日斑共用） */
  function makePuffTexture(sharp = 0.4) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(sharp, 'rgba(255,255,255,0.55)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const puffTex = makePuffTexture(0.45);
  const glowTex = makePuffTexture(0.3);
  const discTex = (() => {   /* 日盘：实心圆 + 锐边 */
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.55, 'rgba(255,255,255,1)');
    rg.addColorStop(0.72, 'rgba(255,250,225,0.65)');
    rg.addColorStop(1, 'rgba(255,250,225,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  { /* 太阳：左上实心日盘（普通混合，锐利）+ 小柔晕 */
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTex, color: 0xffffff, transparent: true, opacity: 1,
      depthWrite: false, fog: false,
    }));
    sunDisc.position.set(-169, 52, -103);
    sunDisc.scale.set(55, 55, 1);
    scene.add(sunDisc);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff3d0, transparent: true, opacity: 0.25,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sunGlow.position.set(-169, 52, -103);
    sunGlow.scale.set(130, 130, 1);
    scene.add(sunGlow);
  }

  /* ---------- 云：岛下云海（Points 大点阵）+ 天上飘的大积云（sprite 簇） ---------- */
  const CLOUD_TOP = -13.5;    // 云海顶面
  { /* 云海：~900 个柔圆点铺满岛下，一层 draw call；两层色（顶亮白 / 下天蓝灰） */
    function cloudSeaLayer(n, y, spread, size0, size1, color, op, holeR = 0) {
      const pos = new Float32Array(n * 3);
      const c = new THREE.Color(color);
      let i = 0, guard = 0;
      while (i < n && guard++ < n * 8) {
        const a = rand() * Math.PI * 2;
        const r = holeR + Math.sqrt(rand()) * spread;
        if (r < holeR) continue;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = y + (rand() - 0.4) * 2.2;
        pos[i * 3 + 2] = Math.sin(a) * r;
        i++;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        map: puffTex, color: c, size: (size0 + size1) / 2, transparent: true,
        opacity: op, depthWrite: false, fog: false,
        blending: THREE.NormalBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      tickers.push((dt) => { pts.rotation.y += 0.0035 * dt; });
      return pts;
    }
    cloudSeaLayer(540, CLOUD_TOP, 62, 10, 16, 0xffffff, 0.96, 11);      // 云海顶：亮白（岛下留洞露岩）
    cloudSeaLayer(340, CLOUD_TOP - 3.4, 74, 11, 17, 0xd8ecfa, 0.9, 8); // 云海中：白偏天蓝
    cloudSeaLayer(220, CLOUD_TOP - 7.5, 88, 13, 19, 0xb4d6ee, 0.85);   // 云海底：蓝灰
  }
  { /* 天上飘的大积云：8 朵，各 14-22 个 sprite 团簇（亮白顶 + 淡蓝底）+ 左右两朵近景大积云 */
    function cumulus(cx, cy, cz, base) {
      const g = new THREE.Group();
      g.position.set(cx, cy, cz);
      scene.add(g);
      const k = 14 + Math.floor(rand() * 9);
      for (let j = 0; j < k; j++) {
        const s = base * (0.4 + rand() * 0.85);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: puffTex, transparent: true, depthWrite: false, fog: false,
          color: j % 3 === 0 ? 0xe2edfb : 0xffffff,
          opacity: 0.85 + rand() * 0.14,
        }));
        sp.position.set(
          (rand() - 0.5) * base * 2.3,
          (rand() - 0.2) * base * 0.6,
          (rand() - 0.5) * base * 1.7
        );
        sp.scale.set(s, s * (0.55 + rand() * 0.3), 1);
        g.add(sp);
      }
      tickers.push((dt) => { g.position.x += dt * 0.12; if (g.position.x > 220) g.position.x = -220; });
    }
    /* 左右两朵近景大积云（参照图：左右中景各一大团；避开金塔/尖塔视线走廊） */
    cumulus(-40, -4, 26, 18);
    cumulus(48, -8, -18, 21);
    cumulus(34, 9, -42, 14);
    cumulus(-44, 10, -24, 13);
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2;
      const r = 70 + rand() * 90;
      cumulus(Math.cos(a) * r, -2 + rand() * 34, Math.sin(a) * r, 10 + rand() * 8);
    }
  }

  /* ---------- 主岛：倒水滴形岩体 ---------- */
  const islandRoot = new THREE.Group();
  scene.add(islandRoot);
  const worldBob = new THREE.Group();
  islandRoot.add(worldBob);
  const ISLE_R = 8.6;    // 顶面半径
  const ISLE_TOP = 0;    // 顶面 y

  { /* 岩体：Lathe 倒水滴轮廓 + 层理色带（逐三角形单色，带缘锐利）+ 角向扰动 */
    const profile = [];
    // 倒水滴：宽顶（0.05 深）→ 缓收 → 急收成尖
    const rings = [
      [1.00, 0.00], [1.01, -0.9], [0.97, -2.4], [0.88, -4.0], [0.77, -5.5],
      [0.64, -6.9], [0.52, -8.3], [0.40, -9.7], [0.30, -11.0], [0.21, -12.3],
      [0.13, -13.6], [0.06, -14.8], [0.015, -15.8], [0.0, -16.2],
    ];
    rings.forEach(([rr, yy]) => profile.push(new THREE.Vector2(rr * ISLE_R, yy)));
    let geo = new THREE.LatheGeometry(profile, 36);
    // 顶盖
    const cap = new THREE.CircleGeometry(ISLE_R, 36).rotateX(-Math.PI / 2);
    geo = mergeGeometries([geo.toNonIndexed(), cap.toNonIndexed()]);
    // 角向扰动：嶙峋层理（层间错相位）
    {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        if (r < 1e-4) continue;
        const th = Math.atan2(z, x);
        const v = Math.min(1, -y / 16.4);
        const n = Math.sin(th * 3 + y * 0.7) * 0.45
                + Math.sin(th * 5 + y * 1.3 + 2.0) * 0.30
                + Math.sin(th * 8 - y * 1.8) * 0.15
                + Math.cos(th * 2 - 1.0) * 0.22;
        const s = 1 + (0.10 + 0.05 * v) * n;
        x *= s; z *= s;
        y += Math.sin(th * 5 + y * 1.1) * 0.22;
        pos.setXYZ(i, x, y, z);
      }
      geo.computeVertexNormals();
    }
    // 层理色带：土黄 / 深棕 / 赭石 / 深褐交替（亮暗强对比，阴影面也读得出层理）
    const STRATA = [0xcc9c5c, 0x7c5228, 0xb5814a, 0x5f3d1e].map((h) => new THREE.Color(h));
    const nrm = geo.attributes.normal;
    const warmDir = new THREE.Vector3(0.58, 0.12, 0.62).normalize(); // 默认机位侧：烘焙暖补进顶点色
    {
      const pos = geo.attributes.position;
      const arr = new Float32Array(pos.count * 3);
      const tmp = new THREE.Color();
      const deep = new THREE.Color(0x6f4c2e);   // 深部（近尖端）略压暗，仍读作暖棕
      for (let f = 0; f < pos.count; f += 3) {
        const yC = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
        const band = Math.floor((-yC + 1) / 1.25);
        tmp.copy(STRATA[((band % 4) + 4) % 4]);
        tmp.lerp(deep, Math.min(1, -yC / 16.4) * 0.28);   // 越往尖端略深
        tmp.offsetHSL((rand() - 0.5) * 0.015, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.04);
        /* 面法线朝机位侧提亮：真实主光在岩体背后，阴面靠烘焙读出棕色层理而非死黑 */
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < 3; k++) { nx += nrm.getX(f + k); ny += nrm.getY(f + k); nz += nrm.getZ(f + k); }
        const lit = Math.max(0, (nx * warmDir.x + ny * warmDir.y + nz * warmDir.z) / 3);
        tmp.multiplyScalar(0.72 + 0.55 * lit);
        for (let k = 0; k < 3; k++) { arr[(f + k) * 3] = tmp.r; arr[(f + k) * 3 + 1] = tmp.g; arr[(f + k) * 3 + 2] = tmp.b; }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    const rock = new THREE.Mesh(geo, new THREE.MeshToonMaterial({
      color: 0xffffff, gradientMap, vertexColors: true,
      emissive: 0x7a5230, emissiveIntensity: 0.24,   // 暖棕自发光下限：阴面不死黑，读作棕岩
    }));
    rock.castShadow = rock.receiveShadow = true;
    worldBob.add(rock);

    /* 顶面草甸：绿色草帽（微扰动的浅圆盘）盖住岩顶 */
    const capGeo = new THREE.CylinderGeometry(ISLE_R * 0.995, ISLE_R * 0.97, 0.7, 36, 2);
    {
      const pos = capGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        if (r > 0.4) {
          const n = Math.sin(x * 1.4 + z * 0.9) * 0.14 + Math.cos(z * 1.7 - x * 0.6) * 0.12;
          pos.setY(i, pos.getY(i) + n * Math.min(1, r / ISLE_R));
        }
      }
      capGeo.computeVertexNormals();
    }
    const grass = new THREE.Mesh(capGeo, toon(0x6fae57));
    grass.position.y = ISLE_TOP + 0.35;
    grass.castShadow = grass.receiveShadow = true;
    worldBob.add(grass);

    /* 草甸垂边：岩顶外缘一圈外凸绿唇（草皮垂过岩缘，参照图草地包边） */
    {
      const lipGeo = new THREE.TorusGeometry(ISLE_R * 0.97, 0.5, 10, 44);
      lipGeo.rotateX(Math.PI / 2);
      const lp = lipGeo.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const x = lp.getX(i), z = lp.getZ(i);
        lp.setY(i, lp.getY(i) + Math.sin(x * 1.1 + z * 0.7) * 0.1);
      }
      lipGeo.computeVertexNormals();
      const lip = new THREE.Mesh(lipGeo, toon(0x63a44f));
      lip.position.y = ISLE_TOP + 0.28;
      lip.castShadow = lip.receiveShadow = true;
      worldBob.add(lip);
    }

    /* 浅色岩台：建筑群地基层（浅砂岩过渡，参照图塔下灰白岩台） */
    {
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(7.55, 7.9, 0.7, 36, 1), toon(0xd9cdb0));
      plat.position.y = ISLE_TOP + 0.53;
      plat.castShadow = plat.receiveShadow = true;
      worldBob.add(plat);
    }

    /* 岩缘垂藤 / 悬挂根系：贝塞尔管渐细 + 叶簇 */
    {
      const parts = [];
      const vineC = new THREE.Color(0x4f8a4a);
      const leafC = [new THREE.Color(0x74c46e), new THREE.Color(0x8ad67e), new THREE.Color(0x9adf76)];
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + rand() * 0.4;
        const yTop = -0.4 - rand() * 1.2;
        const r0 = ISLE_R * (0.97 + rand() * 0.1);
        const len = 2.4 + rand() * 3.6;
        const p0 = new THREE.Vector3(Math.cos(a) * r0, yTop, Math.sin(a) * r0);
        const p1 = new THREE.Vector3(Math.cos(a) * (r0 + 0.35), yTop - len * 0.5, Math.sin(a) * (r0 + 0.35));
        const p2 = new THREE.Vector3(Math.cos(a) * (r0 - 0.8), yTop - len, Math.sin(a) * (r0 - 0.8));
        const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
        const tube = new THREE.TubeGeometry(curve, 8, 0.11, 5, false);
        parts.push(colored(tube, vineC));
        for (let j = 0; j < 3; j++) {
          const p = curve.getPoint(0.3 + j * 0.25);
          const lr = 0.2 + rand() * 0.14;
          parts.push(P(GEO.sph, leafC[Math.floor(rand() * 3)], p.x, p.y, p.z, { sx: lr, sy: lr * 0.8, sz: lr }));
        }
      }
      const vines = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), toonVC);
      vines.castShadow = true;
      worldBob.add(vines);
    }
  }

  /* ---------- 岩缘灌木草丛（InstancedMesh 绿球簇） ---------- */
  {
    const list = [];
    const greens = [0x5da84f, 0x6fb85a, 0x82c465];
    for (let i = 0; i < 72; i++) {
      const a = rand() * Math.PI * 2;
      const r = ISLE_R * (0.82 + rand() * 0.17);   // 集中在岩缘一圈（草甸带，避开浅色岩台）
      const s = 0.38 + rand() * 0.55;
      dummy.position.set(Math.cos(a) * r, 0.55 + rand() * 0.22, Math.sin(a) * r);
      dummy.rotation.set(0, rand() * 6.28, 0);
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      list.push({ m: dummy.matrix.clone(), c: new THREE.Color(greens[Math.floor(rand() * 3)]) });
    }
    buildInstanced(whiteAttr(new THREE.SphereGeometry(1, 8, 6)), toon(0xffffff, { vertexColors: true }), list, worldBob, { shadow: true, colors: true });
  }

  /* ---------- 岛上树木（InstancedMesh：干 + 冠两层） ---------- */
  {
    const trunks = [], crowns = [];
    const crownGreens = [0x63b04e, 0x74bd58, 0x53a049, 0x8ac862];
    for (let i = 0; i < 22; i++) {
      const a = rand() * Math.PI * 2;
      const r = 3.4 + rand() * (ISLE_R - 4.0);       // 避开中心塔区
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 0.9 + rand() * 1.1;
      const cs = 0.55 + rand() * 0.6;
      dummy.position.set(x, 0.7 + h * 0.45, z);
      dummy.rotation.set(0, rand() * 6.28, 0);
      dummy.scale.set(0.14, h * 0.5, 0.14);
      dummy.updateMatrix();
      trunks.push(dummy.matrix.clone());
      dummy.position.set(x, 0.7 + h * 0.9, z);
      dummy.scale.set(cs, cs * (0.8 + rand() * 0.3), cs);
      dummy.updateMatrix();
      crowns.push({ m: dummy.matrix.clone(), c: new THREE.Color(crownGreens[Math.floor(rand() * 4)]) });
    }
    buildInstanced(new THREE.CylinderGeometry(0.5, 0.7, 2, 5), toon(0x6b4a34), trunks, worldBob, { shadow: true });
    buildInstanced(whiteAttr(new THREE.SphereGeometry(1, 8, 6)), toon(0xffffff, { vertexColors: true }), crowns, worldBob, { shadow: true, colors: true });
  }

  /* ---------- 窗实例池 ---------- */
  const winList = [];       // {m, c}
  const GOLD = 0xe8a52a;
  function pushWin(pm, x, y, z, yaw, sx, sy, color) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, 1);
    dummy.updateMatrix();
    winList.push({ m: pm.clone().multiply(dummy.matrix), c: color || new THREE.Color(0x2a4a72) });
  }

  /* ---------- 建筑生成器：白/米白塔身 + 金穹顶点缀 + 拱窗 ---------- */
  const WALLS = [0xf7f3ea, 0xefe9dc, 0xf3ead8, 0xe8e2d2];
  const TRIM = 0xfffdf6;
  function makeBuilding(s, pm) {
    const parts = [];
    const wallC = vary(WALLS[Math.floor(rand() * WALLS.length)], 0.03);
    const trimC = vary(TRIM, 0.03);
    const goldC = vary(GOLD, 0.06);
    const layers = 1 + Math.floor(rand() * 3);
    const w = (0.8 + rand() * 0.5) * s, d = (0.8 + rand() * 0.5) * s;
    let y = 0; const dims = [];
    let wi = w, di = d;
    for (let li = 0; li < layers; li++) {
      const h = (0.55 + rand() * 0.5) * s;
      parts.push(P(GEO.box, wallC, 0, y + h / 2, 0, { sx: wi, sy: h, sz: di }));
      parts.push(P(GEO.box, trimC, 0, y + h + 0.02 * s, 0, { sx: wi + 0.1 * s, sy: 0.07 * s, sz: di + 0.1 * s }));
      dims.push({ y0: y, h, w: wi, d: di });
      y += h + 0.05 * s;
      wi *= 0.9 + rand() * 0.06;
      di *= 0.9 + rand() * 0.06;
    }
    const top = dims[dims.length - 1];
    const topY = y;
    /* 拱窗：暗蓝窗洞（正午下的深色玻璃），四面 */
    for (const L of dims) {
      for (let fi = 0; fi < 4; fi++) {
        const yaw = fi * Math.PI / 2;
        const faceLen = fi % 2 === 0 ? L.w : L.d;
        const cols = faceLen > 0.95 * s ? 2 : 1;
        for (let ci = 0; ci < cols; ci++) {
          if (rand() < 0.25) continue;
          const off = cols === 1 ? 0 : (ci === 0 ? -1 : 1) * faceLen * 0.23;
          const sxw = s * (0.9 + rand() * 0.25);
          const syw = Math.min(s * (0.95 + rand() * 0.25), Math.max(0.5 * s, (L.h - 0.16 * s) / 0.3));
          const wy = L.y0 + Math.max(0.07 * s, (L.h - 0.3 * syw) * 0.5);
          const lx = fi % 2 === 0 ? off : (fi === 1 ? 1 : -1) * (L.w / 2 + 0.02);
          const lz = fi % 2 === 0 ? (fi === 0 ? 1 : -1) * (L.d / 2 + 0.02) : off;
          pushWin(pm, lx, wy, lz, yaw, sxw, syw);
        }
      }
    }
    /* 屋顶：金穹顶 / 白尖锥 / 露台 */
    const roofType = Math.floor(rand() * 3);
    const rh = (0.4 + rand() * 0.4) * s;
    if (roofType === 0) {
      parts.push(P(GEO.hemi, goldC, 0, topY, 0, { sx: top.w * 0.62, sy: rh, sz: top.d * 0.62 }));
      parts.push(P(GEO.sph, goldC, 0, topY + rh + 0.03 * s, 0, { sx: 0.05 * s, sy: 0.05 * s, sz: 0.05 * s }));
    } else if (roofType === 1) {
      parts.push(P(GEO.cone12, trimC, 0, topY + rh / 2, 0, { sx: top.w * 0.55, sy: rh, sz: top.d * 0.55 }));
      parts.push(P(GEO.sph, goldC, 0, topY + rh + 0.04 * s, 0, { sx: 0.05 * s, sy: 0.05 * s, sz: 0.05 * s }));
    } else {
      const pw = top.w / 2 + 0.05 * s, pdd = top.d / 2 + 0.05 * s, phh = 0.14 * s;
      parts.push(P(GEO.box, wallC, 0, topY + phh / 2, pdd, { sx: 2 * pw, sy: phh, sz: 0.05 * s }));
      parts.push(P(GEO.box, wallC, 0, topY + phh / 2, -pdd, { sx: 2 * pw, sy: phh, sz: 0.05 * s }));
      parts.push(P(GEO.box, wallC, pw, topY + phh / 2, 0, { sx: 0.05 * s, sy: phh, sz: 2 * pdd }));
      parts.push(P(GEO.box, wallC, -pw, topY + phh / 2, 0, { sx: 0.05 * s, sy: phh, sz: 2 * pdd }));
      parts.push(P(GEO.hemi, goldC, 0, topY + 0.02 * s, 0, { sx: 0.2 * s, sy: 0.14 * s, sz: 0.2 * s }));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), toonVC);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    pm.decompose(p, q, sc);
    mesh.position.copy(p);
    mesh.quaternion.copy(q);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  /* 建筑环布：外圈 / 中圈簇拥中央大塔（留默认机位视线口） */
  function ringPlace(n, r, y, sMin, sMax) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.2;
      if (Math.abs(((a - 0.75 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.35) continue; // 机位留口
      if (rand() < 0.08) continue;
      const s = sMin + rand() * (sMax - sMin);
      const pm = matAt(Math.cos(a) * r, y, Math.sin(a) * r, -a + Math.PI / 2 + (rand() - 0.5) * 0.4);
      worldBob.add(makeBuilding(s, pm));
    }
  }
  ringPlace(14, 6.6, 0.7, 0.95, 1.3);
  ringPlace(9, 4.6, 0.7, 1.0, 1.3);

  /* ---------- 中央大塔：层叠白塔身 + 拱窗列 + 金穹顶 + 塔顶大树 ---------- */
  const TOWER_TOP = 13.2;
  {
    const parts = [];
    const wallC = vary(0xf7f3ea, 0.02);
    const trimC = vary(TRIM, 0.02);
    const goldC = vary(GOLD, 0.05);
    const idPM = new THREE.Matrix4();
    /* 基座 + 塔身四级收分，每级环形平台 */
    const tiers = [
      [2.5, 2.2, 2.4], [2.2, 1.9, 2.4], [1.9, 1.6, 2.4], [1.6, 1.3, 2.4],
    ];
    let yb = 0.7;
    parts.push(P(new THREE.CylinderGeometry(2.8, 3.1, 1.4, 16), trimC, 0, yb + 0.7, 0));
    yb += 1.4;
    for (let i = 0; i < tiers.length; i++) {
      const [r0, r1, th] = tiers[i];
      parts.push(P(new THREE.CylinderGeometry(r1, r0, th, 16), wallC, 0, yb + th / 2, 0));
      /* 环形平台 + 檐口 */
      parts.push(P(new THREE.CylinderGeometry(r1 + 0.42, r1 + 0.26, 0.18, 16), trimC, 0, yb + th + 0.09, 0));
      /* 拱窗列：每级 6 扇 */
      const wf = 0.55;
      const wallR = THREE.MathUtils.lerp(r0, r1, wf) + 0.03;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + i * 0.26;
        pushWin(idPM, Math.cos(a) * wallR, yb + th * wf, Math.sin(a) * wallR, -a + Math.PI / 2, 1.5, 1.6);
      }
      yb += th + 0.18;
    }
    /* 顶段：小一圈塔身 + 金穹顶 */
    parts.push(P(new THREE.CylinderGeometry(1.0, 1.25, 1.8, 16), wallC, 0, yb + 0.9, 0));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.13;
      pushWin(idPM, Math.cos(a) * 1.12, yb + 0.9, Math.sin(a) * 1.12, -a + Math.PI / 2, 1.4, 1.5);
    }
    yb += 1.8;
    parts.push(P(GEO.hemi, goldC, 0, yb, 0, { sx: 1.3, sy: 0.95, sz: 1.3 }));
    parts.push(P(GEO.sph, goldC, 0, yb + 1.0, 0, { sx: 0.09, sy: 0.09, sz: 0.09 }));
    const tower = new THREE.Mesh(mergeGeometries(parts), toonVC);
    tower.castShadow = tower.receiveShadow = true;
    worldBob.add(tower);

    /* 塔顶大树：干 + 三层大球冠（参照图：塔顶长巨树） */
    const treeParts = [];
    treeParts.push(P(new THREE.CylinderGeometry(0.16, 0.3, 2.2, 7), new THREE.Color(0x6b4a34), 0, yb + 1.0, 0));
    const bigGreens = [0x5aab48, 0x6cbb55, 0x7ec95f, 0x8fd46a];
    treeParts.push(P(GEO.sph, vary(bigGreens[0], 0.04), 0, yb + 3.0, 0, { sx: 2.1, sy: 1.5, sz: 2.1 }));
    treeParts.push(P(GEO.sph, vary(bigGreens[1], 0.04), 1.1, yb + 3.8, 0.4, { sx: 1.2, sy: 0.9, sz: 1.2 }));
    treeParts.push(P(GEO.sph, vary(bigGreens[2], 0.04), -0.9, yb + 3.7, -0.5, { sx: 1.05, sy: 0.8, sz: 1.05 }));
    treeParts.push(P(GEO.sph, vary(bigGreens[3], 0.04), 0.3, yb + 4.5, -0.2, { sx: 0.95, sy: 0.75, sz: 0.95 }));
    const bigTree = new THREE.Mesh(mergeGeometries(treeParts), toonVC);
    bigTree.castShadow = true;
    worldBob.add(bigTree);
  }

  /* ---------- 窗落地：暗蓝窗洞 + 米白石拱框 ---------- */
  const winGeo = (() => {
    const w = 0.17, hh = 0.3, r = w / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-r, 0);
    sh.lineTo(-r, hh - r);
    sh.absarc(0, hh - r, r, Math.PI, 0, true);
    sh.lineTo(r, 0);
    sh.closePath();
    return whiteAttr(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 6 }));
  })();
  const frameGeo = (() => {
    const w = 0.17, hh = 0.3, r = w / 2;
    const R = 0.2, top = 0.45, base = -0.05;
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
  buildInstanced(frameGeo, toon(0xf3ecdc), winList, worldBob);
  buildInstanced(winGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), winList, worldBob, { colors: true });

  /* ---------- 瀑布：4 道白缎带从岛缘坠入云海 + 落点雾斑 ---------- */
  const FALLS = [
    { a: 0.35, w: 2.3 },   // 右前（近机位侧）
    { a: 0.95, w: 1.8 },   // 正对默认视线
    { a: 1.5,  w: 2.2 },   // 左前
    { a: 2.1,  w: 2.0 },   // 左缘（斜视补偿加宽）
    { a: 5.7,  w: 2.2 },   // 右缘
  ];
  /* 瀑布条纹纹理：半透白底 + 竖向白条纹（滚动时读出水流） */
  const fallTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(235,244,255,0.72)';
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 46; i++) {
      const x = rand() * 64, w = 2 + rand() * 5;
      g.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`;
      g.fillRect(x, 0, w, 256);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const fallMats = [];
  /* 岛体半径随高度（贴岩瀑布用）：倒水滴轮廓插值 × 角向扰动余量 */
  const RING_PROF = [
    [1.00, 0.00], [1.01, -0.9], [0.97, -2.4], [0.88, -4.0], [0.77, -5.5],
    [0.64, -6.9], [0.52, -8.3], [0.40, -9.7], [0.30, -11.0], [0.21, -12.3],
    [0.13, -13.6], [0.06, -14.8], [0.015, -15.8], [0.0, -16.2],
  ];
  function isleRadiusAt(y) {
    const yy = Math.max(-16.2, Math.min(0, y)) / ISLE_R * 0; // no-op guard
    const yv = Math.max(-16.2, Math.min(0, y));
    for (let i = 0; i < RING_PROF.length - 1; i++) {
      const [r1, y1] = RING_PROF[i], [r2, y2] = RING_PROF[i + 1];
      if (yv <= y1 && yv >= y2) {
        const t = (y1 - yv) / (y1 - y2 || 1e-4);
        return THREE.MathUtils.lerp(r1, r2, t) * ISLE_R * 1.09;
      }
    }
    return ISLE_R * 1.05;
  }
  function makeFall(ang, w) {
    const yEnd = CLOUD_TOP + 2.0;
    const SEGS = 12;
    const pos = [], col = [], idx = [], uvs = [];
    /* 贴岩路径：沿岛缘下行时跟随倒水滴轮廓外扩 0.35，岩面始终在瀑布背后 */
    const pts = [];
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      const y = 0.5 - t * (0.5 - yEnd);
      const r = (y >= 0 ? ISLE_R : isleRadiusAt(y)) + 0.55;
      const wob = Math.sin(t * 5 + ang * 3) * 0.32;
      pts.push(new THREE.Vector3(Math.cos(ang + wob * 0.06) * r, y, Math.sin(ang + wob * 0.06) * r));
    }
    const side = new THREE.Vector3().subVectors(pts[SEGS], pts[0]).cross(new THREE.Vector3(0, 1, 0)).normalize();
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      const c = pts[i];
      const ww = w * (0.8 + 0.55 * t);        // 越落越散
      pos.push(c.x - side.x * ww, c.y, c.z - side.z * ww, c.x + side.x * ww, c.y, c.z + side.z * ww);
      uvs.push(0, t * 3, 1, t * 3);          // 滚动纹理坐标
      col.push(1, 1, 1, 1, 1, 1);
      if (i < SEGS) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      map: fallTex, vertexColors: true, transparent: true, opacity: 1.0,
      side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    fallMats.push(mat);
    worldBob.add(new THREE.Mesh(geo, mat));
    /* 内芯亮条：更窄的纯白第二层，叠出「白柱」体量 */
    {
      const pos2 = [], col2 = [], idx2 = [], uvs2 = [];
      for (let i = 0; i <= SEGS; i++) {
        const t = i / SEGS;
        const c = pts[i];
        const ww = w * 0.62 * (0.8 + 0.55 * t);
        pos2.push(c.x - side.x * ww, c.y - 0.05, c.z - side.z * ww, c.x + side.x * ww, c.y - 0.05, c.z + side.z * ww);
        uvs2.push(0, t * 3, 1, t * 3);
        col2.push(1, 1, 1, 1, 1, 1);
        if (i < SEGS) {
          const k = i * 2;
          idx2.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const geo2 = new THREE.BufferGeometry();
      geo2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
      geo2.setAttribute('color', new THREE.Float32BufferAttribute(col2, 3));
      geo2.setAttribute('uv', new THREE.Float32BufferAttribute(uvs2, 2));
      geo2.setIndex(idx2);
      worldBob.add(new THREE.Mesh(geo2, mat));
    }
    /* 落点雾斑：4 个大白 sprite 弥漫（抬到云面之上，不被云海吞掉） */
    const p2 = pts[SEGS];
    for (let j = 0; j < 4; j++) {
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: 0xf8fcff, transparent: true, opacity: 0.8,
        depthWrite: false, fog: false,
      }));
      mist.position.set(p2.x + (rand() - 0.5) * 2.8, CLOUD_TOP + 2.2 + rand() * 1.8, p2.z + (rand() - 0.5) * 2.8);
      mist.scale.set(6 + rand() * 4, 3 + rand() * 1.6, 1);
      scene.add(mist);
    }
  }
  FALLS.forEach((f) => makeFall(f.a, f.w));
  /* 瀑布纹理滚动 */
  tickers.push((dt) => { for (const m of fallMats) if (m.map) m.map.offset.y -= dt * 0.9; });
  { /* 瀑布顶缘水花泡沫 */
    for (const f of FALLS) {
      const foam = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: 0xffffff, transparent: true, opacity: 0.7,
        depthWrite: false, fog: false,
      }));
      foam.position.set(Math.cos(f.a) * ISLE_R * 0.96, 0.35, Math.sin(f.a) * ISLE_R * 0.96);
      foam.scale.set(f.w * 2.2, 0.8, 1);
      worldBob.add(foam);
    }
  }
  /* 瀑布粒子溅沫（Points，向下跌落循环） */
  {
    const N = 160;
    const seeds = [];
    for (const f of FALLS) {
      for (let i = 0; i < N / FALLS.length; i++) {
        seeds.push({ a: f.a, t0: rand(), sp: 0.5 + rand() * 0.5, off: (rand() - 0.5) * f.w });
      }
    }
    const pos = new Float32Array(seeds.length * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: puffTex, color: 0xeaf6ff, size: 0.32, transparent: true, opacity: 0.5,
      depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    worldBob.add(pts);
    tickers.push((dt, t) => {
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        const tt = (s.t0 + t * s.sp * 0.22) % 1;
        const y = 0.4 - tt * (0.4 - CLOUD_TOP - 0.4);
        const r = ISLE_R * 0.96 * (1 + tt * 0.1);
        pos[i * 3] = Math.cos(s.a) * r + s.off;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = Math.sin(s.a) * r + s.off;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  /* ---------- 右侧长多拱石桥 → 金色圆塔 ---------- */
  const GOLD_TOWER_POS = new THREE.Vector3(19, 0.5, -2);
  {
    /* 桥：桥面（长条拱曲 box 序列）+ 连续拱洞（半圆柱差读：拱墩 InstancedMesh + 拱环） */
    const parts = [];
    const trimC = vary(0xefe8d6, 0.03);
    const stoneC = vary(0xe3dbc6, 0.03);
    const A = new THREE.Vector3(ISLE_R * 0.92, 1.1, -1.2);
    const B = GOLD_TOWER_POS.clone().add(new THREE.Vector3(-2.6, 1.0, 0));
    const dir = new THREE.Vector3().subVectors(B, A);
    const len = dir.length();
    const nSeg = 14;
    /* 桥面：近直（微拱 0.35） */
    for (let i = 0; i < nSeg; i++) {
      const t = (i + 0.5) / nSeg;
      const arch = Math.sin(t * Math.PI) * 0.35;
      const p = A.clone().lerp(B, t).add(new THREE.Vector3(0, arch, 0));
      const yaw = Math.atan2(dir.x, dir.z);
      parts.push(P(GEO.box, stoneC, p.x, p.y, p.z, { sx: 1.7, sy: 0.34, sz: len / nSeg + 0.08, ry: yaw }));
    }
    /* 连续拱肩墙：一整条带 5 个圆拱洞（经典水渠立面，洞即拱洞） */
    {
      const deckY = Math.min(A.y, B.y);
      const mid = A.clone().add(B).multiplyScalar(0.5);
      const sh = new THREE.Shape();
      sh.moveTo(-len / 2 - 0.1, 0);
      sh.lineTo(len / 2 + 0.1, 0);
      sh.lineTo(len / 2 + 0.1, -3.1);
      sh.lineTo(-len / 2 - 0.1, -3.1);
      sh.closePath();
      const nArch = 5;
      for (let i = 0; i < nArch; i++) {
        const hole = new THREE.Path();
        hole.absarc(-len / 2 + (i + 0.5) * (len / nArch), -1.7, 1.18, 0, Math.PI * 2, true);
        sh.holes.push(hole);
      }
      const wall = new THREE.ExtrudeGeometry(sh, { depth: 1.7, bevelEnabled: false, curveSegments: 12 });
      const θ = Math.atan2(-dir.z, dir.x);        // 绕 Y 旋 x̂ → dir
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(mid.x, deckY + 0.4, mid.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, θ, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      wall.translate(0, 0, -0.85);
      wall.applyMatrix4(m);
      parts.push(colored(wall, trimC));
      /* 拱下墩柱：圆柱坠入云海 */
      for (let i = 0; i < nArch; i++) {
        const px = -len / 2 + (i + 0.5) * (len / nArch);
        const local = new THREE.Vector3(px, -3.1, 0).applyMatrix4(m);
        const botY = CLOUD_TOP + 1.2 + rand() * 2;
        const hgt = deckY + 0.4 - 3.1 - botY;
        const pier = new THREE.CylinderGeometry(0.5, 0.62, hgt, 10);
        parts.push(colored(pier, vary(0xe3dbc6, 0.03)).translate(local.x, deckY + 0.4 - 3.1 - hgt / 2, local.z));
      }
    }
    const bridge = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), toonVC);
    bridge.castShadow = bridge.receiveShadow = true;
    scene.add(bridge);
    /* 桥面栏杆柱 */
    const posts = [];
    for (let i = 1; i < nSeg * 2; i++) {
      const t = i / (nSeg * 2);
      const arch = Math.sin(t * Math.PI) * 1.3;
      const p = A.clone().lerp(B, t).add(new THREE.Vector3(0, arch, 0));
      const nrm = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      for (const sgn of [-1, 1]) {
        posts.push(matAt(p.x + nrm.x * sgn * 0.6, p.y + 0.35, p.z + nrm.z * sgn * 0.6, 0));
      }
    }
    buildInstanced(new THREE.BoxGeometry(0.07, 0.55, 0.07), toon(0xf3ecdc), posts, scene, { shadow: true });
  }

  /* 金色圆塔（桥尽头）：层叠圆塔 + 拱窗 + 金穹顶 */
  {
    const g = new THREE.Group();
    g.position.copy(GOLD_TOWER_POS);
    scene.add(g);
    const parts = [];
    const creamC = vary(0xf5edda, 0.03);
    const goldC = new THREE.Color(0xd98e15);
    const pm = new THREE.Matrix4().makeTranslation(GOLD_TOWER_POS.x, GOLD_TOWER_POS.y, GOLD_TOWER_POS.z);
    /* 基岩小岛（岩柱深插云海） */
    parts.push(P(new THREE.CylinderGeometry(3.0, 1.9, 2.2, 14), new THREE.Color(0xc9a06e), 0, -1.4, 0));
    parts.push(P(new THREE.CylinderGeometry(2.3, 3.0, 9.5, 14), vary(0xd4a878, 0.04), 0, -7.3, 0));
    parts.push(P(new THREE.CylinderGeometry(2.6, 2.9, 0.5, 14), vary(0x6fae57, 0.04), 0, -0.1, 0));
    /* 三段收分圆塔身（上两段金色塔身，读出「金色圆塔」） */
    const tiers = [[2.0, 1.8, 2.6], [1.7, 1.5, 2.6], [1.4, 1.2, 2.4]];
    const bodyC = [creamC, goldC, goldC];
    let yb = 0.15;
    for (let i = 0; i < tiers.length; i++) {
      const [r0, r1, th] = tiers[i];
      parts.push(P(new THREE.CylinderGeometry(r1, r0, th, 14), bodyC[i], 0, yb + th / 2, 0));
      parts.push(P(new THREE.CylinderGeometry(r1 + 0.32, r1 + 0.2, 0.16, 14), goldC, 0, yb + th + 0.08, 0));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + i * 0.3;
        const wallR = THREE.MathUtils.lerp(r0, r1, 0.5) + 0.03;
        pushWin(pm, GOLD_TOWER_POS.x + Math.cos(a) * wallR, GOLD_TOWER_POS.y + yb + th * 0.5, GOLD_TOWER_POS.z + Math.sin(a) * wallR, -a + Math.PI / 2, 1.6, 1.7);
      }
      yb += th + 0.16;
    }
    /* 顶段 + 金穹顶 + 尖顶 */
    parts.push(P(new THREE.CylinderGeometry(1.0, 1.2, 1.5, 14), creamC, 0, yb + 0.75, 0));
    yb += 1.5;
    parts.push(P(GEO.hemi, goldC, 0, yb, 0, { sx: 1.25, sy: 0.9, sz: 1.25 }));
    parts.push(P(GEO.cone12, goldC, 0, yb + 1.5, 0, { sx: 0.16, sy: 1.7, sz: 0.16 }));
    const tower = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), toonVC);
    tower.castShadow = tower.receiveShadow = true;
    g.add(tower);
    /* 落进云海的塔基雾斑 */
    for (let j = 0; j < 3; j++) {
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: 0xf0f7fe, transparent: true, opacity: 0.36, depthWrite: false, fog: false,
      }));
      mist.position.set(GOLD_TOWER_POS.x + (rand() - 0.5) * 5, CLOUD_TOP + 0.5 + rand(), GOLD_TOWER_POS.z + (rand() - 0.5) * 5);
      mist.scale.set(3.5 + rand() * 2.5, 1.8, 1);
      scene.add(mist);
    }
  }

  /* ---------- 左后细长水晶尖塔群（半透明蓝白锥体） ---------- */
  {
    const crystalMat = new THREE.MeshPhongMaterial({
      color: 0x9fd2ff, emissive: 0x86baff, emissiveIntensity: 0.45,
      transparent: true, opacity: 0.8, shininess: 120, specular: 0xffffff,
    });
    const base = new THREE.Vector3(-23, -4, 6);
    const g = new THREE.Group();
    g.position.copy(base);
    scene.add(g);
    /* 草台基座（抬高出云海，尖塔群清晰可见） */
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 6.5, 2.4, 12),
      toon(0x6fae57)
    );
    mound.position.y = 1.2;
    mound.castShadow = mound.receiveShadow = true;
    g.add(mound);
    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(6.2, 2.2, 6.5, 12),
      toon(0xd4a878)
    );
    rock.position.y = -3.2;
    g.add(rock);
    /* 尖塔：主 3 + 小 5（高耸入蓝天） */
    const spires = [
      [0, 13, 0.85], [-1.7, 9.5, 0.55], [1.6, 10, 0.5],
      [-2.8, 5.5, 0.3], [2.7, 6, 0.32], [0.9, 4.6, 0.25], [-0.9, 4.0, 0.22], [3.4, 4.2, 0.2],
    ];
    for (const [sx, sh, sr] of spires) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(sr, sh, 6), crystalMat);
      c.position.set(sx, 2.4 + sh / 2, (rand() - 0.5) * 1.2);
      c.castShadow = true;
      g.add(c);
    }
    /* 基座雾斑 */
    for (let j = 0; j < 3; j++) {
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: 0xf0f7fe, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
      }));
      mist.position.set(base.x + (rand() - 0.5) * 8, CLOUD_TOP + 0.6, base.z + (rand() - 0.5) * 8);
      mist.scale.set(5 + rand() * 3, 2.2, 1);
      scene.add(mist);
    }
  }

  /* ---------- 前景：左下角草坡（位移绿丘 + 小花） ---------- */
  {
    const geo = new THREE.SphereGeometry(16, 24, 14);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = Math.sin(x * 0.8 + z * 0.5) * 0.8 + Math.cos(z * 1.1 - x * 0.3) * 0.6;
      const k = 1 + n * 0.04;
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    const hill = new THREE.Mesh(geo, toon(0x69ad52));
    hill.position.set(-16, -21, 22);
    hill.castShadow = hill.receiveShadow = true;
    scene.add(hill);
    /* 草坡上小白花 / 粉花（InstancedMesh 点缀） */
    const flowers = [];
    const fCols = [0xffffff, 0xffd7e8, 0xfff3b0];
    for (let i = 0; i < 110; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 10;
      dummy.position.set(-16 + Math.cos(a) * r, -21 + Math.sqrt(Math.max(0, 256 - r * r)) * 0.985, 22 + Math.sin(a) * r);
      dummy.rotation.set(0, rand() * 6.28, 0);
      dummy.scale.setScalar(0.14 + rand() * 0.16);
      dummy.updateMatrix();
      flowers.push({ m: dummy.matrix.clone(), c: new THREE.Color(fCols[Math.floor(rand() * 3)]) });
    }
    buildInstanced(whiteAttr(new THREE.SphereGeometry(1, 6, 4)),
      new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), flowers, scene, { colors: true });
  }

  /* 主城极缓沉浮 */
  tickers.push((dt, t) => { worldBob.position.y = Math.sin(t * 0.22 + 1.0) * 0.15; });

  /* ---------- 后期：轻 bloom（亮调场景防过曝） ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.1, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- 机位补间 ---------- */
  let fly = null;
  function flyTo(v, dur = 1.7) {
    fly = {
      t: 0, dur,
      p0: camera.position.clone(), p1: new THREE.Vector3(...v.pos),
      t0: controls.target.clone(), t1: new THREE.Vector3(...v.tgt),
    };
  }

  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

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
    composer.render();
  }
  rafId = requestAnimationFrame(tick);

  window.__skyCity = {
    camera, controls, scene,
    tri: () => renderer.info.render.triangles,
    calls: () => renderer.info.render.calls,
  };

  /* ---------- teardown ---------- */
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
      if (obj.isInstancedMesh) obj.dispose();
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
