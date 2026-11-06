/* ============================================================
   悬浮玻璃立方体微缩生态 · V2 高山纪行
   无外部资产：全部几何 / 纹理 / 环境贴图由代码生成
   V2：放大岛体 / 雪山雪线 / 蜿蜒河流+湖泊+瀑布 / 小鹿兔鸟
       舱内云朵 / 贴地雾 / 移轴散景后期 / 体积光束
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------- 随机 & 噪声（mulberry32 + Perlin 3D + fBm） ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261101);

const Noise = (() => {
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y, z) => {
    h &= 15;
    const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  function perlin3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
           lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
           lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  function fbm(x, y, z, oct = 4) {
    let f = 0, a = 0.5, fr = 1;
    for (let i = 0; i < oct; i++) { f += a * perlin3(x * fr, y * fr, z * fr); a *= 0.5; fr *= 2.07; }
    return f;
  }
  return { perlin3, fbm };
})();
function sstep(a, b, x) {
  x = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/* ---------- 渲染器 / 场景 / 相机 ---------- */
const app = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (e) {
  document.getElementById('err').style.display = 'grid';
  throw e;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5.6, 4.8, 11.2);
camera.lookAt(0, 2.5, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 4;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.55;
controls.autoRotate = false;

/* ---------- 程序化贴图（canvas） ---------- */
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/* 背景竖直渐变 */
function drawBg(warm) {
  return canvasTexture(warm ? 512 : 16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    if (warm) {
      gr.addColorStop(0.0, '#2b2630');
      gr.addColorStop(0.30, '#43302c');
      gr.addColorStop(0.42, '#7a4a33');
      gr.addColorStop(0.52, '#93552f');
      gr.addColorStop(0.64, '#3a2a26');
      gr.addColorStop(1.0, '#0b0a0d');
    } else {
      gr.addColorStop(0.0, '#232830');
      gr.addColorStop(0.45, '#15181e');
      gr.addColorStop(1.0, '#07080b');
    }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (warm) {
      const sun = g.createRadialGradient(w * 0.26, h * 0.5, 0, w * 0.26, h * 0.5, h * 0.5);
      sun.addColorStop(0, 'rgba(255,190,120,0.95)');
      sun.addColorStop(0.25, 'rgba(255,140,80,0.5)');
      sun.addColorStop(0.6, 'rgba(180,90,60,0.18)');
      sun.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sun; g.fillRect(0, 0, w, h);
    }
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 6;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  });
}
const bgTex = drawBg(false);
const bgTexDusk = drawBg(true);
scene.background = bgTex;
scene.fog = new THREE.Fog(0x0b0d11, 10, 26);

/* 地面径向渐变 */
const groundTex = canvasTexture(1024, 1024, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0.0, '#20232a');
  gr.addColorStop(0.4, '#14161b');
  gr.addColorStop(1.0, '#0a0b0e');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 5;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
});
/* 点精灵柔光圆 */
const glowTex = canvasTexture(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
/* 超柔雾团（大面积低频） */
const mistTex = canvasTexture(256, 256, (g, w, h) => {
  for (let i = 0; i < 14; i++) {
    const x = w * (0.2 + Math.random() * 0.6), y = h * (0.35 + Math.random() * 0.3);
    const r = w * (0.08 + Math.random() * 0.14);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.16)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});
/* 云朵纹理（多团聚合） */
const cloudTex = canvasTexture(256, 128, (g, w, h) => {
  for (let i = 0; i < 16; i++) {
    const x = w * (0.18 + Math.random() * 0.64), y = h * (0.4 + Math.random() * 0.25);
    const r = w * (0.05 + Math.random() * 0.09);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.55, 'rgba(250,252,255,0.32)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});
/* 流水条纹（垂直，可无缝滚动） */
function makeFlowTex() {
  const t = canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * w;
      const len = h * (0.18 + Math.random() * 0.55);
      const y = Math.random() * h - len * 0.3;
      const a = 0.10 + Math.random() * 0.30;
      const wd = 1.5 + Math.random() * 3.5;
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, `rgba(255,255,255,0)`);
      gr.addColorStop(0.5, `rgba(235,250,255,${a})`);
      gr.addColorStop(1, `rgba(255,255,255,0)`);
      g.fillStyle = gr;
      g.fillRect(x, y, wd, len);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const flowTexRiver = makeFlowTex();
const flowTexFall = makeFlowTex();
/* 光束渐变 alpha（上强下弱） */
const beamTex = canvasTexture(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0.0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.34)');
  gr.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side; g.fillRect(0, 0, w, h);
});

/* ---------- 程序化环境贴图（PMREM from scene，冷暖两套） ---------- */
const pmrem = new THREE.PMREMGenerator(renderer);
function buildEnv(warm) {
  const envScene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 12),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: warm ? 0x1a1412 : 0x11141a })
  );
  envScene.add(room);
  const softbox = (x, y, z, w, h, color, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    m.material.color.multiplyScalar(intensity);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  softbox(0, 9, 4, 10, 5, 0xffffff, 4.5);
  softbox(-8, 3, -4, 6, 6, warm ? 0xffb27a : 0xdfe8ff, warm ? 4.0 : 2.6);
  softbox(8, 2, -5, 5, 5, 0xffe3c2, 1.8);
  softbox(0, -6, -6, 8, 4, warm ? 0x4a332a : 0x30343d, 1.2);
  return pmrem.fromScene(envScene, 0.06).texture;
}
const envTexCool = buildEnv(false);
const envTexWarm = buildEnv(true);
scene.environment = envTexCool;

/* ---------- 灯光 ---------- */
const keyLight = new THREE.DirectionalLight(0xfff1da, 3.0);
keyLight.position.set(4, 6, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -4; keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4; keyLight.shadow.camera.bottom = -4;
keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 20;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.04;
scene.add(keyLight);

const hemiLight = new THREE.HemisphereLight(0xbcd2ff, 0x3a352c, 0.5);
scene.add(hemiLight);

const rimLight = new THREE.DirectionalLight(0xcfe0ff, 1.1);
rimLight.position.set(-5, 3, -4);
scene.add(rimLight);

const bottomLight = new THREE.DirectionalLight(0x6fa0ff, 0.15);
bottomLight.position.set(0.5, -1.5, -5);
scene.add(bottomLight);

const innerLight = new THREE.PointLight(0xffc98a, 0, 6, 2);
innerLight.position.set(0, 1.6, 0);
scene.add(innerLight);

/* 雪峰冷月光（夜晚托亮峰顶；世界坐标≈峰顶附近，舱心 y=2.55） */
const peakLight = new THREE.PointLight(0xbcd4ff, 0, 4.0, 1);
peakLight.position.set(1.0, 4.35, 0.6);
scene.add(peakLight);

/* 瀑布夜光（瀑布世界坐标 ≈ (0.1, 2.0, 1.45)） */
const fallLight = new THREE.PointLight(0x9fd4e8, 0, 2.2, 2);
fallLight.position.set(0.1, 2.0, 1.45);
scene.add(fallLight);

/* ---------- 地面 ---------- */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(22, 64),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---------- 底座石墩 + 黄铜环 ---------- */
const baseGroup = new THREE.Group();
{
  const stoneGeo = new THREE.CylinderGeometry(1.02, 1.28, 0.52, 56, 4);
  const pos = stoneGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const y01 = (v.y + 0.26) / 0.52;
    if (Math.abs(v.y) < 0.259) {
      const ang = Math.atan2(v.z, v.x);
      const wob = Noise.fbm(Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, y01 * 3.0, 3) * 0.05 * (1 - Math.abs(y01 - 0.35) * 1.2);
      const r = Math.hypot(v.x, v.z);
      if (r > 0.6) {
        v.x = (v.x / r) * (r + wob);
        v.z = (v.z / r) * (r + wob);
      }
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  stoneGeo.computeVertexNormals();
  const stone = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({
    color: 0x2b2d33, roughness: 0.88, metalness: 0.05
  }));
  stone.position.y = 0.26;
  stone.castShadow = stone.receiveShadow = true;
  baseGroup.add(stone);

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc9a86a, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.4
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.022, 12, 96), brassMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.47;
  ring.castShadow = true;
  baseGroup.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.016, 12, 96), brassMat);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.035;
  baseGroup.add(ring2);
  baseGroup.userData.brassMat = brassMat;
}
scene.add(baseGroup);

