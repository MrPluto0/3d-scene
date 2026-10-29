// src/scenes/wontonStallScene.js — 雪夜馄饨摊 GLB 实时场景模块。
// 完整移植自 public/stall/viewer.html（三渲二灯光收敛后的最新版查看器）：
//   OrbitControls 阻尼 / EffectComposer+UnrealBloomPass+OutputPass / GLB 灯光强度
//   缩放 / 落雪 Points / 蒸汽 sprite / 灯笼·灯泡串·黑猫 / 四机位补间飞行 /
//   自动环绕 / 双击聚焦 / 三渲二 inverted-hull 描边双管线（默认三渲二）。
// 差异仅一处：GLB 不再内嵌 base64，改为 fetch(glbUrl) 后 loader.parse。
// 接口：initStallScene(container, { glbUrl, onReady, onError })
//   → { setView(name), setOrbit(on), setSnow(on), dispose() }
// dispose 必须可重入、可在 GLB 加载完成前调用（StrictMode 双挂载安全）。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* 四个机位预设：全景 / 桌前 / 街对面 / 过肩 */
const VIEWS = {
  iso:      { pos: [9.5, 14.5, 8.2],   tgt: [0.5, 1.0, -1.2] },
  table:    { pos: [2.3, 0.95, -1.3],  tgt: [0.3, 1.5, -4.0] },
  street:   { pos: [-4.7, 0.7, 2.9],   tgt: [0.8, 1.4, -4.4] },
  shoulder: { pos: [1.75, 1.5, -1.95], tgt: [0.35, 1.35, -4.5] },
};

