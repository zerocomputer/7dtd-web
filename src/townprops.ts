import * as THREE from 'three';
import { World } from './world';
import type { BuildingSpec, Town } from './town';
import type { Player } from './player';
import { PropModelId, propModels } from './proplibrary';
import { hash2, mulberry32 } from './noise';

interface Placement {
  id: PropModelId;
  x: number;
  z: number;
  rot?: number;
  scale?: number;
  collide?: { halfX: number; halfZ: number; height: number };
}

interface TownGroup {
  group: THREE.Group;
  town: Town;
  glows: THREE.Sprite[];
  lamp: THREE.PointLight | null;
  cars: CarProp[];
}

export interface CarProp {
  key: string;
  label: string;
  x: number;
  y: number;
  z: number;
  halfX: number;
  halfZ: number;
  height: number;
}

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255, 244, 200, 1)');
  g.addColorStop(0.25, 'rgba(255, 204, 110, 0.75)');
  g.addColorStop(0.7, 'rgba(255, 170, 60, 0.12)');
  g.addColorStop(1, 'rgba(255, 160, 40, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function insideAnyBuilding(buildings: BuildingSpec[], x: number, z: number, margin = 1): boolean {
  return buildings.some((b) =>
    x >= b.x0 - margin && x <= b.x1 + margin &&
    z >= b.z0 - margin && z <= b.z1 + margin,
  );
}

export class TownProps {
  private scene: THREE.Scene;
  private groups = new Map<string, TownGroup>();
  private timer = 0;
  private glowTex = makeGlowTexture();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  reset(world?: World | null) {
    for (const [key, entry] of this.groups) {
      this.scene.remove(entry.group);
      this.disposeGroup(entry.group);
      world?.removePropColliders(key);
    }
    this.groups.clear();
    this.timer = 0;
  }

  update(dt: number, world: World, player: Player, darkness: number) {
    if (!propModels.loaded) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.45;
    const px = player.position.x;
    const pz = player.position.z;
    const nearby = world.towns.townsNear(px, pz, 112).filter(
      (t) => Math.hypot(t.cx - px, t.cz - pz) < 118,
    );
    const active = new Set<string>();

    for (const town of nearby) {
      const key = `${town.cellX}:${town.cellZ}`;
      active.add(key);
      if (!this.groups.has(key)) {
        const built = this.build(town, world, key);
        if (built) {
          this.groups.set(key, built);
          this.scene.add(built.group);
        }
      }
    }

    const lit = Math.max(0, Math.min(1, (darkness - 0.08) * 1.5));
    for (const [key, entry] of this.groups) {
      const dist = Math.hypot(entry.town.cx - px, entry.town.cz - pz);
      for (const glow of entry.glows) {
        glow.visible = lit > 0.02;
        (glow.material as THREE.SpriteMaterial).opacity = 0.42 * lit;
      }
      if (entry.lamp) entry.lamp.intensity = 10 * lit;
      if (!active.has(key) && dist > 148) {
        this.scene.remove(entry.group);
        this.disposeGroup(entry.group);
        world.removePropColliders(key);
        this.groups.delete(key);
      }
    }
  }

  private disposeGroup(group: THREE.Group) {
    group.traverse((obj) => {
      if (obj instanceof THREE.Sprite) (obj.material as THREE.SpriteMaterial).dispose();
    });
  }

