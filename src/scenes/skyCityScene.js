// src/scenes/skyCityScene.js — 天空之城：暮色云海上的浮空城。
// 纯代码几何体（无 GLB），三渲二配方（MeshToonMaterial 3 级 gradientMap /
// 关键物件 inverted hull 描边 / UnrealBloomPass + ACES + 冷色雾 / emissive 窗
// 保背光面可读）。元素：倒锥浮岩主岛 + 同心台地 + 中心冲天光柱尖塔 +
// 三道反向慢旋光环（其一挂发光浮石）+ 六座错相位沉浮小浮岛（两座带瀑布）+
// 三层横向漂移云海 + 暮色渐变天空球与星。
// 接口：initSkyCity(container) → { setView(name), setOrbit(on), dispose() }
// dispose 彻底（RAF / 监听 / geometry / material / texture / renderer / canvas），
// StrictMode 双挂载与路由切换安全。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* 四个机位预设：全景 / 仰视光柱 / 平视云海 / 贴环看城 */
const VIEWS = {
  iso:   { pos: [27, 15, 34],      tgt: [0, 3, 0] },   // 全景：主体占 1/4~1/3
  beam:  { pos: [9.5, -2.5, 15],   tgt: [0, 14, 0] },  // 仰视光柱：低机位看晶体与光柱
  cloud: { pos: [36, -9, -4],      tgt: [0, 3, 0] },   // 平视云海：云层高度看浮城
  ring:  { pos: [15.2, 8.6, 4.2],  tgt: [0, 5, 0] },   // 贴环看城：贴着金环看塔
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

export function initSkyCity(container) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  let disposed = false;
  const rand = mulberry32(20261031);
  const tickers = [];   // 每帧更新回调（dt, t）

  /* ---------- renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  controls.maxPolarAngle = Math.PI * 0.66;   // 允许压到云层边缘看岛底，但不整个钻进云下
  controls.autoRotateSpeed = 0.45;

  /* ---------- 灯光：暖色低角度落日主光 + 冷蓝半球（置低防发灰）+ 暗侧冷补 ---------- */
  const sun = new THREE.DirectionalLight(0xffb070, 1.7);
  sun.position.set(60, 22, -38);             // 仰角约 17° 的低角度落日
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 40;  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x5a7ab8, 0x141a30, 0.55);
  scene.add(hemi);

  const coldFill = new THREE.DirectionalLight(0x4a5f8f, 0.35);  // 暗侧冷补：背光面不死黑
  coldFill.position.set(-40, 30, 40);
  scene.add(coldFill);

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

  /* inverted hull 描边：BackSide 深色壳，顶点沿法线外扩；厚度分档缓存共享材质 */
  const OUTLINE_COLOR = 0x0e1120;
  const outlineMats = new Map();
  function addOutline(mesh) {
    if (!mesh.geometry || !mesh.geometry.attributes.normal) return;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere.radius || 1;
    const th = THREE.MathUtils.clamp(r * 0.016, 0.012, 0.09).toFixed(3);
    let mat = outlineMats.get(th);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\ttransformed += normal * ' + th + ';'
        );
      };
      outlineMats.set(th, mat);
    }
    const o = new THREE.Mesh(mesh.geometry, mat);
    o.castShadow = o.receiveShadow = false;
    mesh.add(o);
  }

  /* emissive 窗材质池：暖橙为主、少量冷白、部分熄灭（>1 亮度喂给 bloom） */
  const winGeo = new THREE.PlaneGeometry(0.18, 0.24);
  const WIN_MAT = {
    warm:  new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.55) }),
    warm2: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.95, 0.4) }),
    cold:  new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.8, 2.3) }),
    off:   new THREE.MeshBasicMaterial({ color: 0x25222b }),
  };
  function pickWinMat() {
    const r = rand();
    if (r < 0.6) return WIN_MAT.warm;
    if (r < 0.76) return WIN_MAT.warm2;
    if (r < 0.88) return WIN_MAT.cold;
    return WIN_MAT.off;
  }
  /* 在盒身四面随机点窗（保证任意角度都有可读的窗光） */
  function addWindows(group, w, h, d, bodyH) {
    const sides = [
      { rx: 0,           px: 0,        pz: d / 2 + 0.012 },
      { rx: Math.PI,     px: 0,        pz: -d / 2 - 0.012 },
      { rx: Math.PI / 2, px: w / 2 + 0.012,  pz: 0 },
      { rx: -Math.PI / 2, px: -w / 2 - 0.012, pz: 0 },
    ];
    for (const s of sides) {
      const n = rand() < 0.55 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        if (rand() < 0.12) continue;   // 这扇不点灯（少量熄灭）
        const m = new THREE.Mesh(winGeo, pickWinMat());
        const off = (i === 0 ? -0.22 : 0.2) * (s.px === 0 ? w : d) / 1;
        if (s.px === 0) m.position.set(off, bodyH * (0.35 + rand() * 0.3), s.pz);
        else m.position.set(s.px, bodyH * (0.35 + rand() * 0.3), off);
        m.rotation.y = s.rx;
        group.add(m);
      }
    }
  }

  /* ---------- 天空：暮色渐变内壁球 + 星 + 地平线暖光斑 ---------- */
  function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 1024;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0.00, '#070d1f');   // 顶部深青蓝
    grad.addColorStop(0.30, '#12203f');
    grad.addColorStop(0.50, '#274066');
    grad.addColorStop(0.62, '#4a5a7a');
    grad.addColorStop(0.71, '#8a5f62');   // 过渡玫瑰灰
    grad.addColorStop(0.77, '#c87f4a');
    grad.addColorStop(0.81, '#ef9a4e');   // 地平线暖橙金（拉足落日的橙）
    grad.addColorStop(0.84, '#f6b56a');
    grad.addColorStop(0.88, '#d98a52');
    grad.addColorStop(0.92, '#5c4150');   // 云下深处压暗
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

  /* 星星：只在高处，微冷白 */
  {
    const N = 240, pos = new Float32Array(N * 3);
    let i = 0;
    while (i < N) {
      const u = rand() * 2 - 1, ph = rand() * Math.PI * 2;
      const y = u;                                   // 球面均匀取点，只要上半高纬
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

  /* 落日方向的暖光斑（加法 sprite，撑住地平线的金） */
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
  {
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff9d55, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sunGlow.position.set(237, 92, -150);   // 沿落日方向推到天空球内壁
    sunGlow.scale.set(200, 200, 1);
    scene.add(sunGlow);
  }

  /* ---------- 主岛：倒锥浮岩 + 同心台地 ---------- */
  const islandRoot = new THREE.Group();
  scene.add(islandRoot);
  const worldBob = new THREE.Group();       // 全城极缓沉浮
  islandRoot.add(worldBob);

  const ROCK = [0x7b6a76, 0x6d5c6b, 0x615063, 0x56465c, 0x4a3c52];
  const SEG = [   // [顶半径, 底半径, 高, 底面 y] —— 4 段锥台 + 尖端，收分层理
    [7.0, 6.1, 2.4, -2.4],
    [5.8, 4.9, 2.6, -5.0],
    [4.5, 3.4, 2.8, -7.8],
    [3.0, 1.6, 3.0, -10.8],
    [1.3, 0.05, 2.6, -13.4],
  ];
  const rockMat = ROCK.map((c) => toon(c));
  SEG.forEach((s, i) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(s[0], s[1], s[2], 9, 1),
      rockMat[i]
    );
    m.position.y = s[3] + s[2] / 2;
    m.castShadow = m.receiveShadow = true;
    worldBob.add(m);
    addOutline(m);
  });

  /* 底尖岩芯：青蓝 emissive，从内部照亮锥底（仰视/底视角可读的关键） */
  const coreMat = toon(0x0e2a33, { emissive: new THREE.Color(0.4, 1.4, 1.8), emissiveIntensity: 1.6 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 0), coreMat);
  core.position.y = -11.6;                 // 卡在尖端收口处，露出岩面才能被看见
  worldBob.add(core);
  tickers.push((dt, t) => { core.rotation.y += dt * 0.4; coreMat.emissiveIntensity = 1.6 + 0.35 * Math.sin(t * 1.1); });
  const coreLight = new THREE.PointLight(0x66d8ff, 2.8, 16, 1.8);
  coreLight.position.set(0, -12.4, 0);     // 放在尖端下方岩体外，真正照亮锥底
  worldBob.add(coreLight);
  /* 岩芯辉光：低机位仰视时的青蓝信号灯 */
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x7fe0ff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  coreGlow.position.set(0, -11.6, 0);
  coreGlow.scale.set(4.5, 4.5, 1);
  worldBob.add(coreGlow);

  /* 台地：顶盘 + 外缘矮墙垛 + 两层收分台 */
  const stoneMats = [toon(0x8a7f76), toon(0x91857b), toon(0x9a8d80)];
  const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(7.05, 6.95, 0.5, 40), stoneMats[0]);
  topDisc.position.y = 0.25;
  topDisc.receiveShadow = true;
  worldBob.add(topDisc);

  const wallRing = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 6.9, 0.35, 48), stoneMats[1]);
  wallRing.position.y = 0.675;
  wallRing.castShadow = wallRing.receiveShadow = true;
  worldBob.add(wallRing);
  const merlonGeo = new THREE.BoxGeometry(0.55, 0.5, 0.35);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const m = new THREE.Mesh(merlonGeo, stoneMats[1]);
    m.position.set(Math.cos(a) * 6.88, 1.08, Math.sin(a) * 6.88);
    m.rotation.y = -a;
    m.castShadow = m.receiveShadow = true;
    worldBob.add(m);
  }

  const terraceA = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.5, 1.3, 32), stoneMats[1]);
  terraceA.position.y = 1.15;
  terraceA.castShadow = terraceA.receiveShadow = true;
  worldBob.add(terraceA);
  addOutline(terraceA);
  const terraceB = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 2.9, 1.3, 28), stoneMats[2]);
  terraceB.position.y = 2.45;
  terraceB.castShadow = terraceB.receiveShadow = true;
  worldBob.add(terraceB);
  addOutline(terraceB);

  /* ---------- 建筑群：盒身 + 四棱锥顶，沿圆周错落排布 ---------- */
  const wallMats = [toon(0xb5a28c), toon(0xab9880), toon(0xbfae95)];
  const roofMats = [toon(0x40708c), toon(0x37597c), toon(0x4d7a90)];
  function makeHouse(scale, tall) {
    const g = new THREE.Group();
    const bodyH = tall ? 1.3 : 0.9;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1, bodyH, 1),
      wallMats[Math.floor(rand() * 3)]
    );
    body.position.y = bodyH / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    addOutline(body);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, tall ? 1.0 : 0.75, 4),
      roofMats[Math.floor(rand() * 3)]
    );
    roof.position.y = bodyH + (tall ? 0.5 : 0.37);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    addWindows(g, 1, bodyH, 1, bodyH);
    g.scale.setScalar(scale);
    return g;
  }

  function ringOfHouses(count, radius, baseY, sMin, sMax, tallChance) {
    const g = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.35;
      const h = makeHouse(sMin + rand() * (sMax - sMin), rand() < tallChance);
      h.position.set(Math.cos(a) * radius, baseY, Math.sin(a) * radius);
      h.rotation.y = -a + Math.PI / 4 + (rand() - 0.5) * 0.4;
      g.add(h);
    }
    worldBob.add(g);
  }
  ringOfHouses(9, 5.55, 0.5, 0.85, 1.2, 0.2);     // 顶盘外圈：小屋环
  ringOfHouses(6, 3.8, 1.8, 1.0, 1.35, 0.5);      // 台地 A：楼座
  ringOfHouses(3, 2.25, 3.1, 1.1, 1.4, 0.8);      // 台地 B：贴塔楼座

  /* ---------- 中心主塔：几段收分身 + 尖锥 + 发光晶体 + 冲天光柱 ---------- */
  const towerMat = toon(0xc2b098);
  const trimMat = toon(0x4a7286);
  function towerPart(geo, mat, y) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    worldBob.add(m);
    return m;
  }
  const plinth = towerPart(new THREE.CylinderGeometry(1.55, 1.75, 0.7, 10), trimMat, 3.45);
  const body = towerPart(new THREE.CylinderGeometry(0.82, 1.08, 6.5, 10), towerMat, 7.05);
  addOutline(body);
  const balcony = towerPart(new THREE.TorusGeometry(0.95, 0.13, 6, 20).rotateX(Math.PI / 2), trimMat, 10.15);
  balcony.castShadow = false;
  const upper = towerPart(new THREE.CylinderGeometry(0.55, 0.74, 2.6, 10), towerMat, 11.75);
  const spire1 = towerPart(new THREE.ConeGeometry(0.85, 2.4, 8), trimMat, 14.2);
  const spire2 = towerPart(new THREE.ConeGeometry(0.5, 2.2, 8), towerMat, 16.4);

  /* 塔身竖窗：四面各一列，暖冷相间 */
  {
    const rows = 5;
    for (let c = 0; c < 4; c++) {
      const a = (c / 4) * Math.PI * 2 + Math.PI / 8;
      for (let r = 0; r < rows; r++) {
        if (rand() < 0.15) continue;
        const f = r / (rows - 1);
        const rad = THREE.MathUtils.lerp(1.1, 0.86, f);
        const m = new THREE.Mesh(winGeo, pickWinMat());
        m.position.set(Math.cos(a) * rad, 4.6 + f * 4.8, Math.sin(a) * rad);
        m.scale.setScalar(0.9);
        m.lookAt(m.position.clone().multiplyScalar(2).setY(m.position.y));
        worldBob.add(m);
      }
    }
  }

  /* 顶端发光晶体（暖白青）+ 呼吸脉动 */
  const crystalMat = toon(0x3a4450, { emissive: new THREE.Color(1.0, 0.93, 0.78), emissiveIntensity: 2.8 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), crystalMat);
  crystal.position.y = 18.3;
  crystal.scale.set(1, 1.5, 1);
  worldBob.add(crystal);
  const crystalLight = new THREE.PointLight(0xffe8c0, 3.0, 18, 1.8);
  crystalLight.position.set(0, 18.0, 0);
  worldBob.add(crystalLight);
  tickers.push((dt, t) => {
    crystal.rotation.y += dt * 0.5;
    const p = 0.5 + 0.5 * Math.sin(t * 0.9);          // 呼吸
    crystalMat.emissiveIntensity = 1.8 + 0.6 * p;
    crystalLight.intensity = 1.8 + 0.9 * p;
  });

  /* 冲天光柱：加法混合半透明圆柱，一直伸到画面外，缓慢呼吸 */
  const beamOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.34, 34, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.15, 1.0, 0.72), transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
  );
  beamOuter.position.y = 18.2 + 17;
  worldBob.add(beamOuter);
  const beamInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.14, 34, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 1.45, 1.05), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
  );
  beamInner.position.y = beamOuter.position.y;
  worldBob.add(beamInner);
  tickers.push((dt, t) => {
    const p = 0.5 + 0.5 * Math.sin(t * 0.55);
    beamOuter.material.opacity = 0.2 + 0.16 * p;
    beamInner.material.opacity = 0.32 + 0.26 * p;
    const s = 1 + 0.14 * p;
    beamOuter.scale.set(s, 1, s);
    beamInner.scale.set(s, 1, s);
  });

  /* ---------- 层叠光环：三道，各自微倾、反向慢旋；主环挂发光浮石 ---------- */
  function makeHalo({ radius, tube, y, emissive, tiltX, tiltZ, spin, studN, studColor }) {
    const tilt = new THREE.Group();
    tilt.position.y = y;
    tilt.rotation.set(tiltX, 0, tiltZ);
    scene.add(tilt);
    const spinG = new THREE.Group();
    tilt.add(spinG);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 8, 110).rotateX(Math.PI / 2),
      toon(0x2e3a44, { emissive: new THREE.Color(emissive), emissiveIntensity: 1.7, flatShading: false })
    );
    spinG.add(ring);
    const studMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...studColor) });
    for (let i = 0; i < studN; i++) {
      const a = (i / studN) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(tube * 1.9, 0), studMat);
      s.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      s.scale.set(1, 1.6, 1);
      spinG.add(s);
    }
    tickers.push((dt) => { spinG.rotation.y += spin * dt; });
    return spinG;
  }
  const halo1 = makeHalo({          // 青金主环：挂浮石
    radius: 11, tube: 0.18, y: 3.2, emissive: 0x59e0c8,
    tiltX: 0.1, tiltZ: -0.06, spin: 0.1, studN: 12, studColor: [1.4, 3.0, 2.6],
  });
  makeHalo({                        // 暖金环：反向
    radius: 13.8, tube: 0.14, y: 7.6, emissive: 0xffc878,
    tiltX: -0.08, tiltZ: 0.12, spin: -0.065, studN: 10, studColor: [3.0, 2.1, 1.0],
  });
  makeHalo({                        // 低位冷蓝环：绕锥体
    radius: 8.6, tube: 0.12, y: -2.8, emissive: 0x7fb8ff,
    tiltX: 0.14, tiltZ: 0.05, spin: 0.045, studN: 8, studColor: [1.3, 1.9, 3.0],
  });

  /* 主环上挂 5 粒发光浮石：随环公转 + 各自微沉浮 */
  const haloStones = [];
  {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 2.3) });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const r = 0.35 + rand() * 0.28;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
      const y0 = -(0.18 + r * 0.7 + 0.2);
      s.position.set(Math.cos(a) * 11, y0, Math.sin(a) * 11);
      halo1.add(s);
      haloStones.push({ mesh: s, y0, ph: rand() * Math.PI * 2 });
    }
  }
  tickers.push((dt, t) => {
    for (const st of haloStones) st.mesh.position.y = st.y0 + Math.sin(t * 0.7 + st.ph) * 0.18;
  });

  /* ---------- 云海：三层大尺度半透明云团，缓慢横向漂移 ---------- */
  function makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const r2 = mulberry32(7);
    for (let i = 0; i < 7; i++) {    // 几团叠加的软泡；边缘留足余量，alpha 在画布边归零（杜绝矩形硬边）
      const x = 120 + r2() * 272, y = 180 + r2() * 152;
      const rr = Math.min(
        60 + r2() * 70,
        x - 24, 488 - x, y - 24, 488 - y
      );
      const rg = g.createRadialGradient(x, y, 2, x, y, rr);
      rg.addColorStop(0, 'rgba(255,255,255,0.5)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 512, 512);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const cloudTex = makeCloudTexture();
  function cloudLayer({ y, n, rMin, rMax, sMin, sMax, tint, opMin, opMax, speed }) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const rad = Math.sqrt(THREE.MathUtils.lerp(rMin * rMin, rMax * rMax, rand()));
      const s = sMin + rand() * (sMax - sMin);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, color: tint, transparent: true,
        opacity: opMin + rand() * (opMax - opMin),
        depthWrite: false, rotation: rand() * Math.PI * 2,
      }));
      sp.position.set(Math.cos(a) * rad, y + (rand() - 0.5) * 1.6, Math.sin(a) * rad);
      sp.scale.set(s, s * 0.5, 1);   // 竖向压扁：侧视不成墙
      g.add(sp);
    }
    scene.add(g);
    tickers.push((dt) => { g.rotation.y += speed * dt; });
    return g;
  }
  cloudLayer({ y: -15.2, n: 60, rMin: 8,  rMax: 58, sMin: 10, sMax: 22, tint: 0xe6d2c2, opMin: 0.5,  opMax: 0.75, speed: 0.004 });  // 上层：连成海托住浮岛，被落日照暖（透明度压低，云下仰视不糊屏）
  cloudLayer({ y: -19.8, n: 34, rMin: 12, rMax: 70, sMin: 15, sMax: 32, tint: 0x454d6e, opMin: 0.6,  opMax: 0.78, speed: 0.0028 }); // 下层：压暗压深（仰视时别糊成紫渍）
  cloudLayer({ y: -11.6, n: 10, rMin: 8,  rMax: 30, sMin: 5,  sMax: 9,  tint: 0xb8bed6, opMin: 0.18, opMax: 0.32, speed: -0.006 }); // 贴岛底碎云

  /* ---------- 小浮岛：倒锥岩 + 草绿顶 + 小塔/树，错相位沉浮；两座带瀑布 ---------- */
  const streakTex = (() => {     // 瀑布水纹：竖长软条
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 64, 2, 32, 64, 30);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const CLOUD_TOP = -14.4;       // 瀑布没入云面的世界高度
  const smallRockMat = toon(0x6b5a6c);
  const grassMat = toon(0x5c8758);
  const trunkMat = toon(0x4a3a30);
  const leafMats = [toon(0x3f6b4f), toon(0x4a7a5c)];
  const floaters = [];
  const waterfalls = [];

  function makeTree(s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6), trunkMat);
    trunk.position.y = 0.25;
    trunk.castShadow = true;
    g.add(trunk);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 7), leafMats[Math.floor(rand() * 2)]);
    c1.position.y = 0.8; c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 7), leafMats[Math.floor(rand() * 2)]);
    c2.position.y = 1.25; c2.castShadow = true;
    g.add(c1, c2);
    g.scale.setScalar(s);
    return g;
  }

  function makeWaterfall(group, ex, ez, topWorldY) {
    const fallH = topWorldY - CLOUD_TOP;
    const wGroup = new THREE.Group();
    wGroup.position.set(ex, -0.1, ez);
    group.add(wGroup);
    for (let i = 0; i < 13; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: streakTex, color: 0xcfe4ff, transparent: true, opacity: 0,
        depthWrite: false,
      }));
      sp.scale.set(0.34 + rand() * 0.2, 1.6 + rand() * 1.2, 1);
      wGroup.add(sp);
      waterfalls.push({
        sp, k: rand(),
        v: (0.35 + rand() * 0.3),                     // 归一化下落速率
        fallH,
        ox: (rand() - 0.5) * 0.22, oz: (rand() - 0.5) * 0.22,
      });
    }
  }

  /* [方位角rad, 距主岛心距离, 基准高度, 体量, 内容, 瀑布] —— 手工布点避免均匀对称 */
  const ISLES = [
    [0.55, 16, -3.0, 1.0, 'tower+tree', true],
    [2.20, 20,  2.5, 1.3, 'tower',      false],
    [3.60, 14, -6.0, 0.8, 'trees',      false],
    [4.60, 22, -1.0, 1.15, 'tower',     true],
    [5.50, 18,  4.0, 0.9, 'tree+house', false],
    [1.35, 26,  6.5, 0.7, 'tree',       false],
  ];
  for (const [ang, dist, baseY, s, kind, hasFall] of ISLES) {
    const g = new THREE.Group();
    g.position.set(Math.cos(ang) * dist, baseY, Math.sin(ang) * dist);
    g.rotation.y = rand() * Math.PI * 2;
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 1.6, 0.08, s * 2.6, 7, 1),
      smallRockMat
    );
    cone.position.y = -s * 1.3;
    cone.castShadow = cone.receiveShadow = true;
    g.add(cone);
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 1.72, s * 1.58, s * 0.3, 9),
      grassMat
    );
    grass.position.y = s * 0.15;
    grass.castShadow = grass.receiveShadow = true;
    g.add(grass);
    if (kind.includes('tower')) {
      const t = makeHouse(s * 1.05, true);
      t.position.y = s * 0.3;
      g.add(t);
    }
    if (kind.includes('house')) {
      const h = makeHouse(s * 0.9, false);
      h.position.set(s * 0.9, s * 0.3, s * 0.5);
      g.add(h);
    }
    if (kind.includes('tree')) {
      const t1 = makeTree(s);
      t1.position.set(kind === 'trees' ? -s * 0.7 : s * 0.6, s * 0.28, kind === 'trees' ? 0 : -s * 0.4);
      g.add(t1);
      if (kind === 'trees') {
        const t2 = makeTree(s * 0.8);
        t2.position.set(s * 0.6, s * 0.28, s * 0.45);
        g.add(t2);
      }
    }
    if (hasFall) makeWaterfall(g, s * 1.35, 0, baseY);
    scene.add(g);
    floaters.push({ g, baseY, ph: rand() * Math.PI * 2, amp: 0.45 + rand() * 0.3, sp: 0.4 + rand() * 0.25 });
  }
  tickers.push((dt, t) => {
    for (const f of floaters) f.g.position.y = f.baseY + Math.sin(t * f.sp + f.ph) * f.amp;
    for (const w of waterfalls) {                     // 瀑布：下落 + 淡入淡出 + 循环
      w.k += w.v * dt;
      if (w.k > 1) w.k -= 1;
      w.sp.position.set(w.ox, -w.k * w.fallH, w.oz);
      w.sp.material.opacity = 0.55 * Math.sin(Math.PI * w.k);
    }
  });

  /* 主城整体极缓沉浮（幅度刻意小于小岛，稳） */
  tickers.push((dt, t) => { worldBob.position.y = Math.sin(t * 0.22 + 1.0) * 0.15; });

  /* ---------- 后期：UnrealBloom（阈值卡在 1.0，只让窗/晶体/光环过曝） ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.52, 0.55, 1.0);
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
    composer.render();
  }
  rafId = requestAnimationFrame(tick);

  /* 调试/验收句柄（与站点 window.__bgm 同约定） */
  window.__skyCity = { camera, controls };

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
