import * as THREE from 'three';
import { NetPlayer, RemoteState } from './net';
import { survivorModels } from './survivorvisual';
import { hashStringToSeed } from './noise';

interface Avatar {
  id: string;
  root: THREE.Group;
  visual: ReturnType<typeof survivorModels.create>;
  label: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  name: string;
  color: string;
  hasState: boolean;
  target: THREE.Vector3;
  targetYaw: number;
  dead: boolean;
}

function makeLabel(name: string, color: string): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const text = name.slice(0, 16);
  ctx.font = '600 42px Inter, system-ui, sans-serif';
  const width = Math.min(480, Math.max(140, ctx.measureText(text).width + 52));
  const x = (canvas.width - width) / 2;
  ctx.fillStyle = 'rgba(10, 9, 7, 0.68)';
  ctx.beginPath();
  ctx.roundRect(x, 24, width, 64, 18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, 24, width, 64, 18);
  ctx.stroke();
  ctx.fillStyle = '#f4ead7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, 58);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  }));
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.y = 2.08;
  return { sprite, texture };
}

export class RemotePlayers {
  readonly group = new THREE.Group();
  private avatars = new Map<string, Avatar>();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'remote-players';
    scene.add(this.group);
    void survivorModels.load().catch((err) => console.error('survivor models failed', err));
  }

  update(dt: number, players: Map<string, NetPlayer>, selfId: string) {
    const seen = new Set<string>();
    for (const player of players.values()) {
      if (player.id === selfId || !player.state) continue;
      seen.add(player.id);
      let avatar = this.avatars.get(player.id);
      if (!avatar && survivorModels.loaded) {
        avatar = this.createAvatar(player);
        this.avatars.set(player.id, avatar);
      }
      if (!avatar) continue;
      if (player.name !== avatar.name || player.color !== avatar.color) {
        avatar.name = player.name;
        avatar.color = player.color;
        avatar.root.remove(avatar.label);
        avatar.labelTexture.dispose();
        (avatar.label.material as THREE.SpriteMaterial).dispose();
        const next = makeLabel(player.name, player.color);
        avatar.label = next.sprite;
        avatar.labelTexture = next.texture;
        avatar.root.add(avatar.label);
      }
      this.applyState(avatar, player.state, dt);
    }
    for (const [id, avatar] of this.avatars) {
      if (seen.has(id)) continue;
      this.removeAvatar(avatar);
      this.avatars.delete(id);
    }
    this.group.visible = this.avatars.size > 0;
  }

  clear() {
    for (const avatar of this.avatars.values()) this.removeAvatar(avatar);
    this.avatars.clear();
    this.group.visible = false;
  }

  get count(): number {
    return this.avatars.size;
  }

  debug() {
    return [...this.avatars.values()].map((a) => ({
      id: a.id, name: a.name, rotY: a.root.rotation.y,
      targetYaw: a.targetYaw, x: a.root.position.x, y: a.root.position.y, z: a.root.position.z,
    }));
  }

  private createAvatar(player: NetPlayer): Avatar {
    const root = new THREE.Group();
    const visual = survivorModels.create(hashStringToSeed(player.id));
    root.add(visual.root);
    const label = makeLabel(player.name, player.color);
    root.add(label.sprite);
    this.group.add(root);
    return {
      id: player.id,
      root,
      visual,
      label: label.sprite,
      labelTexture: label.texture,
      name: player.name,
      color: player.color,
      hasState: false,
      target: new THREE.Vector3(),
      targetYaw: 0,
      dead: false,
    };
  }

  private applyState(avatar: Avatar, state: RemoteState, dt: number) {
    avatar.target.set(state.x, state.y, state.z);
    avatar.targetYaw = state.yaw + Math.PI;
    if (!avatar.hasState) {
      avatar.hasState = true;
      avatar.root.position.copy(avatar.target);
      avatar.root.rotation.y = avatar.targetYaw;
    } else {
      const k = 1 - Math.exp(-Math.min(0.1, dt) * 11);
      avatar.root.position.lerp(avatar.target, k);
      let diff = avatar.targetYaw - avatar.root.rotation.y;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      avatar.root.rotation.y += diff * Math.min(1, dt * 14);
    }
    avatar.dead = state.dead;
    avatar.root.visible = !state.dead;
    avatar.visual.setDead(state.dead);
    avatar.visual.update(dt, state.speed);
  }

  private removeAvatar(avatar: Avatar) {
    avatar.root.removeFromParent();
    avatar.visual.dispose();
    avatar.labelTexture.dispose();
    (avatar.label.material as THREE.SpriteMaterial).dispose();
  }
}
