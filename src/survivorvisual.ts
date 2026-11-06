import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export type SurvivorModelId = 'matt' | 'lis' | 'sam' | 'shaun';

interface ModelData {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  scale: number;
  yOffset: number;
  xOffset: number;
  zOffset: number;
}

const MODEL_FILES: Record<SurvivorModelId, string> = {
  matt: '/models/survivors/Matt.gltf',
  lis: '/models/survivors/Lis.gltf',
  sam: '/models/survivors/Sam.gltf',
  shaun: '/models/survivors/Shaun.gltf',
};

const HIDDEN_WEAPONS = new Set([
  'Axe', 'Guitar', 'Knife', 'Pistol', 'Rifle', 'Shotgun', 'SMG', 'Spear',
  'WoodenBat_Barbed', 'WoodenBat_Saw',
]);

export class SurvivorModelLibrary {
  private models = new Map<SurvivorModelId, ModelData>();
  private loading: Promise<void> | null = null;
  loaded = false;

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.loadAll();
    return this.loading;
  }

  private async loadAll() {
    const loader = new GLTFLoader();
    for (const id of Object.keys(MODEL_FILES) as SurvivorModelId[]) {
      const gltf = await loader.loadAsync(MODEL_FILES[id]);
      const scene = gltf.scene;
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const scale = 1.8 / Math.max(0.01, size.y);
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

  create(index: number): SurvivorVisual {
    const ids = Object.keys(MODEL_FILES) as SurvivorModelId[];
    const id = ids[((index % ids.length) + ids.length) % ids.length];
    const data = this.models.get(id);
    if (!data) return new SurvivorVisual(new THREE.Group(), []);
    const model = cloneSkeleton(data.scene);
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;
      }
      if (HIDDEN_WEAPONS.has(obj.name)) obj.visible = false;
    });
    const holder = new THREE.Group();
    holder.scale.setScalar(data.scale);
    holder.position.set(data.xOffset, data.yOffset, data.zOffset);
    holder.add(model);
    return new SurvivorVisual(holder, data.clips);
  }

  hasAny(): boolean {
    return this.models.size > 0;
  }
}

export class SurvivorVisual {
  readonly root = new THREE.Group();
  private holder: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private dead = false;
  private deathLock = 0;

  constructor(holder: THREE.Group, clips: THREE.AnimationClip[]) {
    this.holder = holder;
    this.root.add(holder);
    this.mixer = new THREE.AnimationMixer(holder);
    for (const clip of clips) {
      this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip));
    }
    this.play('idle');
  }

  private play(name: string, fade = 0.18) {
    const next = this.actions.get(name);
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

  setDead(dead: boolean) {
    if (this.dead === dead) return;
    this.dead = dead;
    this.deathLock = dead ? 99 : 0;
    if (dead) {
      const death = this.actions.get('death');
      if (death) {
        death.reset();
        death.setLoop(THREE.LoopOnce, 1);
        death.clampWhenFinished = true;
        death.setEffectiveWeight(1);
        death.fadeIn(0.1).play();
        this.current?.fadeOut(0.1);
        this.current = death;
      } else {
        this.holder.rotation.z = Math.PI / 2;
      }
    } else {
      this.holder.rotation.z = 0;
      this.current = null;
      this.play('idle', 0.1);
    }
  }

  update(dt: number, speed: number) {
    this.mixer.update(dt);
    if (this.dead || this.deathLock > 0) {
      if (this.deathLock > 0 && this.deathLock < 90) this.deathLock -= dt;
      return;
    }
    if (speed > 2.8) this.play('run');
    else if (speed > 0.22) this.play('walk');
    else this.play('idle');
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}

export const survivorModels = new SurvivorModelLibrary();
