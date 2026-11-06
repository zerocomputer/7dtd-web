import * as THREE from 'three';
import { World, SEA_LEVEL } from './world';
import { Player } from './player';
import { SoundSystem } from './audio';
import { Particles } from './particles';
import { Block, blockDef } from './blocks';
import { zombieModels, ZombieModelId, ZombieVisual } from './zombievisual';
import { hash2 } from './noise';

const ZOMBIE_RADIUS = 0.3;
const ZOMBIE_HEIGHT = 1.82;
const MODEL_FACING = 0;

export type ZombieKind =
  | 'walker'
  | 'runner'
  | 'brute'
  | 'one_arm'
  | 'screamer'
  | 'toxic'
  | 'elite'
  | 'crawler'
  | 'hound'
  | 'pug';

interface KindDef {
  model: ZombieModelId;
  health: number;
  speed: number;
  damage: number;
  scale: number;
  tint: number;
  radius: number;
  height: number;
  hitOffset: number;
  attackInterval: number;
  attackRange: number;
  ability?: 'knockback' | 'poison' | 'scream' | 'lunger';
}

const KINDS: Record<ZombieKind, KindDef> = {
  walker: {
    model: 'basic', health: 100, speed: 2.05, damage: 5.5, scale: 1,
    tint: 0xffffff, radius: 0.3, height: 1.82, hitOffset: 1.02,
    attackInterval: 1.45, attackRange: 2.15,
  },
  runner: {
    model: 'arm', health: 75, speed: 3.35, damage: 4.8, scale: 0.97,
    tint: 0xd8ddcf, radius: 0.28, height: 1.76, hitOffset: 0.98,
    attackInterval: 1.1, attackRange: 1.95, ability: 'lunger',
  },
  brute: {
    model: 'chubby', health: 210, speed: 1.55, damage: 12, scale: 1.08,
    tint: 0xd2bda6, radius: 0.4, height: 2.0, hitOffset: 1.12,
    attackInterval: 1.9, attackRange: 2.45, ability: 'knockback',
  },
  one_arm: {
    model: 'arm', health: 125, speed: 2.5, damage: 7, scale: 1.0,
    tint: 0xffffff, radius: 0.3, height: 1.82, hitOffset: 1.0,
    attackInterval: 1.25, attackRange: 2.1,
  },
  screamer: {
    model: 'basic', health: 85, speed: 2.15, damage: 4.5, scale: 0.94,
    tint: 0xe0c7b5, radius: 0.29, height: 1.76, hitOffset: 0.98,
    attackInterval: 1.5, attackRange: 2.0, ability: 'scream',
  },
  toxic: {
    model: 'chubby', health: 145, speed: 1.95, damage: 6, scale: 1.0,
    tint: 0x9eb96b, radius: 0.37, height: 1.92, hitOffset: 1.08,
    attackInterval: 1.55, attackRange: 2.2, ability: 'poison',
  },
  elite: {
    model: 'basic', health: 185, speed: 2.4, damage: 8.5, scale: 1.04,
    tint: 0xc06e62, radius: 0.31, height: 1.86, hitOffset: 1.04,
    attackInterval: 1.15, attackRange: 2.15,
  },
  crawler: {
    model: 'ribcage', health: 60, speed: 1.8, damage: 4.5, scale: 1.12,
    tint: 0xffffff, radius: 0.28, height: 1.15, hitOffset: 0.5,
    attackInterval: 1.15, attackRange: 1.75,
  },
  hound: {
    model: 'shepherd', health: 55, speed: 4.2, damage: 4, scale: 1.0,
    tint: 0xffffff, radius: 0.28, height: 1.12, hitOffset: 0.62,
    attackInterval: 0.95, attackRange: 1.95, ability: 'lunger',
  },
  pug: {
    model: 'pug', health: 40, speed: 3.7, damage: 3.5, scale: 1.0,
    tint: 0xd0b9a5, radius: 0.25, height: 0.9, hitOffset: 0.5,
    attackInterval: 0.9, attackRange: 1.7, ability: 'lunger',
  },
};

