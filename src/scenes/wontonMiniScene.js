// src/scenes/wontonMiniScene.js — 雪夜馄饨摊 diorama as a mountable scene module.
// Ported from wonton-mini/main.js: init(container) returns cleanup().
// Reuses the original build modules (base/stall/props/particles) from wonton-mini/.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildBase } from '../../wonton-mini/modules/base.js';
import { buildStall } from '../../wonton-mini/modules/stall.js';
import { buildProps } from '../../wonton-mini/modules/props.js';
import { Snowfall, Steam } from '../../wonton-mini/modules/particles.js';

export function initWontonMini(container) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  container.appendChild(renderer.domElement);

  // ---- scene: cold blue night ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11182b);
  scene.fog = new THREE.Fog(0x161e33, 14, 34);

  // ---- camera ----
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(5.4, 4.4, 7.0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.0, 1.0, 0.8);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // ---- ambient cold base + moonlight fill ----
  scene.add(new THREE.HemisphereLight(0x3d5473, 0x1c1a26, 1.0));
  const moon = new THREE.DirectionalLight(0x5a6f9e, 0.6);
  moon.position.set(-7, 9, -5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -8; moon.shadow.camera.right = 8;
  moon.shadow.camera.top = 8; moon.shadow.camera.bottom = -8;
  moon.shadow.bias = -0.0006;
  scene.add(moon);
  // cold sky fill from the opposite side — lifts the moon-facing-away walls out of
  // pure black without adding a visible second shadow (keeps the night a night)
  const skyFill = new THREE.DirectionalLight(0x44597f, 0.38);
  skyFill.position.set(6, 10, 6);
  scene.add(skyFill);

  // ---- world ----
  buildBase(scene);
  const { steamOrigin } = buildStall(scene);
  buildProps(scene);

  const snow = new Snowfall(scene, 1700);
  const steam = new Steam(scene, steamOrigin);

  // ---- post: subtle bloom on the emissive lights ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.55,  // strength — restrained
    0.4,   // radius
    0.62   // threshold
  ));
  composer.addPass(new OutputPass());

  // ---- resize ----
  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ---- loop ----
  const clock = new THREE.Clock();
  let rafId = 0;
  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update();
    snow.update(dt);
    steam.update(dt);
    composer.render();
  }
  rafId = requestAnimationFrame(animate);

  // ---- cleanup: full teardown so React StrictMode double-mount & route
  // switching never leak RAF frames, WebGL contexts or GPU memory ----
  return function cleanup() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    controls.dispose();
    composer.dispose();

    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
    // (module-cached canvas textures are left alone: tiny, and three re-uploads
    // a disposed texture on next use, so remounts stay correct)

    renderer.dispose();
    renderer.forceContextLoss(); // free the WebGL context itself
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };
}