export function initStallScene(container, { glbUrl, onReady, onError } = {}) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  let disposed = false;

  /* ---------- renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06080f');
  scene.fog = new THREE.FogExp2(0x060a14, 0.022);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 200);
  camera.position.set(...VIEWS.iso.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...VIEWS.iso.tgt);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.2;
  controls.maxDistance = 46;
  controls.maxPolarAngle = Math.PI * 0.495;   // 别钻到地下
  controls.autoRotateSpeed = 0.55;

  /* faint ambient floor so unlit sides stay readable */
  const hemi = new THREE.HemisphereLight(0x28344d, 0x05060a, 0.55);
  hemi.userData.ours = true;
  scene.add(hemi);

  /* ---------- 后期（在触发 GLB 加载前建好，setStyle 依赖 bloom） ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.25, 0.4, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- 三渲二 / 写实 双管线（与 wonton-mini 同一套视觉语言） ---------- */
  /* 3 级 gradientMap：MeshToonMaterial 的色阶分档 */
  const gradientMap = (() => {
    /* 暗档 66：配合压下来的冷蓝补光，暗面是「深蓝」而不是「灰白」也不是死黑；
       亮档 235 封顶：白桌/台面在暖光下不至于推满 255 被裁成平白，把暖橙色留给 ACES */
    const tex = new THREE.DataTexture(new Uint8Array([66, 145, 235]), 3, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  })();

  /* 三渲二专属补光：冷月光主光（带影）+ 天空冷补；GLB 自带暖光压暗当点缀，形成冷暖光比 */
  const moon = new THREE.DirectionalLight(0x5a6f9e, 0.6);
  moon.position.set(-7, 9, -5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -8; moon.shadow.camera.right = 8;
  moon.shadow.camera.top = 8;  moon.shadow.camera.bottom = -8;
  moon.shadow.bias = -0.0006;
  moon.visible = false;
  moon.userData.ours = true;
  scene.add(moon);
  const skyFill = new THREE.DirectionalLight(0x44597f, 0.25);   // 天空冷补压到 ~55%：只留轮廓可读，不抬亮暗部
  skyFill.position.set(6, 10, 6);
  skyFill.visible = false;
  skyFill.userData.ours = true;
  scene.add(skyFill);
  /* 三渲二专属暖溢光：写实里靠 GLB 暖灯的 PBR 衰减自然照亮摊后门洞/墙；
     三渲二色阶压深后那里会塌成死黑，用一盏低强度暖点光补回「微弱可读」并顺带给光池边缘添暖 */
  const warmSpill = new THREE.PointLight(0xffb877, 2.2, 6, 2);
  warmSpill.position.set(0.5, 1.7, -3.6);
  warmSpill.visible = false;
  warmSpill.userData.ours = true;
  scene.add(warmSpill);

  const OUTLINE_COLOR = 0x0d1119;
  const toonRegistry = [];   // { mesh, origMat, toonMat, outline }
  const glbLights = [];      // GLB 内嵌灯，记录 baseIntensity 供两档切换
  let styleReady = false;

  function toonifyMaterial(src) {
    const t = new THREE.MeshToonMaterial({
      gradientMap,
      map: src.map || null,
      emissiveMap: src.emissiveMap || null,   // 招牌/灯箱的自发光贴图必须保留，否则变成无纹理白板
      alphaMap: src.alphaMap || null,
      transparent: src.transparent,
      opacity: src.opacity,
      alphaTest: src.alphaTest,
      side: src.side,
      vertexColors: src.vertexColors,
      fog: src.fog !== false
    });
    t.color.copy(src.color);
    t.emissive.copy(src.emissive);
    t.emissiveIntensity = Math.min(src.emissiveIntensity, 1.0); // 三渲二：自发光只做「亮块」点缀，别把光池中心曝成白色盖掉暖橙
    return t;
  }

  /* inverted hull 描边：同几何体的 BackSide 深色壳，顶点着色器里沿法线膨胀（厚度随体量缩放）。
     只给大中型物件（半径 > 0.22）加壳：小件（碗筷/瓶罐）加壳既看不清也白费 draw call */
  const OUTLINE_MIN_R = 0.22;
  function buildOutline(mesh) {
    if (!mesh.geometry || !mesh.geometry.attributes.normal) return null;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere.radius || 1;
    if (r < OUTLINE_MIN_R) return null;
    const th = THREE.MathUtils.clamp(r * 0.022, 0.006, 0.035);
    const mat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\ttransformed += normal * ' + th.toFixed(4) + ';'
      );
    };
    const o = new THREE.Mesh(mesh.geometry, mat);
    o.castShadow = o.receiveShadow = false;
    o.visible = false;
    mesh.add(o);                                  // 挂子节点，跟随父级变换（灯笼摆动等）
    return o;
  }

  function setStyle(mode) {
    if (!styleReady) {
      scene.traverse(o => {
        if (o.userData.ours) return;
        if (o.isLight) glbLights.push(o);
        else if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
          toonRegistry.push({ mesh: o, origMat: o.material, toonMat: toonifyMaterial(o.material), outline: buildOutline(o) });
        }
      });
      styleReady = true;
    }
    const toon = mode === 'toon';
    for (const r of toonRegistry) {
      r.mesh.material = toon ? r.toonMat : r.origMat;
      if (r.outline) r.outline.visible = toon;
    }
    /* GLB 灯按冷暖分档：暖橙主光（吊灯/灯笼/rim/溢光）提到 0.55 撑起光池；
       冷色 GLB 灯（WS_L_Moon/街灯/冷池，写实基准 3.8~6.8）在三渲二里压到 0.15 ——
       否则它们把整片建筑和雪地抬成纸白，冷暖对撞就没了 */
    for (const l of glbLights) {
      const warm = l.color.r > l.color.b * 1.15;
      l.intensity = (l.userData.baseIntensity || l.intensity) * (toon ? (warm ? 0.5 : 0.15) : 1);
    }
    moon.visible = skyFill.visible = warmSpill.visible = toon;
    /* 半球补光 1.2 → 0.6（50%）：雪地/路面/墙面回到夜色，暗部交给更深的冷蓝色 */
    hemi.intensity = toon ? 0.6 : 0.55;
    hemi.color.setHex(toon ? 0x273b5f : 0x28344d);
    hemi.groundColor.setHex(toon ? 0x0e0d18 : 0x05060a);
    renderer.toneMappingExposure = 0.85;           // 两档同曝光：三渲二不再靠提亮补光，明暗全交给光比
    bloom.strength = toon ? 0.36 : 0.25;           // 三渲二：辉光只留灯珠本身，光池本体交给暖橙光比（ wonton-mini 同源）
    bloom.threshold = toon ? 0.95 : 1.0;
    scene.background.setHex(toon ? 0x0c1322 : 0x06080f);
    scene.fog.color.setHex(toon ? 0x0d1424 : 0x060a14);
    scene.fog.density = toon ? 0.019 : 0.022;      // 三渲二冷雾略加密，纵深拉开
  }

  /* ---------- 落雪 Points ---------- */
  const SNOW_N = 1400;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW_N * 3);
  const snowVel = new Float32Array(SNOW_N * 2);   // fall speed, phase
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3]     = (Math.random() * 2 - 1) * 12;
    snowPos[i * 3 + 1] = Math.random() * 9.5 + 0.1;
    snowPos[i * 3 + 2] = (Math.random() * 2 - 1) * 12;
    snowVel[i * 2]     = 0.25 + Math.random() * 0.6;
    snowVel[i * 2 + 1] = Math.random() * Math.PI * 2;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xdbe4f5, size: 0.045, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false
  }));
  scene.add(snow);

  /* ---------- 蒸汽 sprite ---------- */
  const steamGroup = new THREE.Group();
  function steamTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0.0, 'rgba(255,226,196,0.50)');
    rg.addColorStop(0.5, 'rgba(255,220,190,0.20)');
    rg.addColorStop(1.0, 'rgba(255,220,190,0.0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const steamTex = steamTexture();
  const puffs = [];
  function addPuff(x, z, base, h) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.position.set(x + (Math.random() - 0.5) * 0.35, 1.3 + h * i / 4, z + (Math.random() - 0.5) * 0.35);
      s.scale.setScalar(base * (0.7 + Math.random() * 0.6));
      s.userData = { y0: s.position.y, y1: s.position.y + h, sp: 0.10 + Math.random() * 0.08, ph: Math.random() * Math.PI * 2, base };
      steamGroup.add(s); puffs.push(s);
    }
  }
  function buildSteam() {
    addPuff(-0.55, -4.45, 1.15, 2.2);   // 左锅
    addPuff( 0.35, -4.45, 0.95, 2.0);   // 右锅
    addPuff( 0.01, -3.57, 0.30, 0.55);  // 碗
    scene.add(steamGroup);
  }

  /* ---------- life: 灯笼摆动 / 灯泡串 / 柜台下的猫 ---------- */
  let lanternGroup = null;
  let cat = null, catBody = null, catEyes = []; const catBlink = { next: 4 };
  let bulbs = [];

  function setupLife(root) {
    // 灯笼：把四个部件挂到电缆末端锚点上，tick 里做钟摆
    const anchor = new THREE.Group();
    anchor.position.set(-1.25, 2.12, -3.60);   // WS_lanCable 末端
    scene.add(anchor);
    lanternGroup = new THREE.Group();
    anchor.add(lanternGroup);
    for (const nm of ['WS_lantern', 'WS_lanCapT', 'WS_lanCapB', 'WS_lanTassel']) {
      const o = root.getObjectByName(nm);
      if (o) lanternGroup.attach(o);
    }

    // 两根撑杆之间拉一根灯泡串，下垂弧线，暖光泡轻微闪烁
    const a = new THREE.Vector3(-1.25, 2.42, -4.05), b = new THREE.Vector3(1.95, 2.42, -4.05);
    const mid = a.clone().lerp(b, 0.5); mid.y = 2.10;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    scene.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.008, 5),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.9 })
    ));
    const bulbGeo = new THREE.SphereGeometry(0.035, 8, 8);
    for (let i = 1; i < 8; i++) {
      const p = curve.getPoint(i / 8);
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) }));
      bulb.position.set(p.x, p.y - 0.045, p.z);
      bulb.userData.ph = Math.random() * Math.PI * 2;
      scene.add(bulb); bulbs.push(bulb);
    }

    // 黑猫蜷在柜台下：呼吸起伏 + 偶尔眨眼（眼睛微光）
    cat = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.85 });
    catBody = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), fur);
    catBody.scale.set(1.15, 0.62, 0.95);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), fur);
    head.position.set(0.16, 0.07, 0.10);
    const earG = new THREE.ConeGeometry(0.028, 0.05, 6);
    const e1 = new THREE.Mesh(earG, fur); e1.position.set(0.20, 0.15, 0.12); e1.rotation.z = -0.3;
    const e2 = new THREE.Mesh(earG, fur); e2.position.set(0.12, 0.15, 0.14); e2.rotation.z = -0.3;
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 18, Math.PI * 1.35), fur);
    tail.position.set(-0.12, 0.02, -0.02); tail.rotation.x = Math.PI / 2; tail.rotation.z = 0.5;
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.05, 0.5) });
    const eyeG = new THREE.SphereGeometry(0.011, 6, 6);
    const ey1 = new THREE.Mesh(eyeG, eyeM); ey1.position.set(0.21, 0.08, 0.165);
    const ey2 = new THREE.Mesh(eyeG, eyeM); ey2.position.set(0.165, 0.08, 0.175);
    cat.add(catBody, head, e1, e2, tail, ey1, ey2);
    catEyes = [ey1, ey2];
    cat.position.set(-0.62, 0.14, -4.18);
    cat.rotation.y = 0.6;
    scene.add(cat);
  }

  /* ---------- GLB 加载：fetch + parse（不再内嵌 base64） ---------- */
  function disposeGltf(root) {
    const seen = new Set();
    root.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          disposeMaterial(m);
        }
      }
    });
  }
  const abort = new AbortController();
  const loader = new GLTFLoader();
  fetch(glbUrl, { signal: abort.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((buf) => {
      if (disposed) return;
      loader.parse(buf, '', (gltf) => {
        if (disposed) { disposeGltf(gltf.scene); return; }   // 卸载竞态：加载完成时组件已 dispose
        const root = gltf.scene;
        root.traverse(o => {
          if (o.isMesh) {
            o.castShadow = o.receiveShadow = true;
            if (o.material) {
              o.material.side = THREE.DoubleSide;      // 单面雪片/棚布从下往上看
              /* Blender 导出的路灯/灯泡自发光强度 14~40，线性 HDR 下远超 bloom 阈值，会把整片灯区炸成白团 */
              if (o.material.emissiveIntensity > 8) o.material.emissiveIntensity = 8;
            }
          }
          if (o.isLight) {
            /* Blender W -> glTF candela 换算出的强度在 three.js 里高约两个数量级，压回夜间量级 */
            if (o.isPointLight || o.isSpotLight) {
              o.intensity /= 250;
              /* 街灯 107cd / 摊位吊灯 31cd：贴着浅色地面/台面时 1/d² 衰减后仍把大片区域推过 bloom 阈值 → 白斑 */
              o.intensity = Math.min(o.intensity, 9);
            }
            else if (o.isDirectionalLight) o.intensity /= 300;
            o.castShadow = false;                       // 只给主角灯开影子
            if (o.name === 'WS_L_Bulb' || o.name === 'WS_L_Street') {
              o.castShadow = true;
              o.shadow.mapSize.set(1024, 1024);
              o.shadow.bias = -0.002;
            }
            o.userData.baseIntensity = o.intensity;    // PBR 基准强度，三渲二模式按比例压暗
          }
        });
        scene.add(root);
        buildSteam();
        setupLife(root);
        setStyle('toon');                               // 默认三渲二
        if (onReady) onReady();
      }, (e) => {
        if (!disposed && onError) onError('模型加载失败：' + (e?.message || e));
      });
    })
    .catch((e) => {
      if (!disposed && onError) onError('模型加载失败：' + (e?.message || e));
    });

  /* ---------- 机位补间飞行 ---------- */
  let fly = null;
  function flyTo(v, dur = 1.6) {
    fly = {
      t: 0, dur,
      p0: camera.position.clone(), p1: new THREE.Vector3(...v.pos),
      t0: controls.target.clone(), t1: new THREE.Vector3(...v.tgt),
    };
  }

  /* ---------- 双击聚焦 ---------- */
  function onDblClick(ev) {
    // 聚焦双击点：把环绕目标移过去
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
    const hit = rc.intersectObject(scene, true)[0];
    if (hit) flyTo({ pos: camera.position.toArray(), tgt: hit.point.toArray() }, 0.9);
  }
  renderer.domElement.addEventListener('dblclick', onDblClick);

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

    // snow fall
    if (snow.visible) {
      const p = snowGeo.attributes.position.array;
      for (let i = 0; i < SNOW_N; i++) {
        p[i * 3 + 1] -= snowVel[i * 2] * dt;
        p[i * 3]     += Math.sin(t * 0.7 + snowVel[i * 2 + 1]) * 0.12 * dt;
        if (p[i * 3 + 1] < 0.05) { p[i * 3 + 1] = 9.5; }
      }
      snowGeo.attributes.position.needsUpdate = true;
    }
    // steam rise（锅常送气 + 每 ~9s 一阵「掀盖」脉冲，碗保持细汽）
    for (const s of puffs) {
      const u = s.userData;
      const burst = u.base > 0.5 ? 1 + 1.15 * Math.pow(Math.max(0, Math.sin(t * 0.7)), 3) : 1;
      s.position.y += u.sp * burst * dt;
      const k = (s.position.y - u.y0) / (u.y1 - u.y0);      // 0..1
      s.material.opacity = 0.42 * burst * Math.sin(Math.PI * Math.min(Math.max(k, 0), 1));
      s.scale.setScalar(u.base * (0.7 + k * 0.9) * (1 + 0.1 * Math.sin(t * 1.4 + u.ph)));
      s.material.rotation = u.ph + t * 0.25;
      if (s.position.y > u.y1) s.position.y = u.y0;
    }
    // lantern sway（钟摆，幅度小、双轴不同频避免机械感）
    if (lanternGroup) {
      lanternGroup.rotation.z = Math.sin(t * 1.05) * 0.055;
      lanternGroup.rotation.x = Math.sin(t * 0.73 + 1.2) * 0.035;
    }
    // bulb string flicker（暖光泡轻微呼吸，各自相位）
    for (const b of bulbs) {
      const f = 0.78 + 0.22 * Math.sin(t * 2.3 + b.userData.ph) * Math.sin(t * 0.9 + b.userData.ph * 1.7);
      b.material.color.setRGB(1.5 * f, 1.05 * f, 0.55 * f);
    }
    // cat：呼吸 + 眨眼
    if (cat) {
      catBody.scale.y = 0.62 * (1 + 0.03 * Math.sin(t * 1.8));
      if (t > catBlink.next) {
        const k = t - catBlink.next;
        if (k < 0.12) {
          const s = k < 0.06 ? 1 - k / 0.06 * 0.9 : 0.1 + (k - 0.06) / 0.06 * 0.9;
          for (const e of catEyes) e.scale.y = s;
        } else {
          for (const e of catEyes) e.scale.y = 1;
          catBlink.next = t + 3 + Math.random() * 4;
        }
      }
    }
    // camera fly
    if (fly) {
      fly.t += dt / fly.dur;
      const k = fly.t >= 1 ? 1 : (fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2); // easeInOutQuad
      camera.position.lerpVectors(fly.p0, fly.p1, k);
      controls.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.t >= 1) fly = null;
    }
    controls.update();
    composer.render();
  }
  rafId = requestAnimationFrame(tick);

  /* ---------- teardown ---------- */
  const TEX_SLOTS = ['map', 'emissiveMap', 'alphaMap', 'aoMap', 'normalMap', 'roughnessMap', 'metalnessMap'];
  function disposeMaterial(m) {
    for (const slot of TEX_SLOTS) if (m[slot]) m[slot].dispose();
    m.dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    abort.abort();                                  // 取消还在路上的 GLB 请求
    window.removeEventListener('resize', onResize);
    renderer.domElement.removeEventListener('dblclick', onDblClick);
    controls.dispose();
    composer.dispose();

    const seenGeo = new Set();
    scene.traverse((obj) => {
      if (obj.geometry && !seenGeo.has(obj.geometry)) { seenGeo.add(obj.geometry); obj.geometry.dispose(); }
      if (obj.material) {
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) disposeMaterial(m);
      }
    });
    // 三渲二注册表里 mesh 当前可能挂 toonMat（traverse 已处理）或 origMat，补齐另一份 + 描边壳材质
    for (const r of toonRegistry) {
      if (r.origMat) disposeMaterial(r.origMat);
      if (r.toonMat) disposeMaterial(r.toonMat);
      if (r.outline && r.outline.material) r.outline.material.dispose();
    }
    gradientMap.dispose();
    steamTex.dispose();

    renderer.dispose();
    renderer.forceContextLoss();                    // 释放 WebGL 上下文本身
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  /* ---------- 控制器（React UI 驱动用） ---------- */
  return {
    /* 切机位：未知名称忽略；切机位会退出自动环绕（与原查看器一致） */
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
    setSnow(on) {
      if (disposed) return;
      snow.visible = !!on;
    },
    dispose,
  };
}