export function pickAmbientKind(day: number): ZombieKind {
  const t = Math.min(1, Math.max(0, (day - 1) / 6));
  const table: [ZombieKind, number][] = [
    ['walker', 40 - t * 16],
    ['runner', 16 + t * 2],
    ['one_arm', 16],
    ['crawler', 9],
    ['brute', 5 + t * 11],
    ['screamer', 4 + t * 8],
    ['toxic', 3 + t * 10],
    ['elite', 2 + t * 10],
    ['hound', 3 + t * 5],
    ['pug', 2 + t * 3],
  ];
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [kind, w] of table) {
    r -= w;
    if (r <= 0) return kind;
  }
  return 'walker';
}

export function pickPoiKind(buildingKind: string, day: number, index: number, seed = 0): ZombieKind {
  const pools: Record<string, ZombieKind[]> = {
    house: ['walker', 'walker', 'screamer', 'crawler', 'toxic', 'pug'],
    store: ['walker', 'runner', 'one_arm', 'elite', 'screamer', 'hound'],
    pharmacy: ['toxic', 'screamer', 'crawler', 'walker'],
    police: ['elite', 'elite', 'brute', 'one_arm', 'runner', 'hound'],
    warehouse: ['brute', 'one_arm', 'toxic', 'elite', 'walker', 'hound'],
    gas: ['toxic', 'runner', 'walker', 'one_arm', 'hound', 'pug'],
    ruin: ['crawler', 'walker', 'one_arm', 'toxic', 'hound', 'pug'],
    apartment: ['walker', 'runner', 'screamer', 'crawler', 'one_arm', 'brute', 'elite'],
  };
  const pool = pools[buildingKind] ?? pools.house;
  if (day > 4 && index === 0) return 'elite';
  if (day > 2 && index === 1 && buildingKind === 'warehouse') return 'brute';
  const roll = seed ? hash2(seed, index * 17 + day * 31, 0x51ed) : Math.random();
  return pool[Math.floor(roll * pool.length) % pool.length];
}

interface KindRuntime {
  def: KindDef;
  visual: ZombieVisual | null;
}

export interface ZombieSense {
  now: number;
  noiseX: number;
  noiseY: number;
  noiseZ: number;
  noiseUntil: number;
  noiseRadius: number;
  hiveAlert: boolean;
}

export class Zombie {
  readonly group = new THREE.Group();
  readonly kind: ZombieKind;
  readonly def: KindDef;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  radius: number;
  height: number;
  hitOffset: number;
  dead = false;
  deathTimer = 0;
  deathNotified = false;
  killedByPlayer = false;
  poiId: string | null = null;
  poiIndex = -1;
  home = new THREE.Vector3();
  chasing = false;
  state: 'idle' | 'wander' | 'investigate' | 'chase' = 'idle';
  lastSeen = new THREE.Vector3();
  investigate = new THREE.Vector3();
  wander = new THREE.Vector3();
  wanderTimer = 1 + Math.random() * 5;
  private lostTimer = 0;
  private senseTimer = Math.random() * 0.25;
  private canSeeCached = false;
  private noiseReacted = false;
  private trapTimer = 0;
  burning = false;
  screamTimer = 0;
  screamed = false;
  speedBoost = 0;
  attackTimer = 0.7 + Math.random() * 0.5;
  private visual: ZombieVisual | null = null;
  private walkPhase = Math.random() * 10;
  private blockedTime = 0;
  private breakProgress = 0;
  private breakKey = '';
  private breakSoundTimer = 0;
  private onGround = false;
  private visualBurning = false;
  private poisonOnHit: boolean;
  private knockback: boolean;
  private lunger: boolean;

