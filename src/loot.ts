import { ContainerKind, ItemId, blockItemId, Block } from './blocks';
import { hash3, mulberry32 } from './noise';

export interface LootStack {
  item: ItemId;
  count: number;
}

interface LootEntry {
  item: ItemId;
  weight: number;
  min?: number;
  max?: number;
}

const TABLES: Record<ContainerKind, LootEntry[]> = {
  crate: [
    { item: blockItemId(Block.Planks), weight: 22, min: 2, max: 6 },
    { item: 'mat:scrap', weight: 18, min: 1, max: 4 },
    { item: 'mat:nails', weight: 14, min: 2, max: 8 },
    { item: 'mat:tape', weight: 8, min: 1, max: 2 },
    { item: 'mat:cloth', weight: 12, min: 1, max: 4 },
    { item: 'food:beans', weight: 8 },
    { item: 'drink:water', weight: 5 },
    { item: 'mat:ammo', weight: 3, min: 3, max: 10 },
    { item: 'tool:bat', weight: 2 },
    { item: 'tool:steelaxe', weight: 1.2 },
    { item: 'tool:steelpick', weight: 1.2 },
    { item: 'tool:pistol', weight: 0.8 },
    { item: 'tool:rifle', weight: 0.5 },
    { item: 'mat:rifleammo', weight: 3, min: 2, max: 6 },
    { item: 'armor:boots', weight: 1.2 },
    { item: 'junk:can', weight: 6 },
  ],
  cabinet: [
    { item: 'mat:cloth', weight: 16, min: 1, max: 3 },
    { item: 'food:beans', weight: 14 },
    { item: 'food:jerky', weight: 9 },
    { item: 'drink:water', weight: 10 },
    { item: 'med:bandage', weight: 10 },
    { item: 'med:pills', weight: 6 },
    { item: 'mat:money', weight: 12, min: 2, max: 15 },
    { item: 'mat:tape', weight: 6 },
    { item: 'food:dogfood', weight: 4 },
    { item: 'med:medkit', weight: 2 },
    { item: 'junk:rotten', weight: 5 },
  ],
  fridge: [
    { item: 'drink:water', weight: 22 },
    { item: 'drink:soda', weight: 15 },
    { item: 'food:beans', weight: 14 },
    { item: 'food:meat', weight: 9 },
    { item: 'food:dogfood', weight: 8 },
    { item: 'food:jerky', weight: 5 },
    { item: 'junk:rotten', weight: 10 },
    { item: 'drink:dirtywater', weight: 5 },
  ],
  safe: [
    { item: 'mat:ammo', weight: 20, min: 6, max: 22 },
    { item: 'mat:money', weight: 18, min: 10, max: 60 },
    { item: 'med:medkit', weight: 8 },
    { item: 'med:bandage', weight: 10, min: 1, max: 2 },
    { item: 'tool:machete', weight: 6 },
    { item: 'tool:bat', weight: 6 },
    { item: 'tool:steelaxe', weight: 4 },
    { item: 'tool:steelpick', weight: 4 },
    { item: 'tool:pistol', weight: 9 },
    { item: 'med:pills', weight: 6 },
    { item: 'mat:tape', weight: 5 },
    { item: 'tool:rifle', weight: 4 },
    { item: 'mat:rifleammo', weight: 10, min: 4, max: 12 },
    { item: 'armor:helmet', weight: 4 },
    { item: 'armor:chest', weight: 3 },
    { item: 'armor:legs', weight: 3 },
  ],
  trash: [
    { item: 'junk:can', weight: 22, min: 1, max: 3 },
    { item: 'mat:cloth', weight: 14, min: 1, max: 3 },
    { item: 'junk:rotten', weight: 12 },
    { item: 'mat:scrap', weight: 10, min: 1, max: 2 },
    { item: 'mat:money', weight: 4, min: 1, max: 5 },
    { item: 'food:beans', weight: 3 },
    { item: 'drink:water', weight: 3 },
    { item: 'mat:tape', weight: 2 },
  ],
  medcab: [
    { item: 'med:bandage', weight: 25, min: 1, max: 2 },
    { item: 'med:pills', weight: 15 },
    { item: 'med:medkit', weight: 10 },
    { item: 'mat:cloth', weight: 8, min: 1, max: 2 },
    { item: 'drink:water', weight: 5 },
    { item: 'mat:ammo', weight: 1, min: 2, max: 6 },
  ],
  car: [
    { item: 'mat:scrap', weight: 20, min: 2, max: 6 },
    { item: 'mat:tape', weight: 12, min: 1, max: 2 },
    { item: 'mat:cloth', weight: 12, min: 1, max: 3 },
    { item: 'drink:water', weight: 12 },
    { item: 'food:energybar', weight: 10 },
    { item: 'mat:ammo', weight: 8, min: 4, max: 14 },
    { item: 'mat:arrow', weight: 8, min: 2, max: 6 },
    { item: 'med:bandage', weight: 7 },
    { item: 'tool:bow', weight: 2 },
    { item: 'tool:pistol', weight: 1.5 },
    { item: 'tool:rifle', weight: 0.8 },
    { item: 'mat:rifleammo', weight: 5, min: 2, max: 8 },
    { item: 'mat:money', weight: 7, min: 3, max: 20 },
    { item: 'junk:can', weight: 5 },
  ],
};

