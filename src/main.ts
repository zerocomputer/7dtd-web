import * as THREE from 'three';
import { World, HEIGHT, SEA_LEVEL } from './world';
import { Block, blockDef, blockDrop, getItem, blockItemId, RECIPES, TOOLS, initItems } from './blocks';
import { Environment } from './environment';
import { Player, InputState } from './player';
import { ZombieManager, Zombie, ZombieKind } from './zombies';
import { Particles } from './particles';
import { SoundSystem } from './audio';
import { UI } from './ui';
import type { InventoryInfo } from './ui';
import { ViewModel } from './viewmodel';
import { TorchLights } from './torchlights';
import { zombieModels } from './zombievisual';
import { weaponModels } from './weaponmodels';
import { propModels } from './proplibrary';
import { TownProps } from './townprops';
import { hashStringToSeed } from './noise';
import { net } from './net';
import type { NetChatMessage, RemoteState } from './net';
import { RemotePlayers } from './remoteplayers';
import { generateContainerLoot, generateZombieLoot, LootStack } from './loot';
import { progression } from './progression';
import type { AttrId, PerkId } from './progression';
import { PoiController, buildingName, PoiCallbacks } from './poi';
import type { BuildingSpec, Town } from './town';
import {
  ArmorEquipment, ArmorSlot, ARMOR_SLOTS, armorForItem, armorStats,
  adrenalineDamage, emptyArmor,
} from './armor';
import { loadInventoryProfile, saveInventoryProfile } from './inventorystore';
import {
  loadSave, writeSave, clearSave, saveInfo,
  loadSettings, writeSettings, SaveData, Settings,
} from './save';
import type { RayHit } from './world';

type GameState = 'menu' | 'loading' | 'ready' | 'playing' | 'paused' | 'craft' | 'loot' | 'skills' | 'dead';

/* ------------------------------------------------------------------ */
/*  Rendering setup                                                    */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('game') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (err) {
  console.error(err);
  document.getElementById('menu')?.classList.add('hidden');
  document.getElementById('fatal')?.classList.remove('hidden');
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0907);
initItems();
const player = new Player();
scene.add(player.camera);
const particles = new Particles(scene);
const viewmodel = new ViewModel(player.camera);
const torchLights = new TorchLights(scene);
const sound = new SoundSystem();
const poiController = new PoiController();
const townProps = new TownProps(scene);
const remotePlayers = new RemotePlayers(scene);
void zombieModels.load().catch((err) => console.error('zombie models failed', err));
void weaponModels.load().catch((err) => console.error('weapon models failed', err));
void propModels.load().catch((err) => console.error('prop models failed', err));
const muzzleLight = new THREE.PointLight(0xffc06a, 0, 16, 2);
muzzleLight.position.set(0.28, -0.1, -0.55);
player.camera.add(muzzleLight);
let muzzleTimer = 0;

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let world: World | null = null;
let environment: Environment | null = null;
let zombies: ZombieManager | null = null;
let state: GameState = 'menu';
let settings: Settings = loadSettings();

const storedProfile = loadInventoryProfile();
let inventory: Record<string, number> = storedProfile ? { ...storedProfile.inventory } : {};
let hotbar: (string | null)[] = storedProfile ? [...storedProfile.hotbar] : new Array(9).fill(null);
let selected = storedProfile ? storedProfile.selected : 0;
let armor: ArmorEquipment = storedProfile ? storedProfile.armor : emptyArmor();
let hasInventoryProfile = !!storedProfile;
let kills = 0;
let bossZombie: Zombie | null = null;
let lastBossDay = 0;
let bossWarnedDay = 0;
const spawnPoint = new THREE.Vector3();

const input: InputState = { forward: false, back: false, left: false, right: false, jump: false, sprint: false };
let leftDown = false;
let rightDown = false;

let miningProgress = 0;
let miningKey = '';
let miningSoundTimer = 0;
let attackCooldown = 0;
let placeCooldown = 0;
let trapCooldown = 0;
let targetZombie: Zombie | null = null;
let targetBlock: RayHit | null = null;

let saveTimer = 0;
let lastDanger = false;
let lastDay = 1;
let lastWarnDay = -1;
let wonShown = false;
let cricketTimer = 5;
let heartbeatTimer = 0;
let hungerWarn = 0;
let thirstWarn = 0;

let lootContainerKey = '';
let lootItems: LootStack[] = [];
let lootTitle = '';
let lastNoAmmoToast = 0;

const REACH = 6;
let lastFrameTime = performance.now();
let shadowTimer = 0;
let perfFrameMs = 16.7;
let dprTarget = 1;
let dprCurrent = 1;
let perfTimer = 0;
let mpWorld = false;
let netTimer = 0;
let chatOpen = false;
let startingWorld = false;
let suppressPointerPauseUntil = 0;

/* ------------------------------------------------------------------ */
/*  UI                                                                 */
/* ------------------------------------------------------------------ */

const ui = new UI({
  onNewWorld: (seed) => startNewWorld(seed),
  onContinue: () => continueWorld(),
  onEnterWorld: () => enterWorld(),
  onResume: () => resumeGame(),
  onSaveExit: () => saveAndExit(),
  onRespawn: () => respawnPlayer(),
  onCraft: (id) => craftRecipe(id),
  onCraftClose: () => closeCraft(),
  onAssignItem: (id) => assignItem(id),
  onSelectSlot: (index) => selectSlot(index),
  onUpgradeAttr: (id) => upgradeAttr(id),
  onUpgradePerk: (id) => upgradePerk(id),
  onSkillsClose: () => closeSkills(),
  onEquipArmor: (id) => equipArmor(id),
  onUnequipArmor: (slot) => unequipArmor(slot),
  onLootTake: (index) => takeLootItem(index),
  onLootAll: () => takeAllLoot(),
  onLootClose: () => closeLoot(),
  onSensitivity: (v) => {
    settings.sensitivity = v;
    writeSettings(settings);
  },
  onVolume: (v) => {
    settings.volume = v;
    writeSettings(settings);
    sound.setVolume(v);
  },
  onDistance: (v) => {
    settings.distance = Math.round(v);
    writeSettings(settings);
    world?.setRenderDistance(settings.distance);
    environment?.setRenderDistance(settings.distance);
  },
  onQuality: (q) => {
    settings.quality = q;
    writeSettings(settings);
    applyGraphicsQuality();
    ui.setSettings(settings.sensitivity, settings.volume, settings.distance, settings.quality);
    ui.toast(`Графика: ${q === 'low' ? 'низкая' : q === 'high' ? 'высокая' : 'средняя'}`, 'good');
  },
  onChatSend: (text) => {
    net.sendChat(text);
    closeChat();
  },
  onChatClose: () => closeChat(),
});

ui.setSettings(settings.sensitivity, settings.volume, settings.distance, settings.quality);
applyGraphicsQuality();
sound.setVolume(settings.volume);

/* ------------------------------------------------------------------ */
/*  Multiplayer                                                        */
/* ------------------------------------------------------------------ */

net.onStatus = (status, text, count) => {
  ui.setMultiplayer(status, text, count);
};
net.onWelcome = () => {
  ui.setMultiplayer('online', 'Онлайн', net.players.size + 1);
};
net.onJoin = () => {};
net.onLeave = () => {};
net.onState = () => {};
net.onEdit = (x, y, z, id) => applyRemoteEdit(x, y, z, id);
net.onLooted = (key) => applyRemoteLoot(key);
net.onPoiKill = (id, index, remaining, total) => applyRemotePoiKill(id, index, remaining, total);
net.onStreetKill = (townKey, count) => {
  world?.streetKills.set(townKey, count);
};
net.onChat = (message: NetChatMessage) => {
  ui.chatMessage(message.text, message.name, message.color, message.system || !message.name);
};
net.onTime = (day, hour) => applyNetTime(day, hour);
net.onClose = (reason) => {
  ui.chatMessage(reason, undefined, undefined, true);
  remotePlayers.clear();
};

void net.probe(ui.getRoomName());
{
  const roomInput = document.getElementById('mp-room') as HTMLInputElement | null;
  roomInput?.addEventListener('change', () => {
    void net.probe(roomInput.value);
  });
  const nameInput = document.getElementById('mp-name') as HTMLInputElement | null;
  nameInput?.addEventListener('change', () => {
    localStorage.setItem('rotwood.name', nameInput.value.trim().slice(0, 16));
  });
}

player.onDamage = () => {
  ui.flashDamage();
  sound.hurt();
  if (player.health < 32 && player.health > 0) {
    ui.hint('Критическое состояние. Найдите укрытие.', 1800);
  }
};
player.onDeath = () => handleDeath();
player.onFootstep = (inWater) => {
  sound.footstep(inWater);
  if (!inWater) zombies?.makeNoise(player.position.x, player.position.y, player.position.z, player.sprinting ? 11 : 4.5, 0.7);
};

const poiCallbacks: PoiCallbacks = {
  onCleared: (building: BuildingSpec) => {
    ui.toast(`Локация зачищена: ${buildingName(building)}`, 'good');
    gainXp(120);
    saveGame();
  },
  onEnterTown: (town: Town) => {
    ui.toast(`Город · ${town.buildings.length} зданий. Ищите лутанные контейнеры.`, 'good');
    ui.hint('Заглядывайте в дома, магазины и склады. Там еда, оружие и патроны.', 4500);
  },
  onHint: (text: string) => ui.setTownHint(text),
};