  constructor(kind: ZombieKind = 'walker') {
    this.kind = kind;
    this.def = KINDS[kind];
    const d = this.def;
    this.health = d.health;
    this.maxHealth = d.health;
    this.speed = d.speed;
    this.damage = d.damage;
    this.radius = d.radius;
    this.height = d.height;
    this.hitOffset = d.hitOffset;
    this.poisonOnHit = d.ability === 'poison';
    this.knockback = d.ability === 'knockback';
    this.lunger = d.ability === 'lunger';
    if (d.ability === 'scream') this.screamTimer = 4 + Math.random() * 7;

    this.visual = zombieModels.create(d.model, d.tint);
    if (!zombieModels.has(d.model)) {
      const fallback = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6b7a52 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), bodyMat);
      body.position.y = 0.9;
      body.castShadow = true;
      fallback.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat);
      head.position.y = 1.62;
      fallback.add(head);
      this.group.add(fallback);
    } else {
      this.visual.root.scale.setScalar(d.scale);
      this.visual.root.rotation.y = MODEL_FACING;
      this.group.add(this.visual.root);
    }
    this.group.scale.setScalar(0.96 + Math.random() * 0.08);
  }

  setPosition(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.group.position.copy(this.pos);
  }

  debugState() {
    return {
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      kind: this.kind, health: this.health,
      poiId: this.poiId, poiIndex: this.poiIndex,
      chasing: this.chasing, state: this.state,
      blockedTime: this.blockedTime,
      breakProgress: this.breakProgress,
      breakKey: this.breakKey,
      burning: this.burning,
      dead: this.dead,
    };
  }

  update(
    dt: number,
    world: World,
    player: Player,
    isNight: boolean,
    particles: Particles,
    sound: SoundSystem,
    sense: ZombieSense,
  ) {
    if (this.dead) {
      this.deathTimer -= dt;
      this.visual?.update(dt, 0);
      return;
    }

    this.speedBoost = Math.max(0, this.speedBoost - dt);
    this.walkPhase += dt;

    const dx = player.position.x - this.pos.x;
    const dz = player.position.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const eyeY = this.pos.y + this.height * 0.78;
    const playerY = player.position.y + 1.1;
    const dy = playerY - eyeY;
    const dist3 = Math.hypot(dx, dy, dz);
    const inWater = world.isWater(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 0.4),
      Math.floor(this.pos.z),
    );

    const now = sense.now;
    this.senseTimer -= dt;
    let canSee = false;
    if (!player.dead && dist3 < (isNight ? 44 : this.poiId ? 33 : 29) * player.detectMultiplier) {
      const forwardX = Math.sin(this.yaw);
      const forwardZ = Math.cos(this.yaw);
      const dot = dist > 0.001 ? (dx * forwardX + dz * forwardZ) / dist : 1;
      if (dist3 < 6.5 || dot > 0.15) {
        if (this.senseTimer <= 0) {
          this.senseTimer = 0.2 + Math.random() * 0.1;
          this.canSeeCached = world.hasLineOfSight(
            this.pos.x, eyeY, this.pos.z,
            player.position.x, playerY, player.position.z,
          );
        }
        canSee = this.canSeeCached;
      }
    }

    if (canSee) {
      this.lastSeen.set(player.position.x, player.position.y, player.position.z);
      this.chasing = true;
      this.state = 'chase';
      this.lostTimer = 9;
      this.noiseReacted = false;
    }

    if (!canSee && sense.noiseUntil > now && !this.noiseReacted) {
      const nx = sense.noiseX - this.pos.x;
      const ny = sense.noiseY - this.pos.y;
      const nz = sense.noiseZ - this.pos.z;
      if (Math.hypot(nx, ny, nz) < sense.noiseRadius) {
        this.noiseReacted = true;
        this.investigate.set(sense.noiseX, sense.noiseY, sense.noiseZ);
        this.state = 'investigate';
        this.chasing = false;
        this.lostTimer = 7;
      }
    }
    if (now > sense.noiseUntil + 0.5) this.noiseReacted = false;

    if (!this.chasing && sense.hiveAlert && dist3 < 38) {
      this.lastSeen.copy(player.position);
      this.chasing = true;
      this.state = 'chase';
      this.lostTimer = 6;
    }

    if (this.chasing && !canSee) {
      this.lostTimer -= dt;
      if (this.lostTimer <= 0) {
        this.chasing = false;
        this.state = 'wander';
      }
    }

    if (!this.chasing && this.state === 'investigate') {
      const ix = this.investigate.x - this.pos.x;
      const iz = this.investigate.z - this.pos.z;
      if (Math.hypot(ix, iz) < 1.6) {
        this.state = 'wander';
        this.wanderTimer = 0;
      }
    }

    let moveX = 0;
    let moveZ = 0;
    let moveSpeed = 0;
    let faceTarget = false;
    if (this.chasing) {
      const tx = canSee ? player.position.x : this.lastSeen.x;
      const tz = canSee ? player.position.z : this.lastSeen.z;
      const tdx = tx - this.pos.x;
      const tdz = tz - this.pos.z;
      const td = Math.hypot(tdx, tdz);
      if (td > (canSee ? this.def.attackRange - 0.2 : 0.8)) {
        moveX = tdx / (td || 1);
        moveZ = tdz / (td || 1);
        moveSpeed = this.speed;
        if (this.burning) moveSpeed *= 1.12;
        if (this.speedBoost > 0) moveSpeed *= 1.35;
        if (this.lunger && dist > 4 && dist < 9) moveSpeed *= 1.18;
        faceTarget = true;
      }
    } else if (this.state === 'investigate') {
      const ix = this.investigate.x - this.pos.x;
      const iz = this.investigate.z - this.pos.z;
      const idist = Math.hypot(ix, iz);
      if (idist > 0.9) {
        moveX = ix / idist;
        moveZ = iz / idist;
        moveSpeed = this.speed * 0.62;
        faceTarget = true;
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 6;
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.5 + Math.random() * 7;
        this.wander.set(
          this.home.x + Math.cos(angle) * radius,
          this.home.y,
          this.home.z + Math.sin(angle) * radius,
        );
        this.state = Math.random() < 0.3 ? 'idle' : 'wander';
      }
      if (this.state === 'wander') {
        const wx = this.wander.x - this.pos.x;
        const wz = this.wander.z - this.pos.z;
        const wd = Math.hypot(wx, wz);
        if (wd > 0.8) {
          moveX = wx / wd;
          moveZ = wz / wd;
          moveSpeed = this.speed * 0.36;
          faceTarget = true;
        } else {
          this.state = 'idle';
          this.wanderTimer = Math.min(this.wanderTimer, 1.5 + Math.random() * 3);
        }
      }
    }

    if (faceTarget && moveSpeed > 0.01) {
      const targetYaw = Math.atan2(moveX, moveZ);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * (this.chasing ? 7 : 3));
    } else if (!this.chasing) {
      this.yaw += Math.sin(now * 0.55 + this.pos.x * 0.4) * dt * 0.12;
    }
    this.group.rotation.y = this.yaw;

    const active = this.chasing || this.state === 'investigate';

    if (active && this.def.ability === 'scream' && dist3 < 30) {
      this.screamTimer -= dt;
      if (this.screamTimer <= 0) {
        this.screamTimer = 14 + Math.random() * 9;
        this.screamed = true;
      }
    }

    if (moveSpeed > 0.01) {
      this.velocityTowards(moveX * moveSpeed, moveZ * moveSpeed, dt);
      if (inWater) {
        this.vel.y += 10 * dt;
        this.vel.y = Math.min(this.vel.y, 2.1);
      }
    } else {
      this.vel.x *= 1 - Math.min(1, dt * 8);
      this.vel.z *= 1 - Math.min(1, dt * 8);
    }

    if (inWater) {
      this.vel.y -= 4.5 * dt;
      this.vel.y = Math.max(this.vel.y, -1.6);
    } else {
      this.vel.y -= 28 * dt;
    }

    const blocked = this.moveHorizontal(this.vel.x * dt, this.vel.z * dt, world);
    if (blocked) {
      this.blockedTime += dt;
    } else {
      this.blockedTime = Math.max(0, this.blockedTime - dt * 2);
    }

    this.onGround = false;
    this.moveVertical(this.vel.y * dt, world);
    this.group.position.copy(this.pos);

    // Keep the model out of the camera and respect the player's personal space.
    const pdx = this.pos.x - player.position.x;
    const pdz = this.pos.z - player.position.z;
    const pd = Math.hypot(pdx, pdz);
    const minPlayerDist = this.radius + 0.55;
    if (!player.dead && pd > 0.001 && pd < minPlayerDist) {
      const push = minPlayerDist - pd;
      const nx = this.pos.x + (pdx / pd) * push;
      const nz = this.pos.z + (pdz / pd) * push;
      if (!world.isSolid(Math.floor(nx), Math.floor(this.pos.y), Math.floor(nz))) {
        this.pos.x = nx;
        this.pos.z = nz;
        this.group.position.copy(this.pos);
      }
    }
    this.group.visible = this.pos.distanceTo(player.position) > 0.8 && this.pos.distanceTo(player.position) < 86;

    if (this.burning !== this.visualBurning) {
      this.visualBurning = this.burning;
      this.visual?.setBurning(this.burning);
    }
    if (this.burning) {
      this.health -= 9 * dt;
      if (Math.random() < dt * 9) {
        particles.burst(
          this.pos.x + (Math.random() - 0.5) * 0.5,
          this.pos.y + 0.7 + Math.random() * 0.8,
          this.pos.z + (Math.random() - 0.5) * 0.5,
          Math.random() > 0.5 ? 0xff8a3a : 0x2c241f,
          2, 0.7, 0.07, -2.5, 0.6, 1.2,
        );
      }
      if (this.health <= 0) {
        this.die(particles, sound);
        return;
      }
    }

    // visual locomotion
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const trapBelow = world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z),
    );
    const trapAt = world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z),
    );
    if (trapBelow === Block.SpikeTrap || trapAt === Block.SpikeTrap) {
      this.trapTimer -= dt;
      if (this.trapTimer <= 0) {
        this.trapTimer = 1;
        this.health -= 14;
        particles.blood(this.pos.x, this.pos.y + 0.55, this.pos.z, 6);
        sound.hitFlesh();
        if (this.health <= 0) {
          this.die(particles, sound);
          return;
        }
      }
    } else {
      this.trapTimer = 0;
    }
    const visualDistance = this.pos.distanceTo(player.position);
    if (visualDistance < 52) this.visual?.update(dt, hSpeed);
    else if (visualDistance < 86) this.visual?.update(dt * 0.2, hSpeed);

    // break through walls
    if (active && blocked && this.blockedTime > 1.3 && dist < 22) {
      const ndx = dx / (dist || 1);
      const ndz = dz / (dist || 1);
      const tx = Math.floor(this.pos.x + ndx * 0.8);
      const tz = Math.floor(this.pos.z + ndz * 0.8);
      const feetY = Math.floor(this.pos.y + 0.02);
      let targetDef: ReturnType<typeof blockDef>;
      let targetY = -1;
      for (let yy = feetY + 1; yy <= feetY + 2; yy++) {
        const id = world.getBlock(tx, yy, tz);
        const def = blockDef(id);
        if (id !== Block.Air && id !== Block.Water && id !== Block.Bedrock && def?.solid) {
          targetDef = def;
          targetY = yy;
          break;
        }
      }
      if (targetY >= 0 && targetDef) {
        const key = `${tx},${targetY},${tz}`;
        if (key !== this.breakKey) {
          this.breakKey = key;
          this.breakProgress = 0;
        }
        const tough = targetDef.material === 'stone' || targetDef.material === 'ore' ? 5.2 : 2.5;
        this.breakProgress += dt;
        this.breakSoundTimer -= dt;
        if (this.breakSoundTimer <= 0) {
          this.breakSoundTimer = 0.52;
          sound.dig(targetDef.material);
          particles.burst(tx + 0.5, targetY + 0.5, tz + 0.5, targetDef.color, 5, 1.8, 0.07, 18, 0.5, 0.8);
        }
        if (this.breakProgress >= tough) {
          world.setBlock(tx, targetY, tz, Block.Air);
          world.flowWater(tx, targetY, tz);
          particles.burst(tx + 0.5, targetY + 0.5, tz + 0.5, targetDef.color, 12, 2.8, 0.08, 20, 0.7, 1.2);
          sound.breakBlock(targetDef.material);
          this.breakProgress = 0;
          this.breakKey = '';
          this.blockedTime = 0;
        }
      } else {
        this.breakProgress = 0;
        this.breakKey = '';
      }
    } else {
      this.breakProgress = Math.max(0, this.breakProgress - dt * 2);
    }

    // attack
    this.attackTimer -= dt;
    const attackDy = Math.abs((player.position.y + 1.0) - (this.pos.y + this.height * 0.5));
    if (this.chasing && dist3 < this.def.attackRange && attackDy < 2.2 && !player.dead) {
      if (this.attackTimer <= 0) {
        const ex = this.pos.x;
        const ey = this.pos.y + this.height * 0.8;
        const ez = this.pos.z;
        const tx = player.position.x;
        const ty = player.position.y + 1.15;
        const tz = player.position.z;
        const ddx = tx - ex;
        const ddy = ty - ey;
        const ddz = tz - ez;
        const len = Math.hypot(ddx, ddy, ddz) || 1;
        const losDir = new THREE.Vector3(ddx / len, ddy / len, ddz / len);
        const losHit = world.raycast(new THREE.Vector3(ex, ey, ez), losDir, len + 0.4);
        const hasLos = !losHit || losHit.distance > len - 0.45;
        if (hasLos) {
          this.attackTimer = this.def.attackInterval;
          player.takeDamage(this.damage);
          this.visual?.attack();
          sound.hurt();
          if (this.poisonOnHit) player.applyPoison(6);
          if (this.knockback) {
            player.velocity.x += (ddx / len) * 4.5;
            player.velocity.z += (ddz / len) * 4.5;
          }
        }
      }
    }

    // ambient breathing/growl is handled by the manager
  }

  private velocityTowards(vx: number, vz: number, dt: number) {
    const blend = 1 - Math.exp(-10 * dt);
    this.vel.x += (vx - this.vel.x) * blend;
    this.vel.z += (vz - this.vel.z) * blend;
  }

  private collides(world: World): boolean {
    if (world.collidesProp(
      this.pos.x - this.radius,
      this.pos.x + this.radius,
      this.pos.y,
      this.pos.y + this.height,
      this.pos.z - this.radius,
      this.pos.z + this.radius,
    )) return true;
    const minX = Math.floor(this.pos.x - this.radius + 0.001);
    const maxX = Math.floor(this.pos.x + this.radius - 0.001);
    const minY = Math.floor(this.pos.y + 0.001);
    const maxY = Math.floor(this.pos.y + this.height - 0.001);
    const minZ = Math.floor(this.pos.z - this.radius + 0.001);
    const maxZ = Math.floor(this.pos.z + this.radius - 0.001);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private moveHorizontal(dx: number, dz: number, world: World): boolean {
    let blocked = false;
    const step = 0.06;
    const tryAxis = (axis: 'x' | 'z', amount: number) => {
      if (amount === 0) return;
      const steps = Math.max(1, Math.ceil(Math.abs(amount) / step));
      const delta = amount / steps;
      for (let i = 0; i < steps; i++) {
        this.pos[axis] += delta;
        if (this.collides(world)) {
          const oldY = this.pos.y;
          this.pos.y += 1.04;
          if (this.collides(world) || oldY + 1.04 > 94) {
            this.pos.y = oldY;
            this.pos[axis] -= delta;
            this.vel[axis] = 0;
            blocked = true;
            return;
          }
          this.pos[axis] += delta;
          if (this.collides(world)) {
            this.pos[axis] -= delta;
            this.pos.y = oldY;
            blocked = true;
            return;
          }
        }
      }
    };
    tryAxis('x', dx);
    tryAxis('z', dz);
    return blocked;
  }

  private moveVertical(dy: number, world: World) {
    if (dy === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(dy) / 0.06));
    const delta = dy / steps;
    for (let i = 0; i < steps; i++) {
      this.pos.y += delta;
      if (this.collides(world)) {
        this.pos.y -= delta;
        if (delta < 0) this.onGround = true;
        this.vel.y = 0;
        return;
      }
    }
  }

  hit(damage: number, dir: THREE.Vector3, particles: Particles, sound: SoundSystem) {
    if (this.dead) return;
    this.killedByPlayer = true;
    this.health -= damage;
    this.vel.x += dir.x * 3.8;
    this.vel.z += dir.z * 3.8;
    particles.blood(this.pos.x, this.pos.y + this.height * 0.62, this.pos.z, 9);
    sound.hitFlesh();
    if (this.health <= 0) this.die(particles, sound);
    else this.visual?.hit();
  }

  die(particles: Particles, sound: SoundSystem) {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 2.1;
    this.visual?.die();
    particles.blood(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z, 20);
    sound.zombieDie();
  }

  dispose() {
    this.visual?.dispose();
    this.visual = null;
    this.group.parent?.remove(this.group);
  }
}