/* ============================================================
   玻璃生态舱（悬浮）
   ============================================================ */
const CUBE = 3.4;
const cubeGroup = new THREE.Group();
const islandGroup = new THREE.Group();
cubeGroup.add(islandGroup);
cubeGroup.position.y = 2.55;
scene.add(cubeGroup);

/* ============================================================
   V2 地形：解析高度场（雪峰 + 蜿蜒河 + 湖 + 山顶冰斗湖）
   岛半径 1.42（舱内半宽 1.7 的 84%），峰顶 ~1.28，锥底 -1.55
   ============================================================ */
const ISLAND_R = 1.46;
const MTN = { x: -0.36, z: -0.66, r: 0.58, h: 1.18 };

/* 峰顶月辉光斑（跟随岛旋转，夜晚淡入；关深度测试避免被峰体自身遮挡） */
const peakGlowMat = new THREE.SpriteMaterial({
  map: glowTex, color: 0xcfe0ff, transparent: true, opacity: 0,
  depthWrite: false, depthTest: false, toneMapped: false,
  blending: THREE.AdditiveBlending, fog: false
});
const peakGlow = new THREE.Sprite(peakGlowMat);
peakGlow.position.set(MTN.x, 1.58, MTN.z);
peakGlow.scale.setScalar(0.6);
peakGlow.renderOrder = 0.5;
islandGroup.add(peakGlow);
/* 峰顶雪冠（独立小白锥，夜晚发冷光——雪峰冷月光的明确读法） */
const snowCapMat = new THREE.MeshStandardMaterial({
  color: 0xf4f8ff, roughness: 0.55, metalness: 0.0,
  emissive: 0x9fc0ff, emissiveIntensity: 0.0
});
{
  const capGeo = new THREE.ConeGeometry(0.30, 0.46, 10, 2, false);
  const cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const yy = cp.getY(i);
    const s = 1 + Noise.perlin3(cp.getX(i) * 9, yy * 9, cp.getZ(i) * 9) * 0.22;
    cp.setXYZ(i, cp.getX(i) * s, yy, cp.getZ(i) * s);
  }
  capGeo.computeVertexNormals();
  const cap = new THREE.Mesh(capGeo, snowCapMat);
  cap.position.set(MTN.x, 1.30, MTN.z);
  cap.rotation.y = 0.6;
  cap.castShadow = true;
  islandGroup.add(cap);
}
const LAKE = { x: 0.10, z: 0.50, r: 0.30, y: 0.215 };
const TARN = { x: -0.34, z: -0.40, r: 0.09, y: 0.802 };

/* 河流中心线（xz 平面 CatmullRom） */
const riverCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.34, 0, -0.40),
  new THREE.Vector3(-0.06, 0, -0.28),
  new THREE.Vector3(0.32, 0, -0.02),
  new THREE.Vector3(0.12, 0, 0.20),
  new THREE.Vector3(0.10, 0, 0.46),
]);
const RIVER_SAMPLES = 56;
const riverPts = [];
for (let i = 0; i <= RIVER_SAMPLES; i++) {
  const t = i / RIVER_SAMPLES;
  const p = riverCurve.getPoint(t);
  riverPts.push({
    x: p.x, z: p.z, t,
    y: 0.82 - (0.82 - 0.245) * Math.pow(t, 0.95),  // 单调下行
    w: 0.062 + 0.058 * t
  });
}
function riverInfo(x, z) {
  let best = 1e9, bi = 0;
  for (let i = 0; i < riverPts.length; i++) {
    const p = riverPts[i];
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) { best = d; bi = i; }
  }
  const p = riverPts[bi];
  return { d: Math.sqrt(best), y: p.y, w: p.w, t: p.t };
}

function terrainH(x, z) {
  const r = Math.hypot(x, z) / ISLAND_R;
  if (r >= 1) return 0;
  const prof = Math.pow(Math.max(0, 1 - r * r), 0.55);
  let h = 0.12 + 0.20 * prof + Noise.fbm(x * 2.1, 0, z * 2.1, 4) * 0.10 * prof;

  /* 雪山（脊状噪声高斯） */
  const dm = Math.hypot(x - MTN.x, z - MTN.z) / MTN.r;
  const g = Math.exp(-dm * dm * 1.9);
  if (g > 0.004) {
    const ridge = 1 - Math.abs(Noise.fbm(x * 2.6, 3.3, z * 2.6, 4));
    h += MTN.h * g * (0.62 + 0.55 * Math.pow(ridge, 1.6)) + 0.15 * g * g * g;
  }

  /* 湖盆 + 湖岸 */
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 1.65) {
    const basin = 1 - sstep(LAKE.r * 0.55, LAKE.r * 1.35, dl);
    h = h * (1 - basin) + (LAKE.y - 0.085 - 0.05 * basin) * basin;
    const bank = sstep(LAKE.r * 0.95, LAKE.r * 1.28, dl) * (1 - sstep(LAKE.r * 1.28, LAKE.r * 1.6, dl));
    const bankH = LAKE.y + 0.035 + Noise.perlin3(x * 5, 4.4, z * 5) * 0.012;
    h = h * (1 - bank) + Math.max(h, bankH) * bank;
  }

  /* 湖出口溢流道（通向崖缘瀑布口） */
  if (z > LAKE.z + LAKE.r * 0.72 && z < 1.30 && Math.abs(x - 0.10) < 0.16) {
    const s = 1 - sstep(0.05, 0.15, Math.abs(x - 0.10));
    if (s > 0) {
      const zt = sstep(LAKE.z + LAKE.r * 0.72, 1.28, z);
      const chY = LAKE.y + 0.012 - 0.145 * zt;
      h = h * (1 - s) + Math.min(h, chY) * s;
    }
  }

  /* 河道切削 */
  const rv = riverInfo(x, z);
  if (rv.d < rv.w * 3.4) {
    const s = 1 - sstep(rv.w * 0.9, rv.w * 2.6, rv.d);
    h = h * (1 - s) + (rv.y - 0.055) * s;
  }

  /* 山顶冰斗湖（河源） */
  const dt = Math.hypot(x - TARN.x, z - TARN.z);
  if (dt < 0.17) {
    const s = 1 - sstep(0.05, 0.155, dt);
    h = h * (1 - s) + (TARN.y - 0.085 - 0.03 * s) * s;
  }

  /* 岛缘收敛到 0 */
  h *= 1 - sstep(0.93, 1.0, r);
  return h;
}
function terrainSlope(x, z) {
  const e = 0.035;
  const sx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e);
  const sz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  return Math.min(1.4, Math.hypot(sx, sz));
}