function handleZombieDeath(z: Zombie, w: World) {
  const poiId = z.poiId;
  const poiIndex = z.poiIndex;
  if (z.kind === 'boss') bossZombie = null;
  poiController.handleDeath(z, w, poiCallbacks);
  if (poiId?.startsWith('street:')) {
    const townKey = poiId.slice('street:'.length);
    w.addStreetKill(townKey);
    if (mpWorld) net.sendStreetKill(townKey);
  }
  if (poiId && poiIndex >= 0) {
    w.markPoiKilled(poiId, poiIndex);
    if (mpWorld) {
      const state = w.poiStates.get(poiId);
      net.sendPoiKill(poiId, poiIndex, state?.remaining ?? 0, state?.total ?? 1);
    }
  }
  if (!z.killedByPlayer) return;
  if (z.kind === 'boss') {
    gainXp(700);
    addItem('med:medkit', 3);
    addItem('mat:rifleammo', 30);
    addItem('mat:scrap', 25);
    addItem('armor:chest', 1);
    ui.showBossBanner('МАТКА ПАЛА', 'Город затих. Ненадолго.');
    sound.bossRoar();
  }
  gainXp(15 + (environment?.day ?? 1) * 3);
  const drops = generateZombieLoot(w.seed, Math.floor(z.pos.x), Math.floor(z.pos.y), Math.floor(z.pos.z));
  if (drops.length > 0) {
    for (const stack of drops) {
      inventory[stack.item] = (inventory[stack.item] ?? 0) + stack.count;
      if (!hotbar.includes(stack.item)) {
        const empty = hotbar.indexOf(null);
        if (empty >= 0) hotbar[empty] = stack.item;
      }
    }
    syncUI();
    updateViewModel();
    const text = drops
      .map((s) => `${getItem(s.item)?.name ?? s.item} ×${s.count}`)
      .join(' · ');
    ui.toast(`Добыча с зомби: ${text}`, 'good');
  }
}

/* ------------------------------------------------------------------ */
/*  World lifecycle                                                    */
/* ------------------------------------------------------------------ */

function parseSeed(text: string): number {
  const t = text.trim();
  if (!t) return (Math.random() * 0xffffffff) >>> 0;
  if (/^-?\d+$/.test(t)) return (Number(t) >>> 0);
  return hashStringToSeed(t);
}

function startNewWorld(seedText: string) {
  void startNewWorldAsync(seedText);
}

async function startNewWorldAsync(seedText: string) {
  if (state === 'loading' || startingWorld) return;
  startingWorld = true;
  sound.init();
  const room = (ui.getRoomName() || 'rotwood').slice(0, 24);
  const name = (ui.getPlayerName() || 'Выживший').slice(0, 16);
  localStorage.setItem('rotwood.room', room);
  localStorage.setItem('rotwood.name', name);

  let online = false;
  if (net.connected && net.room === room && net.selfName === name) {
    online = true;
  } else {
    ui.setMultiplayer('connecting', 'Подключение к серверу…', 0);
    const reachable = net.available || await net.probe(room);
    if (reachable) online = await net.join(room, name);
  }

  if (online) {
    mpWorld = true;
    startingWorld = false;
    ui.setPauseMode(true);
    void buildWorld(null, net.seed || parseSeed(seedText));
    return;
  }

  mpWorld = false;
  ui.setPauseMode(false);
  if (loadSave()) {
    const ok = window.confirm('Начать новый мир? Сохранение мира будет удалено, инвентарь и прокачка останутся.');
    if (!ok) {
      startingWorld = false;
      return;
    }
  }
  clearSave();
  const seed = parseSeed(seedText);
  startingWorld = false;
  void buildWorld(null, seed);
}

function continueWorld() {
  if (state === 'loading') return;
  sound.init();
  const save = loadSave();
  if (!save) {
    ui.toast('Сохранение не найдено', 'warn');
    return;
  }
  void buildWorld(save, save.seed);
}

function applyGraphicsQuality() {
  const quality = settings.quality;
  const cap = quality === 'low' ? 0.85 : quality === 'medium' ? 1.0 : 1.4;
  dprTarget = Math.min(window.devicePixelRatio || 1, cap);
  dprCurrent = dprTarget;
  renderer.setPixelRatio(dprTarget);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.needsUpdate = quality !== 'low';
  environment?.setShadowQuality(quality === 'low' ? 512 : quality === 'high' ? 2048 : 1024);
  torchLights.setLimit(quality === 'low' ? 3 : quality === 'high' ? 6 : 5);
  if (zombies) zombies.viewDistance = quality === 'low' ? 38 : quality === 'high' ? 72 : 56;
  const distance = quality === 'low' ? Math.min(settings.distance, 4) : settings.distance;
  world?.setRenderDistance(distance);
  environment?.setRenderDistance(distance);
}

function startingInventory(): Record<string, number> {
  return {
    'tool:axe': 1,
    [blockItemId(Block.Planks)]: 12,
    [blockItemId(Block.Torch)]: 3,
    'food:beans': 2,
    'drink:water': 2,
  };
}

function startingHotbar(): (string | null)[] {
  return [
    'tool:axe',
    blockItemId(Block.Planks),
    blockItemId(Block.Torch),
    'food:beans',
    'drink:water',
    null, null, null, null,
  ];
}

function sanitizeArmor(data: Partial<ArmorEquipment> | undefined | null): ArmorEquipment {
  const result = emptyArmor();
  if (!data) return result;
  for (const slot of ARMOR_SLOTS) {
    const id = data[slot];
    if (typeof id !== 'string') continue;
    const def = armorForItem(id);
    if (def && def.slot === slot) result[slot] = id;
  }
  return result;
}

let profileSaveTimer: ReturnType<typeof setTimeout> | null = null;

function persistInventory(immediate = false) {
  hasInventoryProfile = true;
  const write = () => {
    profileSaveTimer = null;
    saveInventoryProfile({ inventory: { ...inventory }, hotbar: [...hotbar], selected, armor: { ...armor } });
  };
  if (profileSaveTimer) clearTimeout(profileSaveTimer);
  if (immediate) write();
  else profileSaveTimer = setTimeout(write, 180);
}

async function buildWorld(save: SaveData | null, seed: number) {
  state = 'loading';
  const useMp = mpWorld;
  resetInput();
  leftDown = false;
  rightDown = false;
  resetMining();
  ui.showLoading(useMp ? `КОМНАТА: ${net.room || 'rotwood'}` : `СИД: ${seed}`);
  ui.setHUDVisible(false);
  if (document.pointerLockElement) document.exitPointerLock();

  if (world) {
    townProps.reset(world);
    scene.remove(world.group);
    world.dispose();
    world = null;
  }
  if (environment) {
    environment.dispose();
    environment = null;
  }
  if (zombies) {
    poiController.clear(zombies);
    zombies.dispose();
    zombies = null;
  }
  lootContainerKey = '';
  lootItems = [];
  ui.hideLoot();
  particles.clear();
  viewmodel.setItem(null);
  remotePlayers.clear();
  netTimer = 0;

  const newWorld = new World(seed);
  newWorld.setRenderDistance(settings.distance);
  world = newWorld;
  scene.add(newWorld.group);
  if (useMp) {
    const edits: [number, number, number, number][] = [];
    for (const [key, id] of net.edits) {
      const parts = key.split(',').map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) edits.push([parts[0], parts[1], parts[2], id]);
    }
    newWorld.importEdits(edits);
    for (const key of net.looted) newWorld.containerLoot.set(key, []);
    for (const [id, state] of net.pois) {
      newWorld.poiStates.set(id, { remaining: state.remaining, total: state.total });
    }
    for (const key of net.poiKills) {
      const cut = key.lastIndexOf(':');
      if (cut <= 0) continue;
      const index = Number(key.slice(cut + 1));
      if (Number.isFinite(index)) newWorld.markPoiKilled(key.slice(0, cut), index);
    }
    for (const [key, count] of net.streetKills) {
      if (count > 0) newWorld.streetKills.set(key, count);
    }
    newWorld.onEdit = (x, y, z, id) => {
      if (net.connected) net.sendEdit(x, y, z, id);
    };
  } else if (save) {
    newWorld.importEdits(save.edits ?? []);
  }

  const newEnv = new Environment(scene);
  newEnv.setRenderDistance(settings.distance);
  if (useMp && net.dayLength > 0) newEnv.dayLength = net.dayLength;
  environment = newEnv;

  const spawn = newWorld.findSpawn();
  spawnPoint.set(spawn.x, spawn.y, spawn.z);
  let target: { x: number; y: number; z: number } = save ? save.pos : spawn;
  if (useMp && net.spawnAt) {
    target = { x: net.spawnAt.x, y: net.spawnAt.y, z: net.spawnAt.z };
  }

  try {
    await newWorld.loadInitialProgressive(target.x, target.z, (p, text) => {
      if (world === newWorld) ui.setLoading(p, text);
    });
  } catch (err) {
    console.error('world generation failed', err);
    state = 'menu';
    ui.showMenu(!!loadSave());
    return;
  }
  if (world !== newWorld) return;

  let spawnX = target.x;
  let spawnZ = target.z;
  if (useMp) {
    const offsets: [number, number][] = net.spawnAt
      ? [[1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]]
      : [[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]];
    for (const [dx, dz] of offsets) {
      const tx = target.x + dx;
      const tz = target.z + dz;
      if (
        !newWorld.isSolid(Math.floor(tx), Math.floor(target.y), Math.floor(tz)) &&
        !newWorld.isSolid(Math.floor(tx), Math.floor(target.y + 1), Math.floor(tz))
      ) {
        spawnX = tx;
        spawnZ = tz;
        break;
      }
    }
  }
  player.setPosition(spawnX, target.y, spawnZ);
  // If a saved position ended up inside new geometry, push the player up.
  let push = 0;
  while (
    newWorld.isSolid(Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z)) &&
    push < 80
  ) {
    player.position.y += 1;
    push++;
  }
  if (save?.progression) progression.fromJSON(save.progression);
  else if (!save) progression.reset();
  applyProgression();
  player.health = save ? Math.max(1, Math.min(player.maxHealth, save.health)) : player.maxHealth;
  player.stamina = save ? Math.max(0, Math.min(player.maxStamina, save.stamina)) : player.maxStamina;
  player.hunger = save ? Math.max(20, Math.min(player.maxHunger, save.hunger ?? 100)) : player.maxHunger;
  player.thirst = save ? Math.max(20, Math.min(player.maxThirst, save.thirst ?? 100)) : player.maxThirst;
  player.yaw = save?.yaw ?? 0;
  player.pitch = save?.pitch ?? 0;
  player.dead = false;
  player.invulnTimer = 2;
  player.setPosition(player.position.x, player.position.y, player.position.z);

  if (useMp) {
    newEnv.setTime(net.hour, net.day);
  } else {
    newEnv.setTime(save?.hour ?? 12, save?.day ?? 1);
  }
  newEnv.advance(0.0001);
  torchLights.update(0.1, newWorld, player.position, newEnv.darkness);

  zombies = new ZombieManager(scene, particles, sound);
  zombies.onZombieDeath = (z) => handleZombieDeath(z, newWorld);
  zombies.kills = save?.kills ?? 0;

  if (save) {
    if (!hasInventoryProfile) {
      inventory = { ...(save.inventory ?? {}) };
      hotbar = normalizeHotbar(save.hotbar);
      selected = Math.max(0, Math.min(8, save.selected ?? 0));
      armor = sanitizeArmor(save.armor);
      persistInventory(true);
    }
    kills = save.kills ?? 0;
    for (const entry of save.pois ?? []) {
      if (Array.isArray(entry) && typeof entry[0] === 'string') {
        newWorld.poiStates.set(entry[0], {
          remaining: Math.max(0, Number(entry[1]) || 0),
          total: Math.max(1, Number(entry[2]) || Number(entry[1]) || 1),
        });
      }
    }
    for (const entry of save.poiKilled ?? []) {
      if (!Array.isArray(entry)) continue;
      const [id, index] = entry;
      if (typeof id === 'string' && Number.isFinite(Number(index))) {
        newWorld.markPoiKilled(id, Math.floor(Number(index)));
      }
    }
    for (const entry of save.streetKills ?? []) {
      if (!Array.isArray(entry)) continue;
      const [key, count] = entry;
      if (typeof key === 'string' && Number(count) > 0) {
        newWorld.streetKills.set(key, Math.floor(Number(count)));
      }
    }
    for (const entry of save.containers ?? []) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
      newWorld.containerLoot.set(
        entry[0],
        entry[1].map(([item, count]) => ({ item: String(item), count: Math.max(0, Number(count) || 0) })),
      );
    }
  } else {
    if (!hasInventoryProfile) {
      inventory = startingInventory();
      hotbar = startingHotbar();
      selected = 0;
      armor = emptyArmor();
      persistInventory(true);
    }
    kills = 0;
  }

  applyProgression();
  applyGraphicsQuality();
  updateViewModel();
  syncUI();
  lastDanger = isDangerHour(newEnv.hour);
  lastDay = newEnv.day;
  lastWarnDay = -1;
  wonShown = false;
  bossZombie = null;
  lastBossDay = 0;
  bossWarnedDay = 0;
  saveTimer = 0;

  ui.setLoading(0.94, 'Загружаем модели…');
  try {
    await Promise.all([zombieModels.load(), weaponModels.load(), propModels.load()]);
    await new Promise((r) => setTimeout(r, 30));
  } catch (err) {
    console.error('model load failed', err);
  }

  state = 'ready';
  ui.setPauseMode(useMp);
  ui.showReady(
    useMp
      ? `ОНЛАЙН · ${net.room} · ${net.players.size + 1} в мире · День ${newEnv.day} · ${newEnv.timeString()}`
      : `Сид: ${seed} · День ${newEnv.day} · ${newEnv.timeString()}`,
  );
  ui.setTownHint('ГОРОД РЯДОМ · ИЩИТЕ КОНТЕЙНЕРЫ');
  ui.hint('Впереди город. Обыскивайте дома: E — лут. H/J/K — еда, вода, лечение.', 8000);
  if (!useMp) saveGame();
}

