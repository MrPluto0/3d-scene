// main.js — 雪夜馄饨摊 mini diorama: renderer, camera, lights, fog, bloom, loop
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildBase } from './modules/base.js';
import { buildStall } from './modules/stall.js';
import { buildProps } from './modules/props.js';
import { Snowfall, Steam } from './modules/particles.js';

// ---- renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.body.appendChild(renderer.domElement);

// ---- scene: cold blue night ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11182b);
scene.fog = new THREE.Fog(0x161e33, 14, 34);

// ---- camera: third-person, slightly looking down ----
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
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
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,  // strength — restrained
  0.4,   // radius
  0.62   // threshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---- loop ----
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update();
  snow.update(dt);
  steam.update(dt);
  composer.render();
}
animate();
