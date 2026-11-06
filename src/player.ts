import * as THREE from 'three';
import { World } from './world';

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
}

const PLAYER_RADIUS = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  private readonly flashlight: THREE.SpotLight;
  private readonly flashTarget: THREE.Object3D;
  private readonly handLight: THREE.PointLight;

  yaw = 0;
  pitch = 0;
  health = 100;
  maxHealth = 100;
  stamina = 100;
  maxStamina = 100;
  hunger = 100;
  maxHunger = 100;
  thirst = 100;
  maxThirst = 100;
  poison = 0;
  invulnTimer = 0;
  onGround = false;
  inWater = false;
  headUnderwater = false;
  sprinting = false;
  dead = false;
  flashOn = false;
  moveMultiplier = 1;
  sprintMultiplier = 1;
  armorReduction = 0;
  fallDamageMultiplier = 1;
  adrenaline = false;
  hungerRate = 1;
  thirstRate = 1;
  healMultiplier = 1;
  detectMultiplier = 1;

  fallSpeed = 0;
  private staminaDelay = 0;
  private sinceDamage = 100;
  private starveTimer = 0;
  private poisonTick = 0;
  private walkPhase = 0;
  private walkDistance = 0;
  private shake = 0;
  private shakeSeed = Math.random() * 100;
  private bobAmount = 0;
  private bobTarget = 0;

  onDamage?: (amount: number) => void;
  onDeath?: () => void;
  onFootstep?: (inWater: boolean) => void;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.06, 900);
    this.camera.rotation.order = 'YXZ';

    this.flashlight = new THREE.SpotLight(0xffe2b8, 7, 45, 0.46, 0.5, 1.4);
    this.flashlight.position.set(0.18, -0.12, 0);
    this.flashlight.castShadow = false;
    this.flashlight.visible = true;
    this.flashOn = true;
    this.flashTarget = new THREE.Object3D();
    this.flashTarget.position.set(0, 0, -6);
    this.camera.add(this.flashlight, this.flashTarget);
    this.flashlight.target = this.flashTarget;

    this.handLight = new THREE.PointLight(0xffd9a8, 0.55, 2.2, 2);
    this.handLight.position.set(0.3, -0.25, -0.4);
    this.camera.add(this.handLight);
  }

  toggleFlashlight() {
    this.flashOn = !this.flashOn;
    this.flashlight.visible = this.flashOn;
    return this.flashOn;
  }

  setPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.updateCamera(0);
  }

  look(dx: number, dy: number, sensitivity: number) {
    this.yaw -= dx * 0.0022 * sensitivity;
    this.pitch -= dy * 0.0022 * sensitivity;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
  }

  getViewDirection(target = new THREE.Vector3()): THREE.Vector3 {
    target.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    return target.normalize();
  }

  getSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  applyPoison(seconds: number) {
    this.poison = Math.max(this.poison, seconds);
  }

  takeDamage(amount: number, silent = false) {
    if (this.dead || this.invulnTimer > 0) return;
    if (!silent) amount *= Math.max(0, 1 - this.armorReduction);
    this.health = Math.max(0, this.health - amount);
    this.sinceDamage = 0;
    if (!silent) {
      this.shake = Math.min(0.7, this.shake + 0.25 + amount * 0.012);
      this.onDamage?.(amount);
    }
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath?.();
    }
  }

  respawn(x: number, y: number, z: number) {
    this.dead = false;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.hunger = 70;
    this.thirst = 70;
    this.poison = 0;
    this.poisonTick = 0;
    this.invulnTimer = 3;
    this.sinceDamage = 100;
    this.fallSpeed = 0;
    this.shake = 0;
    this.starveTimer = 0;
    this.setPosition(x, y, z);
  }

  update(dt: number, input: InputState, world: World) {
    if (this.dead) {
      this.updateCamera(dt);
      return;
    }
    dt = Math.min(dt, 0.05);
    this.sinceDamage += dt;
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    const feetWater = world.isWater(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.25),
      Math.floor(this.position.z),
    );
    const bodyWater = world.isWater(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.95),
      Math.floor(this.position.z),
    );
    this.inWater = feetWater || bodyWater;
    this.headUnderwater = world.isWater(
      Math.floor(this.position.x),
      Math.floor(this.position.y + EYE_HEIGHT),
      Math.floor(this.position.z),
    );

    const wishX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const wishZ = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const moving = wishX !== 0 || wishZ !== 0;
    const backing = wishZ < 0;
    const strafing = wishX !== 0;

    let speed = this.inWater ? 3.1 : 4.5 * this.moveMultiplier;
    this.sprinting = false;
    if (!this.inWater && input.sprint && moving && !backing && this.stamina > 1) {
      this.sprinting = true;
      speed = 7.1 * this.moveMultiplier * this.sprintMultiplier;
      this.stamina = Math.max(0, this.stamina - 7 * dt);
      this.staminaDelay = 0.9;
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) {
        this.stamina = Math.min(this.maxStamina, this.stamina + 12 * dt);
      }
    }
    if (this.adrenaline && this.health > 0 && this.health < this.maxHealth * 0.35) {
      speed *= 1.1;
    }
    // Backpedalling and strafing are deliberately slower than moving forward.
    if (backing) speed *= this.inWater ? 0.62 : 0.5;
    else if (strafing) speed *= wishZ > 0 ? 0.86 : 0.76;

    // survival needs
    this.hunger = Math.max(0, this.hunger - dt * (this.sprinting ? 0.17 : 0.1) * this.hungerRate);
    this.thirst = Math.max(0, this.thirst - dt * (this.sprinting ? 0.23 : 0.16) * this.thirstRate);
    if (this.hunger <= 0 || this.thirst <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 1) {
        this.starveTimer = 0;
        const drain = (this.hunger <= 0 ? 0.8 : 0) + (this.thirst <= 0 ? 1.0 : 0);
        this.takeDamage(drain, true);
      }
    } else {
      this.starveTimer = 0;
    }

    if (this.poison > 0) {
      this.poison = Math.max(0, this.poison - dt);
      this.poisonTick += dt;
      if (this.poisonTick >= 1) {
        this.poisonTick = 0;
        this.takeDamage(1.6, true);
      }
    } else {
      this.poisonTick = 0;
    }

    // world-space wish direction
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let dirX = 0;
    let dirZ = 0;
    if (moving) {
      const fX = -sinY;
      const fZ = -cosY;
      const rX = cosY;
      const rZ = -sinY;
      dirX = fX * wishZ + rX * wishX;
      dirZ = fZ * wishZ + rZ * wishX;
      const len = Math.hypot(dirX, dirZ);
      if (len > 0) {
        dirX /= len;
        dirZ /= len;
      }
    }

    const accel = this.onGround ? 16 : this.inWater ? 7 : 4.5;
    const targetVX = dirX * speed;
    const targetVZ = dirZ * speed;
    const blend = 1 - Math.exp(-accel * dt);
    this.velocity.x += (targetVX - this.velocity.x) * blend;
    this.velocity.z += (targetVZ - this.velocity.z) * blend;
    if (!moving && this.onGround) {
      const friction = 1 - Math.exp(-18 * dt);
      this.velocity.x *= 1 - friction;
      this.velocity.z *= 1 - friction;
    }

    if (this.inWater) {
      this.velocity.y -= 7 * dt;
      if (input.jump) this.velocity.y += 22 * dt;
      if (input.jump && !this.headUnderwater && moving) {
        this.velocity.y = Math.max(this.velocity.y, 4.6);
      }
      this.velocity.y = Math.max(-3.6, Math.min(4.8, this.velocity.y));
      this.velocity.y *= 1 - Math.min(1, 2.8 * dt);
    } else {
      this.velocity.y -= 28 * dt;
      if (input.jump && this.onGround) {
        this.velocity.y = 8.6;
        this.onGround = false;
        this.stamina = Math.max(0, this.stamina - 7);
        this.staminaDelay = 0.7;
      }
    }

    const wasOnGround = this.onGround;
    const fallBefore = this.velocity.y;

    this.onGround = false;
    this.moveAxis('y', this.velocity.y * dt, world);
    const canStep = wasOnGround || this.inWater;
    this.moveAxis('x', this.velocity.x * dt, world, canStep);
    this.moveAxis('z', this.velocity.z * dt, world, canStep);

    if (this.inWater) {
      this.fallSpeed = 0;
    } else if (!this.onGround) {
      this.fallSpeed = Math.min(this.fallSpeed, this.velocity.y);
    } else if (!wasOnGround || fallBefore < 0) {
      const impact = -Math.min(fallBefore, this.fallSpeed);
      if (impact > 16) {
        const dmg = Math.min(80, (impact - 16) * 5.5) * this.fallDamageMultiplier;
        this.takeDamage(dmg);
      }
      this.fallSpeed = 0;
    }

    // footsteps / bob
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    this.bobTarget = this.onGround && horizontal > 0.4 ? Math.min(1, horizontal / 5) : 0;
    this.bobAmount += (this.bobTarget - this.bobAmount) * Math.min(1, dt * 8);
    this.walkPhase += horizontal * dt * 2.1;
    const stepLen = horizontal * dt;
    this.walkDistance += stepLen;
    if (this.walkDistance > (this.sprinting ? 2.45 : 1.9) && this.onGround) {
      this.walkDistance = 0;
      this.onFootstep?.(this.inWater);
    }

    if (this.sinceDamage > 7 && this.hunger > 15 && this.thirst > 15) {
      this.health = Math.min(this.maxHealth, this.health + 0.55 * dt * this.healMultiplier);
    }

    this.updateCamera(dt);
  }

  private collides(world: World): boolean {
    if (world.collidesProp(
      this.position.x - PLAYER_RADIUS,
      this.position.x + PLAYER_RADIUS,
      this.position.y,
      this.position.y + PLAYER_HEIGHT,
      this.position.z - PLAYER_RADIUS,
      this.position.z + PLAYER_RADIUS,
    )) return true;
    const minX = Math.floor(this.position.x - PLAYER_RADIUS + 0.0001);
    const maxX = Math.floor(this.position.x + PLAYER_RADIUS - 0.0001);
    const minY = Math.floor(this.position.y + 0.0001);
    const maxY = Math.floor(this.position.y + PLAYER_HEIGHT - 0.0001);
    const minZ = Math.floor(this.position.z - PLAYER_RADIUS + 0.0001);
    const maxZ = Math.floor(this.position.z + PLAYER_RADIUS - 0.0001);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private moveAxis(axis: 'x' | 'y' | 'z', amount: number, world: World, canStep = false) {
    if (amount === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.04));
    const step = amount / steps;
    for (let i = 0; i < steps; i++) {
      this.position[axis] += step;
      if (this.collides(world)) {
        this.position[axis] -= step;
        if (axis === 'y') {
          if (step < 0) {
            this.onGround = true;
            this.fallSpeed = this.velocity.y;
          }
          this.velocity.y = 0;
        } else {
          // Walk up a single-block ledge instead of forcing a jump.
          if (canStep) {
            const oldY = this.position.y;
            const oldAxis = this.position[axis];
            this.position.y += 1.03;
            if (!this.collides(world)) {
              this.position[axis] += step;
              if (!this.collides(world)) {
                this.onGround = true;
                return;
              }
            }
            this.position.y = oldY;
            this.position[axis] = oldAxis;
          }
          this.velocity[axis] = 0;
        }
        return;
      }
    }
  }

  private updateCamera(dt: number) {
    const bob = Math.sin(this.walkPhase * 2) * 0.045 * this.bobAmount;
    const sway = Math.cos(this.walkPhase) * 0.025 * this.bobAmount;
    let shakeX = 0;
    let shakeY = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const t = performance.now() * 0.045 + this.shakeSeed;
      shakeX = (Math.random() - 0.5) * this.shake * 0.06;
      shakeY = (Math.random() - 0.5) * this.shake * 0.06;
      shakeX += Math.sin(t) * this.shake * 0.02;
    }

    this.camera.position.set(
      this.position.x + sway + shakeX,
      this.position.y + EYE_HEIGHT + bob + shakeY,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    if (this.shake > 0) {
      this.camera.rotation.z += (Math.random() - 0.5) * this.shake * 0.03;
    }
  }

  eyePosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.position).add(new THREE.Vector3(0, EYE_HEIGHT, 0));
  }

  intersectsBlock(x: number, y: number, z: number): boolean {
    const minX = x;
    const maxX = x + 1;
    const minY = y;
    const maxY = y + 1;
    const minZ = z;
    const maxZ = z + 1;
    return (
      this.position.x + PLAYER_RADIUS > minX &&
      this.position.x - PLAYER_RADIUS < maxX &&
      this.position.y + PLAYER_HEIGHT > minY &&
      this.position.y < maxY &&
      this.position.z + PLAYER_RADIUS > minZ &&
      this.position.z - PLAYER_RADIUS < maxZ
    );
  }
}
