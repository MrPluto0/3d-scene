// toon.js — shared toon materials, gradient map, outline helper, canvas textures
import * as THREE from 'three';

// 3-step gradient map for MeshToonMaterial (cel shading)
export const gradientMap = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...opts });
}

// deterministic rng for reproducible scatter
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _outlineMats = new Map();
function outlineMat(color) {
  if (!_outlineMats.has(color)) {
    _outlineMats.set(color, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  }
  return _outlineMats.get(color);
}

// Inverted-hull outline: same geometry, BackSide dark shell, expanded ~t along each axis.
// NOTE: only meaningful for geometries whose bounding box is centered at the origin.
export function outline(mesh, t = 0.03, color = 0x0d1119) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const o = new THREE.Mesh(mesh.geometry, outlineMat(color));
  o.scale.set(
    size.x > 1e-6 ? (size.x + t * 2) / size.x : 1,
    size.y > 1e-6 ? (size.y + t * 2) / size.y : 1,
    size.z > 1e-6 ? (size.z + t * 2) / size.z : 1
  );
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
  return o;
}

// radial glow canvas texture (for fake wet-road reflections, particles)
export function makeRadialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  for (const [off, col] of stops) g.addColorStop(off, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// striped canvas texture (awning)
export function makeStripeTexture(colA, colB, stripes = 8) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  const w = c.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? colA : colB;
    ctx.fillRect(i * w, 0, w + 1, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// stretched glow plane laid on the ground — fake wet-asphalt reflection of a light above
export function makeGlowPatch(scene, pos, lenX, lenZ, color, opacity = 0.4) {
  const tex = makeRadialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)']
  ]);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(lenX, lenZ, 1);
  m.position.copy(pos);
  m.renderOrder = 2;
  scene.add(m);
  return m;
}