export class ZombieManager {
  readonly group = new THREE.Group();
  zombies: Zombie[] = [];
  kills = 0;
  maxAlive = 12;
  onZombieDeath?: (z: Zombie) => void;
  private spawnTimer = 2.2;
  private groanTimer = 2;
  private particles: Particles;
  private sound: SoundSystem;
  private scene: THREE.Scene;
  private totalLimit = 30;
  private currentDay = 1;
  private noiseX = 0;
  private noiseY = 0;
  private noiseZ = 0;
  private noiseUntil = 0;
  private noiseRadius = 0;

  makeNoise(x: number, y: number, z: number, radius: number, duration = 1.6) {
    this.noiseX = x;
    this.noiseY = y;
    this.noiseZ = z;
    this.noiseRadius = radius;
    this.noiseUntil = performance.now() / 1000 + duration;
  }

  constructor(scene: THREE.Scene, particles: Particles, sound: SoundSystem) {
    this.scene = scene;
    this.particles = particles;
    this.sound = sound;
    scene.add(this.group);
  }

  clear() {
    for (const z of this.zombies) z.dispose();
    this.zombies = [];
    this.kills = 0;
    this.spawnTimer = 2.2;
  }

  aliveCount(): number {
    let n = 0;
    for (const z of this.zombies) if (!z.dead) n++;
    return n;
  }

