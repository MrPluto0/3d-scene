// particles.js — snowfall (Points) and pot steam (Sprites)
import * as THREE from 'three';
import { makeRadialTexture } from './toon.js';

let flakeTex = null;
function getFlakeTex() {
  if (!flakeTex) {
    flakeTex = makeRadialTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.85)'],
      [1, 'rgba(255,255,255,0)']
    ]);
  }
  return flakeTex;
}

export class Snowfall {
  constructor(scene, count = 1700) {
    this.count = count;
    this.area = 11.4;   // covers base + margin
    this.top = 6.5;
    this.speeds = new Float32Array(count);
    this.phases = new Float32Array(count);
    this.swayAmps = new Float32Array(count);

    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.resetFlake(pos, i, true);
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    geo.setAttribute('position', this.posAttr);

    const mat = new THREE.PointsMaterial({
      color: 0xe8eefb,
      size: 0.065,
      map: getFlakeTex(),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.time = 0;
  }

  resetFlake(pos, i, randomY = false) {
    pos[i * 3] = (Math.random() - 0.5) * this.area;
    pos[i * 3 + 1] = randomY ? Math.random() * this.top : this.top + Math.random() * 0.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * this.area;
    this.speeds[i] = 0.25 + Math.random() * 0.45;
    this.phases[i] = Math.random() * Math.PI * 2;
    this.swayAmps[i] = 0.1 + Math.random() * 0.3;
  }

  update(dt) {
    this.time += dt;
    const pos = this.posAttr.array;
    for (let i = 0; i < this.count; i++) {
      pos[i * 3 + 1] -= this.speeds[i] * dt;
      pos[i * 3] += Math.sin(this.time * 1.1 + this.phases[i]) * this.swayAmps[i] * dt;
      pos[i * 3 + 2] += Math.cos(this.time * 0.8 + this.phases[i] * 1.3) * this.swayAmps[i] * 0.6 * dt;
      if (pos[i * 3 + 1] < 0.04) this.resetFlake(pos, i);
    }
    this.posAttr.needsUpdate = true;
  }
}

let steamTex = null;
function getSteamTex() {
  if (!steamTex) {
    steamTex = makeRadialTexture([
      [0, 'rgba(255,255,255,0.9)'],
      [0.4, 'rgba(255,255,255,0.45)'],
      [1, 'rgba(255,255,255,0)']
    ]);
  }
  return steamTex;
}

// rising, spreading, fading steam column over the wonton pot
export class Steam {
  constructor(scene, origin, count = 26) {
    this.origin = origin.clone();
    this.count = count;
    this.sprites = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: getSteamTex(),
        color: 0xd6dfeb,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(origin);
      scene.add(s);
      this.sprites.push({ sprite: s, age: Math.random() * 4, life: 3 + Math.random() * 1.6, seed: Math.random() * 10 });
    }
  }

  update(dt) {
    for (const p of this.sprites) {
      p.age += dt;
      if (p.age >= p.life) {
        p.age = 0;
        p.life = 3 + Math.random() * 1.6;
        p.seed = Math.random() * 10;
        p.sprite.position.set(
          this.origin.x + (Math.random() - 0.5) * 0.12,
          this.origin.y,
          this.origin.z + (Math.random() - 0.5) * 0.12
        );
      }
      const t = p.age / p.life;             // 0 → 1
      const rise = t * 1.5;                 // climb
      const spread = 0.1 + t * 0.55;        // widen
      p.sprite.position.set(
        this.origin.x + Math.sin(p.seed + p.age * 1.3) * spread * 0.5,
        this.origin.y + rise,
        this.origin.z + Math.cos(p.seed * 1.7 + p.age * 1.1) * spread * 0.5
      );
      const scale = 0.18 + t * 0.55;
      p.sprite.scale.set(scale, scale, 1);
      p.sprite.material.opacity = t < 0.15 ? (t / 0.15) * 0.42 : (1 - (t - 0.15) / 0.85) * 0.42;
    }
  }
}
