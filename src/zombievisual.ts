import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export type ZombieModelId = 'basic' | 'chubby' | 'ribcage' | 'arm' | 'shepherd' | 'pug';

interface ModelData {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  scale: number;
  yOffset: number;
  xOffset: number;
  zOffset: number;
}

const MODEL_FILES: Record<ZombieModelId, { file: string; height: number }> = {
  basic: { file: '/models/zombies/Zombie_Basic.gltf', height: 1.8 },
  chubby: { file: '/models/zombies/Zombie_Chubby.gltf', height: 1.92 },
  ribcage: { file: '/models/zombies/Zombie_Ribcage.gltf', height: 1.2 },
  arm: { file: '/models/zombies/Zombie_Arm.gltf', height: 1.82 },
  shepherd: { file: '/models/zombies/Hound_Shepherd.gltf', height: 1.15 },
  pug: { file: '/models/zombies/Hound_Pug.gltf', height: 0.92 },
};

export class ZombieModelLibrary {
  private models = new Map<ZombieModelId, ModelData>();
  private loading: Promise<void> | null = null;
  loaded = false;
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.loadAll();
    return this.loading;
  }

  private async loadAll() {
    const loader = new GLTFLoader();
    for (const id of Object.keys(MODEL_FILES) as ZombieModelId[]) {
      const conf = MODEL_FILES[id];
      const gltf = await loader.loadAsync(conf.file);
      const scene = gltf.scene;
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const scale = conf.height / Math.max(0.01, size.y);
      const center = box.getCenter(new THREE.Vector3());
      this.models.set(id, {
        scene,
        clips: gltf.animations,
        scale,
        yOffset: -box.min.y * scale,
        xOffset: -center.x * scale,
        zOffset: -center.z * scale,
      });
    }
    this.loaded = true;
  }

  create(modelId: ZombieModelId, tint = 0xffffff): ZombieVisual {
    const data = this.models.get(modelId);
    if (!data) {
      return new ZombieVisual(new THREE.Group(), [], 1);
    }
    const model = cloneSkeleton(data.scene);
    const tintColor = new THREE.Color(tint);
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = true;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => {
          const clone = m.clone();
          if ('color' in clone) (clone as THREE.MeshStandardMaterial).color.copy(tintColor);
          return clone;
        });
      } else if (obj.material) {
        const clone = obj.material.clone();
        if ('color' in clone) (clone as THREE.MeshStandardMaterial).color.copy(tintColor);
        obj.material = clone;
      }
    });
    const holder = new THREE.Group();
    holder.scale.setScalar(data.scale);
    holder.position.set(data.xOffset, data.yOffset, data.zOffset);
    holder.add(model);
    holder.rotation.y = 0;
    return new ZombieVisual(holder, data.clips, 1);
  }

  has(modelId: ZombieModelId): boolean {
    return this.models.has(modelId);
  }
}

export class ZombieVisual {
  readonly root = new THREE.Group();
  private holder: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private lock = 0;
  private dead = false;
  private oneShot: THREE.AnimationAction | null = null;
  private mats: THREE.MeshStandardMaterial[] = [];
  private burning = false;

  constructor(holder: THREE.Group, clips: THREE.AnimationClip[], _scale: number) {
    this.holder = holder;
    this.root.add(holder);
    this.mixer = new THREE.AnimationMixer(holder);
    holder.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial) this.mats.push(m);
        }
      }
    });
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name.toLowerCase(), action);
    }
    this.play('idle', 0);
  }

  private find(names: string[]): THREE.AnimationAction | null {
    for (const name of names) {
      const a = this.actions.get(name.toLowerCase());
      if (a) return a;
    }
    return null;
  }

  private play(name: string, fade = 0.18) {
    const next = this.actions.get(name.toLowerCase());
    if (!next || next === this.current) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  private playOnce(nameCandidates: string[], lock: number): THREE.AnimationAction | null {
    const action = this.find(nameCandidates);
    if (!action) return null;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.fadeIn(0.08).play();
    this.current?.fadeOut(0.08);
    this.current = action;
    this.oneShot = action;
    this.lock = lock;
    return action;
  }

  setEmissive(hex: number, intensity: number) {
    for (const m of this.mats) {
      m.emissive.setHex(hex);
      m.emissiveIntensity = intensity;
      m.needsUpdate = true;
    }
  }

  update(dt: number, speed: number) {
    this.mixer.update(dt);
    if (this.dead) return;
    if (this.lock > 0) {
      this.lock -= dt;
      return;
    }
    if (speed > 2.55) this.play('run');
    else if (speed > 0.25) this.play('walk');
    else this.play('idle');
  }

  attack() {
    if (this.dead) return;
    const a = this.playOnce(
      ['run_attack', 'idle_attack', 'punch', 'attack', 'run'],
      0.55,
    );
    if (a) this.oneShot = a;
  }

  hit() {
    if (this.dead) return;
    this.playOnce(['hitreact', 'hit_react', 'hit'], 0.28);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.lock = 99;
    const death = this.find(['death']);
    this.holder.rotation.x = 0;
    if (!death) {
      this.holder.rotation.z = Math.PI / 2;
      return;
    }
    death.reset();
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    death.setEffectiveWeight(1);
    death.fadeIn(0.1).play();
    this.current?.fadeOut(0.1);
    this.current = death;
  }

  setOpacity(_opacity: number) {
    // Kept for future fade-out; imported materials stay opaque.
  }

  setBurning(on: boolean) {
    if (this.burning === on) return;
    this.burning = on;
    for (const m of this.mats) {
      m.emissive.setHex(on ? 0x4a1400 : 0x000000);
      m.emissiveIntensity = on ? 0.7 : 0;
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) m.dispose();
        } else {
          obj.material?.dispose();
        }
      }
    });
  }
}

export const zombieModels = new ZombieModelLibrary();
