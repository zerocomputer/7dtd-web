import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type WeaponModelId = 'axe' | 'pickaxe' | 'knife' | 'pistol' | 'batBarbed' | 'batSaw';

const FILES: Record<WeaponModelId, { file: string; size: number }> = {
  axe: { file: '/models/weapons/WoodAxe.glb', size: 0.54 },
  pickaxe: { file: '/models/weapons/Axe.gltf', size: 0.56 },
  knife: { file: '/models/weapons/Knife.gltf', size: 0.4 },
  pistol: { file: '/models/weapons/Pistol.gltf', size: 0.42 },
  batBarbed: { file: '/models/weapons/BatBarbed.gltf', size: 0.72 },
  batSaw: { file: '/models/weapons/BatSaw.gltf', size: 0.74 },
};

interface WeaponModelData {
  scene: THREE.Group;
  scale: number;
  center: THREE.Vector3;
}

function steelify(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of mats) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const map = material.map;
      if (!map || !map.image) continue;
      const img = map.image as CanvasImageSource & { width: number; height: number };
      const w = Math.max(1, img.width);
      const h = Math.max(1, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238) {
          const v = 148 + ((i * 7) % 34);
          px[i] = v;
          px[i + 1] = v + 5;
          px[i + 2] = v + 10;
        }
      }
      ctx.putImageData(data, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.flipY = map.flipY;
      tex.colorSpace = map.colorSpace;
      tex.magFilter = map.magFilter;
      tex.minFilter = map.minFilter;
      tex.generateMipmaps = map.generateMipmaps;
      material.map = tex;
      material.metalness = 0.05;
      material.roughness = 0.85;
      material.color.setHex(0x8a9098);
      material.needsUpdate = true;
    }
  });
}

/** Splits the wooden axe into a textured handle and a flat-shaded steel head. */
function steelHeadAxe(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const index = geom.index;
    if (!index) return;
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const arr = index.array;
    const handle: number[] = [];
    const blade: number[] = [];
    const y0 = bb.min.y;
    const y1 = bb.max.y;
    const h = Math.max(0.0001, y1 - y0);
    for (let t = 0; t < arr.length; t += 3) {
      const a = arr[t];
      const b = arr[t + 1];
      const c = arr[t + 2];
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      if ((cy - y0) / h > 0.58) blade.push(a, b, c);
      else handle.push(a, b, c);
    }
    if (blade.length === 0 || handle.length === 0) return;
    const next = new Uint32Array(handle.length + blade.length);
    next.set(handle, 0);
    next.set(blade, handle.length);
    geom.setIndex(new THREE.BufferAttribute(next, 1));
    geom.clearGroups();
    geom.addGroup(0, handle.length, 0);
    geom.addGroup(handle.length, blade.length, 1);
    const source = obj.material as THREE.MeshStandardMaterial;
    const handleMat = source.clone();
    handleMat.color.setHex(0xffffff);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x8c96a0,
      metalness: 0.2,
      roughness: 0.58,
      flatShading: true,
    });
    obj.material = [handleMat, bladeMat];
  });
}

export class WeaponModelLibrary {
  private models = new Map<WeaponModelId, WeaponModelData>();
  private loading: Promise<void> | null = null;
  loaded = false;

  load(): Promise<void> {
    if (!this.loading) this.loading = this.loadAll();
    return this.loading;
  }

  private async loadAll() {
    const loader = new GLTFLoader();
    for (const id of Object.keys(FILES) as WeaponModelId[]) {
      const conf = FILES[id];
      const gltf = await loader.loadAsync(conf.file);
      const scene = gltf.scene;
      if (id === 'pickaxe' || id === 'knife' || id === 'pistol') steelify(scene);
      if (id === 'axe') steelHeadAxe(scene);
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z);
      this.models.set(id, {
        scene,
        scale: conf.size / Math.max(0.001, max),
        center: box.getCenter(new THREE.Vector3()),
      });
    }
    this.loaded = true;
  }

  has(id: WeaponModelId): boolean {
    return this.models.has(id);
  }

  create(id: WeaponModelId): THREE.Group | null {
    const data = this.models.get(id);
    if (!data) return null;
    const model = data.scene.clone(true);
    model.scale.setScalar(data.scale);
    model.position.set(
      -data.center.x * data.scale,
      -data.center.y * data.scale,
      -data.center.z * data.scale,
    );
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;
      }
    });
    const wrapper = new THREE.Group();
    wrapper.userData.shared = true;
    wrapper.add(model);
    return wrapper;
  }
}

export const weaponModels = new WeaponModelLibrary();
