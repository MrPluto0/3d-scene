// src/scenes/skycity/atmosphere.js — 天空、环境光照贴图、云海、积云、飞鸟、浮尘
import * as THREE from 'three';
import {
  BillboardField, cloudTexture, puffTexture, wispTexture, canvasTexture,
  mulberry32, lerp, clamp, smoothstep, TAU,
} from './kit.js';

/** 主光方向（黄昏逆光：太阳在机位左后方低空） */
export const SUN_DIR = new THREE.Vector3(-0.78, 0.30, -0.55).normalize();

export const PALETTE = {
  skyZenith: 0x132445,
  skyUpper: 0x304a78,
  skyMid: 0x7692b6,
  skyHorizon: 0xf2bd8a,
  skyHorizonSun: 0xffd9a2,
  skyLower: 0xf3cfa6,
  sun: 0xffd7a0,
  cloudWarm: 0xfff1dc,
  cloudMid: 0xf7e3cf,
  cloudCool: 0xc4cede,
  haze: 0xefc9a2,
  fog: 0xe6c4a0,
  fogDensity: 0.0018,
};

/* ==========================================================================
   天空穹顶（渐变 + 太阳辉光 + 地平线暖带）
   ========================================================================== */

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 uZenith, uUpper, uMid, uHorizon, uLower, uSunColor, uSunDir;
  uniform float uSunGlow, uHaze;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;

    // 垂直渐变：天顶深蓝 → 中段灰蓝 → 地平线暖橙（暖带很窄，尽快转蓝）
    vec3 col = mix(uHorizon, uMid, smoothstep(0.004, 0.15, y));
    col = mix(col, uUpper, smoothstep(0.08, 0.38, y));
    col = mix(col, uZenith, smoothstep(0.32, 0.82, y));
    col = mix(uLower, col, smoothstep(-0.22, 0.02, y));

    // 太阳方位的地平线暖带（逆光核心）
    vec3 sunAz = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
    vec3 dAz = normalize(vec3(d.x, 0.0, d.z));
    float az = max(dot(dAz, sunAz), 0.0);
    float band = exp(-abs(y) * 11.0) * (0.08 + 1.05 * pow(az, 2.6));
    col += uSunColor * band * uHaze;

    // 太阳辉光
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunColor * pow(sd, 6.0) * 0.22 * uHaze;
    col += uSunColor * pow(sd, uSunGlow) * 0.85;
    // 日盘
    col += uSunColor * smoothstep(0.99955, 0.99992, sd) * 2.6;

    // 轻微抖动，避免渐变带
    col += (hash(gl_FragCoord.xy) - 0.5) * 0.0025;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function buildSky(scene) {
  const uniforms = {
    uZenith: { value: new THREE.Color(PALETTE.skyZenith) },
    uUpper: { value: new THREE.Color(PALETTE.skyUpper) },
    uMid: { value: new THREE.Color(PALETTE.skyMid) },
    uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    uLower: { value: new THREE.Color(PALETTE.skyLower) },
    uSunColor: { value: new THREE.Color(PALETTE.sun) },
    uSunDir: { value: SUN_DIR.clone() },
    uSunGlow: { value: 40.0 },
    uHaze: { value: 0.6 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 48, 32),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);

  // 太阳本体的柔光（叠加混合，Bloom 会把它拉成光晕）
  const glowTex = puffTexture(256, 0.28);
  const sunPos = SUN_DIR.clone().multiplyScalar(600);
  const layers = [
    { scale: 300, color: 0xffce96, opacity: 0.12 },
    { scale: 130, color: 0xffd9a8, opacity: 0.2 },
    { scale: 52, color: 0xfff1d6, opacity: 0.62 },
  ];
  const glows = [];
  for (const l of layers) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: l.color, transparent: true, opacity: l.opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }));
    sp.position.copy(sunPos);
    sp.scale.set(l.scale, l.scale, 1);
    sp.renderOrder = -90;
    scene.add(sp);
    glows.push(sp);
  }

  // 高空卷云 / 地平线云带
  const wisps = new BillboardField(wispTexture(), {
    fogColor: new THREE.Color(PALETTE.haze), fogDensity: 0, opacity: 0.85,
  });
  const rnd = mulberry32(0x51c1);
  for (let i = 0; i < 16; i++) {
    const az = rnd() * TAU;
    const r = 380 + rnd() * 240;
    const y = 26 + rnd() * 120;
    const towardSun = Math.max(0, Math.cos(az - Math.atan2(SUN_DIR.z, SUN_DIR.x)));
    const warm = 0.9 + 0.4 * towardSun;
    wisps.add({
      x: Math.cos(az) * r, y, z: Math.sin(az) * r,
      sx: 180 + rnd() * 220, sy: 26 + rnd() * 30,
      rot: (rnd() - 0.5) * 0.22,
      color: new THREE.Color().setRGB(1.0 * warm, 0.93 * warm, 0.86 * warm),
      opacity: 0.16 + rnd() * 0.22,
      phase: rnd(),
    });
  }
  const wispMesh = wisps.build();
  if (wispMesh) scene.add(wispMesh);

  return { sky, glows, wisps, uniforms };
}

