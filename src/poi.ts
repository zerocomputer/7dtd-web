import { World } from './world';
import { BuildingSpec, Town, buildingCenter } from './town';
import { ZombieManager, Zombie, pickAmbientKind, pickPoiKind } from './zombies';
import { Player } from './player';
import { hashStringToSeed } from './noise';
import { Block } from './blocks';

export interface PoiCallbacks {
  onCleared: (building: BuildingSpec) => void;
  onEnterTown: (town: Town) => void;
  onHint: (text: string) => void;
}

const KIND_NAMES: Record<string, string> = {
  house: 'Дом',
  store: 'Магазин',
  pharmacy: 'Аптека',
  police: 'Полиция',
  warehouse: 'Склад',
  gas: 'Заправка',
  ruin: 'Руины',
  apartment: 'Многоэтажка',
};

const CARDINALS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

export function streetTargetFor(town: Town): number {
  // Fixed population per town: killed street zombies never come back, so a
  // town can eventually be fully cleared. Roughly two street walkers per
  // building, capped so huge towns do not become a wall of bodies.
  return Math.max(18, Math.min(36, 12 + town.buildings.length));
}

export class PoiController {
  private active = new Map<string, { building: BuildingSpec; zombies: Zombie[] }>();
  private streetZombies: Zombie[] = [];
  private streetTownKey = '';
  private timer = 0;
  private hintTimer = 0;
  private lastTownKey = '';

  update(
    dt: number,
    world: World,
    player: Player,
    zombies: ZombieManager,
    cb: PoiCallbacks,
    day = 1,
  ) {
    this.timer -= dt;
    this.hintTimer -= dt;

    if (this.timer <= 0) {
      this.timer = 0.6;
      this.updateSpawns(world, player, zombies, cb, day);
      this.updateStreet(world, player, zombies, day);
    }
    if (this.hintTimer <= 0) {
      this.hintTimer = 0.8;
      this.updateHint(world, player, cb);
    }
  }

  private activeCount(): number {
    let n = 0;
    for (const entry of this.active.values()) {
      for (const z of entry.zombies) if (!z.dead && z.group.parent !== null) n++;
    }
    return n;
  }

  private updateSpawns(world: World, player: Player, zombies: ZombieManager, cb: PoiCallbacks, day: number) {
    // Drop despawned / dead entries.
    for (const [id, entry] of this.active) {
      entry.zombies = entry.zombies.filter((z) => !z.dead && z.group.parent !== null && z.pos.distanceTo(player.position) < 70);
      if (entry.zombies.length === 0) {
        this.active.delete(id);
        continue;
      }
      const c = buildingCenter(entry.building);
      if (Math.hypot(c.x - player.position.x, c.z - player.position.z) > 70 || player.dead) {
        for (const z of entry.zombies) zombies.removeZombie(z);
        this.active.delete(id);
      }
    }

    if (player.dead) return;

    const buildings = world.towns.townsNear(player.position.x, player.position.z, 38)
      .flatMap((town) => town.buildings)
      .map((b) => ({ b, c: buildingCenter(b) }))
      .map(({ b, c }) => ({ b, c, d: Math.hypot(c.x - player.position.x, c.z - player.position.z) }))
      .filter(({ d }) => d <= 55)
      .sort((a, b) => a.d - b.d);

    for (const { b, c, d: dist } of buildings) {
      if (this.activeCount() >= 40) break;
      if (dist > 55) continue;

      let state = world.poiStates.get(b.id);
      if (!state) {
        state = { remaining: b.zombieCount, total: b.zombieCount };
        world.poiStates.set(b.id, state);
      }
      if (state.remaining <= 0) continue;
      if (this.active.has(b.id)) continue;
      if (zombies.aliveCount() >= 90) continue;

      const chunkX = Math.floor(c.x / 16);
      const chunkZ = Math.floor(c.z / 16);
      if (!world.isChunkLoaded(chunkX, chunkZ)) continue;

      const spawns: Zombie[] = [];
      const spawnPoints = b.zombieSpawns;
      let spawned = 0;
      for (let i = 0; i < state.total && spawned < state.remaining; i++) {
        if (world.isPoiKilled(b.id, i)) continue;
        const spot = spawnPoints[i % spawnPoints.length];
        const kind = pickPoiKind(b.kind, day, i, (world.seed ^ hashStringToSeed(b.id)) >>> 0);
        const zed = zombies.spawnAt(spot.x, spot.y, spot.z, kind);
        zed.poiId = b.id;
        zed.poiIndex = i;
        zed.home.set(c.x, b.baseY + 1, c.z);
        spawns.push(zed);
        spawned++;
      }
      if (spawned < state.remaining) {
        state.remaining = spawned;
      }
      if (spawns.length > 0) {
        this.active.set(b.id, { building: b, zombies: spawns });
      }
    }
  }

