import * as THREE from 'three';
import { mulberry32, noise2 } from './noise';

/* ------------------------------------------------------------------ */
/*  Block ids                                                          */
/* ------------------------------------------------------------------ */

export enum Block {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Log = 5,
  Leaves = 6,
  Water = 7,
  Planks = 8,
  Cobble = 9,
  Glass = 10,
  CoalOre = 11,
  IronOre = 12,
  Bedrock = 13,
  Gravel = 14,
  Snow = 15,
  Torch = 16,
  Asphalt = 17,
  RoadLine = 18,
  Concrete = 19,
  Brick = 20,
  Plaster = 21,
  Metal = 22,
  Crate = 23,
  Cabinet = 24,
  Safe = 25,
  Fridge = 26,
  Trash = 27,
  MedCabinet = 28,
  Shingles = 29,
  Fence = 34,
  Awning = 35,
  Siding = 36,
  RoofRed = 37,
  SpikeTrap = 38,
}

export type ContainerKind = 'crate' | 'cabinet' | 'safe' | 'fridge' | 'trash' | 'medcab' | 'car';
export type ToolKind = 'axe' | 'pickaxe' | 'club' | 'bat' | 'machete' | 'steelaxe' | 'steelpick' | 'pistol' | 'bow';
export type MaterialKind = 'dirt' | 'stone' | 'wood' | 'leaves' | 'sand' | 'glass' | 'water' | 'snow' | 'ore' | 'metal';

export interface BlockDef {
  id: Block;
  name: string;
  top: number;
  bottom: number;
  side: number;
  solid: boolean;
  opaque: boolean;
  transparent: boolean;
  liquid: boolean;
  hardness: number;
  material: MaterialKind;
  color: number;
  container?: ContainerKind;
}

export const BLOCKS: Record<number, BlockDef> = {};

function def(
  id: Block,
  name: string,
  top: number,
  side: number,
  opts: Partial<BlockDef> = {},
  bottom = 2,
): BlockDef {
  const d: BlockDef = {
    id,
    name,
    top,
    bottom,
    side,
    solid: true,
    opaque: true,
    transparent: false,
    liquid: false,
    hardness: 1,
    material: 'stone',
    color: 0x888888,
    ...opts,
  };
  BLOCKS[id] = d;
  return d;
}

def(Block.Grass, 'Трава', 0, 1, { hardness: 0.75, material: 'dirt', color: 0x759a48 }, 2);
def(Block.Dirt, 'Земля', 2, 2, { hardness: 0.65, material: 'dirt', color: 0x7b5a3b });
def(Block.Stone, 'Камень', 3, 3, { hardness: 2.6, material: 'stone', color: 0x888786 });
def(Block.Sand, 'Песок', 4, 4, { hardness: 0.55, material: 'sand', color: 0xd6c48c });
def(Block.Log, 'Бревно', 6, 5, { hardness: 1.6, material: 'wood', color: 0x7a5732 }, 6);
def(Block.Leaves, 'Листва', 7, 7, { hardness: 0.35, material: 'leaves', color: 0x4f7638 });
def(Block.Water, 'Вода', 8, 8, {
  hardness: Infinity,
  material: 'water',
  color: 0x2e668c,
  solid: false,
  opaque: false,
  transparent: true,
  liquid: true,
});
def(Block.Planks, 'Доски', 9, 9, { hardness: 1.3, material: 'wood', color: 0xa17a4a });
def(Block.Cobble, 'Булыжник', 10, 10, { hardness: 2.4, material: 'stone', color: 0x7d7c78 });
def(Block.Glass, 'Стекло', 11, 11, {
  hardness: 0.4,
  material: 'glass',
  color: 0xbcd7de,
  opaque: false,
  transparent: true,
});
def(Block.CoalOre, 'Угольная руда', 12, 12, { hardness: 3.2, material: 'ore', color: 0x666259 });
def(Block.IronOre, 'Железная руда', 13, 13, { hardness: 3.8, material: 'ore', color: 0x9b7b5e });
def(Block.Bedrock, 'Коренная порода', 14, 14, { hardness: Infinity, material: 'stone', color: 0x3a3835 });
def(Block.Gravel, 'Гравий', 15, 15, { hardness: 0.8, material: 'stone', color: 0x8a847b });
def(Block.Snow, 'Снег', 16, 16, { hardness: 0.45, material: 'snow', color: 0xeaf1f2 });
def(Block.Torch, 'Факел', 17, 17, {
  hardness: 0.12,
  material: 'wood',
  color: 0xff9f3d,
  solid: false,
  opaque: false,
  transparent: true,
});
def(Block.Asphalt, 'Асфальт', 21, 21, { hardness: 2.2, material: 'stone', color: 0x4d4d4c });
def(Block.RoadLine, 'Разметка', 22, 22, { hardness: 2.2, material: 'stone', color: 0x8f7d32 });
def(Block.Concrete, 'Бетон', 23, 23, { hardness: 2.8, material: 'stone', color: 0x8d8d86 });
def(Block.Brick, 'Кирпич', 24, 24, { hardness: 2.4, material: 'stone', color: 0x8c5a45 });
def(Block.Plaster, 'Штукатурка', 25, 25, { hardness: 1.7, material: 'stone', color: 0xb9ab91 });
def(Block.Metal, 'Ржавый металл', 26, 26, { hardness: 3.4, material: 'metal', color: 0x7d6552 });
def(Block.Crate, 'Деревянный ящик', 27, 27, {
  hardness: 1.4, material: 'wood', color: 0x8c673c, container: 'crate',
});
def(Block.Cabinet, 'Шкаф', 28, 28, {
  hardness: 1.8, material: 'wood', color: 0x6f583e, container: 'cabinet',
});
def(Block.Safe, 'Сейф', 29, 29, {
  hardness: 4.4, material: 'metal', color: 0x5b5d5e, container: 'safe',
});
def(Block.Fridge, 'Холодильник', 30, 30, {
  hardness: 1.5, material: 'metal', color: 0xcfd4d2, container: 'fridge',
});
def(Block.Trash, 'Мусорный бак', 31, 31, {
  hardness: 1.1, material: 'wood', color: 0x4d5a4b, container: 'trash',
});
def(Block.MedCabinet, 'Медицинский шкаф', 32, 32, {
  hardness: 1.2, material: 'metal', color: 0xe0e3df, container: 'medcab',
});
def(Block.Shingles, 'Кровельная черепица', 33, 33, {
  hardness: 1.2, material: 'wood', color: 0x4f4236,
});
def(Block.Fence, 'Забор', 34, 34, { hardness: 0.9, material: 'wood', color: 0x6c5638 });
def(Block.Awning, 'Навес', 35, 35, { hardness: 0.5, material: 'wood', color: 0xa8463c });
def(Block.Siding, 'Сайдинг', 36, 36, { hardness: 1.1, material: 'wood', color: 0x9a9c8d });
def(Block.RoofRed, 'Черепица', 37, 37, { hardness: 1.2, material: 'stone', color: 0x8a4433 });
def(Block.SpikeTrap, 'Шипы', 38, 38, {
  hardness: 0.7, material: 'metal', color: 0x5a5047,
});

export function blockDef(id: number): BlockDef | undefined {
  return BLOCKS[id];
}

export function isSolidBlock(id: number): boolean {
  const b = BLOCKS[id];
  return !!b && b.solid;
}

/* ------------------------------------------------------------------ */
/*  Procedural texture atlas                                           */
/* ------------------------------------------------------------------ */

export const TILE = 32;
const COLS = 8;
const ATLAS_SIZE = TILE * COLS;

type Ctx = CanvasRenderingContext2D;

