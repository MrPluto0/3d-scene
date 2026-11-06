// src/scenes/skycity/water.js — 水池、溪流、坠入云海的瀑布与雾
import * as THREE from 'three';
import {
  BillboardField, GeoKit, stdMat, streakTexture, puffTexture, waterNoiseTexture,
  mulberry32, lerp, clamp, smoothstep, TAU,
} from './kit.js';
import { topHeight, ISLE_R, ISLE_DEPTH } from './terrain.js';
import { SUN_DIR } from './atmosphere.js';

/* ---------------- 水面材质 ---------------- */
function makeWaterMaterial(noiseTex, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNoise: { value: noiseTex },
      uSunDir: { value: SUN_DIR.clone() },
      uDeep: { value: new THREE.Color(o.deep || 0x2f5f63) },
      uShallow: { value: new THREE.Color(o.shallow || 0x8ec6c0) },
      uSky: { value: new THREE.Color(o.sky || 0xd6e6ee) },
      uOpacity: { value: o.opacity !== undefined ? o.opacity : 0.92 },
      uScale: { value: o.scale || 0.16 },
      uGlow: { value: o.glow !== undefined ? o.glow : 1.0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform sampler2D uNoise;
      uniform vec3 uSunDir, uDeep, uShallow, uSky;
      uniform float uOpacity, uScale, uGlow;
      varying vec2 vUv;
      varying vec3 vWorld;

      void main() {
        vec2 base = vWorld.xz * uScale;
        float n1 = texture2D(uNoise, base * 0.14 + vec2(uTime * 0.010, uTime * 0.014)).r;
        float n2 = texture2D(uNoise, base * 0.31 - vec2(uTime * 0.017, uTime * 0.008)).r;
        float n3 = texture2D(uNoise, base * 0.07 + vec2(uTime * 0.004, -uTime * 0.006)).r;
        float rip = (n1 - 0.5) * 0.6 + (n2 - 0.5) * 0.3;

        vec3 N = normalize(vec3(rip * 0.55, 1.0, (n2 - 0.5) * 0.55 + (n3 - 0.5) * 0.2));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);

        vec3 col = mix(uDeep, uShallow, clamp(n1 * 0.7 + n3 * 0.3, 0.0, 1.0));
        col = mix(col, uSky, fres * 0.75);
        // 太阳镜面高光
        vec3 L = normalize(uSunDir);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 120.0);
        col += vec3(1.0, 0.86, 0.62) * spec * 2.4 * uGlow;
        // 细碎闪点
        float sparkle = pow(max(dot(N, H), 0.0), 900.0);
        col += vec3(1.0, 0.92, 0.75) * sparkle * 3.0 * uGlow;

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/* ---------------- 岛顶水池 + 溪流 ---------------- */
function buildPoolAndStream(rand, noiseTex) {
  const group = new THREE.Group();
  const mat = makeWaterMaterial(noiseTex, {
    deep: 0x254f52, shallow: 0x86c2bd, sky: 0xcfe2ea, opacity: 0.9, scale: 0.2,
  });

  const PC = new THREE.Vector2(-2.2, 6.6);
  const waterY = topHeight(PC.x, PC.y) + 0.58;

  // 水池
  const poolGeo = new THREE.CircleGeometry(2.05, 40);
  poolGeo.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(poolGeo, mat);
  pool.position.set(PC.x, waterY, PC.y);
  group.add(pool);

  // 溪流：从水池向西南岩缘
  const path = [
    new THREE.Vector2(-2.7, 7.2),
    new THREE.Vector2(-4.0, 8.1),
    new THREE.Vector2(-5.4, 8.9),
    new THREE.Vector2(-6.8, 9.7),
  ];
  const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(p.x, 0, p.y)));
  const segs = 22;
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const nx = -tangent.z, nz = tangent.x;
    const w = lerp(0.55, 0.9, t);
    for (const s of [-1, 1]) {
      const x = p.x + nx * w * s;
      const z = p.z + nz * w * s;
      const y = topHeight(x, z) + 0.16 + Math.sin(t * 12) * 0.02;
      pos.push(x, y, z);
      uvs.push(t * 8, s > 0 ? 1 : 0);
    }
    if (i < segs) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  streamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  streamGeo.setIndex(idx);
  streamGeo.computeVertexNormals();
  const stream = new THREE.Mesh(streamGeo, mat);
  group.add(stream);

  // 池边碎石
  const stones = new GeoKit();
  for (let i = 0; i < 34; i++) {
    const a = rand() * TAU;
    const r = 1.9 + rand() * 0.7;
    const x = PC.x + Math.cos(a) * r;
    const z = PC.y + Math.sin(a) * r;
    const s = 0.14 + rand() * 0.3;
    stones.add(new THREE.DodecahedronGeometry(s, 0), new THREE.Color(0x8c7f6b).offsetHSL(0, 0, (rand() - 0.5) * 0.1),
      x, topHeight(x, z) + s * 0.3, z, { rx: rand() * 2, ry: rand() * TAU });
  }
  const stoneMesh = stones.build(stdMat(0xffffff, { roughness: 1, vertexColors: true, flatShading: true }));
  if (stoneMesh) group.add(stoneMesh);

  return { group, mat, waterY, poolCenter: PC };
}