function normalizeHotbar(saved: (string | null)[]): (string | null)[] {
  const out: (string | null)[] = new Array(9).fill(null);
  if (Array.isArray(saved)) {
    for (let i = 0; i < 9; i++) {
      const v = saved[i];
      out[i] = typeof v === 'string' ? v : null;
    }
  }
  return out;
}

function enterWorld() {
  if (state !== 'ready') return;
  sound.init();
  ui.hideReady();
  state = 'playing';
  requestLock();
  ui.hint('Обыскивайте дома: E — контейнеры. Ночью придут зомби. H/J/K — еда, вода, лечение.', 6500);
}

function resumeGame() {
  if (state !== 'paused') return;
  sound.init();
  ui.hidePause();
  state = 'playing';
  requestLock();
}

function requestLock() {
  if (document.pointerLockElement === canvas) return;
  try {
    const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        pauseForPointerLoss();
      });
    }
  } catch {
    pauseForPointerLoss();
  }
}

function pauseForPointerLoss() {
  if ((window as unknown as { __rotwoodNoPause?: boolean }).__rotwoodNoPause) return;
  if (performance.now() < suppressPointerPauseUntil) return;
  if (state === 'craft' || state === 'loot' || state === 'skills') return;
  if (state === 'playing') {
    state = 'paused';
    resetInput();
    leftDown = false;
    rightDown = false;
    resetMining();
    ui.setPauseMode(mpWorld);
    ui.showPause(pauseStats());
    saveGame();
  }
}

function openCraft() {
  if (state !== 'playing') return;
  state = 'craft';
  resetInput();
  leftDown = false;
  rightDown = false;
  resetMining();
  ui.setMining(0, false);
  if (document.pointerLockElement) document.exitPointerLock();
  ui.showCraft(inventory, inventoryInfo(), hotbar, selected);
}

function inventoryInfo(): InventoryInfo {
  const stats = armorStats(armor);
  return {
    level: progression.level,
    xp: progression.xp,
    xpNext: progression.xpNext(),
    health: player.health,
    maxHealth: player.maxHealth,
    stamina: player.stamina,
    maxStamina: player.maxStamina,
    hunger: player.hunger,
    thirst: player.thirst,
    poison: player.poison,
    armor: { ...armor },
    armorReduction: stats.reduction,
    setActive: stats.setActive,
    adrenaline: stats.adrenaline && player.health > 0 && player.health < player.maxHealth * 0.35,
  };
}

function applyProgression() {
  const stats = armorStats(armor);
  const oldMaxHealth = player.maxHealth;
  const oldMaxStamina = player.maxStamina;
  player.maxHealth = progression.maxHealth + stats.maxHealth;
  player.maxStamina = progression.maxStamina + stats.staminaBonus;
  if (player.maxHealth > oldMaxHealth) player.health += player.maxHealth - oldMaxHealth;
  if (player.maxStamina > oldMaxStamina) player.stamina += player.maxStamina - oldMaxStamina;
  player.health = Math.min(player.health, player.maxHealth);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  player.moveMultiplier = progression.moveMultiplier * (1 + stats.moveBonus);
  player.sprintMultiplier = progression.sprintMultiplier;
  player.hungerRate = progression.hungerRate;
  player.thirstRate = progression.thirstRate;
  player.healMultiplier = progression.healMultiplier;
  player.detectMultiplier = progression.detectMultiplier;
  player.armorReduction = stats.reduction;
  player.fallDamageMultiplier = stats.fallMultiplier;
  player.adrenaline = stats.adrenaline;
}

function armorDamageMultiplier(): number {
  const stats = armorStats(armor);
  return adrenalineDamage(stats.adrenaline, player.health, player.maxHealth);
}

function gainXp(amount: number) {
  if (amount <= 0) return;
  const result = progression.addXp(amount * armorStats(armor).xpMultiplier);
  if (result.leveled > 0) {
    applyProgression();
    ui.chatMessage(
      `УРОВЕНЬ ${progression.level} · +${result.leveled} очко навыка. Откройте навыки: P`,
      undefined, undefined, true,
    );
    sound.ui();
  }
  if (state === 'craft') ui.updateInventoryPanels(inventory);
  if (state === 'skills') ui.updateSkills(progression);
}

function closeCraft() {
  if (state !== 'craft') return;
  ui.hideCraft();
  state = 'playing';
  suppressPointerPauseUntil = performance.now() + 650;
  requestLock();
}

function openSkills() {
  if (state !== 'playing') return;
  state = 'skills';
  resetInput();
  leftDown = false;
  rightDown = false;
  resetMining();
  ui.setMining(0, false);
  if (document.pointerLockElement) document.exitPointerLock();
  ui.showSkills(progression);
}

function closeSkills() {
  if (state !== 'skills') return;
  ui.hideSkills();
  state = 'playing';
  suppressPointerPauseUntil = performance.now() + 650;
  requestLock();
}

function upgradeAttr(id: AttrId) {
  if (!progression.upgradeAttr(id)) return;
  applyProgression();
  ui.updateSkills(progression);
  sound.ui();
  saveGame();
}

function upgradePerk(id: PerkId) {
  if (!progression.upgradePerk(id)) return;
  applyProgression();
  ui.updateSkills(progression);
  sound.ui();
  saveGame();
}

function equipArmor(itemId: string) {
  const def = armorForItem(itemId);
  if (!def) return;
  if ((inventory[itemId] ?? 0) <= 0) return;
  if (armor[def.slot] === itemId) return;
  const previous = armor[def.slot];
  inventory[itemId] = (inventory[itemId] ?? 0) - 1;
  if (inventory[itemId] <= 0) delete inventory[itemId];
  if (previous) inventory[previous] = (inventory[previous] ?? 0) + 1;
  armor[def.slot] = itemId;
  applyProgression();
  persistInventory();
  sound.ui();
  if (state === 'craft') {
    ui.showCraft(inventory, inventoryInfo(), hotbar, selected);
  } else {
    syncUI();
    ui.toast(`${def.name} надет`, 'good');
  }
  updateViewModel();
}

function unequipArmor(slot: ArmorSlot) {
  const itemId = armor[slot];
  if (!itemId) return;
  armor[slot] = null;
  inventory[itemId] = (inventory[itemId] ?? 0) + 1;
  applyProgression();
  persistInventory();
  sound.ui();
  if (state === 'craft') {
    ui.showCraft(inventory, inventoryInfo(), hotbar, selected);
  } else {
    syncUI();
  }
  updateViewModel();
}

function saveAndExit() {
  if (mpWorld) {
    net.disconnect();
    mpWorld = false;
  } else {
    saveGame();
  }
  window.location.reload();
}