  private build(town: Town, world: World, key: string): TownGroup | null {
    const group = new THREE.Group();
    group.name = `town-props:${key}`;
    const glows: THREE.Sprite[] = [];
    const cars: CarProp[] = [];
    const y = town.baseY + 1;
    const rng = mulberry32((hash2(town.cellX, town.cellZ, world.seed + 3137) * 0xffffffff) >>> 0);
    const placements: Placement[] = [];

    // Parked cars along both main roads.
    const carIds: PropModelId[] = ['pickup', 'sports', 'truck'];
    const carCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < carCount; i++) {
      const alongMain = rng() < 0.58;
      const sign = rng() < 0.5 ? -1 : 1;
      const along = (20 + rng() * 24) * sign;
      const side = rng() < 0.5 ? -1 : 1;
      const car = carIds[Math.floor(rng() * carIds.length)];
      if (alongMain) {
        placements.push({
          id: car, x: town.cx + along, z: town.cz + side * 4.85,
          rot: (sign > 0 ? 1 : -1) * Math.PI / 2,
          collide: { halfX: 2.55, halfZ: 1.15, height: 2.1 },
        });
      } else {
        placements.push({
          id: car, x: town.cx + side * 4.85, z: town.cz + along,
          rot: sign > 0 ? 0 : Math.PI,
          collide: { halfX: 1.15, halfZ: 2.55, height: 2.1 },
        });
      }
    }

    // Street lights: a handful of corners, with the arm turned toward the road.
    const lampSpots = [
      { x: -7.8, z: -7.8, rot: 0 },
      { x: 7.8, z: 7.8, rot: Math.PI },
      { x: 7.8, z: -7.8, rot: -Math.PI / 2 },
      { x: -7.8, z: 7.8, rot: Math.PI / 2 },
      { x: -31, z: 6.4, rot: Math.PI },
      { x: 31, z: -6.4, rot: 0 },
      { x: 6.4, z: -31, rot: -Math.PI / 2 },
      { x: -6.4, z: 31, rot: Math.PI / 2 },
      { x: 43, z: 6.4, rot: Math.PI },
      { x: -43, z: -6.4, rot: 0 },
    ];
    for (const spot of lampSpots) {
      if (rng() > 0.74) continue;
      placements.push({
        id: 'streetlight', x: town.cx + spot.x, z: town.cz + spot.z, rot: spot.rot,
        collide: { halfX: 0.24, halfZ: 0.24, height: 6.6 },
      });
    }

    // Traffic lights at the intersection.
    const tlSpots = [
      { x: 7.4, z: 7.4, rot: Math.PI },
      { x: -7.4, z: -7.4, rot: 0 },
      { x: 7.4, z: -7.4, rot: -Math.PI / 2 },
      { x: -7.4, z: 7.4, rot: Math.PI / 2 },
    ];
    for (const spot of tlSpots) {
      if (rng() > 0.55) continue;
      placements.push({
        id: 'trafficlight', x: town.cx + spot.x, z: town.cz + spot.z, rot: spot.rot,
        scale: 0.82, collide: { halfX: 0.3, halfZ: 0.3, height: 3.9 },
      });
    }

    // One town sign at a random approach.
    const signSide = Math.floor(rng() * 4);
    const signDist = 47 + rng() * 4;
    const signSpots = [
      { x: (rng() - 0.5) * 6, z: signDist, rot: Math.PI },
      { x: (rng() - 0.5) * 6, z: -signDist, rot: 0 },
      { x: signDist, z: (rng() - 0.5) * 6, rot: -Math.PI / 2 },
      { x: -signDist, z: (rng() - 0.5) * 6, rot: Math.PI / 2 },
    ];
    const sign = signSpots[signSide];
    placements.push({ id: 'townsign', x: town.cx + sign.x, z: town.cz + sign.z, rot: sign.rot, scale: 0.48 });

    // A water tower on the outskirts gives the skyline a landmark.
    placements.push({
      id: 'watertower',
      x: town.cx + (rng() < 0.5 ? -50 : 50),
      z: town.cz + (rng() < 0.5 ? -50 : 50),
      rot: rng() * Math.PI * 2,
      scale: 1.45,
      collide: { halfX: 2.1, halfZ: 2.1, height: 13.5 },
    });

    // Hydrant and a construction corner.
    placements.push({ id: 'hydrant', x: town.cx + 8.6, z: town.cz + 7.1 });
    placements.push({ id: 'hydrant', x: town.cx - 8.8, z: town.cz - 7.2 });
    const cz = town.cx + 12 + rng() * 16;
    const czz = town.cz + (rng() < 0.5 ? -1 : 1) * (4.2 + rng() * 0.8);
    placements.push({ id: 'cone', x: cz - 1.1, z: czz, rot: rng() * 0.8 });
    placements.push({ id: 'cone', x: cz + 1.1, z: czz + 0.3, rot: rng() * 0.8 });
    placements.push({ id: 'barrier', x: cz, z: czz + 1.1, rot: 0.2 + rng() * 0.5, scale: 1.1 });

