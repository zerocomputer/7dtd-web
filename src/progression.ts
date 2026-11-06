export type AttrId = 'strength' | 'agility' | 'endurance' | 'perception' | 'intellect';

export interface AttrDef {
  id: AttrId;
  name: string;
  desc: string;
}

export const ATTRS: AttrDef[] = [
  { id: 'strength', name: 'СИЛА', desc: 'Ближний бой и добыча камня.' },
  { id: 'agility', name: 'ЛОВКОСТЬ', desc: 'Скорость движения и скрытность.' },
  { id: 'endurance', name: 'ВЫНОСЛИВОСТЬ', desc: 'Здоровье, выносливость и голод.' },
  { id: 'perception', name: 'ВОСПРИЯТИЕ', desc: 'Стрельба и качество добычи.' },
  { id: 'intellect', name: 'ИНТЕЛЛЕКТ', desc: 'Опыт, медицина и крафт.' },
];

export type PerkId =
  | 'butcher'
  | 'miner'
  | 'runner'
  | 'stealth'
  | 'tough'
  | 'ironGut'
  | 'marksman'
  | 'luckyLooter'
  | 'medic';

export interface PerkDef {
  id: PerkId;
  name: string;
  desc: string;
  attr: AttrId;
  req: number;
  max: number;
}

export const PERKS: PerkDef[] = [
  { id: 'butcher', name: 'МЯСНИК', desc: '+12% урона в ближнем бою за уровень.', attr: 'strength', req: 1, max: 5 },
  { id: 'miner', name: 'ШАХТЁР', desc: '+10% скорости добычи за уровень.', attr: 'strength', req: 2, max: 5 },
  { id: 'runner', name: 'БЕГУН', desc: '+6% скорости бега за уровень.', attr: 'agility', req: 1, max: 5 },
  { id: 'stealth', name: 'ТИХОХОД', desc: 'Зомби замечают вас на 7% ближе за уровень.', attr: 'agility', req: 3, max: 5 },
  { id: 'tough', name: 'КРЕПКИЙ', desc: '+8 к максимальному здоровью за уровень.', attr: 'endurance', req: 1, max: 5 },
  { id: 'ironGut', name: 'ЖЕЛЕЗНЫЙ ЖЕЛУДОК', desc: 'Голод и жажда растут на 8% медленнее за уровень.', attr: 'endurance', req: 2, max: 3 },
  { id: 'marksman', name: 'СТРЕЛОК', desc: '+12% урона из лука и пистолета за уровень.', attr: 'perception', req: 1, max: 5 },
  { id: 'luckyLooter', name: 'МАРОДЁР', desc: '+10% шанс дополнительной добычи за уровень.', attr: 'perception', req: 2, max: 5 },
  { id: 'medic', name: 'МЕДИК', desc: '+20% эффективности лечения за уровень.', attr: 'intellect', req: 1, max: 3 },
];

export interface ProgressionSave {
  level: number;
  xp: number;
  points: number;
  attrs: Record<AttrId, number>;
  perks: Record<PerkId, number>;
}

const baseAttrs = (): Record<AttrId, number> => ({
  strength: 1,
  agility: 1,
  endurance: 1,
  perception: 1,
  intellect: 1,
});

const basePerks = (): Record<PerkId, number> => ({
  butcher: 0,
  miner: 0,
  runner: 0,
  stealth: 0,
  tough: 0,
  ironGut: 0,
  marksman: 0,
  luckyLooter: 0,
  medic: 0,
});

export class Progression {
  level = 1;
  xp = 0;
  points = 1;
  attrs = baseAttrs();
  perks = basePerks();

  reset() {
    this.level = 1;
    this.xp = 0;
    this.points = 1;
    this.attrs = baseAttrs();
    this.perks = basePerks();
  }

  xpNext(): number {
    return 100 + (this.level - 1) * 75;
  }

  addXp(amount: number): { leveled: number } {
    const gain = Math.max(0, amount) * this.xpMultiplier;
    this.xp += gain;
    let leveled = 0;
    while (this.xp >= this.xpNext()) {
      this.xp -= this.xpNext();
      this.level++;
      this.points++;
      leveled++;
    }
    return { leveled };
  }

  get meleeMultiplier(): number {
    return 1 + (this.attrs.strength - 1) * 0.02 + this.perks.butcher * 0.12;
  }

  get rangedMultiplier(): number {
    return 1 + (this.attrs.perception - 1) * 0.02 + this.perks.marksman * 0.12;
  }

  get miningMultiplier(): number {
    return 1 + this.perks.miner * 0.1;
  }

  get moveMultiplier(): number {
    return 1 + (this.attrs.agility - 1) * 0.015;
  }

  get sprintMultiplier(): number {
    return 1 + this.perks.runner * 0.06;
  }

  get maxHealth(): number {
    return 100 + (this.attrs.endurance - 1) * 5 + this.perks.tough * 8;
  }

  get maxStamina(): number {
    return 100 + (this.attrs.endurance - 1) * 4 + this.perks.runner * 4;
  }

  get hungerRate(): number {
    return 1 - this.perks.ironGut * 0.08;
  }

  get thirstRate(): number {
    return 1 - this.perks.ironGut * 0.08;
  }

  get healMultiplier(): number {
    return 1 + this.perks.medic * 0.2;
  }

  get detectMultiplier(): number {
    return 1 - this.perks.stealth * 0.07;
  }

  get lootBonus(): number {
    return this.perks.luckyLooter * 0.1;
  }

  get xpMultiplier(): number {
    return 1 + (this.attrs.intellect - 1) * 0.03;
  }

  canUpgradeAttr(id: AttrId): boolean {
    return this.points > 0 && this.attrs[id] < 10;
  }

  canUpgradePerk(id: PerkId): boolean {
    const def = PERKS.find((p) => p.id === id);
    if (!def || this.points <= 0) return false;
    return this.attrs[def.attr] >= def.req && this.perks[id] < def.max;
  }

  upgradeAttr(id: AttrId): boolean {
    if (!this.canUpgradeAttr(id)) return false;
    this.points--;
    this.attrs[id]++;
    return true;
  }

  upgradePerk(id: PerkId): boolean {
    if (!this.canUpgradePerk(id)) return false;
    this.points--;
    this.perks[id]++;
    return true;
  }

  toJSON(): ProgressionSave {
    return {
      level: this.level,
      xp: this.xp,
      points: this.points,
      attrs: { ...this.attrs },
      perks: { ...this.perks },
    };
  }

  fromJSON(data?: Partial<ProgressionSave> | null) {
    this.reset();
    if (!data) return;
    this.level = Math.max(1, Math.floor(Number(data.level) || 1));
    this.xp = Math.max(0, Number(data.xp) || 0);
    this.points = Math.max(0, Math.floor(Number(data.points) || 0));
    for (const id of Object.keys(this.attrs) as AttrId[]) {
      this.attrs[id] = Math.max(1, Math.min(10, Math.floor(Number(data.attrs?.[id]) || 1)));
    }
    for (const id of Object.keys(this.perks) as PerkId[]) {
      const def = PERKS.find((p) => p.id === id);
      this.perks[id] = Math.max(0, Math.min(def?.max ?? 5, Math.floor(Number(data.perks?.[id]) || 0)));
    }
  }
}

export const progression = new Progression();