function handleDeath() {
  if (!world || !environment) return;
  state = 'dead';
  resetInput();
  leftDown = false;
  rightDown = false;
  resetMining();
  ui.setMining(0, false);
  ui.hideLoot();
  lootContainerKey = '';
  lootItems = [];
  if (document.pointerLockElement) document.exitPointerLock();
  ui.showDeath(
    `День ${environment.day}, ${environment.timeString()}`,
  );
}

function respawnPlayer() {
  if (!world) return;
  world.prepareArea(spawnPoint.x, spawnPoint.z, 2);
  player.respawn(spawnPoint.x, spawnPoint.y, spawnPoint.z);
  ui.hideDeath();
  state = 'playing';
  requestLock();
  ui.toast('Вы очнулись у точки появления', 'good');
  lastDanger = isDangerHour(environment?.hour ?? 0);
  saveGame();
}

function pauseStats(): string {
  if (!environment) return '';
  return [
    `ДЕНЬ ${environment.day}`,
    environment.timeString(),
    `СИД: ${world?.seed ?? '—'}`,
  ].map((s) => `<span>${s}</span>`).join('');
}

/* ------------------------------------------------------------------ */
/*  Saving                                                             */
/* ------------------------------------------------------------------ */

function saveGame(): boolean {
  if (mpWorld) return false;
  if (!world || !environment) return false;
  if (state === 'loading' || state === 'menu' || state === 'dead' || player.dead) return false;
  if (player.health <= 0) return false;
  const data: SaveData = {
    v: 3,
    seed: world.seed,
    day: environment.day,
    hour: environment.hour,
    pos: { x: player.position.x, y: player.position.y, z: player.position.z },
    yaw: player.yaw,
    pitch: player.pitch,
    health: player.health,
    stamina: player.stamina,
    hunger: player.hunger,
    thirst: player.thirst,
    inventory,
    hotbar,
    selected,
    edits: world.exportEdits(),
    kills: zombies?.kills ?? kills,
    pois: [...world.poiStates.entries()].map(([id, s]) => [id, s.remaining, s.total]),
    poiKilled: [...world.poiKills.entries()].flatMap(([id, set]) =>
      [...set].map((index) => [id, index] as [string, number]),
    ),
    streetKills: [...world.streetKills.entries()],
    containers: [...world.containerLoot.entries()].map(
      ([key, stacks]) => [key, stacks.map((s) => [s.item, s.count])],
    ),
    progression: progression.toJSON(),
    armor: { ...armor },
    timestamp: Date.now(),
  };
  persistInventory(true);
  return writeSave(data);
}

window.addEventListener('beforeunload', () => {
  if (state !== 'menu' && state !== 'loading' && state !== 'dead') saveGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (state !== 'menu' && state !== 'loading' && state !== 'dead') saveGame();
  }
});

/* ------------------------------------------------------------------ */
/*  Inventory / crafting                                               */
/* ------------------------------------------------------------------ */

function ensureHotbarItem(id: string) {
  if (hotbar.includes(id)) return;
  if (id.startsWith('armor:')) return;
  const empty = hotbar.indexOf(null);
  if (empty >= 0) hotbar[empty] = id;
}

function addItem(id: string, count = 1) {
  if (count <= 0) return;
  inventory[id] = (inventory[id] ?? 0) + count;
  ensureHotbarItem(id);
  syncUI();
  updateViewModel();
}

function addStacks(stacks: LootStack[], announce = false) {
  if (stacks.length === 0) {
    if (announce) ui.toast('Контейнер пуст', 'warn');
    return;
  }
  for (const s of stacks) {
    inventory[s.item] = (inventory[s.item] ?? 0) + s.count;
    ensureHotbarItem(s.item);
  }
  syncUI();
  updateViewModel();
  if (announce) {
    const text = stacks.map((s) => `${getItem(s.item)?.name ?? s.item} ×${s.count}`).join(' · ');
    ui.toast(`Забрано: ${text}`, 'good');
  }
}

function removeItems(req: { item: string; count: number }[]): boolean {
  if (!req.every((r) => (inventory[r.item] ?? 0) >= r.count)) return false;
  for (const r of req) inventory[r.item] = (inventory[r.item] ?? 0) - r.count;
  return true;
}

function craftRecipe(recipeId: string) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return;
  const outDef = getItem(recipe.out.item);
  if (recipe.out.item.startsWith('tool:') && (inventory[recipe.out.item] ?? 0) > 0) {
    ui.toast('Этот инструмент уже есть', 'warn');
    return;
  }
  if (!removeItems(recipe.req)) {
    ui.toast('Не хватает ресурсов', 'warn');
    return;
  }
  addItem(recipe.out.item, recipe.out.count);
  gainXp(6);
  sound.craft();
  ui.toast(
    `Собрано: ${outDef?.name ?? recipe.name}${recipe.out.count > 1 ? ` ×${recipe.out.count}` : ''}`,
    'good',
  );
  if (state === 'craft') ui.updateInventoryPanels(inventory);
  syncUI();
  updateViewModel();
}

function assignItem(id: string) {
  if (id.startsWith('armor:')) return;
  hotbar[selected] = id;
  syncUI();
  updateViewModel();
  ui.toast(`Слот ${selected + 1}: ${getItem(id)?.name ?? id}`, 'good');
}

function selectSlot(index: number) {
  if (index < 0 || index > 8) return;
  selected = index;
  syncUI();
  updateViewModel();
}

function updateViewModel() {
  const id = hotbar[selected];
  const count = id ? inventory[id] ?? 0 : 0;
  viewmodel.setItem(id && count > 0 ? id : null);
}

function syncUI() {
  persistInventory();
  ui.refreshHotbar(hotbar, selected, inventory);
  if (state === 'craft') ui.updateInventoryPanels(inventory);
}

/* ------------------------------------------------------------------ */
/*  Containers and consumables                                         */
/* ------------------------------------------------------------------ */

function openLoot(hit: RayHit) {
  openContainerAt(hit.x, hit.y, hit.z);
}

function openContainerAt(x: number, y: number, z: number) {
  if (!world) return;
  const def = blockDef(world.getBlock(x, y, z));
  if (!def?.container) return;
  const key = `${x},${y},${z}`;
  let items = world.containerLoot.get(key);
  let newlyOpened = false;
  if (!items) {
    if (mpWorld && net.looted.has(key)) {
      items = [];
    } else {
      items = generateContainerLoot(world.seed, x, y, z, def.container);
      if (items.length > 0 && Math.random() < progression.lootBonus) {
        const extra = items[Math.floor(Math.random() * items.length)];
        extra.count += 1;
      }
      newlyOpened = true;
      if (mpWorld) net.sendLooted(key);
    }
    world.containerLoot.set(key, items);
  }
  if (newlyOpened) gainXp(6);
  presentLoot(key, def.name, items);
}

function openCarLoot(car: { key: string; label: string; x: number; y: number; z: number }) {
  if (!world) return;
  const key = car.key;
  let items = world.containerLoot.get(key);
  let newlyOpened = false;
  if (!items) {
    if (mpWorld && net.looted.has(key)) {
      items = [];
    } else {
      items = generateContainerLoot(world.seed, Math.floor(car.x), Math.floor(car.y), Math.floor(car.z), 'car');
      if (items.length > 0 && Math.random() < progression.lootBonus) {
        const extra = items[Math.floor(Math.random() * items.length)];
        extra.count += 1;
      }
      newlyOpened = true;
      if (mpWorld) net.sendLooted(key);
    }
    world.containerLoot.set(key, items);
  }
  if (newlyOpened) gainXp(8);
  presentLoot(key, car.label, items);
}

function presentLoot(key: string, title: string, items: LootStack[]) {
  lootContainerKey = key;
  lootItems = items;
  lootTitle = title;
  state = 'loot';
  resetInput();
  leftDown = false;
  rightDown = false;
  resetMining();
  ui.setTarget('');
  sound.ui();
  if (document.pointerLockElement) document.exitPointerLock();
  ui.showLoot(lootTitle, lootItems, inventory);
}

function takeLootItem(index: number) {
  if (state !== 'loot' || !lootItems[index]) return;
  const stack = lootItems[index];
  addItem(stack.item, stack.count);
  lootItems.splice(index, 1);
  if (world) world.containerLoot.set(lootContainerKey, lootItems);
  ui.updateLoot(lootItems, inventory);
  sound.ui();
}

function takeAllLoot() {
  if (state !== 'loot') return;
  if (lootItems.length === 0) {
    ui.toast('Здесь пусто', 'warn');
    return;
  }
  const count = lootItems.reduce((n, s) => n + s.count, 0);
  addStacks(lootItems, false);
  lootItems = [];
  if (world) world.containerLoot.set(lootContainerKey, lootItems);
  ui.updateLoot(lootItems, inventory);
  ui.toast(`Забрано предметов: ${count}`, 'good');
  sound.craft();
}

function closeLoot() {
  if (state !== 'loot') return;
  ui.hideLoot();
  state = 'playing';
  lootContainerKey = '';
  lootItems = [];
  saveGame();
  suppressPointerPauseUntil = performance.now() + 650;
  requestLock();
}

function useConsumable(itemId: string): boolean {
  const def = getItem(itemId);
  if (!def?.consumable) return false;
  const count = inventory[itemId] ?? 0;
  if (count <= 0) return false;
  const c = def.consumable;
  let useful = false;
  if (c.food && player.hunger < player.maxHunger) useful = true;
  if (c.water && player.thirst < player.maxThirst) useful = true;
  if (c.heal && c.heal > 0 && player.health < player.maxHealth) useful = true;
  if (c.heal && c.heal < 0) useful = true;
  if (!useful) {
    ui.toast('Сейчас это не нужно', 'warn');
    return false;
  }

  if (c.food) player.hunger = Math.min(player.maxHunger, player.hunger + c.food);
  if (c.water) player.thirst = Math.min(player.maxThirst, player.thirst + c.water);
  if (c.heal) {
    if (c.heal > 0) player.health = Math.min(player.maxHealth, player.health + c.heal * progression.healMultiplier);
    else player.takeDamage(-c.heal, true);
  }
  inventory[itemId] = count - 1;
  if (c.water && !c.food && !c.heal) sound.drink();
  else if (c.heal) sound.heal();
  else sound.eat();
  const parts: string[] = [];
  if (c.food) parts.push(`голод +${c.food}`);
  if (c.water) parts.push(`жажда −${c.water}`);
  if (c.heal) parts.push(c.heal > 0 ? `здоровье +${c.heal}` : `здоровье ${c.heal}`);
  ui.toast(`${def.name} · ${parts.join(' · ')}`, c.heal && c.heal < 0 ? 'warn' : 'good');
  syncUI();
  updateViewModel();
  saveGame();
  return true;
}

