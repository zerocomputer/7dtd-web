import { RECIPES, getItem, allItems, blockItemId } from './blocks';
import { ATTRS, PERKS } from './progression';
import type { AttrId, PerkId, Progression } from './progression';

export interface UICallbacks {
  onNewWorld: (seed: string) => void;
  onContinue: () => void;
  onEnterWorld: () => void;
  onResume: () => void;
  onSaveExit: () => void;
  onRespawn: () => void;
  onCraft: (recipeId: string) => void;
  onCraftClose: () => void;
  onAssignItem: (itemId: string) => void;
  onSelectSlot: (index: number) => void;
  onUpgradeAttr: (id: AttrId) => void;
  onUpgradePerk: (id: PerkId) => void;
  onSkillsClose: () => void;
  onLootTake: (index: number) => void;
  onLootAll: () => void;
  onLootClose: () => void;
  onSensitivity: (v: number) => void;
  onVolume: (v: number) => void;
  onDistance: (v: number) => void;
  onChatSend: (text: string) => void;
  onChatClose: () => void;
}

export interface InventoryInfo {
  level: number;
  xp: number;
  xpNext: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  hunger: number;
  thirst: number;
  poison: number;
}

const COMPASS_NAMES: Record<number, string> = {
  0: 'С', 45: 'СВ', 90: 'В', 135: 'ЮВ', 180: 'Ю', 225: 'ЮЗ', 270: 'З', 315: 'СЗ',
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class UI {
  private cb: UICallbacks;
  private hotbarEls: HTMLElement[] = [];
  private objectivePips: HTMLElement[] = [];
  private compassStrip = $('compass-strip');
  private toasts = $('toasts');
  private hintTimer = 0;
  private nightBannerTimer = 0;
  private lastTarget = '';
  private lastHotbarKey = '';
  private hasSave = false;
  private online = false;
  private lastHotbar: (string | null)[] = new Array(9).fill(null);
  private lastSelected = 0;
  private lastInventory: Record<string, number> = {};
  private lastInfo: InventoryInfo | null = null;
  private chatLog = $('chat-log');
  private chatForm = $('chat-form');
  private chatInput = $('chat-input') as HTMLInputElement;

  readonly hud = $('hud');
  readonly loading = $('loading');
  readonly menu = $('menu');
  readonly pause = $('pause');
  readonly craft = $('craft');
  readonly loot = $('loot');
  readonly skills = $('skills');
  readonly ready = $('ready');
  readonly death = $('death');

  constructor(callbacks: UICallbacks) {
    this.cb = callbacks;
    this.buildHotbar();
    this.buildCompass();
    this.buildObjective();
    this.buildRecipes();
    this.bind();
    const params = new URLSearchParams(location.search);
    const room = (params.get('room') || localStorage.getItem('rotwood.room') || 'rotwood').slice(0, 24);
    const storedName = localStorage.getItem('rotwood.name');
    const name = storedName || `Выживший-${Math.floor(100 + Math.random() * 900)}`;
    this.setPlayerIdentity(name, room);
  }

  private buildObjective() {
    const wrap = document.getElementById('obj-days');
    if (!wrap) return;
    wrap.innerHTML = '';
    this.objectivePips = [];
    for (let i = 0; i < 7; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip' + (i === 6 ? ' last' : '');
      wrap.appendChild(pip);
      this.objectivePips.push(pip);
    }
  }

  private bind() {
    $('btn-new').addEventListener('click', () => {
      const seed = ($('seed-input') as HTMLInputElement).value.trim();
      this.cb.onNewWorld(seed);
    });
    $('seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const seed = ($('seed-input') as HTMLInputElement).value.trim();
        this.cb.onNewWorld(seed);
      }
    });
    $('btn-continue').addEventListener('click', () => this.cb.onContinue());
    $('btn-enter').addEventListener('click', () => this.cb.onEnterWorld());
    $('btn-resume').addEventListener('click', () => this.cb.onResume());
    $('btn-save-exit').addEventListener('click', () => this.cb.onSaveExit());
    $('btn-respawn').addEventListener('click', () => this.cb.onRespawn());
    $('craft-close').addEventListener('click', () => this.cb.onCraftClose());
    $('skills-close').addEventListener('click', () => this.cb.onSkillsClose());
    $('loot-close').addEventListener('click', () => this.cb.onLootClose());
    $('loot-all').addEventListener('click', () => this.cb.onLootAll());

    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (text) this.cb.onChatSend(text);
      this.closeChatInput();
    });
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cb.onChatClose();
        this.closeChatInput();
      }
    });

    const sens = $('sens') as HTMLInputElement;
    const vol = $('vol') as HTMLInputElement;
    const dist = $('dist') as HTMLInputElement;
    sens.addEventListener('input', () => {
      $('sens-value').textContent = Number(sens.value).toFixed(1);
      this.cb.onSensitivity(Number(sens.value));
    });
    vol.addEventListener('input', () => {
      $('vol-value').textContent = vol.value;
      this.cb.onVolume(Number(vol.value) / 100);
    });
    dist.addEventListener('input', () => {
      $('dist-value').textContent = dist.value;
      this.cb.onDistance(Number(dist.value));
    });
  }

  private buildHotbar() {
    const wrap = document.querySelector('.hotbar-slots') as HTMLElement;
    wrap.innerHTML = '';
    this.hotbarEls = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot empty';
      slot.innerHTML = `<span class="num">${i + 1}</span><img alt="" /><span class="count"></span>`;
      wrap.appendChild(slot);
      this.hotbarEls.push(slot);
    }
  }

  private buildCompass() {
    this.compassStrip.innerHTML = '';
    for (let deg = -180; deg <= 540; deg += 15) {
      const el = document.createElement('div');
      const norm = ((deg % 360) + 360) % 360;
      const major = norm % 45 === 0;
      el.className = 'compass-tick' + (major ? ' major' : '');
      el.textContent = major ? COMPASS_NAMES[norm] ?? '' : '·';
      this.compassStrip.appendChild(el);
    }
  }

  private hasItem(itemId: string, amount: number, inventory: Record<string, number>): boolean {
    return (inventory[itemId] ?? 0) >= amount;
  }

  buildRecipes(inventory: Record<string, number> = {}) {
    const list = $('recipe-list');
    list.innerHTML = '';
    for (const r of RECIPES) {
      const can = r.req.every((req) => this.hasItem(req.item, req.count, inventory));
      const row = document.createElement('div');
      row.className = 'recipe';
      const out = getItem(r.out.item);
      const reqHtml = r.req.map((req) => {
        const it = getItem(req.item);
        const have = inventory[req.item] ?? 0;
        const ok = have >= req.count;
        return `<b class="${ok ? '' : 'missing'}">${it?.name ?? req.item} ${have}/${req.count}</b>`;
      }).join(' · ');
      row.innerHTML = `
        <div class="ic"><img src="${out?.icon ?? ''}" alt="" /></div>
        <div class="meta">
          <div class="name">${r.name}${r.out.count > 1 ? ` ×${r.out.count}` : ''}</div>
          <div class="req">${reqHtml}</div>
        </div>
      `;
      const btn = document.createElement('button');
      btn.className = 'craft-btn';
      btn.textContent = 'СОБРАТЬ';
      btn.disabled = !can;
      btn.addEventListener('click', () => this.cb.onCraft(r.id));
      row.appendChild(btn);
      list.appendChild(row);
    }
    this.renderInventoryGrid(inventory);
  }

  renderInventory(inventory: Record<string, number>) {
    this.renderInventoryGrid(inventory);
  }

  private renderInventoryGrid(inventory: Record<string, number>) {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    this.lastInventory = inventory;
    grid.innerHTML = '';
    const entries = allItems()
      .filter((it) => (inventory[it.id] ?? 0) > 0)
      .sort((a, b) => {
        const order = { tool: 0, consumable: 1, block: 2, material: 3 };
        return order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'ru');
      });
    const cells = 30;
    for (let i = 0; i < cells; i++) {
      const cell = document.createElement('div');
      const it = entries[i];
      if (!it) {
        cell.className = 'inv-cell';
        cell.innerHTML = '<span class="inv-empty-mark">·</span>';
      } else {
        const count = inventory[it.id] ?? 0;
        cell.className = 'inv-cell filled';
        cell.title = `${it.name} ×${count}\nЛКМ — назначить в выбранный слот`;
        cell.innerHTML = `<img src="${it.icon}" alt="" /><span class="inv-count">${count > 1 ? count : ''}</span>`;
        cell.addEventListener('click', () => this.cb.onAssignItem(it.id));
      }
      grid.appendChild(cell);
    }
    const cap = document.getElementById('inv-capacity');
    if (cap) cap.textContent = `${Math.min(entries.length, cells)} / ${cells}`;
  }

  private renderInvHotbar(hotbar: (string | null)[], selected: number, inventory: Record<string, number>) {
    const wrap = document.getElementById('inv-hotbar');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-hot-slot' + (i === selected ? ' selected' : '');
      slot.title = `Слот ${i + 1}`;
      const id = hotbar[i];
      const def = id ? getItem(id) : undefined;
      slot.innerHTML = `<span class="num">${i + 1}</span>${def ? `<img src="${def.icon}" alt="" />` : ''}`;
      slot.addEventListener('click', () => this.cb.onSelectSlot(i));
      wrap.appendChild(slot);
    }
  }

  private renderInvStats(info: InventoryInfo) {
    this.lastInfo = info;
    const level = document.getElementById('inv-level');
    if (level) level.textContent = `УРОВЕНЬ ${info.level}`;
    const xpText = document.getElementById('inv-xp-text');
    if (xpText) xpText.textContent = `${Math.floor(info.xp)} / ${info.xpNext}`;
    const xpFill = document.getElementById('inv-xp-fill');
    if (xpFill) xpFill.style.width = `${Math.max(0, Math.min(100, (info.xp / Math.max(1, info.xpNext)) * 100))}%`;
    const stats = document.getElementById('inv-stats');
    if (!stats) return;
    const row = (label: string, value: number, max: number) => {
      const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
      return `<div class="inv-stat"><span>${label}</span><div class="inv-bar"><i style="width:${pct}%;background:${pct < 25 ? '#c75d4a' : '#e8a33d'}"></i></div><b>${Math.round(value)}</b></div>`;
    };
    stats.innerHTML =
      row('ЗДОРОВЬЕ', info.health, info.maxHealth) +
      row('ВЫНОСЛИВОСТЬ', info.stamina, info.maxStamina) +
      row('ГОЛОД', info.hunger, 100) +
      row('ЖАЖДА', info.thirst, 100) +
      (info.poison > 0 ? `<div class="inv-stat"><span>ОТРАВЛЕНИЕ</span><b style="color:#9eb96b">${Math.ceil(info.poison)} с</b></div>` : '');
  }

  private renderInventoryInto(el: HTMLElement, inventory: Record<string, number>) {
    el.innerHTML = '';
    const entries = allItems()
      .filter((it) => (inventory[it.id] ?? 0) > 0)
      .sort((a, b) => {
        const order = { tool: 0, consumable: 1, block: 2, material: 3 };
        return order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'ru');
      });
    if (entries.length === 0) {
      el.innerHTML = '<div class="inv-empty">Инвентарь пуст. Ломайте блоки и обыскивайте здания.</div>';
      return;
    }
    for (const it of entries) {
      const count = inventory[it.id] ?? 0;
      const row = document.createElement('div');
      row.className = 'inv-item clickable';
      row.title = 'Назначить в выбранный слот';
      row.innerHTML = `<img src="${it.icon}" alt="" /><span>${it.name}</span><span class="cnt">×${count}</span>`;
      row.addEventListener('click', () => this.cb.onAssignItem(it.id));
      el.appendChild(row);
    }
  }

  refreshHotbar(hotbar: (string | null)[], selected: number, inventory: Record<string, number>) {
    this.lastHotbar = hotbar;
    this.lastSelected = selected;
    this.lastInventory = inventory;
    const key = hotbar.join('|') + '::' + selected + '::' + JSON.stringify(inventory);
    if (key === this.lastHotbarKey) return;
    this.lastHotbarKey = key;
    for (let i = 0; i < 9; i++) {
      const el = this.hotbarEls[i];
      const id = hotbar[i];
      const img = el.querySelector('img') as HTMLImageElement;
      const countEl = el.querySelector('.count') as HTMLElement;
      el.classList.toggle('active', i === selected);
      if (!id) {
        el.classList.add('empty');
        el.classList.remove('depleted');
        img.removeAttribute('src');
        countEl.textContent = '';
        continue;
      }
      const def = getItem(id);
      if (!def) continue;
      el.classList.remove('empty');
      img.src = def.icon;
      img.alt = def.name;
      const count = inventory[id] ?? 0;
      el.classList.toggle('depleted', count <= 0);
      countEl.textContent = def.kind === 'tool' ? '' : String(count);
      el.title = def.name;
    }
    const nameEl = $('hotbar-name');
    const sel = hotbar[selected];
    if (sel) {
      const def = getItem(sel);
      let label = def?.name ?? '';
      if (def?.tool === 'pistol') label += ` · 9 мм: ${inventory['mat:ammo'] ?? 0}`;
      nameEl.textContent = label;
    } else {
      nameEl.textContent = '';
    }
    if (!this.craft.classList.contains('hidden')) {
      this.renderInvHotbar(hotbar, selected, inventory);
    }
  }

  setHUDVisible(v: boolean) {
    this.hud.classList.toggle('hidden', !v);
  }

  showMenu(hasSave: boolean, saveInfo?: string) {
    this.menu.classList.remove('hidden');
    this.loading.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.ready.classList.add('hidden');
    this.death.classList.add('hidden');
    this.craft.classList.add('hidden');
    this.loot.classList.add('hidden');
    this.skills.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.hasSave = hasSave;
    if (saveInfo) $('btn-continue').textContent = saveInfo;
    this.updateMenuForNet();
  }

  setMultiplayer(status: 'connecting' | 'online' | 'offline', text: string, count = 0) {
    this.online = status === 'online';
    const dot = $('mp-dot');
    dot.className = `mp-dot ${status}`;
    $('mp-status').textContent = text;
    if (this.online && count > 0) {
      $('mp-status').textContent = `${text} · ${count} в мире`;
    }
    this.updateMenuForNet();
  }

  private updateMenuForNet() {
    const seedRow = $('seed-row');
    const cont = $('btn-continue');
    const btn = $('btn-new');
    seedRow.classList.toggle('hidden', this.online);
    cont.classList.toggle('hidden', this.online || !this.hasSave);
    btn.textContent = this.online ? 'Играть вместе' : 'Новый мир';
  }

  setPlayerIdentity(name: string, room: string) {
    ($('mp-name') as HTMLInputElement).value = name;
    ($('mp-room') as HTMLInputElement).value = room;
  }

  getPlayerName(): string {
    return ($('mp-name') as HTMLInputElement).value.trim();
  }

  getRoomName(): string {
    return ($('mp-room') as HTMLInputElement).value.trim();
  }

  setPauseMode(online: boolean) {
    $('btn-save-exit').textContent = online ? 'Выйти из мира' : 'Сохранить и выйти';
  }

  chatMessage(text: string, name?: string, color?: string, system = false) {
    const line = document.createElement('div');
    line.className = `chat-line${system ? ' system' : ''}`;
    if (system || !name) {
      line.textContent = text;
    } else {
      const who = document.createElement('b');
      who.textContent = `${name}:`;
      if (color) who.style.color = color;
      line.appendChild(who);
      line.appendChild(document.createTextNode(` ${text}`));
    }
    if (color && !system) line.style.borderLeftColor = color;
    this.chatLog.appendChild(line);
    while (this.chatLog.children.length > 8) this.chatLog.firstElementChild?.remove();
    window.setTimeout(() => {
      line.classList.add('fade');
      window.setTimeout(() => line.remove(), 600);
    }, 15000);
  }

  openChatInput() {
    this.chatForm.classList.remove('hidden');
    this.chatInput.value = '';
    this.chatInput.focus();
  }

  closeChatInput() {
    this.chatForm.classList.add('hidden');
    this.chatInput.value = '';
    this.chatInput.blur();
  }

  isChatOpen(): boolean {
    return !this.chatForm.classList.contains('hidden');
  }

  showLoading(seedText: string) {
    this.menu.classList.add('hidden');
    this.loading.classList.remove('hidden');
    this.ready.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.death.classList.add('hidden');
    this.craft.classList.add('hidden');
    this.loot.classList.add('hidden');
    this.skills.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.setLoading(0, 'Собираем землю по кускам…', seedText);
  }

  setLoading(p: number, text: string, seedText?: string) {
    ($('load-fill') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    $('load-text').textContent = text;
    if (seedText !== undefined) $('load-seed').textContent = seedText;
  }

  showReady(info: string) {
    this.loading.classList.add('hidden');
    this.ready.classList.remove('hidden');
    this.loot.classList.add('hidden');
    this.skills.classList.add('hidden');
    $('ready-info').textContent = info;
    this.hud.classList.remove('hidden');
  }

  hideReady() {
    this.ready.classList.add('hidden');
  }

  showPause(statsHtml: string) {
    this.pause.classList.remove('hidden');
    this.craft.classList.add('hidden');
    this.skills.classList.add('hidden');
    $('pause-stats').innerHTML = statsHtml;
  }

  hidePause() {
    this.pause.classList.add('hidden');
  }

  showCraft(inventory: Record<string, number>, info?: InventoryInfo, hotbar?: (string | null)[], selected?: number) {
    this.craft.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.skills.classList.add('hidden');
    this.buildRecipes(inventory);
    this.renderInvHotbar(hotbar ?? this.lastHotbar, selected ?? this.lastSelected, inventory);
    if (info) this.renderInvStats(info);
    else if (this.lastInfo) this.renderInvStats(this.lastInfo);
  }

  showSkills(progression: Progression) {
    this.skills.classList.remove('hidden');
    this.craft.classList.add('hidden');
    this.loot.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.renderSkills(progression);
  }

  hideSkills() {
    this.skills.classList.add('hidden');
  }

  updateSkills(progression: Progression) {
    if (!this.skills.classList.contains('hidden')) this.renderSkills(progression);
  }

  private renderSkills(progression: Progression) {
    const points = document.getElementById('skills-points');
    if (points) points.textContent = `ОЧКИ: ${progression.points}`;
    const level = document.getElementById('skills-level');
    if (level) level.textContent = `УРОВЕНЬ ${progression.level}`;
    const xpText = document.getElementById('skills-xp-text');
    if (xpText) xpText.textContent = `${Math.floor(progression.xp)} / ${progression.xpNext()}`;
    const xpFill = document.getElementById('skills-xp-fill');
    if (xpFill) xpFill.style.width = `${Math.max(0, Math.min(100, (progression.xp / Math.max(1, progression.xpNext())) * 100))}%`;

    const attrList = document.getElementById('skills-attr-list');
    if (attrList) {
      attrList.innerHTML = '';
      for (const attr of ATTRS) {
        const row = document.createElement('div');
        row.className = 'attr-row';
        row.innerHTML = `
          <div class="meta"><div class="name">${attr.name}</div><div class="desc">${attr.desc}</div></div>
          <div class="lvl">${progression.attrs[attr.id]} / 10</div>
        `;
        const plus = document.createElement('button');
        plus.className = 'plus';
        plus.textContent = '+';
        plus.disabled = !progression.canUpgradeAttr(attr.id);
        plus.addEventListener('click', () => this.cb.onUpgradeAttr(attr.id));
        row.appendChild(plus);
        attrList.appendChild(row);
      }
    }

    const perkList = document.getElementById('skills-perk-list');
    if (perkList) {
      perkList.innerHTML = '';
      for (const perk of PERKS) {
        const locked = progression.attrs[perk.attr] < perk.req;
        const row = document.createElement('div');
        row.className = `perk-row${locked ? ' locked' : ''}`;
        const attrName = ATTRS.find((a) => a.id === perk.attr)?.name ?? '';
        row.innerHTML = `
          <div class="meta">
            <div class="name">${perk.name}</div>
            <div class="desc">${perk.desc}</div>
            ${locked ? `<div class="req">Требуется ${attrName} ${perk.req}</div>` : ''}
          </div>
          <div class="lvl">${progression.perks[perk.id]} / ${perk.max}</div>
        `;
        const plus = document.createElement('button');
        plus.className = 'plus';
        plus.textContent = '+';
        plus.disabled = !progression.canUpgradePerk(perk.id);
        plus.addEventListener('click', () => this.cb.onUpgradePerk(perk.id));
        row.appendChild(plus);
        perkList.appendChild(row);
      }
    }
  }

  hideCraft() {
    this.craft.classList.add('hidden');
  }

  showLoot(title: string, items: { item: string; count: number }[], inventory: Record<string, number>) {
    this.loot.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.craft.classList.add('hidden');
    this.skills.classList.add('hidden');
    this.hud.classList.remove('hidden');
    $('loot-title').textContent = title;
    this.updateLoot(items, inventory);
  }

  updateLoot(items: { item: string; count: number }[], inventory: Record<string, number>) {
    const list = $('loot-list');
    list.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'loot-empty';
      empty.textContent = 'Пусто. Кто-то уже побывал здесь раньше.';
      list.appendChild(empty);
    } else {
      items.forEach((stack, index) => {
        const def = getItem(stack.item);
        const row = document.createElement('button');
        row.className = 'loot-item';
        row.innerHTML = `
          <img src="${def?.icon ?? ''}" alt="" />
          <span class="ln">${def?.name ?? stack.item}</span>
          <span class="lc">×${stack.count}</span>
          <span class="take">ЗАБРАТЬ</span>
        `;
        row.addEventListener('click', () => this.cb.onLootTake(index));
        list.appendChild(row);
      });
    }
    ($('loot-all') as HTMLButtonElement).disabled = items.length === 0;
    this.renderInventoryInto($('loot-inv'), inventory);
  }

  hideLoot() {
    this.loot.classList.add('hidden');
  }

  setTownHint(text: string) {
    const el = $('town-hint');
    if (el.textContent !== text) el.textContent = text;
  }

  showDeath(info: string) {
    this.death.classList.remove('hidden');
    this.skills.classList.add('hidden');
    $('death-info').textContent = info;
  }

  hideDeath() {
    this.death.classList.add('hidden');
  }

  updateStats(
    health: number, maxHealth: number,
    stamina: number, maxStamina: number,
    hunger: number, maxHunger: number,
    thirst: number, maxThirst: number,
    kills: number,
  ) {
    ($('hp-fill') as HTMLElement).style.width = `${Math.max(0, (health / maxHealth) * 100)}%`;
    ($('sp-fill') as HTMLElement).style.width = `${Math.max(0, (stamina / maxStamina) * 100)}%`;
    ($('food-fill') as HTMLElement).style.width = `${Math.max(0, (hunger / maxHunger) * 100)}%`;
    ($('water-fill') as HTMLElement).style.width = `${Math.max(0, (thirst / maxThirst) * 100)}%`;
    $('hp-value').textContent = String(Math.ceil(Math.max(0, health)));
    $('sp-value').textContent = String(Math.ceil(Math.max(0, stamina)));
    $('food-value').textContent = String(Math.ceil(Math.max(0, hunger)));
    $('water-value').textContent = String(Math.ceil(Math.max(0, thirst)));
    $('kills-label').textContent = `УБИТО: ${kills}`;
  }

  updateClock(day: number, time: string, isNight: boolean) {
    $('day-label').textContent = `ДЕНЬ ${day}`;
    $('time-label').textContent = time;
    $('day-label').style.color = isNight ? '#ff8e70' : '';
    $('time-label').style.color = isNight ? 'rgba(255, 190, 170, 0.9)' : '';
    const filled = Math.min(7, Math.max(1, day));
    this.objectivePips.forEach((pip, i) => pip.classList.toggle('filled', i < filled));
  }

  updateCompass(yaw: number) {
    let heading = (-yaw * 180 / Math.PI) % 360;
    if (heading < 0) heading += 360;
    const idx0 = 12;
    const containerW = ($('compass') as HTMLElement).offsetWidth || 430;
    const x = containerW / 2 - 15 - (idx0 * 30 + (heading / 15) * 30);
    this.compassStrip.style.transform = `translateX(${x}px)`;
  }

  setMining(progress: number, visible: boolean) {
    const ring = $('mine-ring');
    ring.parentElement?.classList.toggle('visible', visible);
    const circumference = 106.8;
    ring.style.strokeDashoffset = String(circumference * (1 - Math.min(1, Math.max(0, progress))));
  }

  setTarget(text: string) {
    if (text === this.lastTarget) return;
    this.lastTarget = text;
    $('target-label').textContent = text;
  }

  flashDamage() {
    const el = $('damage-flash');
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.opacity = '0';
    });
  }

  setUnderwater(v: boolean) {
    $('underwater').style.opacity = v ? '1' : '0';
  }

  setPoisoned(v: boolean) {
    $('poison').style.opacity = v ? '1' : '0';
  }

  showNightBanner() {
    const el = $('night-banner');
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'bannerIn 4.2s ease both';
    clearTimeout(this.nightBannerTimer);
    this.nightBannerTimer = window.setTimeout(() => el.classList.add('hidden'), 4200);
  }

  hint(text: string, duration = 4500) {
    const el = $('hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => el.classList.remove('show'), duration);
  }

  toast(text: string, kind: 'normal' | 'warn' | 'good' = 'normal') {
    const el = document.createElement('div');
    el.className = `toast ${kind === 'normal' ? '' : kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
    setTimeout(() => {
      el.style.transition = 'opacity 0.35s, transform 0.35s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(10px)';
      setTimeout(() => el.remove(), 380);
    }, 2600);
  }

  setSettings(sens: number, vol: number, dist: number) {
    ($('sens') as HTMLInputElement).value = String(sens);
    ($('vol') as HTMLInputElement).value = String(Math.round(vol * 100));
    ($('dist') as HTMLInputElement).value = String(dist);
    $('sens-value').textContent = sens.toFixed(1);
    $('vol-value').textContent = String(Math.round(vol * 100));
    $('dist-value').textContent = String(dist);
  }

  updateInventoryPanels(inventory: Record<string, number>) {
    this.lastHotbarKey = '';
    this.lastInventory = inventory;
    if (!this.craft.classList.contains('hidden')) {
      this.buildRecipes(inventory);
      this.renderInvHotbar(this.lastHotbar, this.lastSelected, inventory);
      if (this.lastInfo) this.renderInvStats(this.lastInfo);
    }
  }

  getSeedValue(): string {
    return ($('seed-input') as HTMLInputElement).value.trim();
  }
}