const ZOMBIE_LOOT: LootEntry[] = [
  { item: 'mat:cloth', weight: 20, min: 1, max: 2 },
  { item: 'mat:money', weight: 14, min: 1, max: 10 },
  { item: 'med:bandage', weight: 10 },
  { item: 'food:beans', weight: 8 },
  { item: 'drink:water', weight: 6 },
  { item: 'mat:ammo', weight: 5, min: 2, max: 8 },
  { item: 'med:pills', weight: 4 },
  { item: 'junk:can', weight: 8 },
  { item: 'mat:tape', weight: 3 },
  { item: 'tool:machete', weight: 1 },
  { item: 'med:medkit', weight: 1 },
];

function pick(table: LootEntry[], rng: () => number): LootEntry | null {
  let total = 0;
  for (const e of table) total += e.weight;
  let r = rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return table[table.length - 1] ?? null;
}

function roll(table: LootEntry[], rng: () => number, rolls: number): LootStack[] {
  const map = new Map<ItemId, number>();
  for (let i = 0; i < rolls; i++) {
    const entry = pick(table, rng);
    if (!entry) continue;
    const min = entry.min ?? 1;
    const max = entry.max ?? min;
    const count = min + Math.floor(rng() * (max - min + 1));
    if (count <= 0) continue;
    map.set(entry.item, (map.get(entry.item) ?? 0) + count);
  }
  return [...map.entries()].map(([item, count]) => ({ item, count }));
}

function seededRng(seed: number, x: number, y: number, z: number, salt: number) {
  const h = Math.floor(hash3(x, y, z, seed + salt) * 0xffffffff) >>> 0;
  return mulberry32(h ^ seed);
}

/** Deterministic loot for a world container. */
export function generateContainerLoot(
  seed: number,
  x: number,
  y: number,
  z: number,
  kind: ContainerKind,
): LootStack[] {
  const rng = seededRng(seed, x, y, z, 913);
  if (rng() < 0.07) return [];
  const rolls = 2 + Math.floor(rng() * 4);
  const table = TABLES[kind] ?? TABLES.crate;
  return roll(table, rng, rolls);
}

export function generateZombieLoot(seed: number, x: number, y: number, z: number): LootStack[] {
  const rng = seededRng(seed, Math.floor(x), Math.floor(y), Math.floor(z), 447);
  const rolls = 1 + Math.floor(rng() * 3);
  return roll(ZOMBIE_LOOT, rng, rolls);
}

export function lootSummary(stacks: LootStack[]): string {
  if (stacks.length === 0) return 'ничего';
  return stacks.map((s) => s.item.replace(/^(block|tool|mat|food|drink|med|junk):/, '')).join(', ');
}