/* ==========================================================================
   环境贴图：从天空 + 云海生成 PMREM，让石/金/水面有环境反射
   ========================================================================== */

export function buildEnvironment(renderer) {
  const tex = canvasTexture(1024, 512, (g, W, H) => {
    // 天顶 → 地平线 → 云海
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, '#16233f');
    grad.addColorStop(0.20, '#25395f');
    grad.addColorStop(0.38, '#4e6a92');
    grad.addColorStop(0.47, '#9fb1c6');
    grad.addColorStop(0.50, '#f7d3a8');
    grad.addColorStop(0.56, '#ffe9cd');
    grad.addColorStop(0.75, '#f3ddc4');
    grad.addColorStop(1.00, '#d8c3ab');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // 太阳
    const y = 0.5 - Math.asin(SUN_DIR.y) / Math.PI; // 0..1
    const yPix = y * H;
    let xPix = (Math.atan2(SUN_DIR.z, SUN_DIR.x) / TAU + 0.5) * W;
    const drawSun = (px) => {
      const rg = g.createRadialGradient(px, yPix, 2, px, yPix, 180);
      rg.addColorStop(0, 'rgba(255,244,220,1)');
      rg.addColorStop(0.08, 'rgba(255,225,180,0.95)');
      rg.addColorStop(0.35, 'rgba(255,200,140,0.35)');
      rg.addColorStop(1, 'rgba(255,190,130,0)');
      g.fillStyle = rg;
      g.fillRect(px - 200, yPix - 200, 400, 400);
    };
    drawSun(xPix);
    drawSun(xPix + W);
    drawSun(xPix - W);

    // 云带（横向丝缕），用来给环境一点结构
    const rnd = mulberry32(0x77c1);
    for (let i = 0; i < 60; i++) {
      const cx = rnd() * W;
      const cy = H * (0.60 + rnd() * 0.36);
      const rw = 40 + rnd() * 130, rh = 6 + rnd() * 16;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rw);
      rg.addColorStop(0, `rgba(255,246,232,${0.25 + rnd() * 0.35})`);
      rg.addColorStop(1, 'rgba(255,240,220,0)');
      g.save();
      g.translate(cx, cy); g.scale(1, rh / rw);
      g.fillStyle = rg;
      g.beginPath(); g.arc(0, 0, rw, 0, TAU); g.fill();
      g.restore();
    }
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/* ==========================================================================
   云海：三层巨大广告牌 + 岛下雾团
   ========================================================================== */

export function buildCloudSea(rand) {
  const group = new THREE.Group();
  const tex = cloudTexture(256);
  const warm = new THREE.Color(0xffe3bb);
  const mid = new THREE.Color(0xdfd0bf);
  const cool = new THREE.Color(0x5b6d93);

  const sunAzimuth = Math.atan2(SUN_DIR.z, SUN_DIR.x);

  // 云海分三层：远处大团 + 中景 + 岛下亮云
  const layers = [
    { y: -36, r0: 30, r1: 300, n: 62, s0: 46, s1: 96, op: [0.4, 0.62], tint: 'mid', fog: 1 },
    { y: -28, r0: 22, r1: 190, n: 52, s0: 30, s1: 64, op: [0.42, 0.66], tint: 'warm', fog: 1 },
    { y: -22, r0: 12, r1: 100, n: 38, s0: 16, s1: 38, op: [0.46, 0.72], tint: 'warm', fog: 1 },
    { y: -17, r0: 16, r1: 54, n: 22, s0: 5, s1: 12, op: [0.55, 0.85], tint: 'warm', fog: 0.5 },
  ];

  const fields = [];
  for (const L of layers) {
    const field = new BillboardField(tex, {
      fogColor: new THREE.Color(PALETTE.fog),
      fogDensity: PALETTE.fogDensity * L.fog,
      opacity: 1,
    });
    for (let i = 0; i < L.n; i++) {
      const a = rand() * TAU;
      const r = L.r0 + Math.pow(rand(), 0.6) * (L.r1 - L.r0);
      // 朝太阳方位的云更暖更亮
      const towardSun = Math.max(0, Math.cos(a - sunAzimuth));
      const ts = Math.pow(towardSun, 2.2);
      // 迎光侧暖金、背光侧冷蓝紫：拉开色彩纵深
      const c = cool.clone().lerp(warm, ts * (L.tint === 'warm' ? 1.0 : 0.7));
      c.multiplyScalar(0.5 + ts * 0.5 + rand() * 0.1);
      const s = L.s0 + rand() * (L.s1 - L.s0);
      field.add({
        x: Math.cos(a) * r,
        y: L.y + (rand() - 0.5) * 4.5,
        z: Math.sin(a) * r,
        sx: s, sy: s * (0.5 + rand() * 0.2),
        rot: (rand() - 0.5) * 0.5,
        color: c,
        opacity: L.op[0] + rand() * (L.op[1] - L.op[0]),
        phase: rand(),
      });
    }
    const mesh = field.build({ sway: 0 });
    mesh.renderOrder = 2;
    group.add(mesh);
    fields.push(field);
  }

  /* 岛下阴影云团（把岛从明亮云海里"压"出来） */
  const shadowField = new BillboardField(puffTexture(128, 0.42), {
    fogColor: new THREE.Color(PALETTE.fog), fogDensity: PALETTE.fogDensity * 0.8,
  });
  for (let i = 0; i < 10; i++) {
    const a = rand() * TAU;
    const r = 3 + rand() * 12;
    shadowField.add({
      x: Math.cos(a) * r - 2, y: -22.5 - rand() * 5, z: Math.sin(a) * r + 3,
      sx: 16 + rand() * 22, sy: 8 + rand() * 12,
      rot: (rand() - 0.5) * 0.4,
      color: new THREE.Color(0x9c8b80).lerp(new THREE.Color(0x7d8394), rand() * 0.5),
      opacity: 0.16 + rand() * 0.18,
      phase: rand(),
    });
  }
  const shadowMesh = shadowField.build({ sway: 0.2 });
  shadowMesh.renderOrder = 2;
  group.add(shadowMesh);
  fields.push(shadowField);

  /* 岛底周围被阳光照亮的云顶（亮边） */
  const rimField = new BillboardField(puffTexture(128, 0.5), {
    fogColor: new THREE.Color(PALETTE.fog), fogDensity: PALETTE.fogDensity * 1.4,
  });
  for (let i = 0; i < 16; i++) {
    const a = -0.4 + rand() * 2.6;   // 集中朝太阳一侧
    const r = 8 + rand() * 16;
    rimField.add({
      x: Math.cos(a) * r - 3, y: -21 + rand() * 2.5, z: Math.sin(a) * r + 1,
      sx: 10 + rand() * 14, sy: 4 + rand() * 5,
      rot: (rand() - 0.5) * 0.5,
      color: new THREE.Color(0xffeed8),
      opacity: 0.3 + rand() * 0.28,
      phase: rand(),
    });
  }
  const rimMesh = rimField.build({ sway: 0.3 });
  rimMesh.renderOrder = 3;
  group.add(rimMesh);
  fields.push(rimField);

  /* 岛下雾团 / 云尾 */
  const mistField = new BillboardField(puffTexture(128, 0.5), {
    fogColor: new THREE.Color(PALETTE.fog), fogDensity: PALETTE.fogDensity * 1.2,
  });
  for (let i = 0; i < 46; i++) {
    const a = rand() * TAU;
    const r = 2 + rand() * 16;
    mistField.add({
      x: Math.cos(a) * r, y: -21 - rand() * 9, z: Math.sin(a) * r,
      sx: 8 + rand() * 16, sy: 4 + rand() * 8,
      rot: (rand() - 0.5) * 0.6,
      color: new THREE.Color(0xfff2e0).lerp(new THREE.Color(0xe6d6c6), rand() * 0.5),
      opacity: 0.28 + rand() * 0.32,
      phase: rand(),
    });
  }
  const mistMesh = mistField.build({ sway: 0.4 });
  mistMesh.renderOrder = 3;
  group.add(mistMesh);
  fields.push(mistField);

  return { group, fields, tex };
}

/* ==========================================================================
   积云簇：中景 / 远景 / 近景各若干，制造纵深
   ========================================================================== */

export function buildCumulus(rand) {
  const group = new THREE.Group();
  const tex = cloudTexture(256);
  const fields = [];

  const clusters = [
    // x, y, z, spread, count, scale, brightness, fog
    { p: [-132, 4, -178], s: 40, n: 30, b: 1.12, f: 1.0 },    // 远景左侧（迎着太阳，发光）
    { p: [146, -4, -156], s: 32, n: 24, b: 0.9, f: 1.0 },     // 远景右侧
    { p: [-84, -16, -96], s: 26, n: 20, b: 1.0, f: 0.85 },    // 中景左
    { p: [96, -20, -62], s: 24, n: 18, b: 0.86, f: 0.8 },     // 中景右
    { p: [-88, -34, 22], s: 22, n: 14, b: 0.9, f: 0.6 },      // 近景左下
    { p: [104, -38, 40], s: 24, n: 16, b: 0.84, f: 0.6 },     // 近景右下
    { p: [10, 30, -230], s: 26, n: 16, b: 1.02, f: 1.0 },     // 正后方高空一朵
  ];

  const warm = new THREE.Color(PALETTE.cloudWarm);
  const cool = new THREE.Color(PALETTE.cloudCool);

  for (const cl of clusters) {
    const field = new BillboardField(tex, {
      fogColor: new THREE.Color(PALETTE.fog),
      fogDensity: PALETTE.fogDensity * cl.f,
      opacity: 1,
    });
    const [cx, cy, cz] = cl.p;
    for (let i = 0; i < cl.n; i++) {
      const a = rand() * TAU;
      const rr = Math.pow(rand(), 0.55);
      const x = Math.cos(a) * rr * cl.s * 1.5;
      const z = Math.sin(a) * rr * cl.s * 0.8;
      const y = (rand() - 0.35) * cl.s * 0.55;
      const size = cl.s * (0.55 + rand() * 0.85);
      const lit = clamp(1.0 - (y / (cl.s * 0.6)) * 0.55, 0.35, 1.2) * cl.b;
      const c = warm.clone().lerp(cool, (1 - lit) * 0.8 + rand() * 0.1);
      c.multiplyScalar(0.46 + lit * 0.6);
      field.add({
        x: cx + x, y: cy + y, z: cz + z,
        sx: size, sy: size * (0.62 + rand() * 0.2),
        rot: (rand() - 0.5) * 0.18,
        color: c,
        opacity: 0.5 + rand() * 0.4,
        phase: rand(),
      });
    }
    const mesh = field.build({ sway: 0 });
    mesh.renderOrder = 1;
    group.add(mesh);
    fields.push(field);
  }

  return { group, fields, tex };
}

/* ==========================================================================
   飞鸟：两群剪影，翅膀由 shader 扇动
   ========================================================================== */

const BIRD_VERT = /* glsl */`
  attribute float iPhase;
  uniform float uTime;
  varying float vShade;
  void main() {
    vec3 p = position;
    float flap = sin(uTime * 5.4 + iPhase);
    p.y += abs(p.x) * flap * 0.62;
    vShade = 0.72 + 0.28 * flap;
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
  }
`;

const BIRD_FRAG = /* glsl */`
  varying float vShade;
  void main() {
    gl_FragColor = vec4(vec3(0.10, 0.09, 0.11) * vShade, 1.0);
  }
`;

export function buildBirds(rand) {
  const group = new THREE.Group();
  const flocks = [
    { center: new THREE.Vector3(-2, 17, 6), radius: 26, height: 9, n: 16, speed: 0.10 },
    { center: new THREE.Vector3(38, -4, -34), radius: 34, height: 6, n: 12, speed: -0.07 },
  ];

  const geo = new THREE.BufferGeometry();
  // 一只鸟：身体 + 两侧翅膀（4 个三角形）
  const verts = [
    // 身体
    0, 0, -0.55, 0.10, 0, 0.15, 0, 0, 0.55,
    0, 0, -0.55, 0, 0, 0.55, -0.10, 0, 0.15,
    // 左翼
    0, 0, 0.18, -0.95, 0, -0.06, -0.12, 0, 0.34,
    // 右翼
    0, 0, 0.18, 0.12, 0, 0.34, 0.95, 0, -0.06,
  ];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: BIRD_VERT,
    fragmentShader: BIRD_FRAG,
    side: THREE.DoubleSide,
    fog: false,
  });

  const birds = [];
  const dummy = new THREE.Object3D();
  let total = 0;
  for (const f of flocks) total += f.n;
  const phase = new Float32Array(total);
  const im = new THREE.InstancedMesh(geo, mat, total);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  let idx = 0;
  for (const f of flocks) {
    for (let i = 0; i < f.n; i++) {
      const a0 = rand() * TAU;
      const r = f.radius * (0.7 + rand() * 0.6);
      const y = f.center.y + (rand() - 0.5) * f.height;
      const s = 0.32 + rand() * 0.26;
      birds.push({ f, a0, r, y, s, wob: rand() * TAU, phase: rand() });
      phase[idx] = rand() * TAU;
      idx++;
    }
  }
  geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phase, 1));
  group.add(im);

  const tmp = new THREE.Vector3();
  function update(t) {
    mat.uniforms.uTime.value = t;
    let i = 0;
    for (const b of birds) {
      const a = b.a0 + t * b.f.speed;
      tmp.set(
        b.f.center.x + Math.cos(a) * b.r,
        b.y + Math.sin(t * 0.6 + b.wob) * 1.4,
        b.f.center.z + Math.sin(a) * b.r
      );
      dummy.position.copy(tmp);
      // 朝向切线方向
      const dir = b.f.speed > 0 ? a + Math.PI / 2 : a - Math.PI / 2;
      dummy.rotation.set(0, -dir, 0);
      dummy.scale.setScalar(b.s);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      i++;
    }
    im.instanceMatrix.needsUpdate = true;
  }
  update(0);

  return { group, update, mesh: im };
}

/* ==========================================================================
   浮尘 / 光点：黄昏暖光里的金色微粒
   ========================================================================== */

export function buildMotes(rand) {
  const field = new BillboardField(puffTexture(64, 0.32), {
    blending: THREE.AdditiveBlending,
    fogColor: new THREE.Color(0x000000),
    fogDensity: 0,
    depthWrite: false,
    renderOrder: 4,
  });
  for (let i = 0; i < 110; i++) {
    const a = rand() * TAU;
    const r = 4 + Math.pow(rand(), 0.7) * 16;
    field.add({
      x: Math.cos(a) * r,
      y: -6 + rand() * 22,
      z: Math.sin(a) * r,
      sx: 0.05 + rand() * 0.1,
      sy: 0.05 + rand() * 0.1,
      color: new THREE.Color(1.0, 0.8, 0.5).multiplyScalar(0.7 + rand() * 1.1),
      opacity: 0.14 + rand() * 0.3,
      phase: rand(),
    });
  }
  const mesh = field.build({ sway: 1.1 });
  mesh.renderOrder = 4;
  return { mesh, field };
}
