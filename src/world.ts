import * as THREE from 'three';
import {
  BLOCKS, Block, TILE, getAtlas, tileUV, blockDef, isSolidBlock,
} from './blocks';
import { fbm2, hash2, hash3, ridged2 } from './noise';
import { TownGenerator } from './town';
import type { LootStack } from './loot';

export const CHUNK = 16;
export const HEIGHT = 96;
export const SEA_LEVEL = 34;

const FACE_SHADE = [0.84, 0.84, 0.97, 0.55, 0.89, 0.89];
const AO_SHADE = [0.5, 0.68, 0.84, 1];

interface FaceTemplate {
  dir: [number, number, number];
  corners: { pos: [number, number, number]; uv: [number, number] }[];
  light: number;
}

const FACES: FaceTemplate[] = [
  {
    dir: [-1, 0, 0],
    light: 0.84,
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    dir: [1, 0, 0],
    light: 0.84,
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    dir: [0, -1, 0],
    light: 0.55,
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    dir: [0, 1, 0],
    light: 0.97,
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    dir: [0, 0, -1],
    light: 0.89,
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  {
    dir: [0, 0, 1],
    light: 0.89,
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];

export class Chunk {
  cx: number;
  cz: number;
  data: Uint8Array;
  generated = false;
  dirty = true;
  mesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;
  glassMesh: THREE.Mesh | null = null;
  torchMesh: THREE.Mesh | null = null;
  plantMesh: THREE.Mesh | null = null;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  }
}

const chunkKey = (cx: number, cz: number) => (cx + 8192) * 16384 + (cz + 8192);

export interface RayHit {
  x: number;
  y: number;
  z: number;
  id: number;
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

export interface PropCollider {
  tag: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export class World {
  readonly seed: number;
  readonly group = new THREE.Group();
  readonly edits = new Map<string, number>();
  readonly towns: TownGenerator;
  readonly poiStates = new Map<string, { remaining: number; total: number }>();
  readonly poiKills = new Map<string, Set<number>>();
  /** Street horde kills per town (`cellX:cellZ`). Killed street zombies never respawn. */
  readonly streetKills = new Map<string, number>();
  readonly containerLoot = new Map<string, LootStack[]>();
  onEdit?: (x: number, y: number, z: number, id: number) => void;
  readonly generatedTorches = new Set<string>();
  readonly propColliders: PropCollider[] = [];
  chunks = new Map<number, Chunk>();
  renderDistance = 5;

  private atlas = getAtlas();
  private opaqueMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  private glassMat: THREE.MeshLambertMaterial;
  private torchMat: THREE.MeshBasicMaterial;
  private plantMat: THREE.MeshLambertMaterial;
  private lastKey = -1;
  private lastChunk: Chunk | undefined;
  private dirtyQueue: Chunk[] = [];
  private initialLoaded = false;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.group.name = 'world';
    this.towns = new TownGenerator(this.seed, (x, z) => this.surfaceHeight(x, z));

    this.opaqueMat = new THREE.MeshLambertMaterial({
      map: this.atlas,
      vertexColors: true,
    });
    this.waterMat = new THREE.MeshLambertMaterial({
      map: this.atlas,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.glassMat = new THREE.MeshLambertMaterial({
      map: this.atlas,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      opacity: 0.95,
    });
    this.torchMat = new THREE.MeshBasicMaterial({
      map: this.atlas,
      vertexColors: true,
      alphaTest: 0.28,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.plantMat = new THREE.MeshLambertMaterial({
      map: this.atlas,
      vertexColors: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
    });
  }

  /* ------------------------------------------------------------ */
  /*  Terrain                                                      */
  /* ------------------------------------------------------------ */

  surfaceHeight(x: number, z: number): number {
    const broad = fbm2(x * 0.006, z * 0.006, this.seed, 4);
    const hills = fbm2(x * 0.022, z * 0.022, this.seed + 91, 3);
    const ridge = ridged2(x * 0.0035 + 80, z * 0.0035 - 30, this.seed + 7, 3);
    const mountain = Math.max(0, ridge - 0.52) / 0.48;
    let h = 37 + broad * 10 + hills * 3.4 + Math.pow(mountain, 1.7) * 34;
    h = Math.max(3, Math.min(HEIGHT - 14, Math.round(h)));
    return h;
  }

  private surfaceBlockFor(h: number): Block {
    if (h < SEA_LEVEL - 4) return Block.Gravel;
    if (h <= SEA_LEVEL + 2) return Block.Sand;
    if (h > 60) return Block.Snow;
    return Block.Grass;
  }

  private treeChance(x: number, z: number): number {
    const forest = fbm2(x * 0.012, z * 0.012, this.seed + 300, 2);
    return 0.004 + Math.max(0, forest) * 0.022;
  }

  private treeAt(x: number, z: number): number {
    const h = this.surfaceHeight(x, z);
    if (h <= SEA_LEVEL + 2 || h > 56) return 0;
    const chance = this.treeChance(x, z);
    if (hash2(x, z, this.seed + 701) > chance) return 0;
    return h;
  }

  private generateChunk(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    const data = chunk.data;
    const baseX = cx * CHUNK;
    const baseZ = cz * CHUNK;

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = this.surfaceHeight(wx, wz);
        const topBlock = this.surfaceBlockFor(h);

        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let id: Block = Block.Air;
          if (y === 0) {
            id = Block.Bedrock;
          } else if (y < h - 3) {
            id = Block.Stone;
            const r = hash3(wx, y, wz, this.seed + 31);
            if (r < 0.012) {
              id = Block.CoalOre;
            } else if (r < 0.019 && y < 28) {
              id = Block.IronOre;
            } else if (r < 0.036 && y < h - 4) {
              id = Block.Gravel;
            }
          } else if (y < h) {
            id = topBlock === Block.Grass || topBlock === Block.Snow ? Block.Dirt : topBlock;
            if (topBlock === Block.Grass && y === h - 1) id = Block.Grass;
          } else if (y === h) {
            id = topBlock;
          } else if (y <= SEA_LEVEL) {
            id = Block.Water;
          }

          if (id !== Block.Air) {
            data[(y * CHUNK + lz) * CHUNK + lx] = id;
          }
        }
      }
    }

    // Trees — consider columns 3 blocks outside the chunk so canopies cross borders.
    for (let tz = baseZ - 3; tz < baseZ + CHUNK + 3; tz++) {
      for (let tx = baseX - 3; tx < baseX + CHUNK + 3; tx++) {
        const ground = this.treeAt(tx, tz);
        if (!ground) continue;
        const rnd = hash2(tx, tz, this.seed + 999);
        const trunkH = 4 + Math.floor(rnd * 4);
        const topY = ground + trunkH;

        const write = (wx: number, y: number, wz: number, id: Block, onlyAir = false) => {
          const lx = wx - baseX;
          const lz = wz - baseZ;
          if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
          const idx = (y * CHUNK + lz) * CHUNK + lx;
          if (onlyAir && data[idx] !== Block.Air) return;
          data[idx] = id;
        };

        for (let y = ground + 1; y <= topY; y++) write(tx, y, tz, Block.Log);
        for (let dy = -2; dy <= 2; dy++) {
          const radius = dy === 2 || dy === -2 ? 1.5 : dy === 1 || dy === -1 ? 2.15 : 2.45;
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const dist = Math.hypot(dx, dz);
              if (dist > radius + 0.12) continue;
              if (dist > radius - 0.55 && hash3(tx + dx, topY + dy, tz + dz, this.seed + 56) < 0.17) continue;
              write(tx + dx, topY + dy, tz + dz, Block.Leaves, true);
            }
          }
        }
      }
    }

    // Towns and POIs overwrite natural terrain and trees.
    this.towns.applyToChunk(this, chunk);

    // Player edits win over generated terrain.
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        for (let y = 0; y < HEIGHT; y++) {
          const k = `${wx},${y},${wz}`;
          const e = this.edits.get(k);
          if (e !== undefined) data[(y * CHUNK + lz) * CHUNK + lx] = e;
        }
      }
    }

    chunk.generated = true;
    chunk.dirty = true;
    return chunk;
  }

  /* ------------------------------------------------------------ */
  /*  Chunk storage                                                */
  /* ------------------------------------------------------------ */

  getChunk(cx: number, cz: number): Chunk | undefined {
    const key = chunkKey(cx, cz);
    if (key === this.lastKey) return this.lastChunk;
    const c = this.chunks.get(key);
    this.lastKey = key;
    this.lastChunk = c;
    return c;
  }

  ensureChunk(cx: number, cz: number): Chunk {
    let c = this.getChunk(cx, cz);
    if (!c) {
      c = this.generateChunk(cx, cz);
      this.chunks.set(chunkKey(cx, cz), c);
      this.lastKey = chunkKey(cx, cz);
      this.lastChunk = c;
      this.markNeighborsDirty(cx, cz);
    }
    return c;
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.data[(y * CHUNK + (z & 15)) * CHUNK + (x & 15)];
  }

  isSolid(x: number, y: number, z: number): boolean {
    return isSolidBlock(this.getBlock(x, y, z));
  }

  isWater(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === Block.Water;
  }

  setBlock(x: number, y: number, z: number, id: number, record = true) {
    if (y < 0 || y >= HEIGHT) return;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c) return;
    const lx = x & 15;
    const lz = z & 15;
    c.data[(y * CHUNK + lz) * CHUNK + lx] = id;
    if (record) {
      this.edits.set(`${x},${y},${z}`, id);
      this.onEdit?.(x, y, z, id);
    }
    c.dirty = true;
    this.markNeighborsDirty(cx, cz);
  }

  markPoiKilled(poiId: string, index: number) {
    let set = this.poiKills.get(poiId);
    if (!set) {
      set = new Set();
      this.poiKills.set(poiId, set);
    }
    set.add(index);
  }

  isPoiKilled(poiId: string, index: number): boolean {
    return this.poiKills.get(poiId)?.has(index) ?? false;
  }

  addStreetKill(townKey: string, count = 1) {
    this.streetKills.set(townKey, (this.streetKills.get(townKey) ?? 0) + count);
  }

  streetKillCount(townKey: string): number {
    return this.streetKills.get(townKey) ?? 0;
  }

  /**
   * Lets water seep into freshly opened cells. Existing water blocks act as
   * sources; the flood is deliberately bounded so a single broken block cannot
   * drain an ocean across the whole map.
   */
  hasLineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.001) return true;
    const steps = Math.ceil(dist / 0.55);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(ax + dx * t);
      const y = Math.floor(ay + dy * t);
      const z = Math.floor(az + dz * t);
      const id = this.getBlock(x, y, z);
      if (id !== Block.Air && id !== Block.Water && id !== Block.Torch && id !== Block.Leaves) return false;
    }
    return true;
  }

  flowWater(x: number, y: number, z: number, maxCells = 96): number {
    if (this.getBlock(x, y, z) !== Block.Air) return 0;
    const neighbours = [
      [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1], [x, y + 1, z], [x, y - 1, z],
    ];
    let touchesWater = false;
    for (const [nx, ny, nz] of neighbours) {
      if (this.getBlock(nx, ny, nz) === Block.Water) {
        touchesWater = true;
        break;
      }
    }
    if (!touchesWater) return 0;

    const queue: { x: number; y: number; z: number; d: number }[] = [{ x, y, z, d: 0 }];
    const seen = new Set<string>([`${x},${y},${z}`]);
    let filled = 0;
    let head = 0;
    const dirs: [number, number, number][] = [
      [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0],
    ];
    while (head < queue.length && filled < maxCells) {
      const cell = queue[head++];
      if (this.getBlock(cell.x, cell.y, cell.z) !== Block.Air) continue;
      this.setBlock(cell.x, cell.y, cell.z, Block.Water);
      filled++;
      for (const [dx, dy, dz] of dirs) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        const nz = cell.z + dz;
        if (ny < 1 || ny >= HEIGHT) continue;
        if (this.getBlock(nx, ny, nz) !== Block.Air) continue;
        const key = `${nx},${ny},${nz}`;
        if (seen.has(key)) continue;
        const nd = dy < 0 ? cell.d : cell.d + 1;
        if (nd > 6) continue;
        seen.add(key);
        queue.push({ x: nx, y: ny, z: nz, d: nd });
      }
    }
    return filled;
  }

  markNeighborsDirty(cx: number, cz: number) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (c) c.dirty = true;
      }
    }
  }

  /* ------------------------------------------------------------ */
  /*  Meshing                                                      */
  /* ------------------------------------------------------------ */

  private isOpaqueId(id: number): boolean {
    return !!BLOCKS[id]?.opaque;
  }

  private buildChunkGeometry(c: Chunk) {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const wPositions: number[] = [];
    const wNormals: number[] = [];
    const wUvs: number[] = [];
    const wColors: number[] = [];
    const wIndices: number[] = [];

    const gPositions: number[] = [];
    const gNormals: number[] = [];
    const gUvs: number[] = [];
    const gColors: number[] = [];
    const gIndices: number[] = [];

    const tPositions: number[] = [];
    const tNormals: number[] = [];
    const tUvs: number[] = [];
    const tColors: number[] = [];
    const tIndices: number[] = [];

    const pPositions: number[] = [];
    const pNormals: number[] = [];
    const pUvs: number[] = [];
    const pColors: number[] = [];
    const pIndices: number[] = [];

    const baseX = c.cx * CHUNK;
    const baseZ = c.cz * CHUNK;
    const data = c.data;

    const aoAt = (
      x: number, y: number, z: number,
      dir: [number, number, number],
      corner: [number, number, number],
    ): number => {
      const axes: number[] = [];
      if (dir[0] !== 0) { axes.push(1, 2); }
      else if (dir[1] !== 0) { axes.push(0, 2); }
      else { axes.push(0, 1); }
      const o1 = [0, 0, 0];
      const o2 = [0, 0, 0];
      o1[axes[0]] = corner[axes[0]] === 1 ? 1 : -1;
      o2[axes[1]] = corner[axes[1]] === 1 ? 1 : -1;
      const bx = x + dir[0];
      const by = y + dir[1];
      const bz = z + dir[2];
      const s1 = this.isOpaqueId(this.getBlock(bx + o1[0], by + o1[1], bz + o1[2])) ? 1 : 0;
      const s2 = this.isOpaqueId(this.getBlock(bx + o2[0], by + o2[1], bz + o2[2])) ? 1 : 0;
      if (s1 && s2) return 0;
      const cor = this.isOpaqueId(
        this.getBlock(bx + o1[0] + o2[0], by + o1[1] + o2[1], bz + o1[2] + o2[2]),
      ) ? 1 : 0;
      return 3 - (s1 + s2 + cor);
    };

    for (let y = 0; y < HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const id = data[(y * CHUNK + lz) * CHUNK + lx];
          if (id === Block.Air) continue;
          const def = blockDef(id)!;
          const wx = baseX + lx;
          const wz = baseZ + lz;
          const tint = 0.96 + hash3(wx, y, wz, this.seed + 404) * 0.04;

          if (id === Block.Torch) {
            const [tu0, tv0, tu1, tv1] = tileUV(17);
            const cx = lx + 0.5;
            const cz = lz + 0.5;
            const y0 = y + 0.12;
            const y1 = y + 1.02;
            const w = 0.21;
            const addQuad = (
              coords: [number, number, number][],
              normal: [number, number, number],
            ) => {
              const start = tPositions.length / 3;
              const uvs: [number, number][] = [
                [tu0, tv1], [tu1, tv1], [tu1, tv0], [tu0, tv0],
              ];
              for (let i = 0; i < 4; i++) {
                tPositions.push(coords[i][0], coords[i][1], coords[i][2]);
                tNormals.push(normal[0], normal[1], normal[2]);
                tUvs.push(uvs[i][0], uvs[i][1]);
                tColors.push(1, 1, 1);
              }
              tIndices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
            };
            addQuad([
              [cx - w, y0, cz], [cx + w, y0, cz], [cx + w, y1, cz], [cx - w, y1, cz],
            ], [0, 0, 1]);
            addQuad([
              [cx, y0, cz - w], [cx, y0, cz + w], [cx, y1, cz + w], [cx, y1, cz - w],
            ], [1, 0, 0]);
            continue;
          }

          const target = id === Block.Water
            ? { pos: wPositions, norm: wNormals, uv: wUvs, col: wColors, idx: wIndices }
            : id === Block.Glass
              ? { pos: gPositions, norm: gNormals, uv: gUvs, col: gColors, idx: gIndices }
              : { pos: positions, norm: normals, uv: uvs, col: colors, idx: indices };

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = wx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = wz + face.dir[2];
            const nid = this.getBlock(nx, ny, nz);
            const nOpaque = this.isOpaqueId(nid);
            let visible = false;

            if (id === Block.Water) {
              visible = nid === Block.Air || (nid !== Block.Water && !nOpaque);
            } else if (id === Block.Glass) {
              visible = nid === Block.Air || nid === Block.Water;
            } else {
              visible = !nOpaque;
            }
            if (!visible) continue;

            const tileIndex = f === 2 ? def.bottom : f === 3 ? def.top : def.side;
            const [u0, v0, u1, v1] = tileUV(tileIndex);
            const startIndex = target.pos.length / 3;

            for (const corner of face.corners) {
              const ao = id === Block.Water || id === Block.Glass
                ? 1
                : AO_SHADE[aoAt(wx, y, wz, face.dir, corner.pos)];
              const shade = face.light * ao * tint;
              target.pos.push(lx + corner.pos[0], y + corner.pos[1], lz + corner.pos[2]);
              target.norm.push(face.dir[0], face.dir[1], face.dir[2]);
              target.uv.push(
                u0 + (u1 - u0) * corner.uv[0],
                v0 + (v1 - v0) * (1 - corner.uv[1]),
              );
              target.col.push(shade, shade, shade);
            }
            target.idx.push(
              startIndex, startIndex + 1, startIndex + 2,
              startIndex + 2, startIndex + 1, startIndex + 3,
            );
          }

          if (id === Block.Grass && this.getBlock(wx, y + 1, wz) === Block.Air) {
            const r = hash3(wx, y, wz, this.seed + 888);
            let decorTile = -1;
            let decorW = 0.42;
            let decorH = 0.52;
            if (r < 0.145) {
              decorTile = 18;
            } else if (r < 0.1525) {
              decorTile = 19;
              decorW = 0.3;
              decorH = 0.42;
            } else if (r < 0.16) {
              decorTile = 20;
              decorW = 0.3;
              decorH = 0.42;
            }
            if (decorTile >= 0) {
              const [pu0, pv0, pu1, pv1] = tileUV(decorTile);
              const cx = lx + 0.5;
              const cz = lz + 0.5;
              const baseY = y + 1;
              const quads: { coords: [number, number, number][] }[] = [
                {
                  coords: [
                    [cx - decorW, baseY, cz], [cx + decorW, baseY, cz],
                    [cx + decorW, baseY + decorH, cz], [cx - decorW, baseY + decorH, cz],
                  ],
                },
                {
                  coords: [
                    [cx, baseY, cz - decorW], [cx, baseY, cz + decorW],
                    [cx, baseY + decorH, cz + decorW], [cx, baseY + decorH, cz - decorW],
                  ],
                },
              ];
              for (const quad of quads) {
                const start = pPositions.length / 3;
                const quadUvs: [number, number][] = [
                  [pu0, pv1], [pu1, pv1], [pu1, pv0], [pu0, pv0],
                ];
                for (let i = 0; i < 4; i++) {
                  pPositions.push(quad.coords[i][0], quad.coords[i][1], quad.coords[i][2]);
                  pNormals.push(0, 1, 0);
                  pUvs.push(quadUvs[i][0], quadUvs[i][1]);
                  pColors.push(0.9, 0.9, 0.9);
                }
                pIndices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
              }
            }
          }
        }
      }
    }

    const apply = (mesh: THREE.Mesh | null, pos: number[], norm: number[], uv: number[], col: number[], idx: number[], mat: THREE.Material, cast: boolean) => {
      if (mesh) {
        mesh.geometry.dispose();
        this.group.remove(mesh);
      }
      if (pos.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(baseX, 0, baseZ);
      m.castShadow = cast;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      return m;
    };

    c.mesh = apply(c.mesh, positions, normals, uvs, colors, indices, this.opaqueMat, true);
    c.waterMesh = apply(c.waterMesh, wPositions, wNormals, wUvs, wColors, wIndices, this.waterMat, false);
    c.glassMesh = apply(c.glassMesh, gPositions, gNormals, gUvs, gColors, gIndices, this.glassMat, false);
    c.torchMesh = apply(c.torchMesh, tPositions, tNormals, tUvs, tColors, tIndices, this.torchMat, false);
    c.plantMesh = apply(c.plantMesh, pPositions, pNormals, pUvs, pColors, pIndices, this.plantMat, false);
    if (c.waterMesh) c.waterMesh.renderOrder = 2;
    if (c.glassMesh) c.glassMesh.renderOrder = 1;
    if (c.torchMesh) c.torchMesh.renderOrder = 3;
    c.dirty = false;
  }

  /* ------------------------------------------------------------ */
  /*  Streaming                                                    */
  /* ------------------------------------------------------------ */

  private rebuildQueue(px: number, pz: number) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    const r = this.renderDistance;
    const list: Chunk[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > (r + 0.4) * (r + 0.4)) continue;
        const c = this.chunks.get(chunkKey(pcx + dx, pcz + dz));
        if (c && c.dirty && c.generated) list.push(c);
      }
    }
    list.sort((a, b) => {
      const da = (a.cx - pcx) ** 2 + (a.cz - pcz) ** 2;
      const db = (b.cx - pcx) ** 2 + (b.cz - pcz) ** 2;
      return da - db;
    });
    this.dirtyQueue = list;
  }

  makeInitialChunks(px: number, pz: number): { total: number; done: number } {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    const r = this.renderDistance;
    const coords: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > (r + 0.4) * (r + 0.4)) continue;
        coords.push([pcx + dx, pcz + dz]);
      }
    }
    // data first (including a one-chunk ring for clean border culling)
    for (const [cx, cz] of coords) {
      this.ensureChunk(cx, cz);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const k = chunkKey(cx + dx, cz + dz);
        if (!this.chunks.has(k)) this.ensureChunk(cx + dx, cz + dz);
      }
    }
    for (const [cx, cz] of coords) {
      const c = this.getChunk(cx, cz);
      if (c) this.buildChunkGeometry(c);
    }
    this.initialLoaded = true;
    return { total: 1, done: 1 };
  }

  /** Progressive version used by the loading screen. */
  async loadInitialProgressive(px: number, pz: number, onProgress: (p: number, text: string) => void) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    const r = this.renderDistance;
    const coords: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > (r + 0.4) * (r + 0.4)) continue;
        coords.push([pcx + dx, pcz + dz]);
      }
    }
    coords.sort((a, b) => ((a[0] - pcx) ** 2 + (a[1] - pcz) ** 2) - ((b[0] - pcx) ** 2 + (b[1] - pcz) ** 2));

    const genCoords = new Set<string>();
    for (const [cx, cz] of coords) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        genCoords.add(`${cx + dx},${cz + dz}`);
      }
    }
    const genList = [...genCoords].map((s) => s.split(',').map(Number) as [number, number]);
    for (let i = 0; i < genList.length; i++) {
      this.ensureChunk(genList[i][0], genList[i][1]);
      if (i % 6 === 0) {
        onProgress((i / Math.max(1, genList.length)) * 0.55, 'Формируем рельеф…');
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    for (let i = 0; i < coords.length; i++) {
      const c = this.getChunk(coords[i][0], coords[i][1]);
      if (c) this.buildChunkGeometry(c);
      if (i % 4 === 0) {
        onProgress(0.55 + (i / coords.length) * 0.45, 'Собираем куски мира…');
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this.initialLoaded = true;
    onProgress(1, 'Готово');
  }

  update(px: number, pz: number, dt: number) {
    if (!this.initialLoaded) return;
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    const r = this.renderDistance;

    // generate a couple of chunks per frame
    let generated = 0;
    for (let dz = -r - 1; dz <= r + 1 && generated < 2; dz++) {
      for (let dx = -r - 1; dx <= r + 1 && generated < 2; dx++) {
        if (dx * dx + dz * dz > (r + 1.4) * (r + 1.4)) continue;
        if (!this.getChunk(pcx + dx, pcz + dz)) {
          this.ensureChunk(pcx + dx, pcz + dz);
          generated++;
        }
      }
    }

    if (this.dirtyQueue.length === 0 || generated > 0) this.rebuildQueue(px, pz);

    const start = performance.now();
    let meshed = 0;
    while (this.dirtyQueue.length > 0 && meshed < 2 && performance.now() - start < 9) {
      const c = this.dirtyQueue.shift()!;
      if (c.dirty && c.generated) {
        this.buildChunkGeometry(c);
        meshed++;
      }
    }

    // unload far meshes/data
    for (const [key, c] of this.chunks) {
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      const d2 = dx * dx + dz * dz;
      if (d2 > (r + 2) * (r + 2)) {
        this.disposeChunk(c);
        this.chunks.delete(key);
        this.lastKey = -1;
        this.lastChunk = undefined;
      } else if (d2 > (r + 1.2) * (r + 1.2)) {
        if (c.mesh) { c.mesh.geometry.dispose(); this.group.remove(c.mesh); c.mesh = null; }
        if (c.waterMesh) { c.waterMesh.geometry.dispose(); this.group.remove(c.waterMesh); c.waterMesh = null; }
        if (c.glassMesh) { c.glassMesh.geometry.dispose(); this.group.remove(c.glassMesh); c.glassMesh = null; }
        if (c.torchMesh) { c.torchMesh.geometry.dispose(); this.group.remove(c.torchMesh); c.torchMesh = null; }
        if (c.plantMesh) { c.plantMesh.geometry.dispose(); this.group.remove(c.plantMesh); c.plantMesh = null; }
      }
    }
  }

  private disposeChunk(c: Chunk) {
    for (const m of [c.mesh, c.waterMesh, c.glassMesh, c.torchMesh, c.plantMesh]) {
      if (m) {
        m.geometry.dispose();
        this.group.remove(m);
      }
    }
  }

  setRenderDistance(rd: number) {
    this.renderDistance = Math.max(2, Math.min(8, Math.round(rd)));
    this.dirtyQueue = [];
    for (const c of this.chunks.values()) c.dirty = true;
  }

  /* ------------------------------------------------------------ */
  /*  Queries                                                      */
  /* ------------------------------------------------------------ */

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): RayHit | null {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);

    const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx);
    const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy);
    const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dz);

    const boundary = (o: number, d: number, s: number) => s > 0 ? (Math.floor(o) + 1 - o) / d : (o - Math.floor(o)) / -d;
    let tMaxX = stepX === 0 ? Infinity : boundary(origin.x, dx, stepX);
    let tMaxY = stepY === 0 ? Infinity : boundary(origin.y, dy, stepY);
    let tMaxZ = stepZ === 0 ? Infinity : boundary(origin.z, dz, stepZ);

    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    for (let i = 0; i < 400; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== Block.Air && id !== Block.Water) {
        return { x, y, z, id, nx, ny, nz, distance: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
      if (t > maxDistance) return null;
    }
    return null;
  }

  findSpawn(): { x: number; y: number; z: number } {
    const starter = this.towns.starterSpawn();
    if (starter) return { x: starter.x, y: starter.y, z: starter.z };
    for (let radius = 0; radius < 90; radius += 2) {
      const steps = Math.max(1, Math.floor(radius * 1.8));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * radius);
        const z = Math.round(Math.sin(a) * radius);
        const h = this.surfaceHeight(x, z);
        if (h > SEA_LEVEL + 2 && h < 58 && this.treeAt(x, z) === 0) {
          return { x: x + 0.5, y: h + 1.2, z: z + 0.5 };
        }
      }
    }
    const h = this.surfaceHeight(0, 0);
    return { x: 0.5, y: Math.max(h, SEA_LEVEL) + 2, z: 0.5 };
  }

  isChunkLoaded(cx: number, cz: number): boolean {
    const c = this.getChunk(cx, cz);
    return !!c && c.generated;
  }

  addPropCollider(c: PropCollider) {
    this.propColliders.push(c);
  }

  removePropColliders(tag: string) {
    for (let i = this.propColliders.length - 1; i >= 0; i--) {
      if (this.propColliders[i].tag === tag) this.propColliders.splice(i, 1);
    }
  }

  collidesProp(
    minX: number, maxX: number,
    minY: number, maxY: number,
    minZ: number, maxZ: number,
  ): boolean {
    for (const c of this.propColliders) {
      if (
        maxX > c.x0 && minX < c.x1 &&
        maxY > c.y0 && minY < c.y1 &&
        maxZ > c.z0 && minZ < c.z1
      ) return true;
    }
    return false;
  }

  /** Highest solid surface y at the column, ignoring water. */
  columnTop(x: number, z: number): number {
    for (let y = HEIGHT - 1; y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== Block.Air && id !== Block.Water && id !== Block.Leaves && id !== Block.Torch) return y;
    }
    return 0;
  }

  importEdits(edits: [number, number, number, number][]) {
    this.edits.clear();
    for (const e of edits) {
      if (Array.isArray(e) && e.length === 4) {
        this.edits.set(`${e[0]},${e[1]},${e[2]}`, e[3]);
      }
    }
  }

  exportEdits(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const [key, id] of this.edits) {
      const parts = key.split(',');
      if (parts.length !== 3) continue;
      out.push([Number(parts[0]), Number(parts[1]), Number(parts[2]), id]);
    }
    return out;
  }

  /** Nearest player-placed torches, used to pool point lights. */
  nearestTorches(x: number, y: number, z: number, max = 6, radius = 38): { x: number; y: number; z: number }[] {
    const found: { x: number; y: number; z: number; d2: number }[] = [];
    const r2 = radius * radius;
    const seen = new Set<string>();
    const consider = (key: string, tx: number, ty: number, tz: number) => {
      if (seen.has(key)) return;
      if (this.getBlock(tx, ty, tz) !== Block.Torch) return;
      seen.add(key);
      const dx = tx + 0.5 - x;
      const dy = ty + 0.7 - y;
      const dz = tz + 0.5 - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= r2) found.push({ x: tx + 0.5, y: ty + 0.85, z: tz + 0.5, d2 });
    };
    for (const [key, id] of this.edits) {
      if (id !== Block.Torch) continue;
      const parts = key.split(',');
      if (parts.length !== 3) continue;
      consider(key, Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
    for (const key of this.generatedTorches) {
      const parts = key.split(',');
      if (parts.length !== 3) continue;
      consider(key, Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
    found.sort((a, b) => a.d2 - b.d2);
    return found.slice(0, max).map(({ x: tx, y: ty, z: tz }) => ({ x: tx, y: ty, z: tz }));
  }

  noteGeneratedTorch(x: number, y: number, z: number) {
    this.generatedTorches.add(`${x},${y},${z}`);
  }

  /** Synchronously prepare a small area, used after respawning far away. */
  prepareArea(px: number, pz: number, radius = 2) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        this.ensureChunk(pcx + dx, pcz + dz);
      }
    }
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const c = this.getChunk(pcx + dx, pcz + dz);
        if (c && c.dirty) this.buildChunkGeometry(c);
      }
    }
  }

  updateMaterialAlbedo(nightAmount: number) {
    // reserved for future tinting; kept intentionally subtle
    this.opaqueMat.emissive.setRGB(0, 0, 0);
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.opaqueMat.dispose();
    this.waterMat.dispose();
    this.glassMat.dispose();
    this.torchMat.dispose();
    this.plantMat.dispose();
  }
}