/* ---------- 岛顶地形网格（极坐标网格，匹配底部锥体顶环） ---------- */
const SECTORS = 144, RINGS = 76;
const topGeo = (() => {
  const verts = [];
  const cols = [];
  const cGrass1 = new THREE.Color(0x4f7d38);
  const cGrass2 = new THREE.Color(0x7fa04a);
  const cDirt = new THREE.Color(0x6a4c33);
  const cRock = new THREE.Color(0x7c766c);
  const cRock2 = new THREE.Color(0x66615a);
  const cSnow = new THREE.Color(0xf2f6fc);
  const cBank = new THREE.Color(0x8d7c54);
  const c = new THREE.Color();
  const ringStep = ISLAND_R / RINGS;
  for (let i = 0; i <= RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      const ang = (j / SECTORS) * Math.PI * 2;
      let rr = ISLAND_R * (i / RINGS);
      if (i > 0 && i < RINGS) {
        rr += (Noise.perlin3(i * 2.7, j * 0.61, 5.5) ) * ringStep * 0.55;
        rr = Math.min(rr, ISLAND_R * (0.2 + 0.8 * i / RINGS));
      }
      const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
      const h = terrainH(x, z);
      verts.push(x, h, z);
      /* 顶点色：草 → 土 → 岩 → 雪线混合 */
      const slope = Math.min(1, terrainSlope(x, z) * 0.75);
      const n1 = Noise.perlin3(x * 3.1, 7.7, z * 3.1);
      const n2 = Noise.perlin3(x * 6.2, 2.2, z * 6.2);
      c.copy(cGrass1).lerp(cGrass2, Math.max(0, n1) * 0.85 + 0.15);
      c.lerp(cDirt, sstep(0.30, 0.62, slope));
      const rockT = sstep(0.42, 0.85, slope + Math.max(0, h - 0.40) * 0.35);
      c.lerp(n2 > 0.1 ? cRock : cRock2, rockT * 0.95);
      const snowT = sstep(0.52, 0.70, h + n2 * 0.13) * (1 - Math.min(0.5, slope * 0.55));
      c.lerp(cSnow, snowT);
      /* 水岸沙色 */
      const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
      const bankT = (1 - sstep(LAKE.r * 0.92, LAKE.r * 1.12, dl)) * (1 - sstep(LAKE.y - 0.05, LAKE.y + 0.05, terrainH(x, z)));
      c.lerp(cBank, bankT * 0.55);
      const rv = riverInfo(x, z);
      if (rv.d < rv.w * 2.2 && h < rv.y + 0.05) c.lerp(cBank, 0.34 * (1 - rv.d / (rv.w * 2.2)));
      cols.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      const a = i * SECTORS + j;
      const b = i * SECTORS + (j + 1) % SECTORS;
      const cc = (i + 1) * SECTORS + j;
      const d = (i + 1) * SECTORS + (j + 1) % SECTORS;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
})();
const islandTop = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.95, metalness: 0.0
}));
islandTop.castShadow = islandTop.receiveShadow = true;
islandGroup.add(islandTop);

/* ---------- 小岛底部岩锥 ---------- */
let bottomSoilMat = null;
{
  const H = 1.55;
  const botGeo = new THREE.ConeGeometry(ISLAND_R, H, 96, 10, true);
  botGeo.rotateX(Math.PI);
  botGeo.translate(0, -H / 2, 0);
  const pos = botGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cDirt = new THREE.Color(0x5c452f);
  const cDark = new THREE.Color(0x2e241b);
  const cRock = new THREE.Color(0x6d675b);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = Math.min(1, -v.y / H);
    const r = Math.hypot(v.x, v.z);
    if (r > 1e-4) {
      const wob = Noise.fbm(v.x * 2.4, v.y * 1.6, v.z * 2.4, 4) * 0.22 * t;
      v.x = (v.x / r) * (r + wob);
      v.z = (v.z / r) * (r + wob);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
    const streak = Noise.fbm(v.x * 4, v.y * 2.2 + 9, v.z * 4, 3);
    c.copy(cDirt).lerp(cDark, Math.min(1, t * 1.1 + streak * 0.4));
    if (streak > 0.32) c.lerp(cRock, 0.45);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  botGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  botGeo.computeVertexNormals();
  const islandBottom = new THREE.Mesh(botGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.97, metalness: 0.0,
    emissive: 0x2a1c12, emissiveIntensity: 0.0
  }));
  bottomSoilMat = islandBottom.material;
  islandBottom.castShadow = true;
  islandGroup.add(islandBottom);

  const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const ang = rng() * Math.PI * 2;
    const rr = 0.15 + rng() * 0.5;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    const len = 0.25 + rng() * 0.45;
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.02 + rng() * 0.015, len, 5), rootMat);
    root.position.set(x * 0.7, -H * (0.72 + rr * 0.2) - len * 0.4, z * 0.7);
    root.rotation.z = (rng() - 0.5) * 0.4;
    root.rotation.x = (rng() - 0.5) * 0.4;
    islandGroup.add(root);
  }
}

/* ============================================================
   水系：湖泊 / 山顶冰斗湖 / 河流缎带 / 瀑布
   ============================================================ */
const waterMat = new THREE.MeshPhysicalMaterial({
  color: 0x2a86ac, roughness: 0.05, metalness: 0.0,
  transparent: true, opacity: 0.88,
  envMapIntensity: 1.3, emissive: 0x0a2a33, emissiveIntensity: 0.25
});
{
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 0.97, 48), waterMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE.x, LAKE.y, LAKE.z);
  islandGroup.add(lake);

  const tarn = new THREE.Mesh(new THREE.CircleGeometry(TARN.r, 24), waterMat);
  tarn.rotation.x = -Math.PI / 2;
  tarn.position.set(TARN.x, TARN.y, TARN.z);
  islandGroup.add(tarn);

  /* 荷叶 */
  const padMat = new THREE.MeshStandardMaterial({ color: 0x5f8f45, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.035 + rng() * 0.03, 14), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(LAKE.x + (rng() - 0.5) * 0.34, LAKE.y + 0.006, LAKE.z + (rng() - 0.5) * 0.34);
    islandGroup.add(pad);
  }
}

