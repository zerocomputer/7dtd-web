export type ArmorSlot = 'helmet' | 'chest' | 'legs' | 'boots';

export interface ArmorDef {
  slot: ArmorSlot;
  item: string;
  name: string;
  short: string;
  reduction: number;
  buff: string;
  maxHealth?: number;
  moveBonus?: number;
  fallReduction?: number;
  xpBonus?: number;
  staminaBonus?: number;
}

export const ARMOR_SLOTS: ArmorSlot[] = ['helmet', 'chest', 'legs', 'boots'];

export const ARMOR_DEFS: Record<ArmorSlot, ArmorDef> = {
  helmet: {
    slot: 'helmet', item: 'armor:helmet', name: 'Стальная каска', short: 'КАСКА',
    reduction: 0.08, buff: '+5% опыта', xpBonus: 0.05,
  },
  chest: {
    slot: 'chest', item: 'armor:chest', name: 'Бронежилет', short: 'БРОНЯ',
    reduction: 0.20, buff: '+8 здоровья', maxHealth: 8,
  },
  legs: {
    slot: 'legs', item: 'armor:legs', name: 'Тактические штаны', short: 'ШТАНЫ',
    reduction: 0.10, buff: '+5% скорости', moveBonus: 0.05,
  },
  boots: {
    slot: 'boots', item: 'armor:boots', name: 'Берцы', short: 'БЕРЦЫ',
    reduction: 0.06, buff: '−25% урона от падения', fallReduction: 0.25, staminaBonus: 10,
  },
};

/** Full set: extra damage reduction and the unique «Адреналин» buff. */
export const ARMOR_SET_REDUCTION = 0.08;

export interface ArmorEquipment {
  helmet: string | null;
  chest: string | null;
  legs: string | null;
  boots: string | null;
}

export interface ArmorStats {
  reduction: number;
  setActive: boolean;
  maxHealth: number;
  moveBonus: number;
  fallMultiplier: number;
  xpMultiplier: number;
  staminaBonus: number;
  adrenaline: boolean;
}

export function emptyArmor(): ArmorEquipment {
  return { helmet: null, chest: null, legs: null, boots: null };
}

export function armorForItem(itemId: string): ArmorDef | null {
  for (const slot of ARMOR_SLOTS) {
    if (ARMOR_DEFS[slot].item === itemId) return ARMOR_DEFS[slot];
  }
  return null;
}

export function armorStats(equip: ArmorEquipment): ArmorStats {
  let reduction = 0;
  let maxHealth = 0;
  let moveBonus = 0;
  let fallMultiplier = 1;
  let xpMultiplier = 1;
  let staminaBonus = 0;
  let pieces = 0;
  for (const slot of ARMOR_SLOTS) {
    const def = ARMOR_DEFS[slot];
    if (equip[slot] !== def.item) continue;
    pieces++;
    reduction += def.reduction;
    maxHealth += def.maxHealth ?? 0;
    moveBonus += def.moveBonus ?? 0;
    staminaBonus += def.staminaBonus ?? 0;
    fallMultiplier *= 1 - (def.fallReduction ?? 0);
    xpMultiplier *= 1 + (def.xpBonus ?? 0);
  }
  const setActive = pieces === ARMOR_SLOTS.length;
  return {
    reduction: Math.min(0.65, reduction + (setActive ? ARMOR_SET_REDUCTION : 0)),
    setActive,
    maxHealth,
    moveBonus,
    fallMultiplier,
    xpMultiplier,
    staminaBonus,
    adrenaline: setActive,
  };
}

/** «Адреналин»: full set + health below 35% gives +15% damage. */
export function adrenalineDamage(active: boolean, health: number, maxHealth: number): number {
  return active && health > 0 && health < maxHealth * 0.35 ? 1.15 : 1;
}
