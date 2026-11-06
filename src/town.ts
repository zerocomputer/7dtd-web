import { Block, ContainerKind } from './blocks';
import { hash2, hash3, mulberry32 } from './noise';
import type { Chunk, World } from './world';

const CELL = 160;
const SEA = 34;
const TOWN_RADIUS = 54;
const TOWN_BLEND = 74;
const HEIGHT = 96;
const CHUNK = 16;

export type BuildingKind = 'house' | 'store' | 'pharmacy' | 'police' | 'warehouse' | 'gas' | 'ruin' | 'apartment';
export type FrontSide = 'north' | 'south' | 'east' | 'west';

export interface ContainerSpot {
  x: number;
  z: number;
  type: ContainerKind;
  floor?: number;
}

export interface TorchSpot {
  x: number;
  z: number;
  floor?: number;
}

export interface StairSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface TrapSpot {
  x: number;
  z: number;
  floor?: number;
}

export interface ZombieSpot {
  x: number;
  y: number;
  z: number;
}

export interface BuildingSpec {
  id: string;
  index: number;
  kind: BuildingKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  front: FrontSide;
  height: number;
  floors: number;
  baseY: number;
  wall: Block;
  floor: Block;
  roof: Block;
  interior: Block;
  roofType: 'flat' | 'hip' | 'gable';
  roofRise: number;
  roofAxis: 'x' | 'z';
  porch: boolean;
  chimney: boolean;
  awnings: boolean;
  fence: boolean;
  bay: boolean;
  containers: ContainerSpot[];
  torches: TorchSpot[];
  traps: TrapSpot[];
  zombieSpawns: ZombieSpot[];
  zombieCount: number;
  stair?: StairSpec;
  partition?: { axis: 'x' | 'z'; pos: number; doorStart: number };
}

export interface ExteriorProp {
  x: number;
  z: number;
  block: Block;
}

export interface LotSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  front: FrontSide;
}

export interface Town {
  cellX: number;
  cellZ: number;
  cx: number;
  cz: number;
  baseY: number;
  buildings: BuildingSpec[];
  props: ExteriorProp[];
  lots: LotSpec[];
  starter: boolean;
}

interface Slot {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  front: FrontSide;
  group: 'main' | 'cross';
}

const SLOTS: Slot[] = [
  { x0: -47, x1: -34, z0: -23, z1: -10, front: 'south', group: 'main' },
  { x0: -31, x1: -17, z0: -23, z1: -10, front: 'south', group: 'main' },
  { x0: 17, x1: 31, z0: -23, z1: -10, front: 'south', group: 'main' },
  { x0: 34, x1: 47, z0: -23, z1: -10, front: 'south', group: 'main' },
  { x0: -47, x1: -34, z0: 10, z1: 23, front: 'north', group: 'main' },
  { x0: -31, x1: -17, z0: 10, z1: 23, front: 'north', group: 'main' },
  { x0: 17, x1: 31, z0: 10, z1: 23, front: 'north', group: 'main' },
  { x0: 34, x1: 47, z0: 10, z1: 23, front: 'north', group: 'main' },
  { x0: -23, x1: -10, z0: -43, z1: -30, front: 'east', group: 'cross' },
  { x0: -23, x1: -10, z0: 30, z1: 43, front: 'east', group: 'cross' },
  { x0: 10, x1: 23, z0: -43, z1: -30, front: 'west', group: 'cross' },
  { x0: 10, x1: 23, z0: 30, z1: 43, front: 'west', group: 'cross' },
  { x0: -47, x1: -34, z0: -42, z1: -29, front: 'south', group: 'main' },
  { x0: 34, x1: 47, z0: -42, z1: -29, front: 'south', group: 'main' },
  { x0: -47, x1: -34, z0: 29, z1: 42, front: 'north', group: 'main' },
  { x0: 34, x1: 47, z0: 29, z1: 42, front: 'north', group: 'main' },
];

const KIND_STYLE: Record<BuildingKind, {
  wall: Block;
  floor: Block;
  roof: Block;
  interior: Block;
  minH: number;
  maxH: number;
  containers: number;
  zombies: number;
  parapet: boolean;
  containerKinds: ContainerKind[];
}> = {
  house: {
    wall: Block.Plaster, floor: Block.Planks, roof: Block.Shingles, interior: Block.Plaster,
    minH: 3, maxH: 3, containers: 3, zombies: 9, parapet: false,
    containerKinds: ['crate', 'cabinet', 'fridge', 'cabinet'],
  },
  store: {
    wall: Block.Brick, floor: Block.Concrete, roof: Block.Concrete, interior: Block.Plaster,
    minH: 4, maxH: 5, containers: 5, zombies: 11, parapet: true,
    containerKinds: ['crate', 'cabinet', 'fridge', 'safe', 'cabinet'],
  },
  pharmacy: {
    wall: Block.Plaster, floor: Block.Concrete, roof: Block.Concrete, interior: Block.Plaster,
    minH: 4, maxH: 4, containers: 4, zombies: 9, parapet: true,
    containerKinds: ['medcab', 'medcab', 'cabinet', 'fridge'],
  },
  police: {
    wall: Block.Concrete, floor: Block.Concrete, roof: Block.Concrete, interior: Block.Concrete,
    minH: 4, maxH: 5, containers: 4, zombies: 14, parapet: true,
    containerKinds: ['safe', 'medcab', 'cabinet', 'crate'],
  },
  warehouse: {
    wall: Block.Metal, floor: Block.Concrete, roof: Block.Metal, interior: Block.Metal,
    minH: 5, maxH: 6, containers: 6, zombies: 17, parapet: true,
    containerKinds: ['crate', 'crate', 'safe', 'crate', 'cabinet', 'crate'],
  },
  gas: {
    wall: Block.Concrete, floor: Block.Concrete, roof: Block.Concrete, interior: Block.Plaster,
    minH: 4, maxH: 4, containers: 4, zombies: 10, parapet: true,
    containerKinds: ['fridge', 'cabinet', 'safe', 'crate'],
  },
  ruin: {
    wall: Block.Brick, floor: Block.Cobble, roof: Block.Shingles, interior: Block.Brick,
    minH: 2, maxH: 3, containers: 2, zombies: 6, parapet: false,
    containerKinds: ['trash', 'crate', 'cabinet'],
  },
  apartment: {
    wall: Block.Concrete, floor: Block.Concrete, roof: Block.Concrete, interior: Block.Plaster,
    minH: 9, maxH: 15, containers: 7, zombies: 18, parapet: true,
    containerKinds: ['crate', 'cabinet', 'fridge', 'medcab', 'cabinet', 'safe', 'trash'],
  },
};

const MAIN_KINDS: { kind: BuildingKind; weight: number }[] = [
  { kind: 'house', weight: 44 },
  { kind: 'store', weight: 16 },
  { kind: 'pharmacy', weight: 7 },
  { kind: 'police', weight: 5 },
  { kind: 'gas', weight: 5 },
  { kind: 'ruin', weight: 11 },
  { kind: 'apartment', weight: 12 },
];

const CROSS_KINDS: { kind: BuildingKind; weight: number }[] = [
  { kind: 'warehouse', weight: 15 },
  { kind: 'store', weight: 10 },
  { kind: 'house', weight: 36 },
  { kind: 'ruin', weight: 20 },
  { kind: 'apartment', weight: 19 },
];