  private updateStreet(world: World, player: Player, zombies: ZombieManager, day: number) {
    this.streetZombies = this.streetZombies.filter((z) =>
      !z.dead && z.group.parent !== null && z.pos.distanceTo(player.position) < 110,
    );
    const nearest = world.towns.nearestTown(player.position.x, player.position.z);
    if (!nearest || nearest.distance > 112) {
      for (const z of this.streetZombies) zombies.removeZombie(z);
      this.streetZombies = [];
      this.streetTownKey = '';
      return;
    }
    const town = nearest.town;
    const key = `${town.cellX}:${town.cellZ}`;
    if (key !== this.streetTownKey) {
      for (const z of this.streetZombies) zombies.removeZombie(z);
      this.streetZombies = [];
      this.streetTownKey = key;
    }
    if (player.dead) return;

    const killed = world.streetKillCount(key);
    const remainingTarget = Math.max(0, streetTargetFor(town) - killed);
    if (remainingTarget <= 0) {
      // The street horde of this town has been wiped out for good.
      for (const z of this.streetZombies) zombies.removeZombie(z);
      this.streetZombies = [];
      return;
    }

    let alive = this.streetZombies.filter((z) => !z.dead).length;
    if (alive >= remainingTarget || zombies.aliveCount() >= 120) return;

    // Fill the street horde in one pass. Spawning 3 per tick would look like
    // respawning right after the player kills someone.
    for (let attempt = 0; attempt < 120 && alive < remainingTarget; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 8 + Math.random() * 44;
      const x = Math.round(town.cx + Math.cos(angle) * radius);
      const z = Math.round(town.cz + Math.sin(angle) * radius);
      if (this.insideBuilding(town, x, z)) continue;
      if (Math.hypot(x - player.position.x, z - player.position.z) < 16) continue;
      if (!world.isChunkLoaded(Math.floor(x / 16), Math.floor(z / 16))) continue;
      const top = world.columnTop(x, z);
      const topBlock = world.getBlock(x, top, z);
      if (top <= 0 || topBlock === Block.Water || topBlock === Block.Leaves || topBlock === Block.Air) continue;
      const zed = zombies.spawnAt(x + 0.5, top + 1.02, z + 0.5, pickAmbientKind(day));
      zed.home.set(town.cx, town.baseY + 1, town.cz);
      zed.poiId = `street:${key}`;
      zed.poiIndex = -1;
      this.streetZombies.push(zed);
      alive++;
    }
  }

  private insideBuilding(town: Town, x: number, z: number): boolean {
    return town.buildings.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  }

  handleDeath(z: Zombie, world: World, cb: PoiCallbacks) {
    if (!z.poiId) return;
    const state = world.poiStates.get(z.poiId);
    const entry = this.active.get(z.poiId);
    if (!state) return;
    state.remaining = Math.max(0, state.remaining - 1);
    if (state.remaining === 0) {
      if (entry) {
        const b = entry.building;
        cb.onCleared(b);
        this.active.delete(z.poiId);
      }
    }
  }

  private updateHint(world: World, player: Player, cb: PoiCallbacks) {
    const nearest = world.towns.nearestTown(player.position.x, player.position.z);
    if (!nearest) {
      cb.onHint('');
      return;
    }
    const dx = nearest.town.cx - player.position.x;
    const dz = nearest.town.cz - player.position.z;
    if (nearest.distance <= 58) {
      const key = `${nearest.town.cellX}:${nearest.town.cellZ}`;
      if (key !== this.lastTownKey) {
        this.lastTownKey = key;
        cb.onEnterTown(nearest.town);
      }
      let cleared = 0;
      for (const b of nearest.town.buildings) {
        const st = world.poiStates.get(b.id);
        if (st && st.remaining <= 0) cleared++;
      }
      const total = nearest.town.buildings.length;
      const streetCleared = world.streetKillCount(key) >= streetTargetFor(nearest.town);
      cb.onHint(
        cleared >= total && total > 0 && streetCleared
          ? `ГОРОД ЗАЧИЩЕН · ${total}/${total}`
          : `ГОРОД · ЗАЧИЩЕНО ${cleared}/${total}`,
      );
    } else {
      const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      const cardinal = CARDINALS[Math.round(deg / 45) % 8];
      cb.onHint(`БЛИЖАЙШИЙ ГОРОД · ${Math.round(nearest.distance)} М · ${cardinal}`);
      this.lastTownKey = '';
    }
  }

  clear(zombies: ZombieManager) {
    for (const entry of this.active.values()) {
      for (const z of entry.zombies) zombies.removeZombie(z);
    }
    for (const z of this.streetZombies) zombies.removeZombie(z);
    this.streetZombies = [];
    this.streetTownKey = '';
    this.active.clear();
    this.lastTownKey = '';
  }

  getClearedCount(world: World, town: Town): number {
    let cleared = 0;
    for (const b of town.buildings) {
      const st = world.poiStates.get(b.id);
      if (st && st.remaining <= 0) cleared++;
    }
    return cleared;
  }
}

export function buildingName(b: BuildingSpec): string {
  return KIND_NAMES[b.kind] ?? 'Здание';
}