function quickUse(kind: 'food' | 'water' | 'heal') {
  let best: string | null = null;
  let bestValue = 0;
  for (const [id, count] of Object.entries(inventory)) {
    if (count <= 0) continue;
    const def = getItem(id);
    const c = def?.consumable;
    if (!c) continue;
    let value = 0;
    if (kind === 'food') value = c.food ?? 0;
    else if (kind === 'water') value = c.water ?? 0;
    else value = (c.heal ?? 0) > 0 ? c.heal! : 0;
    const better = kind === 'heal'
      ? value > 0 && (bestValue === 0 || value < bestValue)
      : value > bestValue;
    if (better) {
      bestValue = value;
      best = id;
    }
  }
  if (best) {
    useConsumable(best);
  } else {
    ui.toast(
      kind === 'food' ? 'Нет еды в рюкзаке' : kind === 'water' ? 'Нет воды в рюкзаке' : 'Нет медикаментов',
      'warn',
    );
  }
}

function selectedItemId(): string | null {
  return hotbar[selected];
}

/* ------------------------------------------------------------------ */
/*  Interaction                                                        */
/* ------------------------------------------------------------------ */

function resetMining() {
  miningProgress = 0;
  miningKey = '';
  ui.setMining(0, false);
}

function miningMultiplier(hitId: Block): number {
  const def = blockDef(hitId);
  const itemId = hotbar[selected];
  const item = itemId ? getItem(itemId) : undefined;
  if (!def || !item?.tool) return 1;
  const tool = TOOLS[item.tool];
  if (!tool) return 1;
  switch (def.material) {
    case 'wood':
    case 'leaves':
      return tool.speedWood;
    case 'stone':
      return tool.speedStone;
    case 'metal':
      return Math.max(tool.speedStone, tool.speedOre) * 0.9;
    case 'ore':
      return tool.speedOre;
    case 'dirt':
    case 'sand':
    case 'snow':
      return tool.speedDirt;
    case 'glass':
      return tool.speedStone * 0.85;
    default:
      return 1;
  }
}

function mineBlock(hit: RayHit, dt: number) {
  if (!world) return;
  const def = blockDef(hit.id);
  if (!def || !Number.isFinite(def.hardness)) {
    resetMining();
    return;
  }
  const key = `${hit.x},${hit.y},${hit.z}`;
  if (key !== miningKey) {
    miningKey = key;
    miningProgress = 0;
    miningSoundTimer = 0;
  }
  const mult = miningMultiplier(hit.id as Block) * progression.miningMultiplier;
  const duration = Math.max(0.05, def.hardness / mult);
  miningProgress += dt / duration;
  miningSoundTimer -= dt;
  if (miningSoundTimer <= 0) {
    sound.dig(def.material);
    miningSoundTimer = 0.27;
    zombies?.makeNoise(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 15, 1.2);
  }
  ui.setMining(miningProgress, true);
  if (miningProgress >= 1) {
    breakBlock(hit, def);
    resetMining();
  }
}

function breakBlock(hit: RayHit, def: NonNullable<ReturnType<typeof blockDef>>) {
  if (!world) return;
  if (def.container) {
    const key = `${hit.x},${hit.y},${hit.z}`;
    const content = world.containerLoot.get(key) ?? generateContainerLoot(
      world.seed, hit.x, hit.y, hit.z, def.container,
    );
    world.containerLoot.set(key, []);
    if (mpWorld) net.sendLooted(key);
    if (content.length > 0) {
      addStacks(content, false);
      const text = content.map((s) => `${getItem(s.item)?.name ?? s.item} ×${s.count}`).join(' · ');
      ui.toast(`Обыскано: ${text}`, 'good');
    } else {
      ui.toast('Контейнер пуст', 'warn');
    }
  } else {
    const drop = blockDrop(hit.id as Block);
    if (drop) addItem(drop, 1);
  }
  world.setBlock(hit.x, hit.y, hit.z, Block.Air);
  const waterFilled = world.flowWater(hit.x, hit.y, hit.z);
  if (waterFilled > 0) sound.water();
  zombies?.makeNoise(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 20, 1.5);
  gainXp(hit.id === Block.CoalOre || hit.id === Block.IronOre ? 7 : 2);
  if (hit.id === Block.CoalOre) addItem('mat:coal', 1);
  particles.burst(
    hit.x + 0.5, hit.y + 0.5, hit.z + 0.5,
    def.color, 16, 3.3, 0.09, 24, 0.8, 1.5,
  );
  sound.breakBlock(def.material);
  viewmodel.swing();
}

function attack(z: Zombie, dir: THREE.Vector3) {
  if (!zombies) return;
  const itemId = hotbar[selected];
  const item = itemId ? getItem(itemId) : undefined;
  const damage = (item?.tool ? TOOLS[item.tool]?.damage ?? 8 : 7) * progression.meleeMultiplier * armorDamageMultiplier();
  const before = zombies.kills;
  zombies.hit(z, damage, dir);
  viewmodel.swing();
  sound.swing();
  attackCooldown = item?.tool ? (TOOLS[item.tool]?.cooldown ?? 0.5) : 0.5;
  if (zombies.kills > before) {
    ui.toast('Зомби уничтожен', 'good');
  }
}

function firePistol() {
  if (!world || !zombies) return;
  const itemId = hotbar[selected];
  const item = itemId ? getItem(itemId) : undefined;
  if (item?.tool !== 'pistol') return;
  const ammo = inventory['mat:ammo'] ?? 0;
  if (ammo <= 0) {
    if (performance.now() - lastNoAmmoToast > 1800) {
      lastNoAmmoToast = performance.now();
      ui.toast('Нет патронов 9 мм', 'warn');
      sound.ui();
    }
    attackCooldown = 0.5;
    return;
  }
  inventory['mat:ammo'] = ammo - 1;
  syncUI();
  const origin = player.eyePosition();
  const dir = player.getViewDirection();
  const blockHit = world.raycast(origin, dir, 70);
  const target = zombies.pickTarget(origin, dir, 70, blockHit ? blockHit.distance : Infinity);
  const before = zombies.kills;
  if (target) {
    zombies.hit(target, (TOOLS.pistol?.damage ?? 55) * progression.rangedMultiplier * armorDamageMultiplier(), dir);
    if (zombies.kills > before) ui.toast('Зомби уничтожен', 'good');
  } else if (blockHit) {
    const def = blockDef(blockHit.id);
    particles.burst(
      blockHit.x + 0.5 + blockHit.nx * 0.48,
      blockHit.y + 0.5 + blockHit.ny * 0.48,
      blockHit.z + 0.5 + blockHit.nz * 0.48,
      def?.color ?? 0x999999, 6, 2.2, 0.055, 18, 0.4, 0.4,
    );
  }
  attackCooldown = TOOLS.pistol?.cooldown ?? 0.48;
  muzzleLight.intensity = 9;
  muzzleTimer = 0.06;
  player.pitch = Math.min(1.55, player.pitch + 0.012);
  viewmodel.swing();
  sound.gunshot();
  zombies?.makeNoise(player.position.x, player.position.y + 1.4, player.position.z, 75, 3.2);
}

function fireBow() {
  if (!world || !zombies) return;
  const itemId = hotbar[selected];
  const item = itemId ? getItem(itemId) : undefined;
  if (item?.tool !== 'bow') return;
  const arrows = inventory['mat:arrow'] ?? 0;
  if (arrows <= 0) {
    if (performance.now() - lastNoAmmoToast > 1800) {
      lastNoAmmoToast = performance.now();
      ui.toast('Нет стрел', 'warn');
      sound.ui();
    }
    attackCooldown = 0.6;
    return;
  }
  inventory['mat:arrow'] = arrows - 1;
  syncUI();
  const origin = player.eyePosition();
  const dir = player.getViewDirection();
  const blockHit = world.raycast(origin, dir, 80);
  const target = zombies.pickTarget(origin, dir, 80, blockHit ? blockHit.distance : Infinity);
  if (target) {
    zombies.hit(target, (TOOLS.bow?.damage ?? 38) * progression.rangedMultiplier * armorDamageMultiplier(), dir);
    sound.arrowHit();
    ui.toast('Стрела попала в цель', 'good');
  } else if (blockHit) {
    sound.arrowHit();
    const def = blockDef(blockHit.id);
    particles.burst(
      blockHit.x + 0.5 + blockHit.nx * 0.48,
      blockHit.y + 0.5 + blockHit.ny * 0.48,
      blockHit.z + 0.5 + blockHit.nz * 0.48,
      def?.color ?? 0x999999, 5, 1.8, 0.05, 16, 0.4, 0.4,
    );
  }
  attackCooldown = TOOLS.bow?.cooldown ?? 0.9;
  viewmodel.swing();
  sound.bow();
  zombies.makeNoise(player.position.x, player.position.y + 1.4, player.position.z, 42, 2.2);
}