/* 河流缎带（沿中心线的条带网格，UV 沿程滚动） */
const riverMat = new THREE.MeshStandardMaterial({
  map: flowTexRiver, color: 0xd6f2fa, transparent: true, opacity: 0.92,
  roughness: 0.15, metalness: 0.0, envMapIntensity: 1.5,
  emissive: 0x1a4a5a, emissiveIntensity: 0.35,
  side: THREE.DoubleSide, depthWrite: false
});
riverMat.map.repeat.set(1, 4);
{
  const N = 60;
  const posArr = [], uvArr = [], idxArr = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = riverCurve.getPoint(t);
    const tan = riverCurve.getTangent(t);
    const nx = -tan.z, nz = tan.x;
    const inv = 1 / Math.hypot(nx, nz);
    const hw = (0.062 + 0.058 * t) * 0.85;
    const y = 0.82 - (0.82 - 0.245) * Math.pow(t, 0.95) + 0.008;
    posArr.push(p.x + nx * inv * hw, y, p.z + nz * inv * hw);
    posArr.push(p.x - nx * inv * hw, y, p.z - nz * inv * hw);
    uvArr.push(0, t * 4, 1, t * 4);
    if (i < N) {
      const a = i * 2;
      idxArr.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setIndex(idxArr);
  geo.computeVertexNormals();
  const river = new THREE.Mesh(geo, riverMat);
  river.renderOrder = 0;
  islandGroup.add(river);
}

/* 瀑布：湖出口 → 沿岛缘坠入舱底雾气（双层缎带 + 底部雾团） */
const fallMat = new THREE.MeshStandardMaterial({
  map: flowTexFall, color: 0xeaf6fb, transparent: true, opacity: 0.92,
  roughness: 0.25, metalness: 0.0, envMapIntensity: 1.4,
  emissive: 0x86c8dc, emissiveIntensity: 0.0,
  side: THREE.DoubleSide, depthWrite: false
});
fallMat.map.repeat.set(1, 2);
{
  const build = (bow, hw0, hw1, yTop, yBot) => {
    const N = 22, posArr = [], uvArr = [], idxArr = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const y = yTop + (yBot - yTop) * s;
      const z = 1.26 + bow * s * s;
      const hw = hw0 + (hw1 - hw0) * s;
      posArr.push(0.10 - hw, y, z, 0.10 + hw, y, z);
      uvArr.push(0, s * 2, 1, s * 2);
      if (i < N) {
        const a = i * 2;
        idxArr.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();
    return geo;
  };
  const main = new THREE.Mesh(build(0.20, 0.092, 0.072, 0.09, -0.62), fallMat);
  islandGroup.add(main);
  const outer = new THREE.Mesh(build(0.26, 0.135, 0.095, 0.07, -0.68), fallMat);
  outer.material = fallMat;
  outer.renderOrder = -1;
  islandGroup.add(outer);
}

/* 瀑布底部雾气 + 贴地薄雾（共享柔雾纹理） */
const mistMat = new THREE.SpriteMaterial({
  map: mistTex, color: 0xdce8ee, transparent: true, opacity: 0.14,
  depthWrite: false, fog: false
});
const wfMistMat = new THREE.SpriteMaterial({
  map: mistTex, color: 0xe6f2f6, transparent: true, opacity: 0.32,
  depthWrite: false, fog: false
});
const mistGroup = new THREE.Group();
const mistBase = [];
{
  /* 瀑布根雾团（独立更浓材质） */
  const wfMist = [
    [0.10, -0.58, 1.46, 0.5], [0.02, -0.52, 1.38, 0.42], [0.18, -0.50, 1.40, 0.38],
    [0.08, -0.44, 1.50, 0.34], [0.14, -0.62, 1.52, 0.4], [0.10, -0.66, 1.42, 0.46],
  ];
  for (const [x, y, z, s] of wfMist) {
    const sp = new THREE.Sprite(wfMistMat);
    sp.position.set(x, y, z);
    sp.scale.set(s * 1.6, s * 0.8, 1);
    mistGroup.add(sp);
    mistBase.push({ sp, ph: rng() * Math.PI * 2, s });
  }
  /* 贴地薄雾 */
  for (let i = 0; i < 9; i++) {
    const ang = rng() * Math.PI * 2;
    const rr = 0.35 + rng() * 0.8;
    const sp = new THREE.Sprite(mistMat);
    sp.position.set(Math.cos(ang) * rr, 0.12 + rng() * 0.08, Math.sin(ang) * rr);
    const s = 0.7 + rng() * 0.6;
    sp.scale.set(s * 1.6, s * 0.8, 1);
    mistGroup.add(sp);
    mistBase.push({ sp, ph: rng() * Math.PI * 2, s });
  }
  islandGroup.add(mistGroup);
}

/* ---------- 程序树（松树偏高山，圆树偏草甸） ---------- */
function makePine(scale, hueShift) {
  const g = new THREE.Group();
  const trunkH = 0.16 + 0.06 * rng();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.026, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x5d4430, roughness: 0.95 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const green = new THREE.Color().setHSL(0.33 + hueShift * 0.07, 0.38 + rng() * 0.12, 0.20 + rng() * 0.08);
  const leafMat = new THREE.MeshStandardMaterial({ color: green, roughness: 0.9 });
  let y = trunkH * 0.7;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = (0.16 - 0.1 * t) * (0.9 + rng() * 0.2);
    const h = 0.14 * (1 - t * 0.45);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), leafMat);
    cone.position.y = y + h * 0.4;
    cone.rotation.y = rng() * Math.PI;
    cone.castShadow = true;
    g.add(cone);
    y += h * 0.62;
  }
  g.scale.setScalar(scale);
  return g;
}
function makeRoundTree(scale, hueShift) {
  const g = new THREE.Group();
  const trunkH = 0.14 + 0.08 * rng();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.024, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x63492f, roughness: 0.95 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const green = new THREE.Color().setHSL(0.28 + hueShift * 0.12, 0.45 + rng() * 0.12, 0.28 + rng() * 0.12);
  const leafMat = new THREE.MeshStandardMaterial({ color: green, roughness: 0.88 });
  const blobs = 2 + (rng() * 2 | 0);
  for (let i = 0; i < blobs; i++) {
    const geo = new THREE.IcosahedronGeometry(0.09 + rng() * 0.06, 1);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const s = 1 + Noise.perlin3(p.getX(j) * 6, p.getY(j) * 6, p.getZ(j) * 6) * 0.28;
      p.setXYZ(j, p.getX(j) * s, p.getY(j) * s * 0.85, p.getZ(j) * s);
    }
    geo.computeVertexNormals();
    const b = new THREE.Mesh(geo, leafMat);
    b.position.set((rng() - 0.5) * 0.1, trunkH + 0.07 + rng() * 0.09, (rng() - 0.5) * 0.1);
    b.castShadow = true;
    g.add(b);
  }
  g.scale.setScalar(scale);
  return g;
}
/* 放置约束：离河 / 离湖 / 坡度 / 雪线 */
function spotOK(x, z, opts = {}) {
  const r = Math.hypot(x, z) / ISLAND_R;
  if (r > (opts.rMax ?? 0.94)) return false;
  const h = terrainH(x, z);
  if (h < (opts.hMin ?? 0.06) || h > (opts.hMax ?? 0.85)) return false;
  if (terrainSlope(x, z) > (opts.sMax ?? 0.85)) return false;
  const rv = riverInfo(x, z);
  if (rv.d < rv.w * (opts.riverGap ?? 2.8)) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + (opts.lakeGap ?? 0.12)) return false;
  return true;
}
const treeSpots = [];
{
  const placed = [];
  let tries = 0;
  while (placed.length < 15 && tries++ < 600) {
    const ang = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * ISLAND_R * 0.88;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    if (placed.some(q => Math.hypot(q.x - x, q.z - z) < 0.26)) continue;
    const h = terrainH(x, z);
    const pine = h > 0.30 || rng() < 0.45;
    if (!spotOK(x, z, pine
      ? { hMin: 0.24, hMax: 0.82, sMax: 0.8, riverGap: 3.4 }
      : { hMin: 0.07, hMax: 0.34, sMax: 0.5, riverGap: 3.0 })) continue;
    const scale = 0.8 + rng() * 0.5;
    const tree = pine ? makePine(scale, rng()) : makeRoundTree(scale, rng());
    tree.position.set(x, h - 0.015, z);
    tree.rotation.y = rng() * Math.PI * 2;
    islandGroup.add(tree);
    placed.push({ x, z });
    treeSpots.push({ x, z });
  }
}