  update(dt: number, world: World, player: Player, isNight: boolean, day: number, darkness: number) {
    this.currentDay = Math.max(1, day);
    this.maxAlive = Math.min(220, 80 + day * 10);
    this.totalLimit = Math.min(260, 100 + day * 12);

    if (isNight && !player.dead) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = Math.max(0.65, 2.1 - day * 0.1);
        const count = 1 + (Math.random() < 0.7 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          if (this.aliveCount() >= Math.min(90, 40 + day * 5)) break;
          this.spawnOne(world, player, darkness);
        }
      }
    } else {
      this.spawnTimer = Math.max(this.spawnTimer, 1.0);
    }

    const now = performance.now() / 1000;
    const sense: ZombieSense = {
      now,
      noiseX: this.noiseX,
      noiseY: this.noiseY,
      noiseZ: this.noiseZ,
      noiseUntil: this.noiseUntil,
      noiseRadius: this.noiseRadius,
      hiveAlert: false,
    };

    for (const z of this.zombies) {
      z.burning = !isNight && !z.poiId && !z.dead;
      sense.hiveAlert = false;
      if (!z.chasing && !z.dead) {
        for (const other of this.zombies) {
          if (other === z || other.dead || !other.chasing) continue;
          if (other.pos.distanceToSquared(z.pos) < 18 * 18) {
            sense.hiveAlert = true;
            break;
          }
        }
      }
      z.update(dt, world, player, isNight, this.particles, this.sound, sense);

      if (z.screamed) {
        z.screamed = false;
        this.sound.scream();
        for (const other of this.zombies) {
          if (other === z || other.dead) continue;
          if (other.pos.distanceTo(z.pos) < 30) other.speedBoost = Math.max(other.speedBoost, 6);
        }
      }

      if (z.dead && !z.deathNotified) {
        z.deathNotified = true;
        if (z.kind === 'toxic') {
          this.particles.burst(z.pos.x, z.pos.y + 0.5, z.pos.z, 0x7d9a42, 24, 2.8, 0.1, 3, 1.4, 1.4);
          if (z.pos.distanceTo(player.position) < 4.5) player.applyPoison(5);
        }
        this.onZombieDeath?.(z);
      }
      if (z.dead && z.deathTimer <= 0) {
        z.dispose();
      }
      if (!z.dead) {
        const dx = z.pos.x - player.position.x;
        const dz = z.pos.z - player.position.z;
        if (dx * dx + dz * dz > 96 * 96) z.dispose();
      }
    }
    this.zombies = this.zombies.filter((z) => z.group.parent !== null);

    // Gentle flocking separation keeps the horde readable.
    const living = this.zombies.filter((z) => !z.dead);
    for (let i = 0; i < living.length; i++) {
      const a = living[i];
      for (let j = i + 1; j < living.length; j++) {
        const b = living[j];
        let dx = b.pos.x - a.pos.x;
        let dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius + 0.1;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          dx /= d;
          dz /= d;
          a.pos.x -= dx * push;
          a.pos.z -= dz * push;
          b.pos.x += dx * push;
          b.pos.z += dz * push;
          a.group.position.copy(a.pos);
          b.group.position.copy(b.pos);
        }
      }
    }

    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 3 + Math.random() * 8;
      const near = this.zombies.some((z) => !z.dead && z.pos.distanceTo(player.position) < 34);
      if (near && !player.dead) this.sound.groan();
    }
  }

  private spawnOne(world: World, player: Player, darkness: number) {
    if (this.aliveCount() >= this.totalLimit) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 22;
    const x = Math.round(player.position.x + Math.cos(angle) * dist);
    const z = Math.round(player.position.z + Math.sin(angle) * dist);
    const top = world.columnTop(x, z);
    if (top <= SEA_LEVEL) return;
    const topBlock = world.getBlock(x, top, z);
    if (topBlock === Block.Water || topBlock === Block.Leaves || topBlock === Block.Air) return;
    const zed = new Zombie(pickAmbientKind(this.currentDay));
    zed.setPosition(x + 0.5, top + 1.02, z + 0.5);
    zed.home.set(x + 0.5, top + 1.02, z + 0.5);
    this.group.add(zed.group);
    this.zombies.push(zed);
    if (darkness > 0.65 && Math.random() < 0.3) this.sound.groan();
  }

  forceSpawn(world: World, player: Player, darkness: number, count = 1) {
    for (let i = 0; i < count; i++) {
      this.spawnOne(world, player, darkness);
    }
  }

  spawnAt(x: number, y: number, z: number, kind: ZombieKind = 'walker'): Zombie {
    const zed = new Zombie(kind);
    zed.setPosition(x, y, z);
    zed.home.set(x, y, z);
    this.group.add(zed.group);
    this.zombies.push(zed);
    return zed;
  }

  removeZombie(z: Zombie) {
    const index = this.zombies.indexOf(z);
    if (index >= 0) this.zombies.splice(index, 1);
    z.dispose();
  }

  pickTarget(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, blockDist: number): Zombie | null {
    let best: Zombie | null = null;
    let bestT = Infinity;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const cx = z.pos.x;
      const cy = z.pos.y + z.hitOffset;
      const cz = z.pos.z;
      const ox = cx - origin.x;
      const oy = cy - origin.y;
      const oz = cz - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > maxDist || t > blockDist + 0.15) continue;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const d2 = (cx - px) ** 2 + (cy - py) ** 2 + (cz - pz) ** 2;
      if (d2 < 0.46 * 0.46 && t < bestT) {
        bestT = t;
        best = z;
      }
    }
    return best;
  }

  hit(z: Zombie, damage: number, dir: THREE.Vector3) {
    if (z.dead) return;
    const wasDead = z.health <= 0;
    z.hit(damage, dir, this.particles, this.sound);
    if (!wasDead && z.dead) this.kills++;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