function fireRifle() {
  if (!world || !zombies) return;
  const itemId = hotbar[selected];
  const item = itemId ? getItem(itemId) : undefined;
  if (item?.tool !== 'rifle') return;
  const ammo = inventory['mat:rifleammo'] ?? 0;
  if (ammo <= 0) {
    if (performance.now() - lastNoAmmoToast > 1800) {
      lastNoAmmoToast = performance.now();
      ui.toast('Нет патронов 7.62', 'warn');
      sound.ui();
    }
    attackCooldown = 0.7;
    return;
  }
  inventory['mat:rifleammo'] = ammo - 1;
  syncUI();
  const origin = player.eyePosition();
  const dir = player.getViewDirection();
  const blockHit = world.raycast(origin, dir, 100);
  const target = zombies.pickTarget(origin, dir, 100, blockHit ? blockHit.distance : Infinity);
  const before = zombies.kills;
  if (target) {
    zombies.hit(
      target,
      (TOOLS.rifle?.damage ?? 92) * progression.rangedMultiplier * armorDamageMultiplier(),
      dir,
    );
    if (zombies.kills > before) ui.toast('Зомби уничтожен', 'good');
  } else if (blockHit) {
    const def = blockDef(blockHit.id);
    particles.burst(
      blockHit.x + 0.5 + blockHit.nx * 0.48,
      blockHit.y + 0.5 + blockHit.ny * 0.48,
      blockHit.z + 0.5 + blockHit.nz * 0.48,
      def?.color ?? 0x999999, 8, 2.4, 0.06, 20, 0.45, 0.5,
    );
  }
  attackCooldown = TOOLS.rifle?.cooldown ?? 0.85;
  muzzleLight.intensity = 12;
  muzzleTimer = 0.07;
  player.pitch = Math.min(1.55, player.pitch + 0.035);
  viewmodel.swing();
  sound.rifle();
  zombies.makeNoise(player.position.x, player.position.y + 1.4, player.position.z, 120, 4.5);
}

function attemptPlace(hit: RayHit | null, zTarget: Zombie | null) {
  if (!world || !zombies) return;
  if (zTarget || !hit) return;
  const itemId = hotbar[selected];
  if (!itemId) return;
  const item = getItem(itemId);
  if (!item || item.kind !== 'block' || item.block === undefined) return;
  const count = inventory[itemId] ?? 0;
  if (count <= 0) return;

  const tx = hit.x + hit.nx;
  const ty = hit.y + hit.ny;
  const tz = hit.z + hit.nz;
  if (ty < 0 || ty >= HEIGHT) return;
  if (item.block === Block.Torch && hit.ny !== 1) return;
  const existing = world.getBlock(tx, ty, tz);
  if (existing !== Block.Air && existing !== Block.Water) return;
  if (player.intersectsBlock(tx, ty, tz)) return;
  for (const z of zombies.zombies) {
    if (z.dead) continue;
    if (
      Math.abs(z.pos.x - (tx + 0.5)) < 0.7 &&
      Math.abs(z.pos.z - (tz + 0.5)) < 0.7 &&
      z.pos.y + 1.8 > ty && z.pos.y < ty + 1
    ) {
      return;
    }
  }

  world.setBlock(tx, ty, tz, item.block);
  inventory[itemId] = count - 1;
  const def = blockDef(item.block);
  if (def) {
    particles.burst(tx + 0.5, ty + 0.5, tz + 0.5, def.color, 5, 1.2, 0.06, 14, 0.35, 0.6);
  }
  sound.place();
  zombies?.makeNoise(tx + 0.5, ty + 0.5, tz + 0.5, 11, 1);
  viewmodel.swing();
  syncUI();
  updateViewModel();
}

function updateInteractions(dt: number) {
  if (!world || !zombies) return;
  attackCooldown = Math.max(0, attackCooldown - dt);
  placeCooldown = Math.max(0, placeCooldown - dt);

  const origin = player.eyePosition();
  const dir = player.getViewDirection();
  const hit = world.raycast(origin, dir, REACH);
  targetBlock = hit;
  targetZombie = zombies.pickTarget(origin, dir, 3.5, hit ? hit.distance : Infinity);

  if (targetZombie) {
    ui.setTarget(`ЗОМБИ · ${Math.max(0, Math.ceil(targetZombie.health))}`);
  } else if (hit) {
    const def = blockDef(hit.id);
    if (def) {
      let label = def.name;
      if (def.container) label += ' · E — ОБЫСКАТЬ';
      else if (!Number.isFinite(def.hardness)) label += ' · НЕЛЬЗЯ';
      else if (miningKey === `${hit.x},${hit.y},${hit.z}` && miningProgress > 0) {
        label += ` · ${Math.round(miningProgress * 100)}%`;
      }
      ui.setTarget(label);
    } else {
      ui.setTarget('');
    }
  } else {
    ui.setTarget('');
  }

  if (leftDown) {
    const heldId = hotbar[selected];
    const held = heldId ? getItem(heldId) : undefined;
    if (held?.consumable) {
      resetMining();
    } else if (held?.tool === 'pistol') {
      resetMining();
      if (attackCooldown <= 0) firePistol();
    } else if (held?.tool === 'bow') {
      resetMining();
      if (attackCooldown <= 0) fireBow();
    } else if (held?.tool === 'rifle') {
      resetMining();
      if (attackCooldown <= 0) fireRifle();
    } else if (targetZombie) {
      resetMining();
      if (attackCooldown <= 0) attack(targetZombie, dir);
    } else if (hit && hit.id !== Block.Water && hit.id !== Block.Bedrock) {
      mineBlock(hit, dt);
    } else {
      resetMining();
    }
  } else {
    resetMining();
  }

  if (rightDown && placeCooldown <= 0) {
    attemptPlace(hit, targetZombie);
    placeCooldown = 0.24;
  }
}

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */

function resetInput() {
  input.forward = input.back = input.left = input.right = false;
  input.jump = input.sprint = false;
}

function isDangerHour(hour: number): boolean {
  return hour >= 21 || hour < 5.5;
}

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  if (chatOpen) {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeChat();
    }
    return;
  }
  if (state === 'menu' || state === 'loading') return;

  if (e.code === 'KeyT' && state === 'playing') {
    e.preventDefault();
    openChat();
    return;
  }

  if (state === 'craft') {
    if (e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      closeCraft();
    }
    return;
  }

  if (state === 'skills') {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      closeSkills();
    }
    return;
  }

  if (state === 'loot') {
    if (e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      closeLoot();
    }
    return;
  }

  if (state === 'ready') {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      enterWorld();
    }
    return;
  }

  if (state === 'dead') {
    if (e.code === 'Enter') {
      e.preventDefault();
      respawnPlayer();
    }
    return;
  }

  if (state === 'paused') {
    if (e.code === 'Enter' || e.code === 'Escape') {
      e.preventDefault();
      resumeGame();
    }
    return;
  }

  if (state !== 'playing') return;

  if (e.code === 'KeyI' || e.code === 'Tab') {
    e.preventDefault();
    openCraft();
    return;
  }

  if (e.code === 'KeyP') {
    e.preventDefault();
    openSkills();
    return;
  }

  if (e.code === 'Escape') {
    e.preventDefault();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else pauseForPointerLoss();
    return;
  }

  switch (e.code) {
    case 'KeyW': input.forward = true; break;
    case 'KeyS': input.back = true; break;
    case 'KeyA': input.left = true; break;
    case 'KeyD': input.right = true; break;
    case 'Space':
      input.jump = true;
      e.preventDefault();
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.sprint = true;
      break;
    case 'KeyE': {
      e.preventDefault();
      const origin = player.eyePosition();
      const dir = player.getViewDirection();
      const hit = world ? world.raycast(origin, dir, 4.8) : null;
      if (hit && blockDef(hit.id)?.container) openLoot(hit);
      else {
        const car = townProps.pickCar(origin, dir, 4.8);
        if (car) openCarLoot(car);
        else openCraft();
      }
      break;
    }
    case 'KeyH':
      quickUse('food');
      break;
    case 'KeyJ':
      quickUse('water');
      break;
    case 'KeyK':
      quickUse('heal');
      break;
    case 'KeyF': {
      const on = player.toggleFlashlight();
      ui.toast(on ? 'Фонарь включён' : 'Фонарь выключен');
      sound.ui();
      break;
    }
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
    case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8':
    case 'Digit9':
      selectSlot(Number(e.code.slice(5)) - 1);
      sound.ui();
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', (e) => {
  if (chatOpen) return;
  switch (e.code) {
    case 'KeyW': input.forward = false; break;
    case 'KeyS': input.back = false; break;
    case 'KeyA': input.left = false; break;
    case 'KeyD': input.right = false; break;
    case 'Space': input.jump = false; break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.sprint = false;
      break;
    default:
      break;
  }
});

window.addEventListener('blur', () => {
  resetInput();
  leftDown = false;
  rightDown = false;
});

document.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  if (document.pointerLockElement !== canvas) return;
  player.look(e.movementX, e.movementY, settings.sensitivity);
});

canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  if (e.button === 0) {
    const id = selectedItemId();
    const item = id ? getItem(id) : undefined;
    if (item?.consumable && id) {
      useConsumable(id);
      return;
    }
    leftDown = true;
  } else if (e.button === 2) {
    rightDown = true;
    if (world && zombies) {
      const origin = player.eyePosition();
      const dir = player.getViewDirection();
      const hit = world.raycast(origin, dir, REACH);
      const zt = zombies.pickTarget(origin, dir, 3.5, hit ? hit.distance : Infinity);
      attemptPlace(hit, zt);
      placeCooldown = 0.24;
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    leftDown = false;
    resetMining();
  } else if (e.button === 2) {
    rightDown = false;
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1 : -1;
  selectSlot((selected + delta + 9) % 9);
}, { passive: false });

canvas.addEventListener('click', () => {
  if (state === 'playing' && document.pointerLockElement !== canvas) requestLock();
});

window.addEventListener('beforeunload', () => {
  persistInventory(true);
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) return;
  if (state === 'playing' && !chatOpen) pauseForPointerLoss();
});

document.addEventListener('pointerlockerror', () => {
  if (state === 'playing' && !chatOpen) pauseForPointerLoss();
});

window.addEventListener('resize', () => {
  player.camera.aspect = window.innerWidth / window.innerHeight;
  player.camera.updateProjectionMatrix();
  applyGraphicsQuality();
});

/* ------------------------------------------------------------------ */
/*  Main loop                                                          */
/* ------------------------------------------------------------------ */

function insideTownBuilding(x: number, z: number): boolean {
  if (!world) return false;
  const nearest = world.towns.nearestTown(x, z);
  if (!nearest) return false;
  return nearest.town.buildings.some(
    (b) => x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1,
  );
}