/* ---------------- 瀑布 ---------------- */
function buildFall(rand, a, opts = {}) {
  // a: 方位角；从岩缘垂落进云海
  const group = new THREE.Group();
  const lipR = ISLE_R * (opts.lipR || 0.985);
  const w0 = opts.w || 1.7;
  const lipY = opts.lipY !== undefined ? opts.lipY : 0.15;
  const endY = opts.endY !== undefined ? opts.endY : -22.5;
  const segs = 26;
  const tex = streakTexture();
  tex.repeat.set(1, 2.6);

  const dirX = Math.cos(a), dirZ = Math.sin(a);
  const tangent = new THREE.Vector3(-dirZ, 0, dirX);

  const makeRibbon = (widthMul, matOpts, extraOut = 1.1) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = lerp(lipY, endY, t);
      // 越往下越向外飘、越散
      const r = lipR + extraOut * Math.pow(t, 1.1);
      const w = w0 * widthMul * (0.72 + t * 0.42);
      const cx = dirX * r + Math.sin(t * 3.2 + a) * 0.25 * t;
      const cz = dirZ * r + Math.cos(t * 2.8 + a) * 0.25 * t;
      for (const s of [-1, 1]) {
        pos.push(cx + tangent.x * w * s, y, cz + tangent.z * w * s);
        uv.push(s > 0 ? 1 : 0, t * 3.2);
      }
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      color: new THREE.Color(1.0, 0.99, 0.97), ...matOpts,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 6;
    group.add(mesh);
    return mat;
  };

  const veil = makeRibbon(1.0, { opacity: 0.28 }, 1.4);
  const core = makeRibbon(0.5, { opacity: 0.72, blending: THREE.AdditiveBlending }, 1.1);
  veil.map = tex; core.map = tex;

  // 唇口水花
  const foamTex = puffTexture(128, 0.5);
  const foam = new BillboardField(foamTex, {
    fogColor: new THREE.Color(0xe9c8a4), fogDensity: 0.003, opacity: 1,
  });
  for (let i = 0; i < 7; i++) {
    foam.add({
      x: dirX * lipR + (rand() - 0.5) * w0 * 2.6,
      y: lipY + 0.15 + rand() * 0.4,
      z: dirZ * lipR + (rand() - 0.5) * w0 * 2.6,
      sx: w0 * (0.6 + rand() * 0.8), sy: 0.5 + rand() * 0.5,
      rot: (rand() - 0.5) * 0.6,
      color: new THREE.Color(1, 1, 1),
      opacity: 0.3 + rand() * 0.25,
      phase: rand(),
    });
  }
  // 落点雾团
  const mist = new BillboardField(foamTex, {
    fogColor: new THREE.Color(0xe9c8a4), fogDensity: 0.0035, opacity: 1,
  });
  for (let i = 0; i < 18; i++) {
    const rr = 1.2 + rand() * 5.5;
    mist.add({
      x: dirX * (lipR + 1.0) + (rand() - 0.5) * 7,
      y: endY + 1.2 + rand() * 3.4,
      z: dirZ * (lipR + 1.0) + (rand() - 0.5) * 7,
      sx: 3.5 + rand() * 5, sy: 1.8 + rand() * 2.4,
      rot: (rand() - 0.5) * 0.5,
      color: new THREE.Color(0xfff4e4),
      opacity: 0.18 + rand() * 0.22,
      phase: rand(),
    });
  }
  const foamMesh = foam.build({ sway: 0.15 });
  const mistMesh = mist.build({ sway: 0.35 });
  foamMesh.renderOrder = 7;
  mistMesh.renderOrder = 7;
  group.add(foamMesh);
  group.add(mistMesh);

  return {
    group,
    tick: (dt) => { tex.offset.y -= dt * 0.55; },
    fields: [foam, mist],
  };
}

/* ---------------- 总装 ---------------- */
export function buildWater(rand) {
  const noiseTex = waterNoiseTexture(256);
  const group = new THREE.Group();
  const pool = buildPoolAndStream(rand, noiseTex);
  group.add(pool.group);

  const falls = [];
  const make = (angle, w, endY) => {
    const x = Math.cos(angle) * ISLE_R * 0.99;
    const z = Math.sin(angle) * ISLE_R * 0.99;
    const f = buildFall(rand, angle, { w, lipY: topHeight(x, z) - 0.02, endY });
    group.add(f.group);
    falls.push(f);
  };
  // 主瀑布：南侧岩缘（正对全景机位，接水池溢流）
  make(Math.atan2(9.7, -6.8), 1.5, -24);
  // 次瀑布：东北岩缘
  make(Math.atan2(-7.4, 8.2), 1.0, -23);
  // 细瀑：西北岩缘
  make(Math.atan2(-6.0, -9.0), 0.8, -22.5);

  const fields = falls.flatMap((f) => f.fields);
  return {
    group,
    poolMat: pool.mat,
    fields,
    tick: (dt, t) => {
      pool.mat.uniforms.uTime.value = t;
      for (const f of falls) f.tick(dt);
    },
  };
}
