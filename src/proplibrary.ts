import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type PropModelId =
  | 'barrel'
  | 'containerGreen'
  | 'containerRed'
  | 'hydrant'
  | 'streetlight'
  | 'townsign'
  | 'cone'
  | 'trafficlight'
  | 'trashbag'
  | 'pallet'
  | 'barrier'
  | 'couch'
  | 'watertower'
  | 'pickup'
  | 'sports'
  | 'truck';

const FILES: Record<PropModelId, string> = {
  barrel: '/models/props/Barrel.gltf',
  containerGreen: '/models/props/ContainerGreen.gltf',
  containerRed: '/models/props/ContainerRed.gltf',
  hydrant: '/models/props/FireHydrant.gltf',
  streetlight: '/models/props/StreetLights.gltf',
  townsign: '/models/props/TownSign.gltf',
  cone: '/models/props/TrafficCone.gltf',
  trafficlight: '/models/props/TrafficLight.gltf',
  trashbag: '/models/props/TrashBag.gltf',
  pallet: '/models/props/Pallet.gltf',
  barrier: '/models/props/PlasticBarrier.gltf',
  couch: '/models/props/Couch.gltf',
  watertower: '/models/props/WaterTower.gltf',
  pickup: '/models/vehicles/Pickup.gltf',
  sports: '/models/vehicles/Sports.gltf',
  truck: '/models/vehicles/Truck.gltf',
};

export class PropModelLibrary {
  private models = new Map<PropModelId, THREE.Group>();
  private minY = new Map<PropModelId, number>();
  private loading: Promise<void> | null = null;
  loaded = false;

  load(): Promise<void> {
    if (!this.loading) this.loading = this.loadAll();
    return this.loading;
  }

  private async loadAll() {
    const loader = new GLTFLoader();
    for (const id of Object.keys(FILES) as PropModelId[]) {
      const gltf = await loader.loadAsync(FILES[id]);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      this.minY.set(id, box.min.y);
      this.models.set(id, gltf.scene);
    }
    this.loaded = true;
  }

  has(id: PropModelId): boolean {
    return this.models.has(id);
  }

  create(id: PropModelId): THREE.Group | null {
    const scene = this.models.get(id);
    if (!scene) return null;
    const model = scene.clone(true);
    model.position.y = -(this.minY.get(id) ?? 0);
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

export const propModels = new PropModelLibrary();