function spawnBossNearPlayer() {
  if (!world || !environment || !zombies) return;
  const px = player.position.x;
  const pz = player.position.z;
  for (let attempt = 0; attempt < 80; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 26 + Math.random() * 18;
    const x = Math.round(px + Math.cos(angle) * radius);
    const z = Math.round(pz + Math.sin(angle) * radius);
    if (insideTownBuilding(x, z)) continue;
    if (!world.isChunkLoaded(Math.floor(x / 16), Math.floor(z / 16))) continue;
    const top = world.columnTop(x, z);
    if (top <= SEA_LEVEL) continue;
    const topBlock = world.getBlock(x, top, z);
    if (topBlock === Block.Water || topBlock === Block.Leaves || topBlock === Block.Air) continue;
    bossZombie = zombies.spawnBoss(x + 0.5, top + 1.02, z + 0.5, environment.day);
    particles.burst(x + 0.5, top + 1.2, z + 0.5, 0x7d9a42, 40, 3.8, 0.11, 6, 1.6, 2.2);
    ui.showBossBanner('МАТКА ГНИЛИ', 'Она уже почуяла тебя');
    sound.bossRoar();
    return;
  }
}

function updateBossEvent() {
  if (!world || !environment || !zombies) return;
  if (bossZombie && (bossZombie.dead || bossZombie.group.parent === null)) bossZombie = null;
  const day = environment.day;
  if (day % 2 !== 0) return;
  if (environment.hour >= 20.25 && environment.hour < 21 && bossWarnedDay !== day) {
    bossWarnedDay = day;
    ui.showBossBanner('ОНО ПРОСНУЛОСЬ', 'До темноты не выходи на открытое место');
    sound.bossRoar();
  }
  if (environment.hour < 21) return;
  if (bossZombie || lastBossDay === day) return;
  lastBossDay = day;
  spawnBossNearPlayer();
}

function updateDayNightEvents() {
  if (!environment) return;
  const nearNight = environment.hour >= 19.4 && environment.hour < 21;
  if (nearNight && lastWarnDay !== environment.day) {
    lastWarnDay = environment.day;
    ui.showNightBanner();
    ui.toast('До темноты меньше двух часов. Они уже рядом.', 'warn');
  }

  const danger = isDangerHour(environment.hour);
  if (danger !== lastDanger) {
    if (danger) {
      ui.toast('Ночь. Они вышли на охоту.', 'warn');
    } else {
      ui.toast('Рассвет. Зомби горят на солнце.', 'good');
    }
    lastDanger = danger;
  }
  if (environment.day !== lastDay) {
    lastDay = environment.day;
    lastWarnDay = -1;
    if (lastDay >= 8 && !wonShown) {
      wonShown = true;
      ui.toast('Вы пережили семь дней. Ротвуд всё ещё стоит.', 'good');
    } else {
      ui.toast(`День ${lastDay}. Вы продержались ещё одну ночь.`, 'good');
    }
    ui.hint('Ночь закончилась. Пора укрепить укрытие.', 3500);
  }
}

function localNetState(): RemoteState {
  return {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    yaw: player.yaw,
    pitch: player.pitch,
    speed: player.getSpeed(),
    health: player.health,
    dead: player.dead || state === 'dead',
  };
}

function sendLocalNetState() {
  if (!mpWorld || !net.connected || !world) return;
  net.sendState(localNetState());
}

function applyRemoteEdit(x: number, y: number, z: number, id: number) {
  if (!world) return;
  world.edits.set(`${x},${y},${z}`, id);
  world.setBlock(x, y, z, id, false);
}

function applyRemoteLoot(key: string) {
  if (!world) return;
  world.containerLoot.set(key, []);
  if (state === 'loot' && lootContainerKey === key) {
    lootItems = [];
    ui.updateLoot(lootItems, inventory);
  }
}

function applyRemotePoiKill(id: string, index: number, remaining: number, total: number) {
  if (!world) return;
  world.poiStates.set(id, { remaining, total });
  world.markPoiKilled(id, index);
  if (!zombies) return;
  if (remaining <= 0) {
    for (const entry of [...zombies.zombies]) {
      if (entry.poiId === id) zombies.removeZombie(entry);
    }
    return;
  }
  const z = zombies.zombies.find((entry) => !entry.dead && entry.poiId === id && entry.poiIndex === index);
  if (z) zombies.removeZombie(z);
}

function applyNetTime(day: number, hour: number) {
  if (!environment) return;
  if (environment.day !== day || Math.abs(environment.hour - hour) > 0.15) {
    environment.setTime(hour, day);
  }
}

function openChat() {
  if (state !== 'playing' || ui.isChatOpen()) return;
  chatOpen = true;
  resetInput();
  leftDown = false;
  rightDown = false;
  resetMining();
  ui.setMining(0, false);
  if (document.pointerLockElement) document.exitPointerLock();
  ui.openChatInput();
}

function closeChat() {
  if (!chatOpen && !ui.isChatOpen()) return;
  chatOpen = false;
  ui.closeChatInput();
  if (state === 'playing') requestLock();
}