/* ---------- 草丛（InstancedMesh + 顶点着色器摆动） ---------- */
const grassUniforms = { uTime: { value: 0 } };
{
  const COUNT = 1000;
  const bladeGeo = new THREE.ConeGeometry(0.011, 0.11, 3, 2);
  bladeGeo.translate(0, 0.055, 0);
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x6d9c4a, roughness: 0.9, side: THREE.DoubleSide
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float h = instanceMatrix[3][0] * 7.31 + instanceMatrix[3][2] * 3.17;
          float sway = sin(uTime * 1.6 + h) * 0.5 + sin(uTime * 2.7 + h * 2.0) * 0.5;
          transformed.x += sway * position.y * 0.55;
          transformed.z += cos(uTime * 1.3 + h) * position.y * 0.3;
        #endif
      `);
  };
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, COUNT);
  grass.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0, tries = 0;
  while (n < COUNT && tries++ < COUNT * 8) {
    const ang = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * ISLAND_R * 0.9;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    const h = terrainH(x, z);
    if (h < 0.05 || h > 0.55) continue;
    if (terrainSlope(x, z) > 0.55) continue;
    const rv = riverInfo(x, z);
    if (rv.d < rv.w * 1.35) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.04) continue;
    p.set(x, h - 0.01, z);
    e.set((rng() - 0.5) * 0.35, rng() * Math.PI * 2, (rng() - 0.5) * 0.35);
    q.setFromEuler(e);
    s.setScalar(0.7 + rng() * 0.9);
    m.compose(p, q, s);
    grass.setMatrixAt(n, m);
    col.setHSL(0.24 + rng() * 0.06, 0.5, 0.3 + rng() * 0.14);
    grass.setColorAt(n, col);
    n++;
  }
  grass.count = n;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  islandGroup.add(grass);
}

/* ---------- 岩石（山坡 / 岛缘更多） ---------- */
{
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7768, roughness: 0.92 });
  let placed = 0, tries = 0;
  while (placed < 12 && tries++ < 400) {
    const ang = rng() * Math.PI * 2;
    const rr = 0.2 + Math.sqrt(rng()) * ISLAND_R * 0.86;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    if (!spotOK(x, z, { hMin: 0.05, hMax: 1.1, sMax: 1.2, riverGap: 2.2, lakeGap: 0.1 })) continue;
    const geo = new THREE.IcosahedronGeometry(0.045 + rng() * 0.075, 1);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const s = 1 + Noise.perlin3(p.getX(j) * 5, p.getY(j) * 5, p.getZ(j) * 5) * 0.4;
      p.setXYZ(j, p.getX(j) * s, p.getY(j) * s * 0.7, p.getZ(j) * s);
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(x, terrainH(x, z) + 0.01, z);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = rock.receiveShadow = true;
    islandGroup.add(rock);
    placed++;
  }
}

/* ---------- 发光蘑菇（黄昏 / 夜晚点亮） ---------- */
const mushroomMat = new THREE.MeshStandardMaterial({
  color: 0xd8efe2, roughness: 0.6,
  emissive: 0x59e8c0, emissiveIntensity: 0.0
});
const mushGlowMat = new THREE.SpriteMaterial({
  map: glowTex, color: 0x59e8c0, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false
});
mushGlowMat.toneMapped = false;
{
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xcfd8cc, roughness: 0.8 });
  let placed = 0, tries = 0;
  while (placed < 7 && tries++ < 300) {
    const ang = rng() * Math.PI * 2;
    const rr = 0.3 + Math.sqrt(rng()) * ISLAND_R * 0.6;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    if (!spotOK(x, z, { hMin: 0.06, hMax: 0.4, sMax: 0.45 })) continue;
    const cnt = 1 + (rng() * 2 | 0);
    for (let i = 0; i < cnt; i++) {
      const ox = x + (rng() - 0.5) * 0.09, oz = z + (rng() - 0.5) * 0.09;
      const y = terrainH(ox, oz);
      const h = 0.05 + rng() * 0.04;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, h, 6), stemMat);
      stem.position.set(ox, y + h / 2, oz);
      islandGroup.add(stem);
      const capR = 0.04 + rng() * 0.02;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(capR, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mushroomMat);
      cap.position.set(ox, y + h, oz);
      cap.scale.y = 0.75;
      islandGroup.add(cap);
      const glow = new THREE.Sprite(mushGlowMat);
      glow.position.set(ox, y + h + capR * 0.4, oz);
      glow.scale.setScalar(capR * 5.5);
      islandGroup.add(glow);
    }
    placed++;
  }
}

/* ============================================================
   V2 微型动物：小鹿 / 兔子（几何拼装，草地放置）
   ============================================================ */
function makeDeer(scale) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa8814f, roughness: 0.92 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x6e5233, roughness: 0.92 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 });
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.7 });
  /* 躯干 */
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), bodyMat);
  body.scale.set(1.75, 1.0, 0.95);
  body.position.y = 0.075;
  body.castShadow = true;
  g.add(body);
  /* 白色臀部 */
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), whiteMat);
  rump.scale.set(0.7, 0.9, 0.9);
  rump.position.set(0, 0.078, -0.078);
  g.add(rump);
  /* 颈 */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.085, 8), bodyMat);
  neck.position.set(0, 0.115, 0.062);
  neck.rotation.x = -0.65;
  neck.castShadow = true;
  g.add(neck);
  /* 头 */
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), bodyMat);
  head.scale.set(0.9, 1.0, 1.35);
  head.position.set(0, 0.152, 0.098);
  head.castShadow = true;
  g.add(head);
  /* 吻部 */
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), darkMat);
  snout.scale.set(0.8, 0.8, 1.3);
  snout.position.set(0, 0.147, 0.122);
  g.add(snout);
  /* 耳 */
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, 6), bodyMat);
    ear.position.set(s * 0.017, 0.172, 0.086);
    ear.rotation.x = -0.25; ear.rotation.z = s * 0.5;
    g.add(ear);
  }
  /* 鹿角（主干+分叉） */
  for (const s of [-1, 1]) {
    const ant = new THREE.Group();
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.005, 0.055, 5), antlerMat);
    main.position.y = 0.027;
    ant.add(main);
    for (let b = 0; b < 2; b++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.0035, 0.026, 4), antlerMat);
      br.position.set(s * 0.011, 0.03 + b * 0.016, -0.004);
      br.rotation.z = s * 0.8;
      ant.add(br);
    }
    ant.position.set(s * 0.011, 0.168, 0.09);
    ant.rotation.z = s * 0.35;
    g.add(ant);
  }
  /* 四腿 */
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.075, 6), darkMat);
    leg.position.set(lx * 0.026, 0.037, lz * 0.052);
    leg.castShadow = true;
    g.add(leg);
  }
  /* 尾 */
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.026, 6), whiteMat);
  tail.position.set(0, 0.095, -0.09);
  tail.rotation.x = 1.1;
  g.add(tail);
  g.scale.setScalar(scale);
  return g;
}
function makeRabbit(scale, white) {
  const g = new THREE.Group();
  const furMat = new THREE.MeshStandardMaterial({ color: white ? 0xd8d2c6 : 0x9a8f80, roughness: 0.95 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xefeade, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), furMat);
  body.scale.set(1.05, 0.92, 1.35);
  body.position.y = 0.032;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.023, 10, 8), furMat);
  head.position.set(0, 0.058, 0.04);
  head.castShadow = true;
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), furMat);
    ear.scale.set(0.55, 1.9, 0.8);
    ear.position.set(s * 0.009, 0.088, 0.032);
    ear.rotation.z = s * 0.22;
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), whiteMat);
  tail.position.set(0, 0.036, -0.046);
  g.add(tail);
  for (const lx of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), furMat);
    foot.scale.set(0.7, 0.5, 1.6);
    foot.position.set(lx * 0.016, 0.006, 0.01);
    g.add(foot);
  }
  g.scale.setScalar(scale);
  return g;
}
{
  /* 2 鹿 + 3 兔，草甸缓坡放置（偏前侧更易看见，体型放大） */
  const animalSpots = [
    { make: () => makeDeer(2.0), hMin: 0.08, hMax: 0.45, sMax: 0.5, zMin: 0.15 },
    { make: () => makeDeer(1.8), hMin: 0.08, hMax: 0.48, sMax: 0.55 },
    { make: () => makeRabbit(1.8, false), hMin: 0.06, hMax: 0.42, sMax: 0.5, zMin: 0.2 },
    { make: () => makeRabbit(1.6, true), hMin: 0.06, hMax: 0.42, sMax: 0.5 },
    { make: () => makeRabbit(1.7, false), hMin: 0.06, hMax: 0.42, sMax: 0.5, zMin: 0.1 },
  ];
  const placed = [];
  let animalsPlaced = 0;
  for (const spot of animalSpots) {
    let tries = 0;
    while (tries++ < 600) {
      const ang = rng() * Math.PI * 2;
      const rr = 0.25 + Math.sqrt(rng()) * ISLAND_R * 0.6;
      const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
      if (spot.zMin !== undefined && z < spot.zMin) continue;
      if (placed.some(q => Math.hypot(q.x - x, q.z - z) < 0.34)) continue;
      if (treeSpots.some(q => Math.hypot(q.x - x, q.z - z) < 0.24)) continue;
      if (!spotOK(x, z, { hMin: spot.hMin, hMax: spot.hMax, sMax: spot.sMax, rMax: 0.85 })) continue;
      const a = spot.make();
      a.position.set(x, terrainH(x, z) - 0.005, z);
      a.rotation.y = rng() * Math.PI * 2;
      islandGroup.add(a);
      placed.push({ x, z });
      animalsPlaced++;
      break;
    }
  }
  window.__ANIMALS__ = animalsPlaced;
}

/* ============================================================
   V2 鸟群（几何拼装，绕舱缓飞，翅膀扑动）
   ============================================================ */
const birds = [];
function makeBird(bodyColor, wingColor) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85 });
  const wingMat = new THREE.MeshStandardMaterial({ color: wingColor, roughness: 0.85, side: THREE.DoubleSide });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xe8a24a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.062, 6), bodyMat);
  body.geometry.rotateX(Math.PI / 2);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), bodyMat);
  head.position.set(0, 0.007, 0.034);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.016, 5), beakMat);
  beak.geometry.rotateX(Math.PI / 2);
  beak.position.set(0, 0.005, 0.05);
  g.add(beak);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, 0.026), wingMat);
  tail.position.set(0, 0.004, -0.038);
  g.add(tail);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.008, 0.008, 0.004);
    const wg = new THREE.PlaneGeometry(0.056, 0.028);
    wg.rotateX(-Math.PI / 2);
    wg.translate(s * -0.028, 0, 0); /* 内缘为轴 */
    const w = new THREE.Mesh(wg, wingMat);
    pivot.add(w);
    g.add(pivot);
    wings.push(pivot);
  }
  g.userData.wings = wings;
  return g;
}
{
  const kinds = [
    { b: 0x5a7fae, w: 0x7296c4 }, { b: 0xc99a5f, w: 0xdfb37a }, { b: 0x4a4e5a, w: 0x5e636e },
    { b: 0x8a5f4a, w: 0xa87a5e },
  ];
  for (let i = 0; i < kinds.length; i++) {
    const bird = makeBird(kinds[i].b, kinds[i].w);
    bird.userData.flight = {
      rx: 0.85 + rng() * 0.35, rz: 0.75 + rng() * 0.4,
      y0: 0.35 + rng() * 0.9, sp: (0.14 + rng() * 0.10) * (i % 2 ? 1 : -1),
      ph: rng() * Math.PI * 2, flap: 7 + rng() * 3, scale: 1.3 + rng() * 0.5
    };
    bird.scale.setScalar(bird.userData.flight.scale);
    cubeGroup.add(bird);
    birds.push(bird);
  }
}

/* ============================================================
   V2 舱内云朵（Sprite 群，绕雪峰）
   ============================================================ */
const cloudMat = new THREE.SpriteMaterial({
  map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.55,
  depthWrite: false, fog: false
});
const cloudGroup = new THREE.Group();
const cloudSprites = [];
{
  const clusterDefs = [
    [-1.18, 1.48, 0.16, 0.5], [0.88, 1.50, -1.08, 0.52],
    [0.38, 1.50, 0.88, 0.42], [-0.55, 1.48, 1.02, 0.42], [1.14, 1.32, 0.36, 0.38],
    [0.85, 1.46, -1.25, 0.38],
  ];
  for (const [cx, cy, cz, cs] of clusterDefs) {
    const n = 5 + (rng() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(cloudMat);
      const s = cs * (0.55 + rng() * 0.7);
      sp.position.set(cx + (rng() - 0.5) * cs * 1.5, cy + (rng() - 0.5) * cs * 0.4, cz + (rng() - 0.5) * cs * 0.9);
      sp.scale.set(s * 1.8, s * 0.85, 1);
      cloudGroup.add(sp);
      cloudSprites.push({ sp, base: sp.position.clone(), ph: rng() * Math.PI * 2 });
    }
  }
  islandGroup.add(cloudGroup);
}

/* ---------- 萤火虫 ---------- */
const FIREFLY_N = 56;
const fireflyMat = new THREE.SpriteMaterial({
  map: glowTex, color: 0xffe08a,
  transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false,
  blending: THREE.AdditiveBlending, fog: false
});
const fireflies = new THREE.Group();
const fireflyBase = [];
{
  for (let i = 0; i < FIREFLY_N; i++) {
    const ang = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * 1.15;
    const b = {
      x: Math.cos(ang) * rr, y: 0.3 + rng() * 0.9, z: Math.sin(ang) * rr,
      ph: rng() * Math.PI * 2, sp: 0.4 + rng() * 0.8, amp: 0.12 + rng() * 0.2
    };
    fireflyBase.push(b);
    const s = new THREE.Sprite(fireflyMat);
    s.scale.setScalar(0.13 + rng() * 0.07);
    s.position.set(b.x, b.y, b.z);
    fireflies.add(s);
  }
  fireflies.userData.base = fireflyBase;
  islandGroup.add(fireflies);
}

/* ---------- 尘埃微粒 ---------- */
const dustMat = new THREE.MeshBasicMaterial({
  color: 0xfff4dd,
  transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false,
  blending: THREE.AdditiveBlending, fog: false
});
{
  const N = 140;
  const dust = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 4, 3), dustMat, N);
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    m.makeTranslation((rng() - 0.5) * 3.0, (rng() - 0.5) * 3.0, (rng() - 0.5) * 3.0);
    dust.setMatrixAt(i, m);
  }
  cubeGroup.add(dust);
  cubeGroup.userData.dust = dust;
}

/* ============================================================
   V2 体积光束（上方斜射加性光锥面片）
   ============================================================ */
const beamMat = new THREE.MeshBasicMaterial({
  map: beamTex, color: 0xfff2d0, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  toneMapped: false, fog: false
});
const beams = [];
{
  const beamDefs = [
    { x: -0.35, y: 0.55, z: -0.15, len: 1.9, w1: 0.18, w2: 0.80, rz: -0.42, ry: 0.4, f: 0.7 },
    { x: 0.42, y: 0.42, z: -0.35, len: 1.7, w1: 0.15, w2: 0.62, rz: 0.38, ry: -0.5, f: 0.9 },
    { x: 0.25, y: 0.30, z: 0.62, len: 1.3, w1: 0.12, w2: 0.50, rz: 0.46, ry: 0.25, f: 1.1 },
  ];
  for (const d of beamDefs) {
    const geo = new THREE.BufferGeometry();
    const hw1 = d.w1 / 2, hw2 = d.w2 / 2;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -hw1, d.len / 2, 0, hw1, d.len / 2, 0,
      -hw2, -d.len / 2, 0, hw2, -d.len / 2, 0
    ], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const mesh = new THREE.Mesh(geo, beamMat);
    mesh.position.set(d.x, d.y, d.z);
    mesh.rotation.set(0, d.ry, d.rz);
    cubeGroup.add(mesh);
    beams.push({ mesh, f: d.f, ph: rng() * Math.PI * 2 });
  }
}

/* ---------- 玻璃外壳 + 黄铜棱框 ---------- */
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xf2f8ff,
  transmission: 1.0,
  thickness: 0.35,
  roughness: 0.02,
  ior: 1.5,
  clearcoat: 1.0,
  clearcoatRoughness: 0.04,
  envMapIntensity: 2.2,
  specularIntensity: 1.0,
  attenuationColor: new THREE.Color(0xdfeef2),
  attenuationDistance: 4.5,
  transparent: false,
  depthWrite: false,
  side: THREE.FrontSide
});
const glass = new THREE.Mesh(new THREE.BoxGeometry(CUBE, CUBE, CUBE), glassMat);
glass.renderOrder = 1;
cubeGroup.add(glass);

const sheenMat = new THREE.MeshStandardMaterial({
  color: 0x000000, metalness: 1.0, roughness: 0.18,
  envMapIntensity: 1.8, transparent: true, opacity: 0.38,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const sheen = new THREE.Mesh(new THREE.BoxGeometry(CUBE + 0.006, CUBE + 0.006, CUBE + 0.006), sheenMat);
sheen.renderOrder = 3;
cubeGroup.add(sheen);

{
  const brassMat = baseGroup.userData.brassMat;
  const edge = new THREE.Group();
  const r = 0.024, half = CUBE / 2;
  const axis = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1]
  ];
  for (const [ax, ay, az] of axis) {
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, CUBE - r * 1.2, 10), brassMat);
      if (ax) { bar.rotation.z = Math.PI / 2; bar.position.set(0, s1 * half, s2 * half); }
      else if (ay) { bar.position.set(s1 * half, 0, s2 * half); }
      else { bar.rotation.x = Math.PI / 2; bar.position.set(s1 * half, s2 * half, 0); }
      bar.castShadow = true;
      edge.add(bar);
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const corner = new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 12, 10), brassMat);
    corner.position.set(sx * half, sy * half, sz * half);
    corner.castShadow = true;
    edge.add(corner);
  }
  cubeGroup.add(edge);
}

/* ---------- 星空 + 月亮 ---------- */
let starMat;
{
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  for (let i = 0; i < 900; i++) {
    const x = rng() * 2048, y = rng() * 460;
    const r = 0.6 + Math.pow(rng(), 3) * 4.5;
    const a = 0.25 + rng() * 0.75;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.3, `rgba(230,238,255,${a * 0.5})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  starMat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.BackSide,
    transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending, fog: false
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(38, 32, 20), starMat);
  sky.renderOrder = -10;
  scene.add(sky);
}
const moonMat = new THREE.SpriteMaterial({
  map: glowTex, color: 0xdfe9ff, transparent: true, opacity: 0,
  depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, fog: false
});
const moon = new THREE.Sprite(moonMat);
moon.position.set(-8, 10, -14);
moon.scale.setScalar(2.2);
scene.add(moon);