function makeCanvas(size: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function rgb(base: [number, number, number], delta: number, rng: () => number): [number, number, number] {
  const d = (rng() - 0.5) * delta;
  return [base[0] + d, base[1] + d, base[2] + d];
}

function fillNoise(ctx: Ctx, base: [number, number, number], spread: number, rng: () => number, scale = 1) {
  const img = ctx.createImageData(TILE, TILE);
  const d = img.data;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const clump = noise2((x / TILE) * 5 * scale, (y / TILE) * 5 * scale, 991) * 0.5;
      const c = rgb(base, spread, rng);
      const i = (y * TILE + x) * 4;
      d[i] = Math.max(0, Math.min(255, c[0] + clump * spread * 0.9));
      d[i + 1] = Math.max(0, Math.min(255, c[1] + clump * spread * 0.9));
      d[i + 2] = Math.max(0, Math.min(255, c[2] + clump * spread * 0.9));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

const tileCanvases: HTMLCanvasElement[] = [];

function tile(index: number, draw: (ctx: Ctx, rng: () => number) => void) {
  const [c, ctx] = makeCanvas(TILE);
  const rng = mulberry32(9001 + index * 7919);
  ctx.imageSmoothingEnabled = false;
  draw(ctx, rng);
  tileCanvases[index] = c;
}

function makeTextures() {
  // 0 — grass top
  tile(0, (ctx, rng) => {
    fillNoise(ctx, [76, 99, 54], 32, rng);
    for (let i = 0; i < 90; i++) {
      const x = (rng() * TILE) | 0;
      const y = (rng() * TILE) | 0;
      const bright = rng() > 0.5;
      px(ctx, x, y, 1, 1, bright ? 'rgba(123,144,76,0.55)' : 'rgba(45,66,32,0.62)');
    }
    for (let i = 0; i < 8; i++) {
      const x = (rng() * TILE) | 0;
      const y = (rng() * TILE) | 0;
      px(ctx, x, y, 1, 2, 'rgba(98,124,59,0.72)');
      px(ctx, x + 1, y - 1, 1, 1, 'rgba(98,124,59,0.62)');
    }
    for (let i = 0; i < 4; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 2, 1, 'rgba(146,147,84,0.24)');
    }
  });

  // 1 — grass side
  tile(1, (ctx, rng) => {
    fillNoise(ctx, [116, 82, 53], 32, rng);
    for (let i = 0; i < 50; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 1, 1, rng() > 0.5 ? 'rgba(78,52,33,0.5)' : 'rgba(148,110,72,0.5)');
    }
    // grass overhang along top
    for (let x = 0; x < TILE; x++) {
      const depth = 5 + Math.floor(noise2(x * 0.3, 4, 55) * 3) + (rng() > 0.7 ? 2 : 0);
      for (let y = 0; y < depth; y++) {
        const c = y < depth - 2 ? [90, 124, 56] : [77, 105, 48];
        const v = (rng() - 0.5) * 26;
        px(ctx, x, y, 1, 1, `rgb(${c[0] + v | 0},${c[1] + v | 0},${c[2] + v | 0})`);
      }
      if (rng() > 0.82) px(ctx, x, depth, 1, 1, 'rgba(78,104,45,0.7)');
    }
  });

  // 2 — dirt
  tile(2, (ctx, rng) => {
    fillNoise(ctx, [111, 79, 52], 30, rng);
    for (let i = 0; i < 40; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      px(ctx, x, y, 1 + (rng() * 2 | 0), 1, rng() > 0.5 ? 'rgba(83,56,36,0.6)' : 'rgba(143,105,72,0.5)');
    }
    for (let i = 0; i < 6; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 2, 2, 'rgba(91,64,42,0.4)');
    }
  });

  // 3 — stone
  tile(3, (ctx, rng) => {
    fillNoise(ctx, [126, 125, 121], 26, rng);
    // dark cracks
    for (let i = 0; i < 4; i++) {
      let x = rng() * TILE;
      let y = rng() * TILE;
      for (let s = 0; s < 7; s++) {
        px(ctx, x, y, 1, 1, 'rgba(86,85,82,0.75)');
        x += (rng() - 0.5) * 3;
        y += rng() * 2;
      }
    }
    for (let i = 0; i < 9; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 1 + (rng() * 2 | 0), 1, 'rgba(158,157,152,0.55)');
    }
    for (let i = 0; i < 4; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 2, 1, 'rgba(101,100,97,0.4)');
    }
  });

  // 4 — sand
  tile(4, (ctx, rng) => {
    fillNoise(ctx, [207, 188, 137], 22, rng);
    for (let i = 0; i < 80; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 1, 1, rng() > 0.5 ? 'rgba(228,212,166,0.5)' : 'rgba(176,155,108,0.4)');
    }
    for (let i = 0; i < 5; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 3, 1, 'rgba(188,168,120,0.35)');
    }
  });

  // 5 — log side
  tile(5, (ctx, rng) => {
    fillNoise(ctx, [104, 75, 46], 22, rng);
    for (let x = 0; x < TILE; x++) {
      const dark = noise2(x * 0.45, 3, 17);
      for (let y = 0; y < TILE; y++) {
        if (rng() < 0.16) {
          px(ctx, x, y, 1, 1 + (rng() * 3 | 0), dark > 0 ? 'rgba(72,49,29,0.5)' : 'rgba(134,99,62,0.4)');
        }
      }
    }
    // deep grooves
    for (let x = 3; x < TILE; x += 6) {
      const ox = Math.floor(noise2(x, 1, 8) * 2);
      for (let y = 0; y < TILE; y++) {
        if (rng() > 0.18) px(ctx, x + ox, y, 1, 1, 'rgba(61,42,25,0.5)');
      }
    }
    // knot
    px(ctx, 19, 20, 4, 4, 'rgba(70,48,28,0.6)');
    px(ctx, 20, 21, 2, 2, 'rgba(120,86,51,0.8)');
  });

  // 6 — log top
  tile(6, (ctx, rng) => {
    fillNoise(ctx, [137, 103, 62], 18, rng);
    const cx = 16;
    const cy = 16;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > 14.5) {
          px(ctx, x, y, 1, 1, rng() > 0.4 ? 'rgba(82,57,33,0.9)' : 'rgba(101,72,41,0.9)');
        } else {
          const ring = Math.sin(dist * 1.45) > 0.15;
          if (ring) px(ctx, x, y, 1, 1, 'rgba(116,84,49,0.5)');
          if (dist > 2 && dist < 3.5) px(ctx, x, y, 1, 1, 'rgba(95,66,38,0.55)');
        }
      }
    }
    // radial crack
    for (let r = 2; r < 13; r++) {
      px(ctx, cx + r, cy + Math.floor(r * 0.25), 1, 1, 'rgba(70,47,26,0.55)');
    }
  });

  // 7 — leaves
  tile(7, (ctx, rng) => {
    const img = ctx.createImageData(TILE, TILE);
    const d = img.data;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const clump = noise2(x * 0.33, y * 0.33, 404) * 0.5 + 0.5;
        const v = 0.62 + clump * 0.72 + (rng() - 0.5) * 0.3;
        const i = (y * TILE + x) * 4;
        d[i] = 52 * v;
        d[i + 1] = 88 * v;
        d[i + 2] = 39 * v;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 55; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      px(ctx, x, y, 1, 1, rng() > 0.55 ? 'rgba(108,142,63,0.65)' : 'rgba(37,62,29,0.6)');
    }
    for (let i = 0; i < 8; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 2, 1, 'rgba(31,52,25,0.55)');
    }
  });

  // 8 — water
  tile(8, (ctx, rng) => {
    fillNoise(ctx, [43, 92, 128], 12, rng);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const w = Math.sin(x * 0.35 + y * 0.15) + Math.sin(x * 0.12 - y * 0.4);
        if (w > 1.35) px(ctx, x, y, 1, 1, 'rgba(115,168,196,0.35)');
        if (w < -1.5) px(ctx, x, y, 1, 1, 'rgba(28,65,96,0.35)');
      }
    }
    for (let i = 0; i < 14; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 2 + (rng() * 3 | 0), 1, 'rgba(160,203,218,0.22)');
    }
  });

  // 9 — planks
  tile(9, (ctx, rng) => {
    fillNoise(ctx, [154, 114, 68], 20, rng);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (y % 8 === 0) px(ctx, x, y, 1, 1, 'rgba(88,61,33,0.85)');
        else if (y % 8 === 1) px(ctx, x, y, 1, 1, 'rgba(190,148,94,0.3)');
        else if (rng() < 0.08) px(ctx, x, y, 1 + (rng() * 3 | 0), 1, 'rgba(120,84,47,0.4)');
      }
    }
    // board joints
    px(ctx, 21, 1, 1, 6, 'rgba(84,57,31,0.8)');
    px(ctx, 9, 9, 1, 6, 'rgba(84,57,31,0.8)');
    px(ctx, 25, 17, 1, 6, 'rgba(84,57,31,0.8)');
    px(ctx, 15, 25, 1, 6, 'rgba(84,57,31,0.8)');
    // nails
    for (let i = 0; i < 5; i++) {
      const x = 4 + (rng() * 24 | 0);
      const y = 4 + ((rng() * 4 | 0) * 8);
      px(ctx, x, y, 1, 1, 'rgba(70,68,64,0.8)');
    }
  });

  // 10 — cobblestone
  tile(10, (ctx, rng) => {
    fillNoise(ctx, [78, 77, 74], 18, rng);
    const stones: [number, number, number, number][] = [];
    for (let i = 0; i < 11; i++) {
      let x = rng() * TILE;
      let y = rng() * TILE;
      const w = 5 + rng() * 6;
      const h = 4 + rng() * 5;
      stones.push([x, y, w, h]);
      const shade = 105 + rng() * 38;
      ctx.fillStyle = `rgb(${shade | 0},${shade - 2 | 0},${shade - 5 | 0})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.ellipse(x - w * 0.12, y - h * 0.16, w / 3, h / 4, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 60; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 1, 1, rng() > 0.5 ? 'rgba(155,154,150,0.35)' : 'rgba(50,49,47,0.4)');
    }
  });

  // 11 — glass (alpha)
  tile(11, (ctx, rng) => {
    const img = ctx.createImageData(TILE, TILE);
    const d = img.data;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const edge = x < 2 || y < 2 || x > TILE - 3 || y > TILE - 3;
        const shine = (x + y > 10 && x + y < 18) || (x + y > 36 && x + y < 40);
        const i = (y * TILE + x) * 4;
        if (edge) {
          d[i] = 188; d[i + 1] = 220; d[i + 2] = 229; d[i + 3] = 225;
        } else if (shine) {
          d[i] = 210; d[i + 1] = 237; d[i + 2] = 243; d[i + 3] = 85;
        } else {
          d[i] = 160; d[i + 1] = 205; d[i + 2] = 218; d[i + 3] = 30;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    px(ctx, 3, 3, 2, 1, 'rgba(255,255,255,0.25)');
  });

  // 12 — coal ore
  tile(12, (ctx, rng) => {
    fillNoise(ctx, [118, 117, 113], 24, rng);
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) spots.push([rng() * TILE, rng() * TILE, 2 + rng() * 2.5]);
    for (const [x, y, r] of spots) {
      ctx.fillStyle = 'rgba(35,34,33,0.92)';
      ctx.beginPath(); ctx.ellipse(x, y, r + 1.3, r + 0.9, rng() * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(71,69,65,0.9)';
      ctx.beginPath(); ctx.ellipse(x - 1, y - 1, r * 0.55, r * 0.4, rng() * 3, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 45; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(93,92,89,0.4)');
  });

  // 13 — iron ore
  tile(13, (ctx, rng) => {
    fillNoise(ctx, [120, 118, 113], 22, rng);
    for (let i = 0; i < 8; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      const r = 1.4 + rng() * 2.2;
      ctx.fillStyle = 'rgba(107,72,47,0.85)';
      ctx.beginPath(); ctx.ellipse(x, y, r + 1, r, rng() * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(205,148,101,0.95)';
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 0.6, rng() * 3, 0, Math.PI * 2); ctx.fill();
      px(ctx, x - 1, y - 1, 1, 1, 'rgba(238,190,142,0.9)');
    }
    for (let i = 0; i < 45; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(93,92,89,0.4)');
  });

  // 14 — bedrock
  tile(14, (ctx, rng) => {
    fillNoise(ctx, [48, 46, 44], 20, rng);
    for (let i = 0; i < 28; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 1 + (rng() * 4 | 0), 1 + (rng() * 2 | 0), rng() > 0.5 ? 'rgba(26,25,24,0.35)' : 'rgba(74,71,67,0.5)');
    }
  });

  // 15 — gravel
  tile(15, (ctx, rng) => {
    fillNoise(ctx, [112, 107, 99], 26, rng);
    for (let i = 0; i < 26; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      const r = 1 + rng() * 2.4;
      const s = 80 + rng() * 68;
      ctx.fillStyle = `rgb(${s | 0},${s - 3 | 0},${s - 8 | 0})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, rng() * 3, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 40; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(70,67,62,0.4)');
  });

  // 16 — snow
  tile(16, (ctx, rng) => {
    fillNoise(ctx, [236, 242, 243], 12, rng);
    for (let i = 0; i < 30; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(192,211,221,0.5)');
    for (let i = 0; i < 14; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(255,255,255,0.85)');
    for (let i = 0; i < 4; i++) px(ctx, rng() * TILE, rng() * TILE, 2, 1, 'rgba(208,224,232,0.35)');
  });
  // 17 — torch
  tile(17, (ctx, rng) => {
    // stick
    ctx.fillStyle = 'rgba(54,35,18,0.95)';
    ctx.fillRect(14, 13, 5, 17);
    ctx.fillStyle = '#8a6033';
    ctx.fillRect(15, 13, 3, 17);
    ctx.fillStyle = 'rgba(198,151,91,0.65)';
    ctx.fillRect(15, 13, 1, 15);
    // binding
    ctx.fillStyle = '#4a321a';
    ctx.fillRect(13, 14, 7, 2);
    // flame
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ff7a1e';
    ctx.beginPath(); ctx.ellipse(16, 9, 5.5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb13a';
    ctx.beginPath(); ctx.ellipse(16, 9.5, 3.6, 5.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath(); ctx.ellipse(16, 10.5, 1.9, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,230,0.95)';
    ctx.fillRect(15, 10, 2, 2);
    ctx.globalAlpha = 1;
    // embers
    for (let i = 0; i < 4; i++) {
      px(ctx, 12 + rng() * 8, 3 + rng() * 5, 1, 1, 'rgba(255,180,80,0.8)');
    }
  });
  // 18 — grass tuft (decor)
  tile(18, (ctx, rng) => {
    for (let i = 0; i < 11; i++) {
      const x = 3 + rng() * 26;
      const h = 8 + rng() * 18;
      const lean = (rng() - 0.5) * 8;
      for (let y = 0; y < h; y++) {
        const px0 = x + lean * (y / h);
        const shade = 70 + (y / h) * 60 + rng() * 20;
        px(ctx, px0, 31 - y, 1, 1, `rgba(${shade * 0.65 | 0},${shade | 0},${shade * 0.4 | 0},0.95)`);
      }
    }
    for (let i = 0; i < 5; i++) {
      px(ctx, 4 + rng() * 24, 12 + rng() * 18, 1, 1, 'rgba(140,170,80,0.8)');
    }
  });

  // 19 — red flower
  tile(19, (ctx, rng) => {
    ctx.strokeStyle = '#4d6b2e';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, 31); ctx.lineTo(16, 14); ctx.stroke();
    px(ctx, 12, 23, 4, 1, '#4d6b2e');
    px(ctx, 17, 20, 4, 1, '#4d6b2e');
    ctx.fillStyle = '#c23a2b';
    ctx.beginPath(); ctx.ellipse(16, 11, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e46a4b';
    ctx.beginPath(); ctx.ellipse(15, 10, 2.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    px(ctx, 16, 11, 2, 2, '#f2c24a');
  });

  // 20 — yellow flower
  tile(20, (ctx, rng) => {
    ctx.strokeStyle = '#4d6b2e';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, 31); ctx.lineTo(16, 15); ctx.stroke();
    px(ctx, 12, 24, 4, 1, '#4d6b2e');
    px(ctx, 17, 21, 4, 1, '#4d6b2e');
    ctx.fillStyle = '#d9a72e';
    ctx.beginPath(); ctx.ellipse(16, 12, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2d268';
    ctx.beginPath(); ctx.ellipse(15, 11, 2.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    px(ctx, 16, 12, 2, 2, '#7b4a1e');
  });

  // 21 — asphalt
  tile(21, (ctx, rng) => {
    fillNoise(ctx, [70, 70, 69], 20, rng);
    for (let i = 0; i < 90; i++) {
      px(ctx, rng() * TILE, rng() * TILE, 1, 1, rng() > 0.5 ? 'rgba(49,49,48,0.65)' : 'rgba(107,107,103,0.5)');
    }
    for (let i = 0; i < 3; i++) {
      let x = rng() * TILE;
      let y = rng() * TILE;
      for (let s = 0; s < 8; s++) {
        px(ctx, x, y, 1, 1, 'rgba(40,40,39,0.55)');
        x += (rng() - 0.5) * 3;
        y += rng() * 2;
      }
    }
  });

  // 22 — asphalt center line
  tile(22, (ctx, rng) => {
    fillNoise(ctx, [70, 70, 69], 18, rng);
    for (let i = 0; i < 55; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(49,49,48,0.55)');
    ctx.fillStyle = 'rgba(196,166,62,0.9)';
    ctx.fillRect(13, 0, 6, TILE);
    ctx.fillStyle = 'rgba(238,207,102,0.55)';
    ctx.fillRect(14, 0, 2, TILE);
  });

  // 23 — concrete
  tile(23, (ctx, rng) => {
    fillNoise(ctx, [142, 142, 136], 20, rng);
    for (let i = 0; i < 30; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(119,119,113,0.6)');
    for (let i = 0; i < 4; i++) {
      let x = rng() * TILE;
      let y = rng() * TILE;
      for (let s = 0; s < 6; s++) {
        px(ctx, x, y, 1, 1, 'rgba(103,102,96,0.5)');
        x += (rng() - 0.5) * 2;
        y += rng() * 2;
      }
    }
    for (let i = 0; i < 3; i++) px(ctx, rng() * TILE, rng() * TILE, 4, 1, 'rgba(117,115,105,0.35)');
  });

  // 24 — brick
  tile(24, (ctx, rng) => {
    fillNoise(ctx, [155, 146, 132], 12, rng);
    const bw = 12;
    const bh = 8;
    const tones = [[145, 83, 61], [128, 69, 50], [158, 96, 70], [117, 63, 47]];
    for (let row = 0; row < 4; row++) {
      const off = row % 2 === 0 ? 0 : -6;
      for (let col = -1; col < 4; col++) {
        const x = col * bw + off;
        const y = row * bh;
        const t = tones[(rng() * tones.length) | 0];
        ctx.fillStyle = `rgb(${t[0]},${t[1]},${t[2]})`;
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 1, y + 1, bw - 2, 1);
        ctx.fillStyle = 'rgba(60,35,25,0.18)';
        ctx.fillRect(x + 1, y + bh - 2, bw - 2, 1);
      }
    }
    for (let i = 0; i < 25; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(80,55,40,0.28)');
  });

  // 25 — plaster
  tile(25, (ctx, rng) => {
    fillNoise(ctx, [178, 167, 146], 20, rng);
    for (let i = 0; i < 18; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(143,132,112,0.45)');
    for (let i = 0; i < 3; i++) {
      let x = rng() * TILE;
      let y = rng() * TILE;
      for (let s = 0; s < 5; s++) {
        px(ctx, x, y, 1, 1, 'rgba(125,114,95,0.5)');
        x += (rng() - 0.5) * 2;
        y += rng() * 2;
      }
    }
    for (let i = 0; i < 2; i++) {
      const x = rng() * TILE;
      px(ctx, x, 4 + rng() * 20, 3, 6, 'rgba(129,115,94,0.2)');
    }
  });

  // 26 — rusty metal
  tile(26, (ctx, rng) => {
    fillNoise(ctx, [121, 99, 80], 18, rng);
    for (let x = 0; x < TILE; x += 4) {
      px(ctx, x, 0, 1, TILE, 'rgba(74,57,45,0.45)');
      px(ctx, x + 1, 0, 1, TILE, 'rgba(158,130,104,0.18)');
    }
    for (let i = 0; i < 16; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      ctx.fillStyle = 'rgba(142,77,41,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y, 2 + rng() * 4, 1 + rng() * 3, rng() * 3, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 5; i++) px(ctx, 3 + rng() * 26, 4 + rng() * 24, 1, 1, 'rgba(198,188,168,0.45)');
  });

  // 27 — crate
  tile(27, (ctx, rng) => {
    fillNoise(ctx, [139, 100, 58], 16, rng);
    for (let y = 0; y < TILE; y += 8) px(ctx, 0, y, TILE, 1, 'rgba(77,50,24,0.7)');
    ctx.strokeStyle = 'rgba(60,39,19,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 28, 28);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(28, 28); ctx.stroke();
    ctx.strokeStyle = 'rgba(33,34,33,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(3, 13); ctx.lineTo(29, 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 20); ctx.lineTo(29, 20); ctx.stroke();
    for (const [x, y] of [[4, 4], [27, 4], [4, 27], [27, 27], [4, 13], [27, 13], [4, 20], [27, 20]] as const) {
      px(ctx, x, y, 2, 2, 'rgba(48,49,47,0.9)');
    }
    for (let i = 0; i < 15; i++) px(ctx, rng() * TILE, rng() * TILE, 1 + (rng() * 3 | 0), 1, 'rgba(110,74,39,0.4)');
  });

  // 28 — cabinet
  tile(28, (ctx, rng) => {
    fillNoise(ctx, [107, 84, 60], 14, rng);
    for (let y = 0; y < TILE; y += 9) px(ctx, 0, y, TILE, 1, 'rgba(65,48,32,0.55)');
    ctx.strokeStyle = 'rgba(45,32,20,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 28, 28);
    ctx.strokeStyle = 'rgba(62,44,28,0.8)';
    ctx.beginPath(); ctx.moveTo(16, 3); ctx.lineTo(16, 29); ctx.stroke();
    ctx.fillStyle = 'rgba(222,190,126,0.8)';
    ctx.fillRect(12, 15, 2, 4);
    ctx.fillRect(18, 15, 2, 4);
    ctx.fillStyle = 'rgba(158,121,79,0.35)';
    ctx.fillRect(4, 4, 10, 1);
    for (let i = 0; i < 10; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(55,38,23,0.3)');
  });

  // 29 — safe
  tile(29, (ctx, rng) => {
    fillNoise(ctx, [78, 81, 82], 16, rng);
    ctx.strokeStyle = 'rgba(40,42,43,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 28, 28);
    ctx.strokeStyle = 'rgba(110,114,115,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(5, 5, 22, 22);
    ctx.fillStyle = 'rgba(39,41,42,0.95)';
    ctx.beginPath(); ctx.arc(16, 16, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(148,152,151,0.9)';
    ctx.beginPath(); ctx.arc(16, 16, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,42,43,0.95)';
    ctx.beginPath(); ctx.arc(16, 16, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,190,180,0.6)';
    ctx.fillRect(23, 14, 4, 3);
    for (const [x, y] of [[4, 4], [27, 4], [4, 27], [27, 27]]) px(ctx, x, y, 1, 1, 'rgba(190,190,180,0.5)');
    for (let i = 0; i < 8; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(120,84,56,0.25)');
  });

  // 30 — fridge
  tile(30, (ctx, rng) => {
    fillNoise(ctx, [207, 211, 207], 10, rng);
    ctx.strokeStyle = 'rgba(130,136,135,0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, 28, 28);
    px(ctx, 3, 12, 26, 1, 'rgba(142,148,146,0.8)');
    ctx.fillStyle = 'rgba(120,126,125,0.85)';
    ctx.fillRect(25, 6, 2, 5);
    ctx.fillRect(25, 16, 2, 8);
    for (let i = 0; i < 6; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(174,178,174,0.4)');
  });

  // 31 — trash bin
  tile(31, (ctx, rng) => {
    fillNoise(ctx, [58, 74, 61], 16, rng);
    ctx.strokeStyle = 'rgba(35,47,37,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 4, 26, 26);
    for (let x = 7; x < 30; x += 5) px(ctx, x, 6, 1, 22, 'rgba(40,54,42,0.5)');
    px(ctx, 2, 4, 28, 3, 'rgba(33,43,35,0.9)');
    px(ctx, 2, 3, 28, 1, 'rgba(96,112,92,0.5)');
    ctx.fillStyle = 'rgba(111,124,104,0.55)';
    ctx.fillRect(12, 15, 4, 2);
    ctx.fillRect(18, 20, 5, 1);
  });

  // 32 — medical cabinet
  tile(32, (ctx, rng) => {
    fillNoise(ctx, [217, 221, 216], 10, rng);
    ctx.strokeStyle = 'rgba(137,143,138,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 28, 28);
    ctx.fillStyle = 'rgba(186,52,41,0.9)';
    ctx.fillRect(13, 7, 6, 18);
    ctx.fillRect(7, 13, 18, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(14, 8, 1, 16);
    px(ctx, 24, 16, 4, 2, 'rgba(120,126,121,0.8)');
    for (let i = 0; i < 5; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(180,184,179,0.35)');
  });

  // 33 — roof shingles
  tile(33, (ctx, rng) => {
    fillNoise(ctx, [92, 78, 64], 14, rng);
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      const off = row % 2 === 0 ? 0 : -5;
      for (let col = -1; col < 4; col++) {
        const x = col * 10 + off;
        const shade = 82 + rng() * 30;
        ctx.fillStyle = `rgb(${shade | 0},${(shade * 0.84) | 0},${(shade * 0.68) | 0})`;
        ctx.fillRect(x + 1, y + 1, 9, 7);
        ctx.fillStyle = 'rgba(255,236,210,0.11)';
        ctx.fillRect(x + 1, y + 1, 9, 1);
        ctx.fillStyle = 'rgba(26,20,15,0.26)';
        ctx.fillRect(x + 1, y + 6, 9, 1);
      }
    }
    for (let i = 0; i < 22; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(52,42,33,0.32)');
  });

  // 34 — wooden fence
  tile(34, (ctx, rng) => {
    fillNoise(ctx, [38, 32, 24], 10, rng);
    for (let i = 0; i < 6; i++) {
      const x = 1 + i * 5 + (i % 2 === 0 ? 0 : 1);
      const shade = 92 + rng() * 26;
      ctx.fillStyle = `rgb(${shade | 0},${(shade * 0.78) | 0},${(shade * 0.52) | 0})`;
      ctx.fillRect(x, 1, 4, 30);
      ctx.fillStyle = 'rgba(255,236,200,0.12)';
      ctx.fillRect(x, 1, 1, 30);
      ctx.fillStyle = 'rgba(24,18,12,0.35)';
      ctx.fillRect(x + 3, 1, 1, 30);
    }
    px(ctx, 0, 8, TILE, 3, 'rgba(88,67,42,0.9)');
    px(ctx, 0, 21, TILE, 3, 'rgba(88,67,42,0.9)');
    for (let i = 0; i < 16; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(28,23,17,0.35)');
  });

  // 35 — striped awning
  tile(35, (ctx, rng) => {
    for (let x = 0; x < TILE; x += 8) {
      ctx.fillStyle = x % 16 === 0 ? '#a8463c' : '#d8c9ad';
      ctx.fillRect(x, 0, 8, TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, 0, 3, TILE);
      ctx.fillStyle = 'rgba(30,20,18,0.16)';
      ctx.fillRect(x + 6, 0, 2, TILE);
    }
    for (let i = 0; i < 40; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(46,32,26,0.12)');
    px(ctx, 0, TILE - 3, TILE, 2, 'rgba(60,40,30,0.35)');
  });

  // 36 — horizontal siding
  tile(36, (ctx, rng) => {
    fillNoise(ctx, [156, 158, 143], 8, rng);
    for (let y = 0; y < TILE; y += 6) {
      const shade = 146 + rng() * 22;
      ctx.fillStyle = `rgb(${shade | 0},${(shade * 1.01) | 0},${(shade * 0.9) | 0})`;
      ctx.fillRect(0, y, TILE, 5);
      px(ctx, 0, y, TILE, 1, 'rgba(255,255,245,0.22)');
      px(ctx, 0, y + 4, TILE, 1, 'rgba(46,48,40,0.3)');
    }
    for (let i = 0; i < 18; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(60,62,52,0.13)');
  });

  // 37 — red clay roof tiles
  tile(37, (ctx, rng) => {
    fillNoise(ctx, [116, 57, 43], 12, rng);
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      const off = row % 2 === 0 ? 0 : -5;
      for (let col = -1; col < 4; col++) {
        const x = col * 10 + off;
        const shade = 126 + rng() * 30;
        ctx.fillStyle = `rgb(${shade | 0},${(shade * 0.5) | 0},${(shade * 0.38) | 0})`;
        ctx.fillRect(x + 1, y + 1, 9, 7);
        ctx.fillStyle = 'rgba(255,220,190,0.14)';
        ctx.fillRect(x + 1, y + 1, 9, 1);
        ctx.fillStyle = 'rgba(38,16,12,0.3)';
        ctx.fillRect(x + 1, y + 6, 9, 1);
      }
    }
    for (let i = 0; i < 22; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(40,20,15,0.3)');
  });

  // 38 — spike trap
  tile(38, (ctx, rng) => {
    fillNoise(ctx, [66, 60, 53], 12, rng);
    ctx.strokeStyle = 'rgba(24,21,18,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30);
    for (let i = 0; i < 5; i++) {
      const x = 4 + i * 6;
      const y = 8 + (i % 2) * 5;
      ctx.fillStyle = 'rgba(23,21,18,0.9)';
      ctx.beginPath();
      ctx.moveTo(x - 3, y + 12); ctx.lineTo(x + 3, y + 12); ctx.lineTo(x, y - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(154,151,142,0.8)';
      ctx.beginPath();
      ctx.moveTo(x - 1, y + 9); ctx.lineTo(x + 1, y + 9); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 7; i++) px(ctx, rng() * TILE, rng() * TILE, 1, 1, 'rgba(120,63,37,0.35)');
  });
}

let atlasTexture: THREE.Texture | null = null;

export function getAtlas(): THREE.Texture {
  if (atlasTexture) return atlasTexture;
  makeTextures();
  const [atlas, ctx] = makeCanvas(ATLAS_SIZE);
  for (let i = 0; i < tileCanvases.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    ctx.drawImage(tileCanvases[i], col * TILE, row * TILE);
  }
  const tex = new THREE.CanvasTexture(atlas);
  tex.flipY = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  atlasTexture = tex;
  return tex;
}

export function tileUV(tileIndex: number): [number, number, number, number] {
  const col = tileIndex % COLS;
  const row = Math.floor(tileIndex / COLS);
  const inset = 0.02;
  const u0 = (col + inset) / COLS;
  const u1 = (col + 1 - inset) / COLS;
  const v0 = (row + inset) / COLS;
  const v1 = (row + 1 - inset) / COLS;
  return [u0, v0, u1, v1];
}

/* ------------------------------------------------------------------ */
/*  Items                                                              */
/* ------------------------------------------------------------------ */

export type ItemId = string;

export interface ToolStats {
  speedWood: number;
  speedStone: number;
  speedDirt: number;
  speedOre: number;
  damage: number;
  cooldown: number;
  label: string;
}

export const TOOLS: Record<string, ToolStats> = {
  axe: { speedWood: 4.5, speedStone: 1.35, speedDirt: 2.2, speedOre: 1.1, damage: 22, cooldown: 0.5, label: 'Топор' },
  pickaxe: { speedWood: 1.2, speedStone: 4.6, speedDirt: 1.4, speedOre: 4.6, damage: 16, cooldown: 0.55, label: 'Кирка' },
  club: { speedWood: 1.4, speedStone: 1.15, speedDirt: 1.2, speedOre: 1, damage: 28, cooldown: 0.72, label: 'Дубина' },
  bat: { speedWood: 1.6, speedStone: 1.1, speedDirt: 1.2, speedOre: 1, damage: 36, cooldown: 0.82, label: 'Бита' },
  machete: { speedWood: 2.0, speedStone: 1.1, speedDirt: 1.6, speedOre: 1, damage: 27, cooldown: 0.4, label: 'Мачете' },
  steelaxe: { speedWood: 6.2, speedStone: 2.2, speedDirt: 3.6, speedOre: 1.8, damage: 30, cooldown: 0.48, label: 'Стальной топор' },
  steelpick: { speedWood: 1.4, speedStone: 6.8, speedDirt: 1.6, speedOre: 6.6, damage: 22, cooldown: 0.52, label: 'Стальная кирка' },
  pistol: { speedWood: 1, speedStone: 1, speedDirt: 1, speedOre: 1, damage: 55, cooldown: 0.48, label: 'Пистолет' },
  bow: { speedWood: 1, speedStone: 1, speedDirt: 1, speedOre: 1, damage: 38, cooldown: 0.9, label: 'Лук' },
};

export interface ItemDef {
  id: ItemId;
  name: string;
  kind: 'block' | 'tool' | 'material' | 'consumable';
  block?: Block;
  tool?: ToolKind;
  icon: string;
  desc?: string;
  consumable?: { food?: number; water?: number; heal?: number };
}

const itemDefs = new Map<ItemId, ItemDef>();

export function blockItemId(id: Block): ItemId {
  return `block:${id}`;
}

function drawFace(
  ctx: Ctx,
  tileCanvas: HTMLCanvasElement,
  ox: number, oy: number,
  ux: number, uy: number,
  vx: number, vy: number,
  shade: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + ux, oy + uy);
  ctx.lineTo(ox + ux + vx, oy + uy + vy);
  ctx.lineTo(ox + vx, oy + vy);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(ux / TILE, uy / TILE, vx / TILE, vy / TILE, ox, oy);
  ctx.drawImage(tileCanvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (shade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${shade})`;
    ctx.fillRect(0, 0, 64, 64);
  }
  ctx.restore();
}

function makeTorchIcon(): string {
  const [c, ctx] = makeCanvas(64);
  const grad = ctx.createRadialGradient(32, 20, 2, 32, 20, 26);
  grad.addColorStop(0, 'rgba(255,200,90,0.55)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  // handle
  ctx.fillStyle = 'rgba(40,26,13,0.9)';
  ctx.fillRect(28, 26, 9, 32);
  ctx.fillStyle = '#8a6033';
  ctx.fillRect(30, 26, 5, 32);
  ctx.fillStyle = 'rgba(205,160,101,0.6)';
  ctx.fillRect(30, 26, 2, 29);
  ctx.fillStyle = '#4a321a';
  ctx.fillRect(26, 29, 13, 4);
  // flame
  ctx.fillStyle = '#ff7a1e';
  ctx.beginPath(); ctx.ellipse(32, 19, 11, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffb13a';
  ctx.beginPath(); ctx.ellipse(32, 20, 7, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  ctx.beginPath(); ctx.ellipse(32, 22, 3.6, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fffbe8';
  ctx.fillRect(30, 21, 4, 4);
  return c.toDataURL();
}

function makeBlockIcon(topIndex: number, sideIndex: number): string {
  const [c, ctx] = makeCanvas(64);
  ctx.imageSmoothingEnabled = false;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(32, 55, 21, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  drawFace(ctx, tileCanvases[topIndex], 32, 4, 26, 14, -26, 14, 0.0);
  drawFace(ctx, tileCanvases[sideIndex], 6, 18, 26, 14, 0, 26, 0.2);
  drawFace(ctx, tileCanvases[sideIndex], 32, 32, 26, -14, 0, 26, 0.38);
  return c.toDataURL();
}

const toolIconCache = new Map<string, string>();

function makeToolIcon(tool: ToolKind): string {
  const cached = toolIconCache.get(tool);
  if (cached) return cached;
  const [c, ctx] = makeCanvas(64);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const outline = 'rgba(31, 22, 14, 0.9)';
  const steel = tool.startsWith('steel');
  const metalMid = steel ? '#aeb4b1' : '#8b8b87';
  const metalLight = steel ? 'rgba(239,243,239,0.85)' : 'rgba(206,207,201,0.75)';
  const metalDark = steel ? 'rgba(113,121,119,0.9)' : 'rgba(120,120,116,0.7)';

  if (tool === 'axe' || tool === 'steelaxe') {
    // handle
    ctx.strokeStyle = outline;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(20, 54); ctx.lineTo(40, 20); ctx.stroke();
    ctx.strokeStyle = '#7c5731';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(20, 54); ctx.lineTo(40, 20); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,146,92,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(19, 51); ctx.lineTo(38, 21); ctx.stroke();
    // head
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(36, 10); ctx.lineTo(56, 18); ctx.lineTo(56, 31); ctx.lineTo(38, 30); ctx.lineTo(30, 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = metalMid;
    ctx.beginPath();
    ctx.moveTo(37, 13); ctx.lineTo(53, 20); ctx.lineTo(53, 28); ctx.lineTo(39, 27); ctx.lineTo(33, 21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = metalLight;
    ctx.beginPath(); ctx.moveTo(37, 13); ctx.lineTo(53, 20); ctx.lineTo(46, 21); ctx.lineTo(35, 16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#573a22';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(36, 20); ctx.lineTo(40, 29); ctx.stroke();
    ctx.strokeStyle = 'rgba(227,198,148,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(42, 18); ctx.lineTo(42, 26); ctx.stroke();
  } else if (tool === 'pickaxe' || tool === 'steelpick') {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(32, 55); ctx.lineTo(32, 22); ctx.stroke();
    ctx.strokeStyle = '#7c5731';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(32, 55); ctx.lineTo(32, 22); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,146,92,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, 52); ctx.lineTo(30, 24); ctx.stroke();
    // curved head
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(5, 26); ctx.quadraticCurveTo(32, 8, 59, 26);
    ctx.lineTo(52, 33); ctx.quadraticCurveTo(32, 20, 12, 33); ctx.closePath(); ctx.fill();
    ctx.fillStyle = metalMid;
    ctx.beginPath();
    ctx.moveTo(8, 27); ctx.quadraticCurveTo(32, 12, 56, 27);
    ctx.lineTo(51, 30); ctx.quadraticCurveTo(32, 18, 13, 30); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = metalLight;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(12, 25); ctx.quadraticCurveTo(32, 13, 52, 25); ctx.stroke();
    ctx.strokeStyle = metalDark;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(14, 30); ctx.quadraticCurveTo(32, 19, 50, 30); ctx.stroke();
    ctx.strokeStyle = '#573a22';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(28, 22); ctx.lineTo(36, 28); ctx.stroke();
  } else if (tool === 'bat') {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(16, 55); ctx.lineTo(46, 12); ctx.stroke();
    const grad = ctx.createLinearGradient(16, 55, 46, 12);
    grad.addColorStop(0, '#5f4228');
    grad.addColorStop(0.6, '#a87c46');
    grad.addColorStop(1, '#c79a5e');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(16, 55); ctx.lineTo(46, 12); ctx.stroke();
    ctx.strokeStyle = 'rgba(236,199,140,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(18, 52); ctx.lineTo(45, 14); ctx.stroke();
    // grip tape
    ctx.strokeStyle = 'rgba(42,36,30,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = 18 + i * 2.2;
      const y = 52 - i * 3.1;
      ctx.beginPath(); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x + 3, y + 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(93,57,28,0.7)';
    ctx.beginPath(); ctx.ellipse(44, 15, 4, 3, -0.6, 0, Math.PI * 2); ctx.fill();
  } else if (tool === 'machete') {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(18, 54); ctx.lineTo(30, 42); ctx.stroke();
    ctx.strokeStyle = '#4d3520';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(18, 54); ctx.lineTo(30, 42); ctx.stroke();
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(28, 44); ctx.lineTo(40, 20); ctx.lineTo(50, 8); ctx.lineTo(56, 10);
    ctx.lineTo(52, 24); ctx.lineTo(38, 47); ctx.closePath(); ctx.fill();
    const blade = ctx.createLinearGradient(34, 40, 54, 10);
    blade.addColorStop(0, '#9ba3a1');
    blade.addColorStop(0.5, '#d5dbd8');
    blade.addColorStop(1, '#eef1ed');
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(31, 43); ctx.lineTo(42, 21); ctx.lineTo(50, 12); ctx.lineTo(53, 13);
    ctx.lineTo(49, 24); ctx.lineTo(37, 44); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(36, 40); ctx.lineTo(51, 14); ctx.stroke();
    ctx.fillStyle = '#2e2a26';
    ctx.fillRect(25, 42, 6, 6);
  } else if (tool === 'pistol') {
    // grip
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(22, 52); ctx.lineTo(33, 34); ctx.lineTo(42, 35); ctx.lineTo(44, 52); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b3a37';
    ctx.beginPath();
    ctx.moveTo(24, 50); ctx.lineTo(34, 36); ctx.lineTo(40, 37); ctx.lineTo(41, 50); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,163,159,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(27 + i * 3, 49); ctx.lineTo(35 + i * 3, 38); ctx.stroke();
    }
    // slide/body
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(14, 22); ctx.lineTo(52, 20); ctx.lineTo(56, 27); ctx.lineTo(52, 35);
    ctx.lineTo(33, 36); ctx.lineTo(23, 32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#55585a';
    ctx.beginPath();
    ctx.moveTo(16, 24); ctx.lineTo(50, 22); ctx.lineTo(53, 27); ctx.lineTo(50, 32);
    ctx.lineTo(33, 33); ctx.lineTo(24, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(200,205,205,0.55)';
    ctx.fillRect(18, 24, 30, 2);
    ctx.fillStyle = '#222527';
    ctx.fillRect(51, 24, 10, 5);
    ctx.fillStyle = 'rgba(30,31,30,0.9)';
    ctx.fillRect(31, 33, 3, 5);
    ctx.strokeStyle = '#2a2c2c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(31, 38, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    // magazine
    ctx.fillStyle = 'rgba(38,39,38,0.9)';
    ctx.fillRect(33, 46, 7, 3);
  } else if (tool === 'bow') {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(32, 32, 21, -Math.PI * 0.68, Math.PI * 0.68);
    ctx.stroke();
    ctx.strokeStyle = '#8b6338';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(32, 32, 21, -Math.PI * 0.68, Math.PI * 0.68);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(234,220,190,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(44, 15); ctx.lineTo(44, 49); ctx.stroke();
    ctx.strokeStyle = '#4b321f';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(44, 20); ctx.lineTo(44, 44); ctx.stroke();
    ctx.fillStyle = '#c5c7c2';
    ctx.beginPath(); ctx.moveTo(44, 17); ctx.lineTo(48, 23); ctx.lineTo(40, 23); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8b6338';
    ctx.fillRect(30, 36, 3, 10);
  } else {
    // club
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(14, 56); ctx.lineTo(24, 58); ctx.lineTo(34, 34); ctx.lineTo(44, 18);
    ctx.lineTo(57, 9); ctx.lineTo(58, 19); ctx.lineTo(49, 31); ctx.lineTo(40, 44);
    ctx.closePath(); ctx.fill();
    const grad = ctx.createLinearGradient(20, 54, 52, 14);
    grad.addColorStop(0, '#5e3f23');
    grad.addColorStop(0.55, '#8c6335');
    grad.addColorStop(1, '#b3844c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(17, 54); ctx.lineTo(23, 55); ctx.lineTo(33, 32); ctx.lineTo(43, 17);
    ctx.lineTo(53, 11); ctx.lineTo(54, 17); ctx.lineTo(46, 29); ctx.lineTo(37, 42);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(50,31,16,0.55)';
    ctx.beginPath(); ctx.ellipse(44, 22, 4, 2.4, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(31, 38, 2.6, 1.6, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(225,183,119,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(20, 51); ctx.lineTo(49, 13); ctx.stroke();
  }
  const url = c.toDataURL();
  toolIconCache.set(tool, url);
  return url;
}

function makeStickIcon(): string {
  const [c, ctx] = makeCanvas(64);
  ctx.lineCap = 'round';
  const sticks: [number, number, number, number][] = [
    [16, 52, 46, 16],
    [22, 54, 48, 24],
    [13, 42, 39, 10],
  ];
  for (const [x1, y1, x2, y2] of sticks) {
    ctx.strokeStyle = 'rgba(30,21,13,0.9)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#7a5730';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(196,153,96,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1 + 1, y1 - 1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  return c.toDataURL();
}

function drawMaterialIcon(kind: 'stick' | 'coal'): string {
  const [c, ctx] = makeCanvas(64);
  if (kind === 'stick') return makeStickIcon();
  // coal lump
  ctx.fillStyle = '#262523';
  ctx.beginPath();
  ctx.moveTo(14, 38); ctx.lineTo(22, 20); ctx.lineTo(40, 14); ctx.lineTo(54, 27);
  ctx.lineTo(50, 46); ctx.lineTo(32, 53); ctx.lineTo(18, 47); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a4844';
  ctx.beginPath();
  ctx.moveTo(22, 22); ctx.lineTo(38, 17); ctx.lineTo(45, 25); ctx.lineTo(30, 31); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(126,122,114,0.55)';
  ctx.beginPath(); ctx.moveTo(26, 38); ctx.lineTo(38, 33); ctx.lineTo(44, 40); ctx.lineTo(32, 46); ctx.closePath(); ctx.fill();
  return c.toDataURL();
}

const lootIconCache = new Map<string, string>();

function lootIcon(kind: string): string {
  const cached = lootIconCache.get(kind);
  if (cached) return cached;
  const [c, ctx] = makeCanvas(64);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const can = (label: string, color: string) => {
    ctx.fillStyle = 'rgba(20,22,22,0.9)';
    ctx.fillRect(21, 14, 22, 38);
    ctx.fillStyle = '#b8bfbb';
    ctx.fillRect(23, 16, 18, 34);
    ctx.fillStyle = color;
    ctx.fillRect(23, 22, 18, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(25, 17, 3, 32);
    ctx.fillStyle = 'rgba(48,50,48,0.65)';
    ctx.fillRect(22, 14, 20, 3);
    ctx.fillRect(22, 48, 20, 3);
    ctx.fillStyle = '#f2ead2';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 32, 35);
  };

  const bottle = (color: string, cap = '#325c7a', dirty = false) => {
    ctx.fillStyle = 'rgba(18,26,28,0.85)';
    ctx.beginPath();
    ctx.moveTo(26, 10); ctx.lineTo(38, 10); ctx.lineTo(38, 20);
    ctx.quadraticCurveTo(48, 26, 46, 46); ctx.quadraticCurveTo(45, 54, 32, 54);
    ctx.quadraticCurveTo(18, 54, 18, 45); ctx.quadraticCurveTo(17, 27, 26, 20);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(28, 13); ctx.lineTo(36, 13); ctx.lineTo(36, 22);
    ctx.quadraticCurveTo(44, 28, 42, 45); ctx.quadraticCurveTo(41, 50, 32, 50);
    ctx.quadraticCurveTo(22, 50, 22, 44); ctx.quadraticCurveTo(21, 28, 28, 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(27, 25, 3, 19);
    ctx.fillStyle = cap;
    ctx.fillRect(26, 8, 12, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(27, 28, 10, 6);
    if (dirty) {
      ctx.fillStyle = 'rgba(70,82,48,0.55)';
      ctx.fillRect(23, 37, 18, 3);
      ctx.fillRect(25, 42, 14, 2);
    }
  };

  if (kind === 'beans' || kind === 'meat' || kind === 'dogfood') {
    can(kind === 'beans' ? 'BEANS' : kind === 'meat' ? 'MEAT' : 'DOG', kind === 'beans' ? '#5d7f3e' : kind === 'meat' ? '#8e4d35' : '#7c6a35');
  } else if (kind === 'energybar') {
    ctx.fillStyle = 'rgba(30,24,15,0.9)';
    ctx.beginPath(); ctx.roundRect(17, 21, 30, 22, 3); ctx.fill();
    ctx.fillStyle = '#d2a23e';
    ctx.beginPath(); ctx.roundRect(19, 23, 26, 18, 2); ctx.fill();
    ctx.fillStyle = '#5a3b1d';
    ctx.fillRect(22, 28, 20, 2);
    ctx.fillRect(22, 33, 15, 2);
    ctx.fillStyle = '#f6e3ac';
    ctx.font = 'bold 6px sans-serif';
    ctx.fillText('ENERGY', 32, 26);
  } else if (kind === 'jerky') {
    ctx.fillStyle = 'rgba(35,22,12,0.9)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.roundRect(16 + i * 7, 16 + i * 5, 13, 32, 3);
      ctx.fill();
    }
    ctx.fillStyle = '#83502f';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.roundRect(18 + i * 7, 18 + i * 5, 9, 28, 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(200,132,83,0.5)';
    for (let i = 0; i < 3; i++) ctx.fillRect(20 + i * 7, 23 + i * 5, 5, 2);
  } else if (kind === 'water') {
    bottle('#4e9dc3', '#2d6685');
  } else if (kind === 'dirtywater') {
    bottle('#6d7f63', '#4a5744', true);
  } else if (kind === 'soda') {
    can('COLA', '#a8342a');
  } else if (kind === 'bandage') {
    ctx.fillStyle = 'rgba(30,25,21,0.85)';
    ctx.beginPath(); ctx.ellipse(32, 34, 19, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8e2d2';
    ctx.beginPath(); ctx.ellipse(32, 32, 17, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(28, 27, 8, 5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5382a';
    ctx.fillRect(29, 24, 6, 16);
    ctx.fillRect(24, 29, 16, 6);
  } else if (kind === 'medkit') {
    ctx.fillStyle = 'rgba(28,25,22,0.9)';
    ctx.beginPath(); ctx.roundRect(12, 18, 40, 32, 3); ctx.fill();
    ctx.fillStyle = '#e9e5da';
    ctx.beginPath(); ctx.roundRect(14, 20, 36, 28, 2); ctx.fill();
    ctx.fillStyle = '#b5382a';
    ctx.fillRect(29, 23, 6, 22);
    ctx.fillRect(21, 31, 22, 6);
    ctx.fillStyle = '#7e7b73';
    ctx.fillRect(29, 15, 6, 5);
  } else if (kind === 'pills') {
    ctx.fillStyle = 'rgba(24,23,20,0.9)';
    ctx.beginPath(); ctx.roundRect(22, 14, 20, 38, 3); ctx.fill();
    ctx.fillStyle = '#d9d5c8';
    ctx.beginPath(); ctx.roundRect(24, 16, 16, 34, 2); ctx.fill();
    ctx.fillStyle = '#b5382a';
    ctx.fillRect(24, 34, 16, 16);
    ctx.fillStyle = '#f0e8d4';
    ctx.fillRect(26, 18, 12, 12);
    ctx.fillStyle = '#7a3b2e';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MED', 32, 27);
    ctx.fillStyle = '#ddd7c8';
    ctx.beginPath(); ctx.ellipse(28, 47, 4, 2, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(36, 49, 4, 2, 0.4, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'cloth') {
    ctx.fillStyle = 'rgba(34,29,23,0.9)';
    ctx.beginPath(); ctx.roundRect(14, 18, 36, 30, 4); ctx.fill();
    ctx.fillStyle = '#9e927c';
    ctx.beginPath(); ctx.roundRect(16, 20, 32, 26, 3); ctx.fill();
    ctx.fillStyle = 'rgba(224,214,191,0.45)';
    for (let y = 23; y < 44; y += 4) ctx.fillRect(18, y, 28, 1);
    ctx.fillStyle = 'rgba(76,68,55,0.4)';
    ctx.fillRect(28, 20, 2, 26);
  } else if (kind === 'tape') {
    ctx.fillStyle = 'rgba(25,25,24,0.9)';
    ctx.beginPath(); ctx.ellipse(32, 34, 20, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#777873';
    ctx.beginPath(); ctx.ellipse(32, 34, 16, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2321';
    ctx.beginPath(); ctx.ellipse(32, 34, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,190,183,0.55)';
    ctx.beginPath(); ctx.ellipse(29, 28, 5, 3, -0.4, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'nails') {
    ctx.strokeStyle = '#c3c5c2';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = 16 + i * 7;
      const y = 16 + (i % 2) * 8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 28); ctx.stroke();
      ctx.fillStyle = '#d8dad6';
      ctx.fillRect(x - 2, y - 2, 8, 3);
    }
  } else if (kind === 'scrap') {
    ctx.fillStyle = '#707473';
    ctx.beginPath();
    ctx.moveTo(12, 30); ctx.lineTo(26, 18); ctx.lineTo(44, 24); ctx.lineTo(54, 42);
    ctx.lineTo(38, 50); ctx.lineTo(20, 44); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9a9d99';
    ctx.beginPath(); ctx.moveTo(18, 30); ctx.lineTo(28, 23); ctx.lineTo(40, 27); ctx.lineTo(30, 36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(142,77,41,0.55)';
    ctx.beginPath(); ctx.ellipse(41, 41, 7, 4, 0.4, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'money') {
    ctx.fillStyle = 'rgba(20,30,20,0.9)';
    ctx.fillRect(12, 24, 40, 20);
    ctx.fillStyle = '#8ba165';
    ctx.fillRect(14, 26, 36, 16);
    ctx.fillStyle = '#dfe4cc';
    ctx.fillRect(30, 29, 4, 10);
    ctx.beginPath(); ctx.arc(32, 34, 6, 0, Math.PI * 2); ctx.strokeStyle = '#6e8151'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#6e8151';
    ctx.font = 'bold 5px sans-serif';
    ctx.fillText('$', 31, 36);
  } else if (kind === 'ammo') {
    ctx.fillStyle = 'rgba(38,30,20,0.9)';
    ctx.beginPath(); ctx.roundRect(14, 24, 36, 22, 2); ctx.fill();
    ctx.fillStyle = '#8a7a4b';
    ctx.beginPath(); ctx.roundRect(16, 26, 32, 18, 1); ctx.fill();
    ctx.fillStyle = '#c2a34d';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(19 + i * 7, 15, 4, 13);
      ctx.fillStyle = '#d8c07a';
      ctx.fillRect(19 + i * 7, 13, 4, 3);
      ctx.fillStyle = '#c2a34d';
    }
    ctx.fillStyle = '#3d3323';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('9MM', 32, 38);
  } else if (kind === 'arrow') {
    ctx.strokeStyle = '#9a7845';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(16, 49); ctx.lineTo(45, 17); ctx.stroke();
    ctx.fillStyle = '#b9bdb8';
    ctx.beginPath(); ctx.moveTo(45, 17); ctx.lineTo(52, 12); ctx.lineTo(50, 23); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6e5638';
    ctx.beginPath(); ctx.moveTo(14, 51); ctx.lineTo(22, 43); ctx.lineTo(24, 50); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, 45); ctx.lineTo(20, 39); ctx.lineTo(21, 46); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(225,225,215,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, 47); ctx.lineTo(44, 19); ctx.stroke();
  } else if (kind === 'junkcan') {
    ctx.fillStyle = '#8f918c';
    ctx.beginPath();
    ctx.moveTo(22, 18); ctx.lineTo(42, 20); ctx.lineTo(44, 48); ctx.lineTo(24, 50); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(70,72,68,0.7)';
    ctx.fillRect(26, 26, 14, 2);
    ctx.fillRect(24, 38, 18, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(28, 22, 2, 22);
  } else if (kind === 'rotten') {
    ctx.fillStyle = '#5c6234';
    ctx.beginPath(); ctx.ellipse(32, 35, 18, 14, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#737a42';
    ctx.beginPath(); ctx.ellipse(28, 31, 10, 7, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d4223';
    ctx.beginPath(); ctx.ellipse(40, 42, 4, 3, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#90945b';
    ctx.beginPath(); ctx.ellipse(24, 40, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#888';
    ctx.fillRect(20, 20, 24, 24);
  }

  const url = c.toDataURL();
  lootIconCache.set(kind, url);
  return url;
}

export function initItems() {
  if (itemDefs.size > 0) return;
  getAtlas();
  for (const key of Object.keys(BLOCKS)) {
    const b = BLOCKS[+key];
    const icon = b.id === Block.Torch ? makeTorchIcon() : makeBlockIcon(b.top, b.side);
    const item: ItemDef = {
      id: blockItemId(b.id),
      name: b.name,
      kind: 'block',
      block: b.id,
      icon,
      desc: 'Строительный блок',
    };
    itemDefs.set(item.id, item);
  }
  itemDefs.set('tool:axe', {
    id: 'tool:axe', name: 'Каменный топор', kind: 'tool', tool: 'axe',
    icon: makeToolIcon('axe'), desc: 'Валит деревья, дробит камень',
  });
  itemDefs.set('tool:pickaxe', {
    id: 'tool:pickaxe', name: 'Каменная кирка', kind: 'tool', tool: 'pickaxe',
    icon: makeToolIcon('pickaxe'), desc: 'Быстро ломает камень и руду',
  });
  itemDefs.set('tool:club', {
    id: 'tool:club', name: 'Деревянная дубина', kind: 'tool', tool: 'club',
    icon: makeToolIcon('club'), desc: 'Тяжёлая, но бьёт больно',
  });
  itemDefs.set('tool:bat', {
    id: 'tool:bat', name: 'Бейсбольная бита', kind: 'tool', tool: 'bat',
    icon: makeToolIcon('bat'), desc: 'Урон 36 · находка из города',
  });
  itemDefs.set('tool:machete', {
    id: 'tool:machete', name: 'Мачете', kind: 'tool', tool: 'machete',
    icon: makeToolIcon('machete'), desc: 'Урон 27 · очень быстрый удар',
  });
  itemDefs.set('tool:steelaxe', {
    id: 'tool:steelaxe', name: 'Стальной топор', kind: 'tool', tool: 'steelaxe',
    icon: makeToolIcon('steelaxe'), desc: 'Валит дерево в разы быстрее',
  });
  itemDefs.set('tool:steelpick', {
    id: 'tool:steelpick', name: 'Стальная кирка', kind: 'tool', tool: 'steelpick',
    icon: makeToolIcon('steelpick'), desc: 'Быстро дробит камень и руду',
  });
  itemDefs.set('tool:pistol', {
    id: 'tool:pistol', name: 'Пистолет', kind: 'tool', tool: 'pistol',
    icon: makeToolIcon('pistol'), desc: 'Стреляет патронами 9 мм · ЛКМ — огонь',
  });
  itemDefs.set('tool:bow', {
    id: 'tool:bow', name: 'Лук', kind: 'tool', tool: 'bow',
    icon: makeToolIcon('bow'), desc: 'Стреляет стрелами · ЛКМ — выстрел',
  });
  itemDefs.set('mat:stick', {
    id: 'mat:stick', name: 'Палки', kind: 'material',
    icon: drawMaterialIcon('stick'), desc: 'Основа для инструментов',
  });
  itemDefs.set('mat:coal', {
    id: 'mat:coal', name: 'Уголь', kind: 'material',
    icon: drawMaterialIcon('coal'), desc: 'Топливо. Позже пригодится.',
  });
  itemDefs.set('mat:cloth', {
    id: 'mat:cloth', name: 'Тряпки', kind: 'material',
    icon: lootIcon('cloth'), desc: 'Для бинтов и крафта',
  });
  itemDefs.set('mat:tape', {
    id: 'mat:tape', name: 'Скотч', kind: 'material',
    icon: lootIcon('tape'), desc: 'Ценный ремонтный материал',
  });
  itemDefs.set('mat:nails', {
    id: 'mat:nails', name: 'Гвозди', kind: 'material',
    icon: lootIcon('nails'), desc: 'Для укреплений',
  });
  itemDefs.set('mat:scrap', {
    id: 'mat:scrap', name: 'Металлолом', kind: 'material',
    icon: lootIcon('scrap'), desc: 'Ржавый, но полезный',
  });
  itemDefs.set('mat:money', {
    id: 'mat:money', name: 'Доллары', kind: 'material',
    icon: lootIcon('money'), desc: 'Деньги мёртвого мира',
  });
  itemDefs.set('mat:ammo', {
    id: 'mat:ammo', name: 'Патроны 9 мм', kind: 'material',
    icon: lootIcon('ammo'), desc: 'Патроны. Оружие ещё найдётся.',
  });
  itemDefs.set('mat:arrow', {
    id: 'mat:arrow', name: 'Стрелы', kind: 'material',
    icon: lootIcon('arrow'), desc: 'Боеприпас для лука',
  });
  itemDefs.set('food:beans', {
    id: 'food:beans', name: 'Консервы с фасолью', kind: 'consumable',
    icon: lootIcon('beans'), desc: 'Голод +35', consumable: { food: 35 },
  });
  itemDefs.set('food:meat', {
    id: 'food:meat', name: 'Мясные консервы', kind: 'consumable',
    icon: lootIcon('meat'), desc: 'Голод +50', consumable: { food: 50 },
  });
  itemDefs.set('food:jerky', {
    id: 'food:jerky', name: 'Вяленое мясо', kind: 'consumable',
    icon: lootIcon('jerky'), desc: 'Голод +28', consumable: { food: 28 },
  });
  itemDefs.set('food:dogfood', {
    id: 'food:dogfood', name: 'Собачий корм', kind: 'consumable',
    icon: lootIcon('dogfood'), desc: 'Голод +22 · невкусно',
    consumable: { food: 22 },
  });
  itemDefs.set('food:energybar', {
    id: 'food:energybar', name: 'Энергобатончик', kind: 'consumable',
    icon: lootIcon('energybar'), desc: 'Голод +18',
    consumable: { food: 18 },
  });
  itemDefs.set('drink:water', {
    id: 'drink:water', name: 'Бутылка воды', kind: 'consumable',
    icon: lootIcon('water'), desc: 'Жажда −45',
    consumable: { water: 45 },
  });
  itemDefs.set('drink:soda', {
    id: 'drink:soda', name: 'Газировка', kind: 'consumable',
    icon: lootIcon('soda'), desc: 'Жажда −25 · голод +8',
    consumable: { water: 25, food: 8 },
  });
  itemDefs.set('drink:dirtywater', {
    id: 'drink:dirtywater', name: 'Грязная вода', kind: 'consumable',
    icon: lootIcon('dirtywater'), desc: 'Жажда −30 · здоровье −4',
    consumable: { water: 30, heal: -4 },
  });
  itemDefs.set('med:bandage', {
    id: 'med:bandage', name: 'Бинт', kind: 'consumable',
    icon: lootIcon('bandage'), desc: 'Здоровье +22',
    consumable: { heal: 22 },
  });
  itemDefs.set('med:medkit', {
    id: 'med:medkit', name: 'Аптечка', kind: 'consumable',
    icon: lootIcon('medkit'), desc: 'Здоровье +65',
    consumable: { heal: 65 },
  });
  itemDefs.set('med:pills', {
    id: 'med:pills', name: 'Обезболивающие', kind: 'consumable',
    icon: lootIcon('pills'), desc: 'Здоровье +12',
    consumable: { heal: 12 },
  });
  itemDefs.set('junk:can', {
    id: 'junk:can', name: 'Пустая банка', kind: 'material',
    icon: lootIcon('junkcan'), desc: 'Мусор. Можно разобрать на металл.',
  });
  itemDefs.set('junk:rotten', {
    id: 'junk:rotten', name: 'Гнилая еда', kind: 'material',
    icon: lootIcon('rotten'), desc: 'Лучше не трогать.',
  });
}

export function getItem(id: ItemId): ItemDef | undefined {
  return itemDefs.get(id);
}

export function allItems(): ItemDef[] {
  return [...itemDefs.values()];
}

/* ------------------------------------------------------------------ */
/*  Crafting                                                           */
/* ------------------------------------------------------------------ */

export interface Recipe {
  id: string;
  name: string;
  out: { item: ItemId; count: number };
  req: { item: ItemId; count: number }[];
  hint: string;
}

export const RECIPES: Recipe[] = [
  {
    id: 'planks',
    name: 'Доски',
    out: { item: blockItemId(Block.Planks), count: 4 },
    req: [{ item: blockItemId(Block.Log), count: 1 }],
    hint: 'Распилить бревно',
  },
  {
    id: 'sticks',
    name: 'Палки',
    out: { item: 'mat:stick', count: 4 },
    req: [{ item: blockItemId(Block.Planks), count: 1 }],
    hint: 'Нащепать из досок',
  },
  {
    id: 'club',
    name: 'Деревянная дубина',
    out: { item: 'tool:club', count: 1 },
    req: [
      { item: blockItemId(Block.Planks), count: 4 },
      { item: 'mat:stick', count: 2 },
    ],
    hint: 'Урон 28 · ближний бой',
  },
  {
    id: 'axe',
    name: 'Каменный топор',
    out: { item: 'tool:axe', count: 1 },
    req: [
      { item: 'mat:stick', count: 2 },
      { item: blockItemId(Block.Stone), count: 3 },
    ],
    hint: 'Скорость: дерево ×4.5',
  },
  {
    id: 'pickaxe',
    name: 'Каменная кирка',
    out: { item: 'tool:pickaxe', count: 1 },
    req: [
      { item: 'mat:stick', count: 2 },
      { item: blockItemId(Block.Stone), count: 5 },
    ],
    hint: 'Скорость: камень ×4.6',
  },
  {
    id: 'torch',
    name: 'Факел',
    out: { item: blockItemId(Block.Torch), count: 4 },
    req: [
      { item: 'mat:stick', count: 1 },
      { item: 'mat:coal', count: 1 },
    ],
    hint: 'Свет в темноте · ставится на блок',
  },
  {
    id: 'bandage',
    name: 'Бинт',
    out: { item: 'med:bandage', count: 1 },
    req: [{ item: 'mat:cloth', count: 2 }],
    hint: 'Здоровье +22',
  },
  {
    id: 'bow',
    name: 'Лук',
    out: { item: 'tool:bow', count: 1 },
    req: [
      { item: blockItemId(Block.Planks), count: 3 },
      { item: 'mat:stick', count: 4 },
      { item: 'mat:cloth', count: 2 },
    ],
    hint: 'Дальний бой · стрелы',
  },
  {
    id: 'arrows',
    name: 'Стрелы',
    out: { item: 'mat:arrow', count: 4 },
    req: [
      { item: 'mat:stick', count: 2 },
      { item: 'mat:scrap', count: 1 },
      { item: 'mat:cloth', count: 1 },
    ],
    hint: 'Боеприпас для лука',
  },
  {
    id: 'spiketrap',
    name: 'Шипы',
    out: { item: blockItemId(Block.SpikeTrap), count: 1 },
    req: [
      { item: blockItemId(Block.Planks), count: 4 },
      { item: 'mat:scrap', count: 3 },
      { item: 'mat:nails', count: 2 },
    ],
    hint: 'Ловушка на пол · ранит всех',
  },
  {
    id: 'medkit',
    name: 'Аптечка',
    out: { item: 'med:medkit', count: 1 },
    req: [
      { item: 'med:bandage', count: 2 },
      { item: 'mat:cloth', count: 2 },
      { item: 'mat:tape', count: 1 },
    ],
    hint: 'Здоровье +65',
  },
  {
    id: 'steelaxe',
    name: 'Стальной топор',
    out: { item: 'tool:steelaxe', count: 1 },
    req: [
      { item: 'mat:scrap', count: 5 },
      { item: blockItemId(Block.Planks), count: 2 },
      { item: 'mat:tape', count: 1 },
    ],
    hint: 'Скорость: дерево ×6.2',
  },
  {
    id: 'steelpick',
    name: 'Стальная кирка',
    out: { item: 'tool:steelpick', count: 1 },
    req: [
      { item: 'mat:scrap', count: 6 },
      { item: blockItemId(Block.Planks), count: 2 },
      { item: 'mat:tape', count: 1 },
    ],
    hint: 'Скорость: камень ×6.8',
  },
];

/* ------------------------------------------------------------------ */
/*  Player facing helpers                                              */
/* ------------------------------------------------------------------ */

export function blockDrop(id: Block): ItemId | null {
  if (id === Block.Air || id === Block.Water || id === Block.Bedrock) return null;
  return blockItemId(id);
}
