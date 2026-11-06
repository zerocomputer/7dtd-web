import * as THREE from 'three';
import { World } from './world';

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 236, 190, 1)');
  grad.addColorStop(0.25, 'rgba(255, 180, 84, 0.65)');
  grad.addColorStop(0.6, 'rgba(255, 128, 36, 0.16)');
  grad.addColorStop(1, 'rgba(255, 100, 20, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class TorchLights {
  private lights: THREE.PointLight[] = [];
  private sprites: THREE.Sprite[] = [];
  private positions: THREE.Vector3[] = [];
  private timer = 0;
  private glowTex: THREE.Texture;
  private scene: THREE.Scene;
  private limit = 6;

  constructor(scene: THREE.Scene, count = 6) {
    this.scene = scene;
    this.glowTex = makeGlowTexture();
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffa45a, 0, 13, 1.7);
      light.castShadow = false;
      light.visible = false;
      scene.add(light);
      this.lights.push(light);

      const mat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffb268,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.1, 2.1, 1);
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      this.sprites.push(sprite);
    }
  }

  setLimit(limit: number) {
    this.limit = Math.max(0, Math.min(this.lights.length, Math.floor(limit)));
    for (let i = this.limit; i < this.lights.length; i++) {
      this.lights[i].visible = false;
      this.sprites[i].visible = false;
    }
  }

  update(dt: number, world: World, player: THREE.Vector3, darkness: number) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.35;
      const active = Math.min(this.limit, this.lights.length);
      const torches = world.nearestTorches(player.x, player.y, player.z, active, 42);
      this.positions = torches.map((t) => new THREE.Vector3(t.x, t.y, t.z));
      for (let i = 0; i < this.lights.length; i++) {
        const light = this.lights[i];
        const sprite = this.sprites[i];
        if (i < this.limit && i < this.positions.length) {
          const p = this.positions[i];
          light.position.copy(p);
          light.visible = true;
          sprite.position.copy(p);
          sprite.visible = true;
        } else {
          light.visible = false;
          sprite.visible = false;
        }
      }
    }

    const t = performance.now() * 0.001;
    for (let i = 0; i < this.limit; i++) {
      const light = this.lights[i];
      if (!light.visible) continue;
      const flicker = 0.82 + Math.sin(t * 9.1 + i * 2.3) * 0.1 + Math.sin(t * 17.3 + i * 5.1) * 0.06;
      light.intensity = 6.4 * flicker;
      const sprite = this.sprites[i];
      (sprite.material as THREE.SpriteMaterial).opacity = (0.16 + darkness * 0.34) * flicker;
    }
  }

  dispose() {
    for (const l of this.lights) this.scene.remove(l);
    for (const s of this.sprites) {
      this.scene.remove(s);
      (s.material as THREE.SpriteMaterial).dispose();
    }
    this.glowTex.dispose();
    this.lights = [];
    this.sprites = [];
  }
}
