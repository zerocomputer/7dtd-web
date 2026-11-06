import { ArmorEquipment, emptyArmor } from './armor';

export interface InventoryProfile {
  v: 1;
  inventory: Record<string, number>;
  hotbar: (string | null)[];
  selected: number;
  armor: ArmorEquipment;
}

const KEY = 'rotwood.inventory.v1';

export function loadInventoryProfile(): InventoryProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as InventoryProfile;
    if (!data || data.v !== 1) return null;
    if (!data.inventory || typeof data.inventory !== 'object') return null;
    if (!Array.isArray(data.hotbar) || data.hotbar.length !== 9) return null;
    const inventory: Record<string, number> = {};
    for (const [id, count] of Object.entries(data.inventory)) {
      const n = Math.floor(Number(count) || 0);
      if (typeof id === 'string' && n > 0) inventory[id] = n;
    }
    const hotbar = data.hotbar.map((id) => (typeof id === 'string' ? id : null));
    const armor = emptyArmor();
    for (const slot of ['helmet', 'chest', 'legs', 'boots'] as const) {
      const id = data.armor?.[slot];
      if (typeof id === 'string') armor[slot] = id;
    }
    return {
      v: 1,
      inventory,
      hotbar,
      selected: Math.max(0, Math.min(8, Math.floor(Number(data.selected) || 0))),
      armor,
    };
  } catch {
    return null;
  }
}

export function saveInventoryProfile(profile: Omit<InventoryProfile, 'v'>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ...profile }));
    return true;
  } catch (err) {
    console.warn('inventory save failed', err);
    return false;
  }
}

export function clearInventoryProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
