import type { ProgressionSave } from './progression';
import type { ArmorEquipment } from './armor';

export interface SaveVec {
  x: number;
  y: number;
  z: number;
}

export interface SaveData {
  v: number;
  seed: number;
  day: number;
  hour: number;
  pos: SaveVec;
  yaw: number;
  pitch: number;
  health: number;
  stamina: number;
  hunger?: number;
  thirst?: number;
  inventory: Record<string, number>;
  hotbar: (string | null)[];
  selected: number;
  edits: [number, number, number, number][];
  kills: number;
  pois?: [string, number, number][];
  /** Individually killed POI residents: [poiId, index]. */
  poiKilled?: [string, number][];
  /** Street horde kills per town: [townKey, count]. */
  streetKills?: [string, number][];
  containers?: [string, [string, number][]][];
  progression?: ProgressionSave;
  armor?: ArmorEquipment;
  timestamp: number;
}

const KEY = 'rotwood.save.v2';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data || (data.v !== 2 && data.v !== 3) || typeof data.seed !== 'number') return null;
    if (!Array.isArray(data.hotbar)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('save failed', err);
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function saveInfo(): { day: number; seed: number; time: string } | null {
  const s = loadSave();
  if (!s) return null;
  const h = Math.floor(s.hour);
  const m = Math.floor((s.hour - h) * 60);
  return {
    day: s.day,
    seed: s.seed,
    time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  };
}

/* Settings are small and independent from the world save. */
export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface Settings {
  sensitivity: number;
  volume: number;
  distance: number;
  quality: GraphicsQuality;
}

const SETTINGS_KEY = 'rotwood.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return {
        sensitivity: Math.min(2.5, Math.max(0.3, Number(s.sensitivity) || 1)),
        volume: Math.min(1, Math.max(0, Number(s.volume) ?? 0.7)),
        distance: Math.min(7, Math.max(3, Math.round(Number(s.distance) || 5))),
        quality: s.quality === 'low' || s.quality === 'high' ? s.quality : 'medium',
      };
    }
  } catch {
    /* ignore */
  }
  return { sensitivity: 1, volume: 0.7, distance: 5, quality: 'medium' };
}

export function writeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
