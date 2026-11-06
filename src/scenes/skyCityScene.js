// src/scenes/skyCityScene.js — 天空之城（重制版）
// 黄昏逆光的云海浮空城：程序化王城 / 巨树 / 瀑布 / 云海 / 长桥 / 飞鸟。
// 零外部资产：几何、纹理、环境贴图全部由代码生成。
//
// 架构：
//   skycity/kit.js          随机、噪声、Canvas 纹理、几何合并、实例化、广告牌粒子场
//   skycity/atmosphere.js   天穹 shader、环境贴图、云海、积云、飞鸟、浮尘
//   skycity/terrain.js      主岛岩体 / 草甸 / 植被 / 巨树 / 卫星岛 / 远景浮岛
//   skycity/architecture.js 王城（主塔 / 大殿 / 城门 / 钟楼 / 露台 / 城墙 / 长桥）
//   skycity/water.js        水池 / 溪流 / 瀑布 / 水雾
//
// 对外接口：initSkyCity(container) → { setView(name), setOrbit(on), dispose() }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import {
  mulberry32, disposeObject, BillboardField, GeoKit, stdMat,
  leafTexture, grassTexture,
} from './skycity/kit.js';
import {
  buildEnvironment, buildSky, buildCloudSea, buildCumulus, buildBirds, buildMotes,
  PALETTE, SUN_DIR,
} from './skycity/atmosphere.js';
import {
  buildMainIsland, buildSatelliteIsland, buildDistantIslands, topHeight,
} from './skycity/terrain.js';
import { buildCitadel, buildCausewayBridge } from './skycity/architecture.js';
import { buildWater } from './skycity/water.js';

/* 四个机位 */
const VIEWS = {
  hero:   { pos: [-14.5, 4, 39], tgt: [0.4, 6.2, -1.8] },
  fall:   { pos: [-19, -3.5, 31], tgt: [-6.4, -7.5, 5.5] },
  bridge: { pos: [12, 4.5, 33],  tgt: [15.5, -1.2, 4.0] },
  cloud:  { pos: [30, -18, 44],  tgt: [-2.0, -16.0, 0.0] },
};

/* 后期：柔和暗角 + 冷暖分离 + 细颗粒 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.05 },
    uGrain: { value: 0.012 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 tc = texture2D(tDiffuse, vUv);
      vec3 col = tc.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // 冷暖分离：暗部偏青蓝，亮部偏暖
      col *= mix(vec3(0.965, 1.0, 1.035), vec3(1.035, 1.0, 0.955), smoothstep(0.12, 0.78, l));
      // 轻微 S 曲线
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.34);
      // 暗角
      vec2 q = vUv - 0.5;
      float vig = 1.0 - dot(q, q) * uVignette;
      col *= clamp(vig, 0.0, 1.0);
      // 颗粒
      float g = hash(vUv * vec2(1417.0, 907.0) + fract(uTime) * 31.7);
      col += (g - 0.5) * uGrain;
      // 轻微提饱和
      float lm = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lm), col, 1.16);
      gl_FragColor = vec4(col, tc.a);
    }
  `,
};

/* 桥 / 卫星岛的世界坐标 */
const BRIDGE_A = new THREE.Vector3(9.35, -0.55, 2.65);
const SAT_POS = new THREE.Vector3(22.9, -2.95, 5.1);
const BRIDGE_B = new THREE.Vector3(19.3, -2.25, 4.95);