    // Small clutter along the sidewalks.
    const clutterIds: PropModelId[] = ['barrel', 'trashbag', 'pallet', 'barrel'];
    for (let i = 0; i < 8; i++) {
      const side = Math.floor(rng() * 4);
      const t = (rng() * 2 - 1) * 40;
      const off = (rng() < 0.5 ? -1 : 1) * (5.6 + rng() * 1.4);
      let x = town.cx;
      let z = town.cz;
      if (side === 0) { x += t; z += off; }
      else if (side === 1) { x += t; z -= off; }
      else if (side === 2) { x += off; z += t; }
      else { x -= off; z += t; }
      if (Math.abs(x - town.cx) < 8 && Math.abs(z - town.cz) < 8) continue;
      if (insideAnyBuilding(town.buildings, x, z, 0.2)) continue;
      placements.push({
        id: clutterIds[Math.floor(rng() * clutterIds.length)],
        x, z, rot: rng() * Math.PI * 2,
        scale: 0.85 + rng() * 0.3,
      });
    }

    // Empty lots become overgrown parking spots / dumps.
    for (const lot of town.lots) {
      const lx = (lot.x0 + lot.x1) / 2;
      const lz = (lot.z0 + lot.z1) / 2;
      if (rng() < 0.55) {
        const car = carIds[Math.floor(rng() * carIds.length)];
        const alongX = rng() < 0.5;
        placements.push({
          id: car, x: lx + (rng() - 0.5) * 2, z: lz + (rng() - 0.5) * 2,
          rot: (alongX ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.5,
          collide: alongX
            ? { halfX: 2.55, halfZ: 1.15, height: 2.1 }
            : { halfX: 1.15, halfZ: 2.55, height: 2.1 },
        });
      }
      if (rng() < 0.7) {
        placements.push({
          id: rng() < 0.5 ? 'containerGreen' : 'containerRed',
          x: lx + (rng() - 0.5) * 4, z: lz + (rng() - 0.5) * 4,
          rot: Math.PI / 2, scale: 0.42,
          collide: { halfX: 0.6, halfZ: 1.25, height: 1.15 },
        });
      }
      placements.push({
        id: 'trashbag', x: lx + (rng() - 0.5) * 5, z: lz + (rng() - 0.5) * 5,
        rot: rng() * Math.PI * 2,
      });
      if (rng() < 0.5) {
        placements.push({ id: 'pallet', x: lx + (rng() - 0.5) * 5, z: lz + (rng() - 0.5) * 5, rot: rng() * Math.PI });
      }
    }

    // Indoor furniture, a first pass at making the interiors feel lived in.
    for (const b of town.buildings) {
      if (b.kind === 'ruin') {
        placements.push({
          id: 'trashbag', x: b.x0 + 2.5 + rng() * 2, z: b.z0 + 2.5 + rng() * 2,
          rot: rng() * Math.PI * 2,
        });
        continue;
      }
      const corners = [
        { x: b.x0 + 2.3, z: b.z0 + 1.7, rot: 0 },
        { x: b.x1 - 2.3, z: b.z0 + 1.7, rot: 0 },
        { x: b.x0 + 2.3, z: b.z1 - 1.7, rot: Math.PI },
        { x: b.x1 - 2.3, z: b.z1 - 1.7, rot: Math.PI },
      ];
      const corner = corners[Math.floor(rng() * corners.length)];
      const doorX = (b.x0 + b.x1) / 2;
      const doorZ = (b.z0 + b.z1) / 2;
      const nearDoor = Math.hypot(corner.x - doorX, corner.z - doorZ) < 4;
      if (!nearDoor && (b.kind === 'house' || b.kind === 'apartment' || b.kind === 'store' || b.kind === 'pharmacy' || b.kind === 'police')) {
        placements.push({
          id: 'couch', x: corner.x, z: corner.z, rot: corner.rot, scale: 0.68,
          collide: corner.rot === 0 || corner.rot === Math.PI
            ? { halfX: 1.05, halfZ: 0.45, height: 0.9 }
            : { halfX: 0.45, halfZ: 1.05, height: 0.9 },
        });
      } else if (b.kind === 'warehouse' || b.kind === 'gas') {
        placements.push({
          id: 'pallet', x: b.x0 + 2.5, z: b.z0 + 2.5, rot: rng() * Math.PI,
        });
        placements.push({
          id: 'barrel', x: b.x1 - 2.5, z: b.z0 + 2.5,
          collide: { halfX: 0.38, halfZ: 0.38, height: 1.15 },
        });
      } else if (b.kind === 'house' || b.kind === 'apartment') {
        placements.push({
          id: 'barrel', x: b.x1 - 2.4, z: b.z0 + 2.2,
          collide: { halfX: 0.38, halfZ: 0.38, height: 1.15 },
        });
      }
    }

    let placed = 0;
    for (const p of placements) {
      const model = propModels.create(p.id);
      if (!model) continue;
      model.position.set(p.x, y, p.z);
      if (p.rot) model.rotation.y = p.rot;
      if (p.scale) model.scale.setScalar(p.scale);
      group.add(model);
      placed++;
      if (p.id === 'streetlight') {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffcf8a,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }));
        glow.position.set(0, 6.05, 1.8);
        glow.scale.set(2.4, 2.4, 1);
        glow.visible = false;
        model.add(glow);
        glows.push(glow);
      }
      if (p.collide) {
        world.addPropCollider({
          tag: key,
          x0: p.x - p.collide.halfX,
          x1: p.x + p.collide.halfX,
          z0: p.z - p.collide.halfZ,
          z1: p.z + p.collide.halfZ,
          y0: y,
          y1: y + p.collide.height,
        });
      }
      if (p.id === 'pickup' || p.id === 'sports' || p.id === 'truck') {
        const alongX = Math.abs(Math.sin(p.rot ?? 0)) > 0.7;
        cars.push({
          key: `car:${Math.round(p.x * 10)},${Math.round(p.z * 10)}`,
          label: p.id === 'truck' ? 'Грузовик' : p.id === 'sports' ? 'Спорткар' : 'Пикап',
          x: p.x,
          y,
          z: p.z,
          halfX: alongX ? 2.6 : 1.25,
          halfZ: alongX ? 1.25 : 2.6,
          height: 2.2,
        });
      }
    }
    if (placed === 0) return null;
    const lamp = new THREE.PointLight(0xffc98a, 0, 30, 2);
    lamp.position.set(town.cx, y + 7, town.cz);
    group.add(lamp);
    return { group, town, glows, lamp, cars };
  }

  pickCar(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 5): CarProp | null {
    const ray = new THREE.Ray(origin.clone(), dir.clone().normalize());
    const point = new THREE.Vector3();
    let best: CarProp | null = null;
    let bestDistance = Infinity;
    for (const entry of this.groups.values()) {
      for (const car of entry.cars) {
        const box = new THREE.Box3(
          new THREE.Vector3(car.x - car.halfX, car.y, car.z - car.halfZ),
          new THREE.Vector3(car.x + car.halfX, car.y + car.height, car.z + car.halfZ),
        );
        if (!ray.intersectBox(box, point)) continue;
        const distance = origin.distanceTo(point);
        if (distance <= maxDist && distance < bestDistance) {
          bestDistance = distance;
          best = car;
        }
      }
    }
    return best;
  }

  debugCars() {
    return [...this.groups.values()].flatMap((entry) =>
      entry.cars.map((car) => ({ ...car, town: `${entry.town.cellX}:${entry.town.cellZ}` })),
    );
  }
}
