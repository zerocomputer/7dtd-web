import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  active: boolean;
}

const MAX = 700;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) {
      this.particles.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        gravity: 20,
        drag: 0.5,
        active: false,
      });
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setRGB(1, 1, 1));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  burst(
    x: number, y: number, z: number,
    color: number,
    count = 12,
    power = 3.8,
    size = 0.09,
    gravity = 22,
    life = 0.7,
    upward = 1.6,
  ) {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      p.active = true;
      p.life = p.maxLife = life * (0.55 + Math.random() * 0.7);
      p.size = size * (0.55 + Math.random() * 0.85);
      p.gravity = gravity;
      p.drag = 0.6 + Math.random() * 1.2;
      p.pos.set(
        x + (Math.random() - 0.5) * 0.55,
        y + (Math.random() - 0.5) * 0.55,
        z + (Math.random() - 0.5) * 0.55,
      );
      const theta = Math.random() * Math.PI * 2;
      const r = Math.random() * power;
      p.vel.set(Math.cos(theta) * r, Math.random() * power * 0.85 + upward, Math.sin(theta) * r);
      const tint = 0.72 + Math.random() * 0.45;
      this.color.setRGB(
        Math.min(1, base.r * tint),
        Math.min(1, base.g * tint),
        Math.min(1, base.b * tint),
      );
      this.mesh.setColorAt((this.cursor - 1 + MAX) % MAX, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  blood(x: number, y: number, z: number, count = 10) {
    this.burst(x, y, z, 0x7d1712, count, 2.6, 0.075, 16, 0.55, 0.5);
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - Math.min(1, p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);

      const t = p.life / p.maxLife;
      const scale = p.size * Math.min(1, t * 2.2);
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.pos.x * 3, p.pos.y * 3, p.pos.z * 3);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < MAX; i++) {
      this.particles[i].active = false;
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