function weightedKind(table: { kind: BuildingKind; weight: number }[], rng: () => number): BuildingKind {
  let total = 0;
  for (const e of table) total += e.weight;
  let r = rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) return e.kind;
  }
  return table[0].kind;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function cellKey(cx: number, cz: number): number {
  return (cx + 8192) * 16384 + (cz + 8192);
}

export class TownGenerator {
  readonly seed: number;
  private heightAt: (x: number, z: number) => number;
  private cache = new Map<number, Town | null>();
  private starterCell: [number, number] | null = null;

  constructor(seed: number, heightAt: (x: number, z: number) => number) {
    this.seed = seed >>> 0;
    this.heightAt = heightAt;
    this.starterCell = this.findStarterCell();
  }

  private findStarterCell(): [number, number] | null {
    for (let radius = 0; radius <= 4; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          if (this.canPlaceTown(dx, dz, true)) return [dx, dz];
        }
      }
    }
    return null;
  }

  private canPlaceTown(cx: number, cz: number, relaxed = false): boolean {
    const x = cx * CELL;
    const z = cz * CELL;
    const hs: number[] = [];
    for (const [ox, oz] of [[0, 0], [-30, 0], [30, 0], [0, -30], [0, 30], [-24, -24], [24, 24]] as const) {
      hs.push(this.heightAt(x + ox, z + oz));
    }
    const min = Math.min(...hs);
    const max = Math.max(...hs);
    if (min < SEA + 2) return false;
    return relaxed || max - min <= 18;
  }

  townAtCell(cx: number, cz: number): Town | null {
    const key = cellKey(cx, cz);
    if (this.cache.has(key)) return this.cache.get(key)!;
    const starter = this.starterCell !== null && this.starterCell[0] === cx && this.starterCell[1] === cz;
    const roll = hash2(cx, cz, this.seed + 811);
    if (!starter && roll > 0.62) {
      this.cache.set(key, null);
      return null;
    }
    if (!this.canPlaceTown(cx, cz, starter)) {
      this.cache.set(key, null);
      return null;
    }
    const town = this.createTown(cx, cz, starter);
    this.cache.set(key, town);
    return town;
  }

  private createTown(cx: number, cz: number, starter: boolean): Town {
    const centerX = cx * CELL;
    const centerZ = cz * CELL;
    const samples: number[] = [];
    for (const [ox, oz] of [[0, 0], [-30, 0], [30, 0], [0, -30], [0, 30]] as const) {
      samples.push(this.heightAt(centerX + ox, centerZ + oz));
    }
    samples.sort((a, b) => a - b);
    const baseY = samples[Math.floor(samples.length / 2)];
    const rng = mulberry32((hash2(cx, cz, this.seed + 1907) * 0xffffffff) >>> 0);
    const buildings: BuildingSpec[] = [];
    const usedSlots = new Set<number>();

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const present = starter ? rng() < 0.96 : rng() < 0.79;
      if (!present) continue;
      const kind = weightedKind(slot.group === 'main' ? MAIN_KINDS : CROSS_KINDS, rng);
      const building = this.makeBuilding(cx, cz, baseY, i, slot, kind, rng);
      if (building) {
        buildings.push(building);
        usedSlots.add(i);
      }
    }

    // Guarantee the starter town is worth visiting.
    if (starter && buildings.length < 6) {
      for (let i = 0; i < SLOTS.length && buildings.length < 7; i++) {
        if (usedSlots.has(i)) continue;
        const building = this.makeBuilding(
          cx, cz, baseY, i, SLOTS[i],
          weightedKind(SLOTS[i].group === 'main' ? MAIN_KINDS : CROSS_KINDS, rng),
          rng,
        );
        if (building) {
          buildings.push(building);
          usedSlots.add(i);
        }
      }
    }

    // The first town should read as a residential town, not a ruin field.
    if (starter) {
      let houses = buildings.filter((b) => b.kind === 'house').length;
      for (let i = 0; i < buildings.length && houses < 6; i++) {
        const b = buildings[i];
        if (b.kind !== 'ruin' && b.kind !== 'store') continue;
        const rebuilt = this.makeBuilding(cx, cz, baseY, b.index, SLOTS[b.index], 'house', rng);
        if (rebuilt) {
          buildings[i] = rebuilt;
          houses++;
        }
      }
    }

    const lots: LotSpec[] = [];
    for (let i = 0; i < SLOTS.length; i++) {
      if (usedSlots.has(i)) continue;
      const s = SLOTS[i];
      lots.push({
        x0: s.x0 + cx * CELL, x1: s.x1 + cx * CELL,
        z0: s.z0 + cz * CELL, z1: s.z1 + cz * CELL,
        front: s.front,
      });
    }

    const props: ExteriorProp[] = [];
    const propRng = mulberry32((hash2(cx, cz, this.seed + 555) * 0xffffffff) >>> 0);
    const propCandidates: [number, number][] = [
      [8, -8], [-8, 9], [8, 9], [-8, -8], [30, 7], [-32, 8], [8, 34], [-8, -36],
      [14, 7], [-15, -7], [7, 18], [-7, -19], [40, 7], [-41, -7], [7, -40], [-7, 41],
    ];
    const wantedProps = 6 + Math.floor(propRng() * 5);
    for (let k = 0; k < propCandidates.length && props.length < wantedProps; k++) {
      const [dx, dz] = propCandidates[k];
      const px = centerX + dx;
      const pz = centerZ + dz;
      if (this.insideBuilding(buildings, px, pz)) continue;
      if (Math.abs(px - centerX) <= 4 && Math.abs(pz - centerZ) <= 4) continue;
      const roll = propRng();
      const block = roll < 0.42 ? Block.Trash : roll < 0.72 ? Block.Crate : Block.Cobble;
      props.push({ x: px, z: pz, block });
    }

    return {
      cellX: cx,
      cellZ: cz,
      cx: centerX,
      cz: centerZ,
      baseY,
      buildings,
      props,
      lots,
      starter,
    };
  }

  private insideBuilding(buildings: BuildingSpec[], x: number, z: number): boolean {
    return buildings.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  }

  private makeBuilding(
    cx: number,
    cz: number,
    baseY: number,
    index: number,
    slot: Slot,
    kind: BuildingKind,
    rng: () => number,
  ): BuildingSpec | null {
    let x0 = slot.x0 + cx * CELL;
    let x1 = slot.x1 + cx * CELL;
    let z0 = slot.z0 + cz * CELL;
    let z1 = slot.z1 + cz * CELL;
    if (rng() < 0.55) {
      if (slot.front === 'south') z0 += 1;
      else if (slot.front === 'north') z1 -= 1;
      else if (slot.front === 'east') x0 += 1;
      else x1 -= 1;
    }
    if (rng() < 0.4) {
      if (slot.front === 'south') x1 -= 1;
      else if (slot.front === 'north') x0 += 1;
      else if (slot.front === 'east') z1 -= 1;
      else z0 += 1;
    }
    // Vary the street line: some houses sit back from the pavement.
    const setback = Math.floor(rng() * 3);
    if (setback > 0) {
      if (slot.front === 'south') z1 -= setback;
      else if (slot.front === 'north') z0 += setback;
      else if (slot.front === 'east') x1 -= setback;
      else x0 += setback;
    }
    if (x1 - x0 < 9 || z1 - z0 < 8) return null;

    const style = KIND_STYLE[kind];
    let floors = 1;
    if (kind === 'house') floors = rng() < 0.35 ? 2 : 1;
    else if (kind === 'store' || kind === 'pharmacy' || kind === 'ruin') floors = rng() < 0.45 ? 2 : 1;
    else if (kind === 'police' || kind === 'warehouse') floors = 2;
    else if (kind === 'apartment') floors = 3 + Math.floor(rng() * 3);
    const height = floors * 3;
    const width = x1 - x0 + 1;
    const depth = z1 - z0 + 1;
    let wall = style.wall;
    let roof = style.roof;
    let interior = style.interior;
    if (kind === 'house') {
      const variant = rng();
      if (variant < 0.22) {
        wall = Block.Siding;
        interior = Block.Plaster;
      } else if (variant < 0.46) {
        wall = Block.Planks;
        interior = Block.Planks;
      } else if (variant < 0.74) {
        wall = Block.Plaster;
        interior = Block.Plaster;
      } else {
        wall = Block.Brick;
        interior = Block.Plaster;
      }
      roof = rng() < 0.34 ? Block.RoofRed : Block.Shingles;
    } else if (kind === 'ruin') {
      if (rng() < 0.45) {
        wall = Block.Plaster;
        interior = Block.Brick;
      }
      roof = rng() < 0.3 ? Block.RoofRed : Block.Shingles;
    } else if (kind === 'pharmacy' || kind === 'gas') {
      roof = rng() < 0.4 ? Block.RoofRed : Block.Shingles;
    }

    let roofType: 'flat' | 'hip' | 'gable' = 'flat';
    if (kind === 'house') {
      roofType = 'gable';
    } else if (kind === 'ruin') {
      const r = rng();
      roofType = r < 0.5 ? 'gable' : r < 0.78 ? 'hip' : 'flat';
    } else if (kind === 'store' || kind === 'pharmacy') {
      const r = rng();
      roofType = r < 0.5 ? 'gable' : r < 0.74 ? 'hip' : 'flat';
    } else if (kind === 'gas') {
      roofType = rng() < 0.55 ? 'hip' : 'flat';
    } else if (kind === 'police') {
      roofType = rng() < 0.22 ? 'hip' : 'flat';
    } else if (kind === 'apartment') {
      roofType = 'flat';
    }
    const roofAxis: 'x' | 'z' = slot.front === 'south' || slot.front === 'north' ? 'x' : 'z';
    const baseRise = Math.max(2, Math.min(3, Math.ceil(Math.min(width, depth) / 2) - 2));
    const roofRise = roofType === 'hip'
      ? Math.max(3, Math.min(5, Math.ceil(Math.min(width, depth) / 2) - 1))
      : baseRise;
    if (roofType !== 'flat' && roof !== Block.Shingles && roof !== Block.RoofRed) {
      roof = rng() < 0.35 ? Block.RoofRed : Block.Shingles;
    }
    const porch = (kind === 'house' || kind === 'store' || kind === 'pharmacy' || kind === 'gas') && rng() < (kind === 'house' ? 0.92 : 0.34);
    const awnings = !porch && (kind === 'store' || kind === 'pharmacy' || kind === 'gas') && rng() < 0.9;
    const fence = kind === 'house' && rng() < 0.68;
    const bay = kind === 'house' && width >= 12 && rng() < 0.42;
    const chimney = (kind === 'house' || kind === 'ruin') && roofType !== 'flat' && rng() < 0.6;
    const containers: ContainerSpot[] = [];
    const torches: TorchSpot[] = [];
    const traps: TrapSpot[] = [];
    const zombieSpawns: ZombieSpot[] = [];
    const midX = Math.round((x0 + x1) / 2);
    const midZ = Math.round((z0 + z1) / 2);
    const stair: StairSpec | undefined = floors > 1
      ? { x0: x0 + 2, x1: x0 + 4, z0: z0 + 1, z1: z0 + 2 }
      : undefined;
    const isStairCell = (x: number, z: number) =>
      !!stair && x >= stair.x0 && x <= stair.x1 && z >= stair.z0 && z <= stair.z1;

    let partition: BuildingSpec['partition'];
    if (kind !== 'warehouse' && kind !== 'ruin' && x1 - x0 >= 11 && z1 - z0 >= 10) {
      if (slot.front === 'north' || slot.front === 'south') {
        const pos = Math.round((z0 + z1) / 2);
        const doorStart = x0 + 2;
        partition = { axis: 'z', pos, doorStart };
      } else {
        const pos = Math.round((x0 + x1) / 2);
        const doorStart = z0 + 2;
        partition = { axis: 'x', pos, doorStart };
      }
    }

    const candidates: [number, number][] = [
      [x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1],
      [midX, z0 + 1], [midX, z1 - 1], [x0 + 1, midZ], [x1 - 1, midZ],
    ];
    for (let z = z0 + 2; z <= z1 - 2; z += 2) {
      for (let x = x0 + 2; x <= x1 - 2; x += 2) {
        candidates.push([x, z]);
      }
    }
    const shuffled: [number, number][] = [];
    while (candidates.length > 0) {
      const i = Math.floor(rng() * candidates.length);
      shuffled.push(candidates.splice(i, 1)[0]);
    }
    const isBlockedByPartition = (x: number, z: number) => {
      if (!partition) return false;
      if (partition.axis === 'z') return z === partition.pos;
      return x === partition.pos;
    };
    const nearFrontDoor = (x: number, z: number) => {
      if (slot.front === 'south') return z === z1 - 1 && Math.abs(x - midX) <= 1;
      if (slot.front === 'north') return z === z0 + 1 && Math.abs(x - midX) <= 1;
      if (slot.front === 'east') return x === x1 - 1 && Math.abs(z - midZ) <= 1;
      return x === x0 + 1 && Math.abs(z - midZ) <= 1;
    };
    const used = new Set<string>();

    for (const [x, z] of shuffled) {
      if (containers.length >= style.containers) break;
      if (isBlockedByPartition(x, z)) continue;
      if (nearFrontDoor(x, z)) continue;
      if (isStairCell(x, z)) continue;
      if (Math.abs(x - midX) <= 0 && Math.abs(z - z0) <= 1) continue;
      const key = `${x},${z}`;
      if (used.has(key)) continue;
      used.add(key);
      const type = style.containerKinds[containers.length % style.containerKinds.length];
      containers.push({ x, z, type });
    }

    const torchTarget = kind === 'ruin' ? 0 : (x1 - x0 >= 12 ? 2 : 1);
    for (const [x, z] of shuffled) {
      if (torches.length >= torchTarget) break;
      const key = `${x},${z}`;
      if (used.has(key)) continue;
      if (isBlockedByPartition(x, z)) continue;
      if (nearFrontDoor(x, z)) continue;
      if (isStairCell(x, z)) continue;
      used.add(key);
      torches.push({ x, z });
    }

    const trapCount = (kind === 'warehouse' || kind === 'apartment' || kind === 'police')
      ? 2
      : (kind === 'house' || kind === 'store' || kind === 'pharmacy' || kind === 'gas') ? 1 : 0;
    if (trapCount > 0 && rng() < 0.62) {
      for (const [x, z] of shuffled) {
        if (traps.length >= trapCount) break;
        const key = `${x},${z}`;
        if (used.has(key)) continue;
        if (isBlockedByPartition(x, z)) continue;
        if (nearFrontDoor(x, z)) continue;
        if (isStairCell(x, z)) continue;
        used.add(key);
        traps.push({ x, z });
      }
    }

    const zombiePool = shuffled.filter(([x, z]) =>
      !used.has(`${x},${z}`) && !isBlockedByPartition(x, z) && !isStairCell(x, z),
    );
    const wantedZombies = Math.min(style.zombies, zombiePool.length);
    for (let i = 0; i < wantedZombies; i++) {
      const [x, z] = zombiePool[i];
      zombieSpawns.push({ x: x + 0.5, y: baseY + 1.15, z: z + 0.5 });
    }

    if (floors > 1) {
      const upperCandidates = shuffled.filter(([x, z]) =>
        !isBlockedByPartition(x, z) && !isStairCell(x, z) && !nearFrontDoor(x, z),
      );
      for (let f = 1; f < floors; f++) {
        const floorY = baseY + f * 3;
        for (let k = 0; k < 2 && upperCandidates.length > 0; k++) {
          const [x, z] = upperCandidates[(f * 5 + k * 3) % upperCandidates.length];
          const type = style.containerKinds[(f + k) % style.containerKinds.length];
          if (!containers.some((c) => c.x === x && c.z === z && (c.floor ?? 0) === f)) {
            containers.push({ x, z, type, floor: f });
          }
        }
        if (torchTarget > 0 && upperCandidates.length > 0) {
          const [tx, tz] = upperCandidates[(f * 7 + 2) % upperCandidates.length];
          torches.push({ x: tx, z: tz, floor: f });
        }
        for (let k = 0; k < 3 && upperCandidates.length > 0; k++) {
          const [x, z] = upperCandidates[(f * 11 + k * 7) % upperCandidates.length];
          zombieSpawns.push({ x: x + 0.5, y: floorY + 1.15, z: z + 0.5 });
        }
      }
    }
    if (zombieSpawns.length === 0) {
      zombieSpawns.push({ x: midX + 0.5, y: baseY + 1.15, z: midZ + 0.5 });
    }

    return {
      id: `town:${cx}:${cz}:${index}`,
      index,
      kind,
      x0, x1, z0, z1,
      front: slot.front,
      height,
      floors,
      baseY,
      wall,
      floor: style.floor,
      roof,
      interior,
      roofType,
      roofRise,
      roofAxis,
      porch,
      chimney,
      awnings,
      fence,
      bay,
      containers,
      torches,
      traps,
      zombieSpawns,
      zombieCount: Math.max(1, zombieSpawns.length),
      stair,
      partition,
    };
  }

  townsNear(x: number, z: number, radius: number): Town[] {
    const fromX = Math.floor((x - radius) / CELL) - 1;
    const toX = Math.floor((x + radius) / CELL) + 1;
    const fromZ = Math.floor((z - radius) / CELL) - 1;
    const toZ = Math.floor((z + radius) / CELL) + 1;
    const out: Town[] = [];
    for (let cz = fromZ; cz <= toZ; cz++) {
      for (let cx = fromX; cx <= toX; cx++) {
        const town = this.townAtCell(cx, cz);
        if (!town) continue;
        const dx = town.cx - x;
        const dz = town.cz - z;
        if (Math.hypot(dx, dz) <= radius + TOWN_BLEND) out.push(town);
      }
    }
    return out;
  }

  nearestTown(x: number, z: number): { town: Town; distance: number } | null {
    let best: { town: Town; distance: number } | null = null;
    for (let radius = 1; radius <= 4; radius++) {
      const fromX = Math.floor(x / CELL) - radius;
      const toX = Math.floor(x / CELL) + radius;
      const fromZ = Math.floor(z / CELL) - radius;
      const toZ = Math.floor(z / CELL) + radius;
      for (let cz = fromZ; cz <= toZ; cz++) {
        for (let cx = fromX; cx <= toX; cx++) {
          const town = this.townAtCell(cx, cz);
          if (!town) continue;
          const d = Math.hypot(town.cx - x, town.cz - z);
          if (!best || d < best.distance) best = { town, distance: d };
        }
      }
      if (best) return best;
    }
    return best;
  }

  starterSpawn(): { x: number; y: number; z: number; yaw: number } | null {
    if (!this.starterCell) return null;
    const town = this.townAtCell(this.starterCell[0], this.starterCell[1]);
    if (!town) return null;
    return { x: town.cx + 0.5, y: town.baseY + 1.2, z: town.cz + 48.5, yaw: 0 };
  }

  /** Writes town terrain, roads, buildings and props into a single chunk. */
  applyToChunk(world: World, chunk: Chunk) {
    const baseX = chunk.cx * CHUNK;
    const baseZ = chunk.cz * CHUNK;
    const towns = this.townsNear(baseX + 8, baseZ + 8, 44);
    if (towns.length === 0) return;

    const write = (wx: number, wy: number, wz: number, id: number) => {
      if (wy < 0 || wy >= HEIGHT) return;
      const lx = wx - baseX;
      const lz = wz - baseZ;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) return;
      chunk.data[(wy * CHUNK + lz) * CHUNK + lx] = id;
    };

    for (const town of towns) {
      // Flatten the town core, then let the ground slope back to the natural terrain.
      for (let lz = 0; lz < CHUNK; lz++) {
        const wz = baseZ + lz;
        const dz = wz - town.cz;
        if (Math.abs(dz) > TOWN_BLEND) continue;
        for (let lx = 0; lx < CHUNK; lx++) {
          const wx = baseX + lx;
          const dx = wx - town.cx;
          if (Math.abs(dx) > TOWN_BLEND) continue;

          const edge = Math.max(Math.abs(dx), Math.abs(dz));
          const core = edge <= TOWN_RADIUS;
          const h = world.surfaceHeight(wx, wz);
          let target = town.baseY;
          if (!core) {
            const t = smoothstep(TOWN_RADIUS, TOWN_BLEND, edge);
            target = Math.round(town.baseY + (h - town.baseY) * t);
          }

          const clearTop = core ? Math.max(h, town.baseY + 14) : Math.max(h, target) + 7;
          for (let y = target + 1; y <= clearTop; y++) write(wx, y, wz, Block.Air);
          if (h < target) {
            for (let y = h + 1; y < target; y++) write(wx, y, wz, Block.Dirt);
          }

          const onMain = Math.abs(dz) <= 4;
          const onCross = Math.abs(dx) <= 4;
          const onSidewalk = Math.abs(dz) <= 6 || Math.abs(dx) <= 6;
          let top = Block.Grass;
          if (core) {
            if (onMain || onCross) {
              const dashMain = dz === 0 && Math.floor((dx + 1000) / 8) % 2 === 0;
              const dashCross = dx === 0 && Math.floor((dz + 1000) / 8) % 2 === 0;
              top = dashMain || dashCross ? Block.RoadLine : Block.Asphalt;
            } else if (onSidewalk) {
              top = Block.Concrete;
            }
          } else if ((onMain || onCross) && edge < TOWN_BLEND - 5) {
            top = Block.Gravel;
          }
          write(wx, target, wz, top);
        }
      }

      // Scatter trees through the transition ring so the town does not end abruptly.
      for (let tz = baseZ - 3; tz < baseZ + CHUNK + 3; tz++) {
        const ddz = tz - town.cz;
        if (Math.abs(ddz) > TOWN_BLEND) continue;
        for (let tx = baseX - 3; tx < baseX + CHUNK + 3; tx++) {
          const ddx = tx - town.cx;
          if (Math.abs(ddx) > TOWN_BLEND) continue;
          const edge = Math.max(Math.abs(ddx), Math.abs(ddz));
          if (edge <= TOWN_RADIUS + 3 || edge >= TOWN_BLEND - 2) continue;
          if (Math.abs(ddx) < 9 || Math.abs(ddz) < 9) continue;
          const blend = smoothstep(TOWN_RADIUS, TOWN_BLEND, edge);
          if (hash2(tx, tz, world.seed + 771) > 0.003 + blend * 0.017) continue;
          const h = world.surfaceHeight(tx, tz);
          const target = Math.round(town.baseY + (h - town.baseY) * blend);
          const trunkH = 3 + Math.floor(hash2(tx, tz, world.seed + 772) * 3);
          for (let y = target + 1; y <= target + trunkH; y++) write(tx, y, tz, Block.Log);
          const topY = target + trunkH;
          for (let dy = -1; dy <= 2; dy++) {
            const radius = dy === 2 ? 1 : 2;
            for (let dz = -radius; dz <= radius; dz++) {
              for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
                if (dx === 0 && dz === 0 && dy <= 0) continue;
                if (hash3(tx + dx, topY + dy, tz + dz, world.seed + 773) < 0.2) continue;
                write(tx + dx, topY + dy, tz + dz, Block.Leaves);
              }
            }
          }
        }
      }

      for (const building of town.buildings) {
        if (
          building.x1 < baseX || building.x0 > baseX + CHUNK - 1 ||
          building.z1 < baseZ || building.z0 > baseZ + CHUNK - 1
        ) continue;
        this.applyBuilding(world, chunk, write, building);
      }

      for (const prop of town.props) {
        if (prop.x < baseX || prop.x >= baseX + CHUNK || prop.z < baseZ || prop.z >= baseZ + CHUNK) continue;
        write(prop.x, town.baseY + 1, prop.z, prop.block);
      }
    }
  }

  private applyBuilding(
    world: World,
    chunk: Chunk,
    write: (wx: number, wy: number, wz: number, id: number) => void,
    b: BuildingSpec,
  ) {
    const baseY = b.baseY;

    // clear and floor
    for (let z = b.z0 + 1; z <= b.z1 - 1; z++) {
      for (let x = b.x0 + 1; x <= b.x1 - 1; x++) {
        for (let y = baseY + 1; y <= baseY + b.height + 2; y++) write(x, y, z, Block.Air);
      }
    }
    for (let z = b.z0; z <= b.z1; z++) {
      for (let x = b.x0; x <= b.x1; x++) write(x, baseY, z, b.floor);
    }

    const isRuin = b.kind === 'ruin';
    // perimeter walls
    for (let y = baseY + 1; y <= baseY + b.height; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        for (let z = b.z0; z <= b.z1; z++) {
          if (!(x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1)) continue;
          if (isRuin && hash3(x, y, z, world.seed + 171) < 0.2) continue;
          write(x, y, z, b.wall);
        }
      }
    }

    // foundation band and timber corner posts make the facades read as buildings
    if (!isRuin) {
      const foundation = b.kind === 'house' ? Block.Cobble : Block.Concrete;
      for (let x = b.x0; x <= b.x1; x++) {
        write(x, baseY + 1, b.z0, foundation);
        write(x, baseY + 1, b.z1, foundation);
      }
      for (let z = b.z0 + 1; z < b.z1; z++) {
        write(b.x0, baseY + 1, z, foundation);
        write(b.x1, baseY + 1, z, foundation);
      }
      if (b.kind === 'house' && (b.wall === Block.Planks || b.wall === Block.Siding)) {
        for (const [cx2, cz2] of [
          [b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1],
        ] as const) {
          for (let y = baseY + 1; y <= baseY + b.height; y++) write(cx2, y, cz2, Block.Log);
        }
      }
      if (b.kind === 'house' && (b.wall === Block.Brick || b.wall === Block.Plaster)) {
        const quoin = b.wall === Block.Brick ? Block.Concrete : Block.Brick;
        for (const [cx2, cz2] of [
          [b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1],
        ] as const) {
          for (let y = baseY + 2; y <= baseY + b.height; y++) write(cx2, y, cz2, quoin);
        }
      }
    }

    // door opening
    const midX = Math.round((b.x0 + b.x1) / 2);
    const midZ = Math.round((b.z0 + b.z1) / 2);
    const doorCells: [number, number][] = [];
    if (b.front === 'south' || b.front === 'north') {
      const z = b.front === 'south' ? b.z1 : b.z0;
      doorCells.push([midX - 1, z], [midX, z]);
    } else {
      const x = b.front === 'east' ? b.x1 : b.x0;
      doorCells.push([x, midZ - 1], [x, midZ]);
    }
    for (const [x, z] of doorCells) {
      for (let y = baseY + 1; y <= baseY + 2; y++) write(x, y, z, Block.Air);
    }

    // door frame
    const frameBlock = b.kind === 'warehouse' ? Block.Metal : b.kind === 'house' ? Block.Planks : Block.Concrete;
    if (b.front === 'south' || b.front === 'north') {
      const z = b.front === 'south' ? b.z1 : b.z0;
      for (const x of [midX - 2, midX + 1]) {
        for (let y = baseY + 1; y <= baseY + 3; y++) write(x, y, z, frameBlock);
      }
      for (let x = midX - 1; x <= midX; x++) write(x, baseY + 3, z, frameBlock);
    } else {
      const x = b.front === 'east' ? b.x1 : b.x0;
      for (const z of [midZ - 2, midZ + 1]) {
        for (let y = baseY + 1; y <= baseY + 3; y++) write(x, y, z, frameBlock);
      }
      for (let z = midZ - 1; z <= midZ; z++) write(x, baseY + 3, z, frameBlock);
    }

    // windows on every floor
    const wideWindows = b.kind === 'house' || b.kind === 'store' || b.kind === 'pharmacy' || b.kind === 'apartment';
    const winWidth = wideWindows ? 2 : 1;
    const winStep = wideWindows ? 6 : 4;
    const windowFrame = b.kind === 'house'
      ? (b.wall === Block.Brick || b.wall === Block.Plaster ? Block.Concrete : Block.Planks)
      : b.kind === 'warehouse' ? Block.Metal : Block.Concrete;
    const isDoorCell = (x: number, z: number) => doorCells.some(([dx, dz]) => dx === x && dz === z);
    const placeWindow = (x: number, z: number, ax: number, az: number, windowY: number, floor: number) => {
      if (floor === 0 && isDoorCell(x, z)) return;
      for (let i = 0; i < winWidth; i++) {
        const wx = x + ax * i;
        const wz = z + az * i;
        if (floor === 0 && isDoorCell(wx, wz)) return;
      }
      for (let i = 0; i < winWidth; i++) {
        const wx = x + ax * i;
        const wz = z + az * i;
        write(wx, windowY - 1, wz, b.kind === 'house' ? Block.Planks : Block.Concrete);
        write(wx, windowY, wz, Block.Glass);
      }
      if (b.kind === 'house' || b.kind === 'apartment') {
        for (let i = 0; i < winWidth; i++) {
          write(x + ax * i, windowY + 1, z + az * i, windowFrame);
        }
        for (const wxz of [
          [x - ax, z - az],
          [x + ax * winWidth, z + az * winWidth],
        ] as const) {
          if (!(floor === 0 && isDoorCell(wxz[0], wxz[1]))) write(wxz[0], windowY, wxz[1], windowFrame);
        }
      }
    };
    for (let f = 0; f < b.floors; f++) {
      const wy = baseY + f * 3 + 2;
      for (let x = b.x0 + 2; x <= b.x1 - 2 - (winWidth - 1); x += winStep) {
        if (f === 0 && Math.abs(x - midX) <= 3) continue;
        placeWindow(x, b.z0, 1, 0, wy, f);
        placeWindow(x, b.z1, 1, 0, wy, f);
      }
      for (let z = b.z0 + 2; z <= b.z1 - 2 - (winWidth - 1); z += winStep) {
        if (f === 0 && Math.abs(z - midZ) <= 3) continue;
        placeWindow(b.x0, z, 0, 1, wy, f);
        placeWindow(b.x1, z, 0, 1, wy, f);
      }
      if (b.front === 'south' || b.front === 'north') {
        const z = b.front === 'south' ? b.z1 : b.z0;
        for (const x of [b.x0 + 2, b.x1 - 3]) {
          placeWindow(x, z, 1, 0, wy, f);
        }
      } else {
        const x = b.front === 'east' ? b.x1 : b.x0;
        for (const z of [b.z0 + 2, b.z1 - 3]) {
          placeWindow(x, z, 0, 1, wy, f);
        }
      }
    }

    // Ground-floor shop windows on the street side.
    if (b.kind === 'store' || b.kind === 'pharmacy' || b.kind === 'gas') {
      const panelRow = baseY + 1;
      const glassRow = baseY + 2;
      const placeShopfront = (x: number, z: number, ax: number, az: number) => {
        for (let i = 0; i < 3; i++) {
          const wx = x + ax * i;
          const wz = z + az * i;
          if (isDoorCell(wx, wz)) continue;
          write(wx, panelRow, wz, Block.Concrete);
          write(wx, glassRow, wz, Block.Glass);
        }
      };
      if (b.front === 'south' || b.front === 'north') {
        const z = b.front === 'south' ? b.z1 : b.z0;
        for (let x = b.x0 + 2; x <= b.x1 - 4; x += 5) {
          if (Math.abs(x - midX) <= 3) continue;
          placeShopfront(x, z, 1, 0);
        }
        for (const x of [b.x0 + 2, b.x1 - 4]) {
          placeShopfront(x, z, 1, 0);
        }
      } else {
        const x = b.front === 'east' ? b.x1 : b.x0;
        for (let z = b.z0 + 2; z <= b.z1 - 4; z += 5) {
          if (Math.abs(z - midZ) <= 3) continue;
          placeShopfront(x, z, 0, 1);
        }
        for (const z of [b.z0 + 2, b.z1 - 4]) {
          placeShopfront(x, z, 0, 1);
        }
      }
    }

    // interior partition
    if (b.partition) {
      const p = b.partition;
      if (p.axis === 'z') {
        for (let x = b.x0 + 1; x <= b.x1 - 1; x++) {
          if (x >= p.doorStart && x <= p.doorStart + 1) continue;
          for (let y = baseY + 1; y <= baseY + b.height; y++) write(x, y, p.pos, b.interior);
        }
      } else {
        for (let z = b.z0 + 1; z <= b.z1 - 1; z++) {
          if (z >= p.doorStart && z <= p.doorStart + 1) continue;
          for (let y = baseY + 1; y <= baseY + b.height; y++) write(p.pos, y, z, b.interior);
        }
      }
    }

    // Upper floors and a stairwell. Each floor is three blocks high so the
    // player can walk it without special movement.
    const stairBlock = b.kind === 'house' ? Block.Planks
      : b.kind === 'warehouse' ? Block.Metal : Block.Concrete;
    for (let f = 1; f < b.floors; f++) {
      const floorY = baseY + f * 3;
      for (let z = b.z0 + 1; z <= b.z1 - 1; z++) {
        for (let x = b.x0 + 1; x <= b.x1 - 1; x++) {
          if (b.partition) {
            if (b.partition.axis === 'z' && z === b.partition.pos) continue;
            if (b.partition.axis === 'x' && x === b.partition.pos) continue;
          }
          if (
            b.stair &&
            ((z === b.stair.z0 && x >= b.stair.x0 - 1 && x <= b.stair.x1) ||
              (z === b.stair.z1 && x >= b.stair.x0 && x <= b.stair.x1 + 1))
          ) continue;
          write(x, floorY, z, b.floor);
        }
      }
    }
    if (b.stair) {
      // Switchback flights: even floors climb +x along the first row, odd
      // floors climb -x along the second row. Alternating rows keeps the
      // head-space of every flight clear of the flight above it.
      for (let f = 0; f < b.floors - 1; f++) {
        const baseStep = baseY + f * 3 + 1;
        const forward = f % 2 === 0;
        const row = forward ? b.stair.z0 : b.stair.z1;
        for (let i = 0; i < 3; i++) {
          const x = forward ? b.stair.x0 + i : b.stair.x1 - i;
          for (let y = baseStep; y <= baseStep + i; y++) write(x, y, row, stairBlock);
        }
      }
    }

    const roofBase = baseY + b.height + 1;
    const width = b.x1 - b.x0 + 1;
    const depth = b.z1 - b.z0 + 1;
    const flatTop = b.kind === 'house' || b.kind === 'ruin'
      ? Block.Gravel
      : b.kind === 'warehouse' ? Block.Metal : Block.Concrete;

    const addChimney = (topY: number) => {
      if (!b.chimney) return;
      let chx: number;
      let chz: number;
      if (b.roofType === 'gable') {
        const alongX = b.roofAxis === 'x';
        chx = alongX ? b.x0 + Math.max(2, Math.round(width * 0.28)) : midX;
        chz = alongX ? midZ : b.z0 + Math.max(2, Math.round(depth * 0.28));
      } else {
        chx = b.x0 + 2;
        chz = b.z0 + 2;
      }
      for (let y = roofBase; y <= topY; y++) write(chx, y, chz, Block.Brick);
      write(chx, topY + 1, chz, Block.Concrete);
    };

    if (b.roofType === 'gable') {
      const alongX = b.roofAxis === 'x';
      const rise = b.roofRise;
      const peak = roofBase + rise - 1;

      if (alongX) {
        for (let i = 0; i < rise; i++) {
          const z0 = b.z0 - 1 + i;
          const z1 = b.z1 + 1 - i;
          if (z1 < z0) break;
          for (let z = z0; z <= z1; z++) {
            for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
              for (let y = roofBase; y <= roofBase + i; y++) {
                if (isRuin && hash3(x, y, z, world.seed + 919) < 0.18) continue;
                write(x, y, z, b.roof);
              }
            }
          }
        }
        // triangular gable ends under the overhang
        for (let z = b.z0; z <= b.z1; z++) {
          const d = Math.min(z - (b.z0 - 1), (b.z1 + 1) - z);
          const h = Math.min(rise - 1, d);
          for (let y = roofBase; y < roofBase + h; y++) {
            write(b.x0, y, z, b.wall);
            write(b.x1, y, z, b.wall);
          }
        }
      } else {
        for (let i = 0; i < rise; i++) {
          const x0 = b.x0 - 1 + i;
          const x1 = b.x1 + 1 - i;
          if (x1 < x0) break;
          for (let z = b.z0 - 1; z <= b.z1 + 1; z++) {
            for (let x = x0; x <= x1; x++) {
              for (let y = roofBase; y <= roofBase + i; y++) {
                if (isRuin && hash3(x, y, z, world.seed + 919) < 0.18) continue;
                write(x, y, z, b.roof);
              }
            }
          }
        }
        for (let x = b.x0; x <= b.x1; x++) {
          const d = Math.min(x - (b.x0 - 1), (b.x1 + 1) - x);
          const h = Math.min(rise - 1, d);
          for (let y = roofBase; y < roofBase + h; y++) {
            write(x, y, b.z0, b.wall);
            write(x, y, b.z1, b.wall);
          }
        }
      }
      addChimney(peak + 1);
    } else if (b.roofType === 'hip') {
      const layers = b.roofRise;
      for (let i = 0; i < layers; i++) {
        const x0 = b.x0 - 1 + i;
        const x1 = b.x1 + 1 - i;
        const z0 = b.z0 - 1 + i;
        const z1 = b.z1 + 1 - i;
        if (x1 - x0 < 1 || z1 - z0 < 1) break;
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            for (let y = roofBase; y <= roofBase + i; y++) {
              if (isRuin && hash3(x, y, z, world.seed + 919) < 0.2) continue;
              write(x, y, z, b.roof);
            }
          }
        }
      }
      addChimney(roofBase + layers + 1);
    } else {
      // flat roof with a small cornice
      for (let z = b.z0; z <= b.z1; z++) {
        for (let x = b.x0; x <= b.x1; x++) {
          if (isRuin && hash3(x, baseY, z, world.seed + 919) < 0.35) continue;
          write(x, roofBase, z, flatTop);
        }
      }
      for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
        write(x, roofBase, b.z0 - 1, flatTop);
        write(x, roofBase, b.z1 + 1, flatTop);
      }
      for (let z = b.z0; z <= b.z1; z++) {
        write(b.x0 - 1, roofBase, z, flatTop);
        write(b.x1 + 1, roofBase, z, flatTop);
      }
      if (KIND_STYLE[b.kind].parapet) {
        for (let x = b.x0; x <= b.x1; x++) {
          write(x, roofBase + 1, b.z0, b.wall);
          write(x, roofBase + 1, b.z1, b.wall);
        }
        for (let z = b.z0; z <= b.z1; z++) {
          write(b.x0, roofBase + 1, z, b.wall);
          write(b.x1, roofBase + 1, z, b.wall);
        }
        // rooftop unit
        if (b.kind !== 'ruin' && hash3(b.x0, b.z0, baseY, world.seed + 21) < 0.6) {
          const ux = b.x0 + 3;
          const uz = b.z0 + 3;
          for (let z = uz; z <= uz + 1; z++) {
            for (let x = ux; x <= ux + 1; x++) write(x, roofBase + 1, z, Block.Metal);
          }
        }
      } else if (b.kind === 'house') {
        // flat-roofed houses keep a simple open roof
      }
      addChimney(roofBase + 3);
    }

    // fascia board under the eaves
    if (b.kind === 'house' && b.roofType !== 'flat') {
      const y = roofBase - 1;
      if (b.roofType === 'gable' && b.roofAxis === 'x') {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
          write(x, y, b.z0 - 1, Block.Log);
          write(x, y, b.z1 + 1, Block.Log);
        }
      } else if (b.roofType === 'gable') {
        for (let z = b.z0 - 1; z <= b.z1 + 1; z++) {
          write(b.x0 - 1, y, z, Block.Log);
          write(b.x1 + 1, y, z, Block.Log);
        }
      } else {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
          write(x, y, b.z0 - 1, Block.Log);
          write(x, y, b.z1 + 1, Block.Log);
        }
        for (let z = b.z0; z <= b.z1; z++) {
          write(b.x0 - 1, y, z, Block.Log);
          write(b.x1 + 1, y, z, Block.Log);
        }
      }
    }

    // porch and path to the street
    if (b.porch) {
      const span = 2;
      let px0 = midX - span;
      let px1 = midX + span;
      let pz0 = b.z0;
      let pz1 = b.z1;
      let roofX0 = px0;
      let roofX1 = px1;
      let roofZ0 = pz0;
      let roofZ1 = pz1;
      let postXs: number[] = [];
      let postZs: number[] = [];
      let pathStart = 0;
      let pathEnd = 0;
      let pathAxis: 'x' | 'z' = 'z';

      if (b.front === 'south') {
        pz0 = b.z1 + 1;
        pz1 = b.z1 + 2;
        roofZ0 = b.z1;
        roofZ1 = pz1;
        postXs = [px0, px1];
        postZs = [pz1];
        pathStart = pz1 + 1;
        pathEnd = pz1 + 3;
        pathAxis = 'z';
      } else if (b.front === 'north') {
        pz0 = b.z0 - 2;
        pz1 = b.z0 - 1;
        roofZ0 = pz0;
        roofZ1 = b.z0;
        postXs = [px0, px1];
        postZs = [pz0];
        pathStart = pz0 - 1;
        pathEnd = pz0 - 3;
        pathAxis = 'z';
      } else if (b.front === 'east') {
        px0 = b.x1 + 1;
        px1 = b.x1 + 2;
        roofX0 = b.x1;
        roofX1 = px1;
        pz0 = midZ - span;
        pz1 = midZ + span;
        roofZ0 = pz0;
        roofZ1 = pz1;
        postXs = [px1];
        postZs = [pz0, pz1];
        pathStart = px1 + 1;
        pathEnd = px1 + 3;
        pathAxis = 'x';
      } else {
        px0 = b.x0 - 2;
        px1 = b.x0 - 1;
        roofX0 = px0;
        roofX1 = b.x0;
        pz0 = midZ - span;
        pz1 = midZ + span;
        roofZ0 = pz0;
        roofZ1 = pz1;
        postXs = [px0];
        postZs = [pz0, pz1];
        pathStart = px0 - 1;
        pathEnd = px0 - 3;
        pathAxis = 'x';
      }

      for (let z = pz0; z <= pz1; z++) {
        for (let x = px0; x <= px1; x++) {
          for (let y = baseY + 1; y <= baseY + 3; y++) write(x, y, z, Block.Air);
          write(x, baseY, z, b.floor);
        }
      }
      const porchRoofY = baseY + 3;
      const porchRoof = b.roofType === 'flat' ? flatTop : b.roof;
      for (let z = roofZ0; z <= roofZ1; z++) {
        for (let x = roofX0; x <= roofX1; x++) write(x, porchRoofY, z, porchRoof);
      }
      for (const x of postXs) {
        for (const z of postZs) {
          for (let y = baseY + 1; y <= porchRoofY - 1; y++) write(x, y, z, frameBlock);
        }
      }

      const step = Math.sign(pathEnd - pathStart);
      if (pathAxis === 'z') {
        for (let z = pathStart; z !== pathEnd + step; z += step) {
          for (let x = midX - 1; x <= midX + 1; x++) write(x, baseY, z, Block.Concrete);
        }
      } else {
        for (let x = pathStart; x !== pathEnd + step; x += step) {
          for (let z = midZ - 1; z <= midZ + 1; z++) write(x, baseY, z, Block.Concrete);
        }
      }
    }

    // a small bay window / vestibule breaks up the rectangle of some houses
    if (b.bay) {
      const sideLeft = hash3(b.z0, b.x0, b.index, world.seed + 660) < 0.5;
      const onZ = b.front === 'south' || b.front === 'north';
      let x0: number;
      let x1: number;
      let z0: number;
      let z1: number;
      if (onZ) {
        x0 = sideLeft ? b.x0 + 1 : b.x1 - 3;
        x1 = x0 + 2;
        z0 = b.front === 'south' ? b.z1 + 1 : b.z0 - 2;
        z1 = z0 + 1;
      } else {
        z0 = sideLeft ? b.z0 + 1 : b.z1 - 3;
        z1 = z0 + 2;
        x0 = b.front === 'east' ? b.x1 + 1 : b.x0 - 2;
        x1 = x0 + 1;
      }
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          write(x, baseY, z, b.floor);
          for (let y = baseY + 1; y <= baseY + 2; y++) write(x, y, z, Block.Air);
        }
      }
      // bay walls
      for (let y = baseY + 1; y <= baseY + 2; y++) {
        for (let x = x0; x <= x1; x++) {
          write(x, y, z0, b.wall);
          write(x, y, z1, b.wall);
        }
        for (let z = z0 + 1; z < z1; z++) {
          write(x0, y, z, b.wall);
          write(x1, y, z, b.wall);
        }
      }
      // glazing around the outside
      const glassRow = baseY + 2;
      if (b.front === 'south') {
        for (let x = x0; x <= x1; x++) write(x, glassRow, z1, Block.Glass);
      } else if (b.front === 'north') {
        for (let x = x0; x <= x1; x++) write(x, glassRow, z0, Block.Glass);
      } else if (b.front === 'east') {
        for (let z = z0; z <= z1; z++) write(x1, glassRow, z, Block.Glass);
      } else {
        for (let z = z0; z <= z1; z++) write(x0, glassRow, z, Block.Glass);
      }
      for (let z = z0 + 1; z < z1; z++) {
        write(x0, glassRow, z, Block.Glass);
        write(x1, glassRow, z, Block.Glass);
      }
      const bayRoof = b.roofType === 'flat' ? flatTop : b.roof;
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        for (let x = x0 - 1; x <= x1 + 1; x++) write(x, baseY + 3, z, bayRoof);
      }
    }

    // canvas awning over shop entrances
    if (b.awnings) {
      const awningY = baseY + 3;
      if (b.front === 'south' || b.front === 'north') {
        const dir = b.front === 'south' ? 1 : -1;
        const zEdge = b.front === 'south' ? b.z1 : b.z0;
        for (let x = midX - 2; x <= midX + 2; x++) {
          for (let d = 1; d <= 2; d++) write(x, awningY, zEdge + dir * d, Block.Awning);
        }
        for (const x of [midX - 2, midX + 2]) {
          for (let y = baseY + 1; y < awningY; y++) write(x, y, zEdge + dir * 2, frameBlock);
        }
      } else {
        const dir = b.front === 'east' ? 1 : -1;
        const xEdge = b.front === 'east' ? b.x1 : b.x0;
        for (let z = midZ - 2; z <= midZ + 2; z++) {
          for (let d = 1; d <= 2; d++) write(xEdge + dir * d, awningY, z, Block.Awning);
        }
        for (const z of [midZ - 2, midZ + 2]) {
          for (let y = baseY + 1; y < awningY; y++) write(xEdge + dir * 2, y, z, frameBlock);
        }
      }
    }

    // picket fence around the front yard, with a gate at the path
    if (b.fence) {
      const fy = baseY + 1;
      const post = (x: number, z: number) => {
        write(x, fy, z, Block.Fence);
        write(x, fy + 1, z, Block.Fence);
      };
      if (b.front === 'south' || b.front === 'north') {
        const zf = b.front === 'south' ? b.z1 + 3 : b.z0 - 3;
        for (let x = b.x0; x <= b.x1; x++) {
          if (Math.abs(x - midX) <= 1) continue;
          write(x, fy, zf, Block.Fence);
          if ((x - b.x0) % 6 === 0) write(x, fy + 1, zf, Block.Fence);
        }
        post(midX - 2, zf);
        post(midX + 2, zf);
      } else {
        const xf = b.front === 'east' ? b.x1 + 3 : b.x0 - 3;
        for (let z = b.z0; z <= b.z1; z++) {
          if (Math.abs(z - midZ) <= 1) continue;
          write(xf, fy, z, Block.Fence);
          if ((z - b.z0) % 6 === 0) write(xf, fy + 1, z, Block.Fence);
        }
        post(xf, midZ - 2);
        post(xf, midZ + 2);
      }

      // a small yard tree in one of the front corners
      if (b.kind === 'house' && hash3(b.x0, b.z0, b.index, world.seed + 444) < 0.24) {
        const left = hash3(b.z0, b.x0, b.index, world.seed + 445) < 0.5;
        let tx = midX;
        let tz = midZ;
        if (b.front === 'south' || b.front === 'north') {
          tx = left ? b.x0 + 1 : b.x1 - 1;
          tz = b.front === 'south' ? b.z1 + 2 : b.z0 - 2;
        } else {
          tx = b.front === 'east' ? b.x1 + 2 : b.x0 - 2;
          tz = left ? b.z0 + 1 : b.z1 - 1;
        }
        const trunkH = 2 + Math.floor(hash3(tx, tz, b.index, world.seed + 446) * 2);
        for (let y = baseY + 1; y <= baseY + trunkH; y++) write(tx, y, tz, Block.Log);
        for (let dy = trunkH; dy <= trunkH + 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dz === 0 && dy === trunkH) continue;
              if (Math.abs(dx) + Math.abs(dz) === 2 && hash3(tx + dx, dy, tz + dz, world.seed + 447) < 0.45) continue;
              write(tx + dx, baseY + dy, tz + dz, Block.Leaves);
            }
          }
        }
      }
    }

    // bushes at the front corners of some houses
    if (b.kind === 'house' && !b.fence && hash3(b.x0, b.z0, b.index, world.seed + 551) < 0.55) {
      const frontZ = b.front === 'south' ? b.z1 + 1 : b.front === 'north' ? b.z0 - 1 : midZ;
      if (b.front === 'south' || b.front === 'north') {
        const bx = hash3(b.z0, b.x0, b.index, world.seed + 552) < 0.5 ? b.x0 + 1 : b.x1 - 1;
        for (let dz = 0; dz <= 1; dz++) {
          for (let y = baseY + 1; y <= baseY + 2; y++) {
            if (hash3(bx, y, frontZ + dz * Math.sign(frontZ - midZ), world.seed + 78) < 0.75) {
              write(bx, y, frontZ + dz * Math.sign(frontZ - midZ), Block.Leaves);
            }
          }
        }
      }
    }

    for (const c of b.containers) {
      const y = baseY + 1 + (c.floor ?? 0) * 3;
      write(c.x, y, c.z, containerBlock(c.type));
    }
    for (const t of b.torches) {
      const y = baseY + 1 + (t.floor ?? 0) * 3;
      write(t.x, y, t.z, Block.Torch);
      world.noteGeneratedTorch(t.x, y, t.z);
    }
    for (const t of b.traps) {
      const y = baseY + 1 + (t.floor ?? 0) * 3;
      write(t.x, y, t.z, Block.SpikeTrap);
    }

    if (isRuin) {
      for (let i = 0; i < 12; i++) {
        const x = b.x0 + 1 + Math.floor(hash3(b.x0, i, b.z0, world.seed + 95) * (b.x1 - b.x0 - 1));
        const z = b.z0 + 1 + Math.floor(hash3(b.z0, i, b.x0, world.seed + 96) * (b.z1 - b.z0 - 1));
        if (hash3(x, i, z, world.seed + 97) < 0.45) write(x, baseY + 1, z, Block.Cobble);
      }
    }
  }
}

function containerBlock(type: ContainerKind): Block {
  switch (type) {
    case 'crate': return Block.Crate;
    case 'cabinet': return Block.Cabinet;
    case 'safe': return Block.Safe;
    case 'fridge': return Block.Fridge;
    case 'trash': return Block.Trash;
    case 'medcab': return Block.MedCabinet;
  }
  return Block.Crate;
}

export function buildingCenter(b: BuildingSpec): { x: number; z: number } {
  return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
}