export function initSkyCity(container) {
  const W = () => container.clientWidth || window.innerWidth;
  const H = () => container.clientHeight || window.innerHeight;
  let disposed = false;
  const rand = mulberry32(0x5c17a3);
  const tickers = [];
  const drifts = [];

  /* ---------------- renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);

  /* ---------------- scene / camera ---------------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(PALETTE.fog, PALETTE.fogDensity);

  const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.5, 2400);
  camera.position.set(...VIEWS.hero.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...VIEWS.hero.tgt);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.minDistance = 14;
  controls.maxDistance = 170;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.655;
  controls.autoRotateSpeed = 0.32;

  /* ---------------- 环境光照贴图 ---------------- */
  const envTex = buildEnvironment(renderer);
  scene.environment = envTex;

  /* ---------------- 灯光：黄昏逆光 + 冷调补光 + 云海反射 ---------------- */
  const sun = new THREE.DirectionalLight(0xffb26d, 4.2);
  sun.position.copy(SUN_DIR).multiplyScalar(180);
  sun.target.position.set(0, -2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -48;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.09;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x7196cf, 0.34);
  fill.position.set(-38, 26, 62);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(0xffd3a2, 0.26);
  bounce.position.set(6, -70, 18);
  scene.add(bounce);

  const hemi = new THREE.HemisphereLight(0x7fa4d4, 0x6a4f36, 0.22);
  scene.add(hemi);

  /* ---------------- 天空 / 云 / 飞鸟 ---------------- */
  const sky = buildSky(scene);
  const cloudSea = buildCloudSea(rand);
  scene.add(cloudSea.group);
  const cumulus = buildCumulus(rand);
  scene.add(cumulus.group);
  cumulus.fields.forEach((field, i) => {
    const speed = i % 2 === 0 ? 0.55 : -0.4;
    drifts.push((dt) => {
      const m = field.mesh;
      if (!m) return;
      m.position.x += dt * speed;
      if (m.position.x > 320) m.position.x -= 640;
      if (m.position.x < -320) m.position.x += 640;
    });
  });

  const birds = buildBirds(rand);
  scene.add(birds.group);
  const motes = buildMotes(rand);
  scene.add(motes.mesh);

  /* ---------------- 主岛 + 王城 ---------------- */
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  const island = buildMainIsland(rand);
  worldRoot.add(island.group);

  const citadel = buildCitadel(rand);
  worldRoot.add(citadel.group);

  /* ---------------- 卫星岛 + 长桥 ---------------- */
  const satLeaves = new BillboardField(leafTexture(), {
    fogColor: new THREE.Color(PALETTE.fog), fogDensity: PALETTE.fogDensity, opacity: 1,
  });
  const satGrass = new BillboardField(grassTexture(), {
    fogColor: new THREE.Color(PALETTE.fog), fogDensity: PALETTE.fogDensity, opacity: 1,
  });
  const sat = buildSatelliteIsland(rand, satLeaves, satGrass);
  sat.position.copy(SAT_POS);
  sat.rotation.y = -0.25;
  worldRoot.add(sat);
  const satLeafMesh = satLeaves.build({ sway: 0.05, flutter: 0.03 });
  if (satLeafMesh) sat.add(satLeafMesh);
  const satGrassMesh = satGrass.build({ sway: 0.03, flutter: 0.02 });
  if (satGrassMesh) sat.add(satGrassMesh);

  const bridge = buildCausewayBridge(rand, BRIDGE_A, BRIDGE_B);
  worldRoot.add(bridge.group);

  // 桥头石台 + 石阶
  {
    const kit = new GeoKit();
    const c = new THREE.Color(0xe6d8bd);
    for (let i = 0; i < 5; i++) {
      const x = BRIDGE_A.x - i * 0.62;
      const z = BRIDGE_A.z - i * 0.1;
      kit.add(new THREE.BoxGeometry(1.5, 0.5, 2.2), c.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.05),
        x, topHeight(x, z) + 0.05, z, { ry: 0.18 });
    }
    for (let i = 0; i < 4; i++) {
      const x = BRIDGE_A.x - 3.2 - i * 0.5;
      const z = BRIDGE_A.z - 0.55;
      kit.add(new THREE.BoxGeometry(1.3, 0.22, 1.9), c.clone().multiplyScalar(0.96),
        x, topHeight(x, z) + 0.12 - i * 0.06, z, { ry: 0.18 });
    }
    worldRoot.add(kit.build(stdMat(0xffffff, { roughness: 0.95, vertexColors: true })));
  }

  // 草地石径：城门 → 桥头，城门 → 巨树 / 水池
  {
    const kit = new GeoKit();
    const pathMat = stdMat(0xffffff, { roughness: 1, vertexColors: true, envMapIntensity: 0.35 });
    const makePath = (pts, width) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])));
      const n = Math.max(10, Math.round(curve.getLength() / 0.9));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t);
        const y = topHeight(p.x, p.z) + 0.06;
        const col = new THREE.Color(0xd9c9a8).offsetHSL(0, 0, (rand() - 0.5) * 0.07);
        kit.add(new THREE.BoxGeometry(width, 0.08, 1.05), col, p.x, y, p.z,
          { ry: Math.atan2(tan.x, tan.z) });
      }
    };
    makePath([[5.9, 2.4], [7.2, 2.5], [8.3, 2.6], [9.1, 2.6]], 1.15);
    makePath([[1.2, 3.4], [-0.4, 4.2], [-2.2, 4.4], [-4.2, 4.0], [-5.6, 3.2]], 1.0);
    makePath([[-2.6, 2.8], [-4.0, 2.6], [-5.2, 2.6]], 0.9);
    worldRoot.add(kit.build(pathMat));
  }

  /* ---------------- 远景浮岛 ---------------- */
  const distantLeaves = new BillboardField(leafTexture(), {
    fogColor: new THREE.Color(PALETTE.fog), fogDensity: PALETTE.fogDensity * 1.1, opacity: 1,
  });
  const distant = buildDistantIslands(rand, distantLeaves);
  const distantLeafMesh = distantLeaves.build({ sway: 0.04, flutter: 0.03 });
  if (distantLeafMesh) distant.add(distantLeafMesh);
  worldRoot.add(distant);

  /* ---------------- 水 ---------------- */
  const water = buildWater(rand);
  worldRoot.add(water.group);
  tickers.push((dt, t) => water.tick(dt, t));

  /* ---------------- 风动 + 动画 ---------------- */
  const fields = [island.leafField, island.grassField, satLeaves, satGrass, distantLeaves, ...water.fields];
  tickers.push((dt, t) => {
    for (const f of fields) f.update(t);
    sky.wisps.update(t);
    cloudSea.fields.forEach((f) => f.update(t));
    cumulus.fields.forEach((f) => f.update(t));
    motes.field.update(t);
    birds.update(t);
  });

  tickers.push((dt, t) => {
    worldRoot.position.y = Math.sin(t * 0.24 + 0.8) * 0.22;
    worldRoot.rotation.z = Math.sin(t * 0.17) * 0.0025;
    cloudSea.group.rotation.y = t * 0.0035;
  });

  /* ---------------- 后期 ---------------- */
  const rt = new THREE.WebGLRenderTarget(W(), H(), {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.24, 0.36, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  /* ---------------- 机位补间 ---------------- */
  let fly = null;
  function flyTo(v, dur = 1.9) {
    fly = {
      t: 0, dur,
      p0: camera.position.clone(), p1: new THREE.Vector3(...v.pos),
      t0: controls.target.clone(), t1: new THREE.Vector3(...v.tgt),
    };
  }

  function updateFov() {
    const a = W() / H();
    camera.fov = a < 0.8 ? 68 : a < 1.0 ? 62 : a < 1.3 ? 54 : a < 1.7 ? 48 : 45;
    camera.updateProjectionMatrix();
  }
  updateFov();

  function onResize() {
    const w = W(), h = H();
    camera.aspect = w / h;
    updateFov();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  }
  window.addEventListener('resize', onResize);

  /* ---------------- 主循环 ---------------- */
  const clock = new THREE.Clock();
  let rafId = 0;
  let time = 0;
  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    if (fly) {
      fly.t += dt / fly.dur;
      const k = fly.t >= 1 ? 1 : (fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2);
      camera.position.lerpVectors(fly.p0, fly.p1, k);
      controls.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.t >= 1) fly = null;
    }

    for (const fn of tickers) fn(dt, time);
    for (const fn of drifts) fn(dt);
    grade.uniforms.uTime.value = time;
    if (sky.glows[1]) sky.glows[1].material.opacity = 0.30 + Math.sin(time * 0.5) * 0.02;

    controls.update();
    renderer.info.reset();
    composer.render();
  }
  rafId = requestAnimationFrame(tick);

  window.__skyCity = {
    ready: true,
    scene,
    camera,
    controls,
    renderer,
    views: VIEWS,
    tri: () => renderer.info.render.triangles,
    calls: () => renderer.info.render.calls,
    setView: (name) => {
      const v = VIEWS[name];
      if (!v || disposed) return;
      controls.autoRotate = false;
      flyTo(v);
    },
  };

  /* ---------------- teardown ---------------- */
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    if (window.__skyCity) delete window.__skyCity;
    controls.dispose();
    composer.dispose();
    rt.dispose();
    disposeObject(scene);
    envTex.dispose();
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