/* ============================================================
   V2 后期：移轴散景（对角焦平面渐变模糊） + OutputPass
   ============================================================ */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    uDir: { value: new THREE.Vector2(0.64, 0.77).normalize() },
    uBand: { value: 0.09 },
    uSoft: { value: 0.30 },
    uMaxBlur: { value: 14.0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform vec2 uDir;
    uniform float uBand;
    uniform float uSoft;
    uniform float uMaxBlur;
    varying vec2 vUv;
    void main() {
      float d = abs(dot(vUv - vec2(0.5), uDir));
      float b = smoothstep(uBand, uBand + uSoft, d) * uMaxBlur; /* 像素计的模糊半径 */
      vec2 px = uTexel * b;
      vec4 c = texture2D(tDiffuse, vUv) * 1.9;
      c += texture2D(tDiffuse, vUv + px * vec2(-0.28, -0.52));
      c += texture2D(tDiffuse, vUv + px * vec2( 0.38, -0.42));
      c += texture2D(tDiffuse, vUv + px * vec2(-0.60,  0.12));
      c += texture2D(tDiffuse, vUv + px * vec2( 0.55,  0.24));
      c += texture2D(tDiffuse, vUv + px * vec2(-0.14,  0.68));
      c += texture2D(tDiffuse, vUv + px * vec2( 0.48,  0.58));
      c += texture2D(tDiffuse, vUv + px * vec2( 0.86, -0.16));
      c += texture2D(tDiffuse, vUv + px * vec2(-0.86,  0.22));
      c /= 9.9;
      gl_FragColor = c;
    }`
};
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.setSize(innerWidth, innerHeight);
const renderPass = new RenderPass(scene, camera);
const tiltPass = new ShaderPass(TiltShiftShader);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(tiltPass);
composer.addPass(outputPass);
function updateTiltTexel() {
  TiltShiftShader.uniforms.uTexel.value.set(
    1 / (innerWidth * Math.min(devicePixelRatio, 2)),
    1 / (innerHeight * Math.min(devicePixelRatio, 2))
  );
}
updateTiltTexel();

/* ============================================================
   昼夜光照预设 & 状态机（V2 联动：瀑布微光/雪峰冷月/云雾/光束）
   ============================================================ */
const PRESETS = {
  day: {
    keyColor: 0xfff1da, keyInt: 3.4, keyPos: [4.2, 6.2, 3.2],
    hemiSky: 0xbcd2ff, hemiGround: 0x3a352c, hemiInt: 0.75,
    rimColor: 0xcfe0ff, rimInt: 1.05,
    envInt: 1.0, exposure: 1.26,
    firefly: 0.0, mush: 0.0, star: 0.0, soil: 0.0,
    innerLight: 0.0, waterGlow: 0.25, dust: 0.32,
    sheen: 0.32, bottom: 0.42, fog: 0x0b0d11,
    beam: 0.55, beamColor: 0xffe8b0, cloud: 0.55, cloudColor: 0xffffff,
    mist: 0.12, wfGlow: 0.05, peak: 0.0
  },
  dusk: {
    keyColor: 0xff8a4a, keyInt: 2.6, keyPos: [-5.0, 1.6, 1.4],
    hemiSky: 0x6a70a8, hemiGround: 0x453328, hemiInt: 0.5,
    rimColor: 0xffb37a, rimInt: 1.6,
    envInt: 0.8, exposure: 1.15,
    firefly: 0.55, mush: 1.2, star: 0.08, soil: 0.6,
    innerLight: 0.5, waterGlow: 0.7, dust: 0.3,
    sheen: 0.68, bottom: 0.75, fog: 0x241812,
    beam: 0.5, beamColor: 0xffb066, cloud: 0.72, cloudColor: 0xffc4ae,
    mist: 0.18, wfGlow: 0.32, peak: 0.2
  },
  night: {
    keyColor: 0x80a3ff, keyInt: 0.95, keyPos: [2.5, 5.5, -2.5],
    hemiSky: 0x2c3d66, hemiGround: 0x1c1916, hemiInt: 0.4,
    rimColor: 0x9db8ff, rimInt: 1.3,
    envInt: 0.5, exposure: 1.02,
    firefly: 1.0, mush: 2.6, star: 0.95, soil: 0.45,
    innerLight: 1.1, waterGlow: 1.25, dust: 0.22,
    sheen: 0.75, bottom: 0.7, fog: 0x0b0d11,
    beam: 0.20, beamColor: 0x9fc0ff, cloud: 0.28, cloudColor: 0x8fa4c8,
    mist: 0.3, wfGlow: 0.95, peak: 2.0
  }
};
const state = {
  keyColor: new THREE.Color(), keyInt: 0, keyPos: new THREE.Vector3(),
  hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiInt: 0,
  rimColor: new THREE.Color(), rimInt: 0,
  envInt: 1, exposure: 1.12, firefly: 0, mush: 0, star: 0, soil: 0,
  innerLight: 0, waterGlow: 0.25, dust: 0.3,
  sheen: 0.32, bottom: 0.15, fog: new THREE.Color(0x0b0d11),
  beam: 0.15, beamColor: new THREE.Color(0xfff2d0),
  cloud: 0.55, cloudColor: new THREE.Color(0xffffff),
  mist: 0.12, wfGlow: 0.05, peak: 0
};
let target = PRESETS.day;
function snapTo(p) {
  state.keyColor.set(p.keyColor); state.keyInt = p.keyInt;
  state.keyPos.set(...p.keyPos);
  state.hemiSky.set(p.hemiSky); state.hemiGround.set(p.hemiGround); state.hemiInt = p.hemiInt;
  state.rimColor.set(p.rimColor); state.rimInt = p.rimInt;
  state.envInt = p.envInt; state.exposure = p.exposure;
  state.firefly = p.firefly; state.mush = p.mush; state.star = p.star; state.soil = p.soil;
  state.innerLight = p.innerLight; state.waterGlow = p.waterGlow; state.dust = p.dust;
  state.sheen = p.sheen; state.bottom = p.bottom; state.fog.set(p.fog);
  state.beam = p.beam; state.beamColor.set(p.beamColor);
  state.cloud = p.cloud; state.cloudColor.set(p.cloudColor);
  state.mist = p.mist; state.wfGlow = p.wfGlow; state.peak = p.peak;
}
function setMode(mode) {
  if (!PRESETS[mode]) return;
  target = PRESETS[mode];
  scene.background = (mode === 'dusk') ? bgTexDusk : bgTex;
  scene.environment = (mode === 'dusk') ? envTexWarm : envTexCool;
  document.querySelectorAll('.modebar button').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === mode));
  window.__MODE__ = mode;
}
window.__TERRARIUM = { setMode, ready: false };
window.__TERRARIUM.setView = (azDeg) => {
  const off = camera.position.clone().sub(controls.target);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.theta = THREE.MathUtils.degToRad(azDeg);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
  controls.update();
};
/* 调试：直接设机位（世界坐标） */
window.__TERRARIUM.setCam = (x, y, z, tx, ty, tz) => {
  camera.position.set(x, y, z);
  if (tx !== undefined) controls.target.set(tx, ty, tz);
  controls.update();
};
window.__DBG = () => ({
  mode: window.__MODE__,
  starOp: starMat.opacity, ffOp: fireflyMat.opacity,
  mush: mushroomMat.emissiveIntensity, mushGlow: mushGlowMat.opacity,
  beam: beamMat.opacity, cloud: cloudMat.opacity, mist: mistMat.opacity,
  wf: fallMat.emissiveIntensity, peak: peakLight.intensity,
  calls: renderer.info.render.calls,
  envInt: scene.environmentIntensity
});
snapTo(PRESETS.day);
setMode('day');

/* ---------- UI ---------- */
document.querySelectorAll('.modebar button').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));
{
  const q = new URLSearchParams(location.search).get('mode');
  if (q) setMode(q);
}
addEventListener('keydown', e => {
  if (e.key === '1') setMode('day');
  if (e.key === '2') setMode('dusk');
  if (e.key === '3') setMode('night');
});

/* ============================================================
   主循环
   ============================================================ */
const clock = new THREE.Clock();
const _kColor = new THREE.Color(), _hSky = new THREE.Color(), _hGr = new THREE.Color(),
      _rColor = new THREE.Color(), _fogColor = new THREE.Color(), _bColor = new THREE.Color(),
      _cColor = new THREE.Color();
const _ahead = new THREE.Vector3();
let frames = 0;

function tick() {
  requestAnimationFrame(tick);
  const rdt = Math.min(clock.getDelta(), 1.0);
  const dt = Math.min(rdt, 0.05);
  const t = clock.elapsedTime;
  const k = 1 - Math.exp(-rdt * 2.4);

  /* 光照插值 */
  _kColor.set(target.keyColor); state.keyColor.lerp(_kColor, k);
  _hSky.set(target.hemiSky); state.hemiSky.lerp(_hSky, k);
  _hGr.set(target.hemiGround); state.hemiGround.lerp(_hGr, k);
  _rColor.set(target.rimColor); state.rimColor.lerp(_rColor, k);
  state.keyInt += (target.keyInt - state.keyInt) * k;
  state.hemiInt += (target.hemiInt - state.hemiInt) * k;
  state.rimInt += (target.rimInt - state.rimInt) * k;
  state.envInt += (target.envInt - state.envInt) * k;
  state.exposure += (target.exposure - state.exposure) * k;
  state.firefly += (target.firefly - state.firefly) * k;
  state.mush += (target.mush - state.mush) * k;
  state.star += (target.star - state.star) * k;
  state.soil += ((target.soil ?? 0) - state.soil) * k;
  state.innerLight += (target.innerLight - state.innerLight) * k;
  state.waterGlow += (target.waterGlow - state.waterGlow) * k;
  state.dust += (target.dust - state.dust) * k;
  state.sheen += (target.sheen - state.sheen) * k;
  state.bottom += (target.bottom - state.bottom) * k;
  state.beam += (target.beam - state.beam) * k;
  state.cloud += (target.cloud - state.cloud) * k;
  state.mist += (target.mist - state.mist) * k;
  state.wfGlow += (target.wfGlow - state.wfGlow) * k;
  state.peak += (target.peak - state.peak) * k;
  state.beamColor.lerp(_bColor.set(target.beamColor), k);
  state.cloudColor.lerp(_cColor.set(target.cloudColor), k);
  state.fog.lerp(_fogColor.set(target.fog), k);

  keyLight.color.copy(state.keyColor);
  keyLight.intensity = state.keyInt;
  const kp = new THREE.Vector3(...target.keyPos);
  keyLight.position.lerp(kp, k);
  hemiLight.color.copy(state.hemiSky);
  hemiLight.groundColor.copy(state.hemiGround);
  hemiLight.intensity = state.hemiInt;
  rimLight.color.copy(state.rimColor);
  rimLight.intensity = state.rimInt;
  renderer.toneMappingExposure = state.exposure;
  scene.environmentIntensity = state.envInt;
  fireflyMat.opacity = state.firefly;
  mushroomMat.emissiveIntensity = state.mush;
  mushGlowMat.opacity = Math.min(0.9, state.mush * 0.3);
  if (bottomSoilMat) bottomSoilMat.emissiveIntensity = state.soil;
  starMat.opacity = state.star;
  moonMat.opacity = state.star * 0.8;
  innerLight.intensity = state.innerLight;
  waterMat.emissiveIntensity = state.waterGlow;
  dustMat.opacity = state.dust;
  sheenMat.opacity = state.sheen;
  bottomLight.intensity = state.bottom;
  scene.fog.color.copy(state.fog);
  beamMat.color.copy(state.beamColor);
  cloudMat.color.copy(state.cloudColor);
  cloudMat.opacity = state.cloud;
  mistMat.opacity = state.mist;
  wfMistMat.opacity = 0.2 + state.mist * 1.2;
  fallMat.emissiveIntensity = state.wfGlow;
  riverMat.emissiveIntensity = 0.15 + state.wfGlow * 0.35 + state.waterGlow * 0.15;
  fallLight.intensity = state.wfGlow * 0.45;
  peakLight.intensity = state.peak;
  peakGlowMat.opacity = Math.min(0.55, state.peak * 0.32);
  snowCapMat.emissiveIntensity = state.peak * 0.6;

  /* 浮动 & 自转 */
  cubeGroup.position.y = 2.55 + Math.sin(t * 0.55) * 0.055;
  cubeGroup.rotation.y = Math.sin(t * 0.1) * 0.06;
  islandGroup.rotation.y = t * 0.03;

  /* 萤火虫游动 */
  {
    const base = fireflies.userData.base;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      const s = fireflies.children[i];
      s.position.set(
        b.x + Math.sin(t * b.sp + b.ph) * b.amp,
        b.y + Math.sin(t * b.sp * 0.7 + b.ph * 2.0) * b.amp * 0.6,
        b.z + Math.cos(t * b.sp * 0.8 + b.ph) * b.amp);
      const pulse = 0.75 + 0.25 * Math.sin(t * (1.2 + b.sp) + b.ph * 3.0);
      const sc = (0.13 + (i % 7) * 0.008) * pulse;
      s.scale.setScalar(sc);
    }
  }
  /* 尘埃缓旋 */
  if (cubeGroup.userData.dust) {
    cubeGroup.userData.dust.rotation.y = t * 0.02;
    cubeGroup.userData.dust.position.y = Math.sin(t * 0.3) * 0.05;
  }

  /* V2 水流动画（UV 滚动） */
  flowTexRiver.offset.y -= dt * 0.45;
  flowTexFall.offset.y -= dt * 1.5;

  /* V2 鸟群绕舱缓飞 */
  for (const bird of birds) {
    const f = bird.userData.flight;
    const th = t * f.sp + f.ph;
    const x = Math.cos(th) * f.rx;
    const z = Math.sin(th) * f.rz;
    const y = f.y0 + Math.sin(t * 0.8 + f.ph) * 0.14;
    bird.position.set(x, y, z);
    const th2 = th + 0.08 * Math.sign(f.sp);
    _ahead.set(Math.cos(th2) * f.rx, y + 0.02, Math.sin(th2) * f.rz);
    bird.lookAt(_ahead);
    const flap = Math.sin(t * f.flap + f.ph) * 0.85;
    bird.userData.wings[0].rotation.z = -0.15 - flap;
    bird.userData.wings[1].rotation.z = 0.15 + flap;
  }

  /* V2 云朵缓漂 */
  for (const c of cloudSprites) {
    c.sp.position.x = c.base.x + Math.sin(t * 0.09 + c.ph) * 0.10;
    c.sp.position.y = c.base.y + Math.sin(t * 0.14 + c.ph * 2.0) * 0.045;
  }
  cloudGroup.rotation.y = Math.sin(t * 0.02) * 0.15;

  /* V2 雾团呼吸 */
  for (const m of mistBase) {
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.5 + m.ph);
    m.sp.scale.set(m.s * 1.6 * pulse, m.s * 0.8 * pulse, 1);
  }
  mistGroup.rotation.y = t * 0.012;

  /* V2 光束呼吸 */
  for (const b of beams) {
    b.mesh.material.opacity = state.beam * b.f * (0.8 + 0.2 * Math.sin(t * 0.6 + b.ph));
  }

  grassUniforms.uTime.value = t;
  controls.update();
  composer.render();

  if (++frames === 3) window.__TERRARIUM.ready = true;
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  updateTiltTexel();
});
