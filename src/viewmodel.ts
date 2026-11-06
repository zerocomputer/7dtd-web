import * as THREE from 'three';
import { blockDef, Block, getAtlas, tileUV, getItem } from './blocks';
import { weaponModels, WeaponModelId } from './weaponmodels';

const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a552f });
const darkWoodMat = new THREE.MeshLambertMaterial({ color: 0x51371f });
const stoneMat = new THREE.MeshLambertMaterial({ color: 0x787873 });
const stoneDarkMat = new THREE.MeshLambertMaterial({ color: 0x565652 });
const lashMat = new THREE.MeshLambertMaterial({ color: 0x362715 });
const steelMat = new THREE.MeshLambertMaterial({ color: 0xc8cdc9 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8f24, toneMapped: false });
const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xffe6a2, toneMapped: false });

function applyBlockUV(geo: THREE.BoxGeometry, id: Block) {
  const def = blockDef(id);
  if (!def) return;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const tiles = [def.side, def.side, def.top, def.bottom, def.side, def.side];
  for (let face = 0; face < 6; face++) {
    const [u0, v0, u1, v1] = tileUV(tiles[face]);
    for (let v = 0; v < 4; v++) {
      const idx = face * 4 + v;
      const u = uv.getX(idx);
      const vv = uv.getY(idx);
      uv.setXY(idx, u0 + (u1 - u0) * u, v0 + (v1 - v0) * (1 - vv));
    }
  }
  uv.needsUpdate = true;
}

export class ViewModel {
  readonly group = new THREE.Group();
  private holder = new THREE.Group();
  private blockMat: THREE.MeshLambertMaterial;
  private itemId: string | null = null;
  private swingT = 1;
  private time = 0;
  private bob = 0;
  basePos = new THREE.Vector3(0.36, -0.42, -0.74);
  baseRot = new THREE.Euler(-0.16, -0.46, 0.12, 'YXZ');

  constructor(camera: THREE.PerspectiveCamera) {
    this.group.add(this.holder);
    camera.add(this.group);
    this.blockMat = new THREE.MeshLambertMaterial({
      map: getAtlas(),
      emissive: new THREE.Color(0x1c1813),
    });
  }

  setItem(id: string | null) {
    if (id === this.itemId) return;
    this.itemId = id;
    this.clear();
    if (!id) return;
    const def = getItem(id);
    if (!def) return;

    if (def.kind === 'block' && def.block !== undefined) {
      if (def.block === Block.Torch) {
        this.holder.add(this.makeHeldTorch());
      } else {
        const geo = new THREE.BoxGeometry(0.23, 0.23, 0.23);
        applyBlockUV(geo, def.block);
        const mesh = new THREE.Mesh(geo, this.blockMat);
        mesh.castShadow = false;
        mesh.rotation.set(0.15, -0.55, 0.06);
        this.holder.add(mesh);
      }
    } else if (def.tool) {
      const wm = this.weaponModelFor(def.tool);
      if (!wm || !this.addWeaponModel(wm)) {
        if (def.tool === 'axe' || def.tool === 'steelaxe') this.holder.add(this.makeAxe());
        else if (def.tool === 'pickaxe' || def.tool === 'steelpick') this.holder.add(this.makePickaxe());
        else if (def.tool === 'club') this.holder.add(this.makeClub());
        else if (def.tool === 'bat') this.holder.add(this.makeBat());
        else if (def.tool === 'machete') this.holder.add(this.makeMachete());
        else if (def.tool === 'pistol') this.holder.add(this.makePistol());
        else if (def.tool === 'rifle') this.holder.add(this.makeRifle());
        else if (def.tool === 'bow') this.holder.add(this.makeBow());
        else this.holder.add(this.makeSticks());
      }
    } else {
      this.holder.add(this.makeSticks());
    }
    this.holder.scale.setScalar(0.45);
  }