function frame(now?: number) {
  requestAnimationFrame(frame);
  const time = now ?? performance.now();
  const dt = Math.min(Math.max(0, (time - lastFrameTime) / 1000), 0.05);
  lastFrameTime = time;
  perfFrameMs = perfFrameMs * 0.94 + (dt * 1000) * 0.06;
  perfTimer += dt;
  if (perfTimer >= 2 && (state === 'playing' || state === 'loot')) {
    perfTimer = 0;
    if (perfFrameMs > 26 && dprCurrent > 0.7) {
      dprCurrent = Math.max(0.7, dprCurrent - 0.1);
      renderer.setPixelRatio(dprCurrent);
    } else if (perfFrameMs < 17.5 && dprCurrent < dprTarget) {
      dprCurrent = Math.min(dprTarget, dprCurrent + 0.05);
      renderer.setPixelRatio(dprCurrent);
    }
  }

  netTimer -= dt;
  if (netTimer <= 0) {
    netTimer = 0.07;
    sendLocalNetState();
  }

  if ((state === 'playing' || state === 'loot') && world && environment && zombies) {
    player.update(dt, input, world);
    environment.setUnderwater(player.headUnderwater);
    environment.advance(dt);
    world.update(player.position.x, player.position.z, dt);
    townProps.update(dt, world, player, environment.darkness);
    sound.setAmbience(environment.darkness);
    zombies.update(dt, world, player, isDangerHour(environment.hour), environment.day, environment.darkness);
    poiController.update(dt, world, player, zombies, poiCallbacks, environment.day);
    particles.update(dt);
    torchLights.update(dt, world, player.position, environment.darkness);
    if (muzzleTimer > 0) {
      muzzleTimer = Math.max(0, muzzleTimer - dt);
      muzzleLight.intensity = muzzleTimer > 0 ? 9 * (muzzleTimer / 0.06) : 0;
    }
    viewmodel.update(dt, player.getSpeed());
    if (state === 'playing') updateInteractions(dt);
    updateDayNightEvents();
    updateBossEvent();

    hungerWarn -= dt;
    thirstWarn -= dt;
    if (player.hunger < 20 && hungerWarn <= 0) {
      hungerWarn = 45;
      ui.toast('Сильный голод. Проверьте рюкзак: H — еда.', 'warn');
    }
    if (player.thirst < 20 && thirstWarn <= 0) {
      thirstWarn = 45;
      ui.toast('Хочется пить. J — вода.', 'warn');
    }

    cricketTimer -= dt;
    if (cricketTimer <= 0) {
      cricketTimer = 3 + Math.random() * 7;
      if (environment.darkness > 0.45) sound.cricket();
    }
    if (player.health < 30 && player.health > 0) {
      heartbeatTimer -= dt;
      if (heartbeatTimer <= 0) {
        heartbeatTimer = 1.5;
        sound.heartbeat();
      }
    }

    if (world) {
      const fx = Math.floor(player.position.x);
      const fz = Math.floor(player.position.z);
      const trapBelow = world.getBlock(fx, Math.floor(player.position.y - 0.1), fz);
      const trapAt = world.getBlock(fx, Math.floor(player.position.y + 0.1), fz);
      const onTrap = trapBelow === Block.SpikeTrap || trapAt === Block.SpikeTrap;
      if (onTrap) {
        trapCooldown -= dt;
        if (trapCooldown <= 0) {
          trapCooldown = 1.15;
          player.takeDamage(7 + (environment?.day ?? 1) * 0.6);
          sound.hurt();
          particles.burst(
            player.position.x, player.position.y + 0.15, player.position.z,
            0x8e4d2a, 7, 1.8, 0.07, 14, 0.5, 1.1,
          );
        }
      } else {
        trapCooldown = Math.min(trapCooldown, 0.35);
      }
    }

    saveTimer += dt;
    if (saveTimer > 22) {
      saveTimer = 0;
      saveGame();
    }
  } else if (state !== 'menu' && state !== 'loading') {
    particles.update(dt);
    viewmodel.update(dt * 0.45, 0);
  }

  if (world && mpWorld) {
    remotePlayers.update(dt, net.players, net.selfId);
    remotePlayers.group.visible = remotePlayers.count > 0 && state !== 'menu' && state !== 'loading';
  } else {
    remotePlayers.group.visible = false;
  }

  if (world && environment) {
    environment.setUnderwater(player.headUnderwater);
    environment.follow(player.position);
    ui.updateStats(
      player.health, player.maxHealth,
      player.stamina, player.maxStamina,
      player.hunger, player.maxHunger,
      player.thirst, player.maxThirst,
      zombies?.kills ?? kills,
    );
    ui.updateClock(environment.day, environment.timeString(), isDangerHour(environment.hour));
    ui.updateCompass(player.yaw);
    ui.setUnderwater(player.headUnderwater);
    ui.setPoisoned(player.poison > 0);
  }

  viewmodel.setVisible(
    state === 'playing' || state === 'ready' || state === 'paused' || state === 'craft' || state === 'loot',
  );

  shadowTimer -= dt;
  if (shadowTimer <= 0) {
    shadowTimer = 0.28;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.render(scene, player.camera);
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__rotwood = {
    getState: () => state,
    forcePlay: () => {
      if (!world) return false;
      (window as unknown as { __rotwoodNoPause?: boolean }).__rotwoodNoPause = true;
      state = 'playing';
      ui.hidePause();
      ui.hideReady();
      return true;
    },
    setTime: (hour: number, day?: number) => {
      if (!environment) return;
      environment.setTime(hour, day ?? environment.day);
      environment.advance(0.0001);
      lastDanger = isDangerHour(environment.hour);
    },
    setHealth: (v: number) => {
      player.health = Math.max(0, Math.min(player.maxHealth, v));
    },
    setNeeds: (food: number, water: number) => {
      player.hunger = Math.max(0, Math.min(player.maxHunger, food));
      player.thirst = Math.max(0, Math.min(player.maxThirst, water));
    },
    invincible: () => {
      player.invulnTimer = 9999;
    },
    vulnerable: () => {
      player.invulnTimer = 0;
      (window as unknown as { __rotwoodNoPause?: boolean }).__rotwoodNoPause = false;
    },
    allowPause: () => {
      (window as unknown as { __rotwoodNoPause?: boolean }).__rotwoodNoPause = false;
    },
    flowWater: (x: number, y: number, z: number) => world?.flowWater(x, y, z) ?? 0,
    makeNoise: (x: number, y: number, z: number, radius = 40) => zombies?.makeNoise(x, y, z, radius),
    getPoiStates: () => [...(world?.poiStates.entries() ?? [])].map(([id, s]) => ({ id, remaining: s.remaining, total: s.total })),
    getContainers: () => [...(world?.containerLoot.entries() ?? [])].map(([key, items]) => ({
      key, items: items.map((s) => ({ item: s.item, count: s.count })),
    })),
    openContainer: (x: number, y: number, z: number) => openContainerAt(x, y, z),
    takeAllLoot: () => { if (state === 'loot') takeAllLoot(); },
    killZombie: (index = 0) => {
      const list = (zombies?.zombies ?? []).filter((z) => !z.dead);
      const z = list[index];
      if (!z || !zombies) return false;
      zombies.hit(z, 999, new THREE.Vector3(0, 0, 1));
      return true;
    },
    look: (yaw: number, pitch: number) => {
      player.yaw = yaw;
      player.pitch = Math.max(-1.5, Math.min(1.5, pitch));
    },
    aimAt: (x: number, y: number, z: number) => {
      const ox = player.position.x;
      const oy = player.position.y + 1.62;
      const oz = player.position.z;
      const dx = x - ox;
      const dy = y - oy;
      const dz = z - oz;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    damagePlayer: (v: number) => player.takeDamage(v),
    spawnZombie: () => {
      if (!world || !zombies || !environment) return;
      zombies.forceSpawn(world, player, 1, 1);
    },
    spawnZombieAt: (x: number, y: number, z: number) => {
      const zed = zombies?.spawnAt(x, y, z);
      return zed ? { x: zed.pos.x, y: zed.pos.y, z: zed.pos.z } : null;
    },
    spawnZombieKind: (kind: string, x: number, y: number, z: number) => {
      const zed = zombies?.spawnAt(x, y, z, kind as ZombieKind);
      return zed ? { x: zed.pos.x, y: zed.pos.y, z: zed.pos.z, kind: zed.kind } : null;
    },
    clearZombies: () => zombies?.clear(),
    getStreetKills: () => [...(world?.streetKills.entries() ?? [])],
    getArmor: () => ({ ...armor }),
    spawnBoss: () => {
      lastBossDay = 0;
      spawnBossNearPlayer();
      return bossZombie ? { x: bossZombie.pos.x, y: bossZombie.pos.y, z: bossZombie.pos.z } : null;
    },
    getPerf: () => ({
      frameMs: Math.round(perfFrameMs * 100) / 100,
      fps: Math.round(1000 / Math.max(1, perfFrameMs)),
      zombies: zombies?.zombies.filter((z) => !z.dead).length ?? 0,
      viewDistance: zombies?.viewDistance ?? 0,
      pixelRatio: renderer.getPixelRatio(),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      shadows: renderer.shadowMap.enabled,
      quality: settings.quality,
    }),
    getBoss: () => bossZombie && !bossZombie.dead
      ? { kind: bossZombie.kind, health: bossZombie.health, maxHealth: bossZombie.maxHealth, x: bossZombie.pos.x, z: bossZombie.pos.z, enraged: bossZombie.enraged }
      : null,
    hurt: (amount: number) => player.takeDamage(amount),
    fireHeld: () => {
      if (state !== 'playing') return false;
      const id = hotbar[selected];
      const tool = id ? getItem(id)?.tool : undefined;
      if (tool === 'rifle') { fireRifle(); return true; }
      if (tool === 'pistol') { firePistol(); return true; }
      if (tool === 'bow') { fireBow(); return true; }
      return false;
    },
    getPoiKills: () => [...(world?.poiKills.entries() ?? [])].map(([id, set]) => [id, [...set]]),
    killStreetOne: () => {
      const manager = zombies;
      if (!manager) return null;
      const target = manager.zombies.find((z) => !z.dead && z.poiId?.startsWith('street:'));
      if (!target) return null;
      manager.hit(target, 99999, new THREE.Vector3(0, 0, 1));
      return target.poiId;
    },
    give: (id: string, count = 1) => addItem(id, count),
    getZombies: () => (zombies?.zombies ?? []).filter((z) => !z.dead).map((z) => ({
      x: z.pos.x, y: z.pos.y, z: z.pos.z, health: z.health,
    })),
    getZombieDebug: () => (zombies?.zombies ?? []).filter((z) => !z.dead).map((z) => z.debugState()),
    teleportZombie: (index: number, x: number, y: number, z: number) => {
      const list = (zombies?.zombies ?? []).filter((zz) => !zz.dead);
      const zz = list[index];
      if (!zz) return null;
      zz.setPosition(x, y, z);
      return { x: zz.pos.x, y: zz.pos.y, z: zz.pos.z };
    },
    teleport: (x: number, y: number, z: number) => {
      world?.prepareArea(x, z, 2);
      player.setPosition(x, y, z);
    },
    getInfo: () => ({
      state,
      day: environment?.day,
      hour: environment?.hour,
      zombies: zombies?.zombies.filter((z) => !z.dead).length ?? 0,
      pos: { x: player.position.x, y: player.position.y, z: player.position.z },
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      hunger: player.hunger,
      thirst: player.thirst,
      kills: zombies?.kills ?? kills,
      seed: world?.seed,
      edits: world?.edits.size ?? 0,
      inventory: { ...inventory },
      hotbar: [...hotbar],
      selected,
    }),
    getBlock: (x: number, y: number, z: number) => world?.getBlock(x, y, z),
    getCars: () => townProps.debugCars(),
    getProgression: () => progression.toJSON(),
    openCarLoot: (index = 0) => {
      const cars = townProps.debugCars();
      const car = cars[index];
      if (!car) return false;
      openCarLoot(car);
      return true;
    },
    getMultiplayer: () => ({
      connected: net.connected,
      available: net.available,
      room: net.room,
      seed: net.seed,
      selfId: net.selfId,
      selfName: net.selfName,
      mpWorld,
      players: [...net.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color,
        state: p.state ? { ...p.state } : null,
      })),
      remoteAvatars: remotePlayers.count,
      avatarDebug: remotePlayers.debug(),
      edits: net.edits.size,
      looted: net.looted.size,
      poiKills: net.poiKills.size,
      day: net.day,
      hour: net.hour,
    }),
    groundY: (x: number, z: number) => (world ? world.columnTop(Math.floor(x), Math.floor(z)) + 1 : 0),
    findContainer: () => {
      if (!world) return null;
      const px = Math.floor(player.position.x);
      const py = Math.floor(player.position.y);
      const pz = Math.floor(player.position.z);
      let best: { x: number; y: number; z: number; name: string; dist: number } | null = null;
      for (let x = px - 40; x <= px + 40; x++) {
        for (let z = pz - 40; z <= pz + 40; z++) {
          for (let y = Math.max(1, py - 8); y <= Math.min(90, py + 10); y++) {
            const id = world.getBlock(x, y, z);
            const def = blockDef(id);
            if (!def?.container) continue;
            const d = Math.hypot(x + 0.5 - player.position.x, z + 0.5 - player.position.z);
            if (!best || d < best.dist) best = { x, y, z, name: def.name, dist: d };
          }
        }
      }
      return best;
    },
    townInfo: () => {
      if (!world) return null;
      const nearest = world.towns.nearestTown(player.position.x, player.position.z);
      if (!nearest) return null;
      return {
        distance: nearest.distance,
        cx: nearest.town.cx,
        cz: nearest.town.cz,
        baseY: nearest.town.baseY,
        buildings: nearest.town.buildings.map((b) => ({
          id: b.id, kind: b.kind, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1,
          baseY: b.baseY, front: b.front,
          wall: b.wall, roofType: b.roofType, roofAxis: b.roofAxis,
          porch: b.porch, awnings: b.awnings, fence: b.fence, bay: b.bay,
          floors: b.floors, stair: b.stair, traps: b.traps,
          containers: b.containers.length, zombies: b.zombieCount,
          spawn: b.zombieSpawns[0],
        })),
      };
    },
    setBlock: (x: number, y: number, z: number, id: number) => world?.setBlock(x, y, z, id),
    findWater: () => {
      if (!world) return null;
      for (let r = 6; r < 160; r += 4) {
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          const x = Math.round(player.position.x + Math.cos(a) * r);
          const z = Math.round(player.position.z + Math.sin(a) * r);
          if (world.surfaceHeight(x, z) < SEA_LEVEL - 3) {
            return { x: x + 0.5, y: SEA_LEVEL + 2, z: z + 0.5 };
          }
        }
      }
      return null;
    },
  };
}

const info = saveInfo();
ui.showMenu(
  !!loadSave(),
  info ? `Продолжить · День ${info.day} · ${info.time}` : undefined,
);
requestAnimationFrame(frame);