  private clear() {
    for (const child of [...this.holder.children]) {
      this.holder.remove(child);
      if (child.userData.shared) continue;
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
        }
      });
    }
  }

  private weaponModelFor(tool: string | undefined): WeaponModelId | null {
    switch (tool) {
      case 'axe':
      case 'steelaxe':
        return 'axe';
      case 'pickaxe':
      case 'steelpick':
        return 'pickaxe';
      case 'club':
        return 'batBarbed';
      case 'bat':
        return 'batSaw';
      case 'machete':
        return 'knife';
      case 'pistol':
        return 'pistol';
      default:
        return null;
    }
  }

  private addWeaponModel(id: WeaponModelId): boolean {
    const model = weaponModels.create(id);
    if (!model) return false;
    const wrap = new THREE.Group();
    wrap.add(model);
    if (id === 'pistol') {
      wrap.rotation.set(-0.05, Math.PI + 0.28, 0.04);
      wrap.position.set(0, 0.05, -0.02);
    } else if (id === 'batSaw') {
      wrap.rotation.set(0.12, 0, -0.3);
      wrap.position.set(0, 0.02, 0);
    } else if (id === 'knife') {
      wrap.rotation.set(-Math.PI / 2, 0, -0.32);
      wrap.position.set(0, -0.02, 0.02);
    } else if (id === 'axe') {
      wrap.rotation.set(0.06, 0.28, -0.12);
      wrap.position.set(0, 0.02, 0.02);
    } else {
      wrap.rotation.set(-Math.PI / 2, 0.32, -0.2);
      wrap.position.set(0, 0, 0.02);
    }
    this.holder.add(wrap);
    return true;
  }

  private makeAxe(): THREE.Group {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.5, 0.032), woodMat);
    handle.position.y = 0.2;
    handle.rotation.z = 0.06;
    g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.055), stoneMat);
    head.position.set(0.05, 0.43, 0);
    head.rotation.z = -0.18;
    g.add(head);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), stoneMat);
    blade.position.set(0.145, 0.405, 0);
    blade.rotation.z = -0.18;
    g.add(blade);
    const lash = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), lashMat);
    lash.position.set(-0.01, 0.35, 0);
    g.add(lash);
    g.rotation.set(0.1, 0, -0.15);
    return g;
  }

  private makePickaxe(): THREE.Group {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.52, 0.03), woodMat);
    handle.position.y = 0.2;
    g.add(handle);
    const center = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.055), stoneMat);
    center.position.set(0, 0.44, 0);
    g.add(center);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), stoneDarkMat);
    left.position.set(-0.11, 0.455, 0);
    left.rotation.z = 0.34;
    g.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), stoneDarkMat);
    right.position.set(0.11, 0.455, 0);
    right.rotation.z = -0.34;
    g.add(right);
    const lash = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.04), lashMat);
    lash.position.set(0, 0.41, 0);
    g.add(lash);
    g.rotation.set(0.15, 0, -0.1);
    return g;
  }

  private makeClub(): THREE.Group {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.026, 0.42, 6), darkWoodMat);
    shaft.position.y = 0.18;
    shaft.rotation.z = 0.12;
    g.add(shaft);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.045, 0.3, 7), woodMat);
    head.position.set(0.055, 0.47, 0);
    head.rotation.z = 0.18;
    g.add(head);
    const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.05, 7), darkWoodMat);
    knot.position.set(0.075, 0.46, 0);
    knot.rotation.z = 0.18;
    g.add(knot);
    g.rotation.set(0.2, 0, -0.2);
    return g;
  }

  private makeSticks(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.025), woodMat);
      stick.position.set(i * 0.028 - 0.028, 0.17, i * 0.02);
      stick.rotation.z = 0.22 + i * 0.14;
      g.add(stick);
    }
    return g;
  }

  private makeBat(): THREE.Group {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.055, 0.58, 8), woodMat);
    shaft.position.y = 0.25;
    shaft.rotation.z = 0.12;
    g.add(shaft);
    for (let i = 0; i < 5; i++) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.07), lashMat);
      tape.position.set(0.012 * i, 0.06 + i * 0.022, 0);
      g.add(tape);
    }
    g.rotation.set(0.2, 0, -0.18);
    return g;
  }

  private makeMachete(): THREE.Group {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.045), darkWoodMat);
    handle.position.y = 0.08;
    g.add(handle);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.05), lashMat);
    guard.position.y = 0.19;
    g.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.38, 0.012), stoneMat);
    blade.position.set(0.012, 0.38, 0);
    blade.rotation.z = -0.04;
    g.add(blade);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.36, 0.014), steelMat);
    edge.position.set(0.048, 0.38, 0);
    g.add(edge);
    g.rotation.set(0.1, 0.1, -0.12);
    return g;
  }

  private makePistol(): THREE.Group {
    const g = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.065), stoneDarkMat);
    slide.position.set(0.02, 0.21, 0);
    g.add(slide);
    const slideTop = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.012, 0.05), steelMat);
    slideTop.position.set(0.02, 0.245, 0);
    g.add(slideTop);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), stoneMat);
    barrel.position.set(0.16, 0.205, 0);
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.2, 0.08), darkWoodMat);
    grip.position.set(-0.045, 0.06, 0);
    grip.rotation.z = 0.16;
    g.add(grip);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.065, 0.03), stoneDarkMat);
    trigger.position.set(0.02, 0.13, 0);
    g.add(trigger);
    g.rotation.set(0.1, -0.12, 0);
    return g;
  }

  private makeRifle(): THREE.Group {
    const g = new THREE.Group();
    // receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), stoneDarkMat);
    receiver.position.set(0.12, 0.2, 0);
    g.add(receiver);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.014, 0.05), steelMat);
    rail.position.set(0.13, 0.24, 0);
    g.add(rail);
    // long barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.55, 8), steelMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.56, 0.205, 0);
    g.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.07, 8), stoneDarkMat);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(0.85, 0.205, 0);
    g.add(muzzle);
    // wooden stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.075), darkWoodMat);
    stock.position.set(-0.2, 0.15, 0);
    stock.rotation.z = -0.13;
    g.add(stock);
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), woodMat);
    butt.position.set(-0.36, 0.11, 0);
    butt.rotation.z = -0.13;
    g.add(butt);
    // grip and magazine
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.075), darkWoodMat);
    grip.position.set(-0.03, 0.08, 0);
    grip.rotation.z = 0.2;
    g.add(grip);
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.06), stoneDarkMat);
    magazine.position.set(0.12, 0.09, 0);
    magazine.rotation.z = 0.12;
    g.add(magazine);
    // scope
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 10), stoneDarkMat);
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0.16, 0.29, 0);
    g.add(scope);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 10), steelMat);
    lens.rotation.z = Math.PI / 2;
    lens.position.set(0.28, 0.29, 0);
    g.add(lens);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.03), stoneDarkMat);
    trigger.position.set(0.0, 0.13, 0);
    g.add(trigger);
    g.rotation.set(0.06, -0.1, 0);
    return g;
  }

  private makeBow(): THREE.Group {
    const g = new THREE.Group();
    const limb = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.013, 5, 20, Math.PI * 1.2),
      darkWoodMat,
    );
    limb.rotation.z = Math.PI * 0.6;
    limb.rotation.y = -Math.PI / 2;
    g.add(limb);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.035), lashMat);
    grip.position.set(0, 0.02, 0);
    g.add(grip);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.38, 4), steelMat);
    string.position.set(0.19, 0.02, 0);
    g.add(string);
    g.rotation.set(0.05, -0.3, -0.12);
    return g;
  }

  private makeHeldTorch(): THREE.Group {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, 0.38, 5), woodMat);
    stick.position.y = 0.12;
    stick.rotation.z = 0.08;
    g.add(stick);
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.055), lashMat);
    wrap.position.set(0.01, 0.29, 0);
    g.add(wrap);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), flameMat);
    flame.position.set(0.015, 0.4, 0);
    g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.1, 6), flameCoreMat);
    core.position.set(0.015, 0.39, 0.005);
    g.add(core);
    g.rotation.set(0.05, 0, -0.08);
    return g;
  }

  swing() {
    this.swingT = 0;
  }

  update(dt: number, movingSpeed: number) {
    this.time += dt;
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt * 4.2);
    const s = Math.sin(this.swingT * Math.PI);

    this.bob += (Math.min(1, movingSpeed / 5) - this.bob) * Math.min(1, dt * 7);
    const bobX = Math.sin(this.time * 8.5) * 0.012 * this.bob;
    const bobY = Math.abs(Math.cos(this.time * 8.5)) * 0.012 * this.bob;
    const idle = Math.sin(this.time * 1.4) * 0.003;

    this.holder.position.set(
      this.basePos.x + bobX - s * 0.06,
      this.basePos.y + bobY + idle - s * 0.1,
      this.basePos.z + s * 0.1,
    );
    this.holder.rotation.set(
      this.baseRot.x - s * 0.85,
      this.baseRot.y + s * 0.18,
      this.baseRot.z + s * 0.2 + bobX * 0.4,
      'YXZ',
    );
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }
}
