export interface RemoteState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  health: number;
  dead: boolean;
}

export interface NetPlayer {
  id: string;
  name: string;
  color: string;
  state: RemoteState | null;
}

interface WelcomeMessage {
  type: 'welcome';
  self: { id: string; name: string; color: string };
  room: { id: string; seed: number };
  players: NetPlayer[];
  edits: [number, number, number, number][];
  looted: string[];
  poiKills: string[];
  pois: [string, { remaining: number; total: number }][];
  time: { day: number; hour: number };
}

export type NetChatMessage = {
  id?: string;
  name?: string;
  color?: string;
  text: string;
  system?: boolean;
  ts: number;
};

type NetStatus = 'connecting' | 'online' | 'offline';

function wsBase(): string {
  const explicit = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.hostname || 'localhost';
  const envPort = (import.meta.env.VITE_WS_PORT as string | undefined)?.trim();
  if (envPort) return `${proto}://${host}:${envPort}`;
  if (location.port === '5180' || location.port === '4180') return `${proto}://${host}:5190`;
  return `${proto}://${location.host}`;
}

function healthUrl(): string {
  const explicit = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (explicit) return `${explicit.replace(/^ws/, 'http').replace(/\/+$/, '')}/health`;
  const httpProto = location.protocol === 'https:' ? 'https' : 'http';
  const host = location.hostname || 'localhost';
  const envPort = (import.meta.env.VITE_WS_PORT as string | undefined)?.trim();
  if (envPort) return `${httpProto}://${host}:${envPort}/health`;
  if (location.port === '5180' || location.port === '4180') return `${httpProto}://${host}:5190/health`;
  return '/health';
}

export class NetClient {
  ws: WebSocket | null = null;
  connected = false;
  available = false;
  connecting = false;
  seed = 0;
  room = '';
  selfId = '';
  selfName = '';
  selfColor = '#e8a33d';
  players = new Map<string, NetPlayer>();
  edits = new Map<string, number>();
  looted = new Set<string>();
  poiKills = new Set<string>();
  pois = new Map<string, { remaining: number; total: number }>();
  day = 1;
  hour = 12;
  spawnAt: { x: number; y: number; z: number } | null = null;
  lastError = '';

  onWelcome?: () => void;
  onJoin?: (player: NetPlayer) => void;
  onLeave?: (player: NetPlayer) => void;
  onState?: (player: NetPlayer) => void;
  onEdit?: (x: number, y: number, z: number, id: number) => void;
  onLooted?: (key: string) => void;
  onPoiKill?: (id: string, index: number, remaining: number, total: number) => void;
  onChat?: (message: NetChatMessage) => void;
  onTime?: (day: number, hour: number) => void;
  onStatus?: (status: NetStatus, text: string, count: number) => void;
  onClose?: (reason: string) => void;

  private pendingResolve: ((ok: boolean) => void) | null = null;
  private pendingRoom = '';
  private pendingName = '';
  private connectPromise: Promise<boolean> | null = null;
  private generation = 0;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;

  async probe(room: string): Promise<boolean> {
    const cleanRoom = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'rotwood';
    try {
      const res = await fetch(healthUrl(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`health ${res.status}`);
      const data = await res.json() as { rooms?: { id: string; players: number }[] };
      const info = data.rooms?.find((entry) => entry.id === cleanRoom);
      this.available = true;
      this.onStatus?.('online', 'Сервер онлайн', Math.max(0, Number(info?.players) || 0));
      return true;
    } catch {
      this.available = false;
      this.onStatus?.('offline', 'Сервер недоступен — одиночная игра', 0);
      return false;
    }
  }

  async join(room: string, name: string, seed?: number): Promise<boolean> {
    const cleanRoom = room.trim() || 'rotwood';
    const cleanName = name.trim() || 'Выживший';
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      if (this.room === cleanRoom && this.selfName === cleanName) return true;
    }
    if (this.connecting && this.connectPromise && this.pendingRoom === cleanRoom && this.pendingName === cleanName) {
      return this.connectPromise;
    }
    return this.connect(cleanRoom, cleanName, seed);
  }

  connect(room: string, name: string, seed?: number): Promise<boolean> {
    this.disconnect(false);
    const gen = ++this.generation;
    const cleanRoom = room.trim() || 'rotwood';
    const cleanName = name.trim() || 'Выживший';
    this.pendingRoom = cleanRoom;
    this.pendingName = cleanName;
    this.connecting = true;
    this.available = false;
    this.onStatus?.('connecting', 'Подключение к серверу…', 0);

    const params = new URLSearchParams({ room: cleanRoom, name: cleanName });
    if (seed && seed > 0) params.set('seed', String(seed >>> 0));
    const url = `${wsBase()}/?${params.toString()}`;

    const promise = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (this.welcomeTimer) {
          clearTimeout(this.welcomeTimer);
          this.welcomeTimer = null;
        }
        if (this.connectPromise === promise) this.connectPromise = null;
        const pending = this.pendingResolve;
        this.pendingResolve = null;
        pending?.(ok);
        resolve(ok);
      };
      this.pendingResolve = finish;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        this.lastError = String(err);
        this.connecting = false;
        this.available = false;
        this.onStatus?.('offline', 'Сервер недоступен — одиночная игра', 0);
        finish(false);
        return;
      }
      this.ws = ws;

      this.welcomeTimer = setTimeout(() => {
        if (gen !== this.generation) return;
        if (!this.connected) {
          this.lastError = 'Нет ответа от сервера';
          this.onStatus?.('offline', 'Сервер не отвечает — одиночная игра', 0);
          try { ws.close(); } catch { /* ignore */ }
          this.connecting = false;
          this.available = false;
          finish(false);
        }
      }, 2600);

      ws.onopen = () => {
        if (gen !== this.generation) return;
        this.connecting = true;
      };

      ws.onmessage = (event) => {
        if (gen !== this.generation) return;
        let msg: unknown;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object') return;
        const data = msg as Record<string, unknown> & { type?: string };
        switch (data.type) {
          case 'welcome': {
            const w = data as unknown as WelcomeMessage;
            this.seed = Number(w.room?.seed) || 0;
            this.room = String(w.room?.id ?? cleanRoom);
            this.selfId = String(w.self?.id ?? '');
            this.selfName = String(w.self?.name ?? cleanName);
            this.selfColor = String(w.self?.color ?? '#e8a33d');
            this.players.clear();
            for (const p of w.players ?? []) {
              if (p && p.id) this.players.set(String(p.id), {
                id: String(p.id),
                name: String(p.name ?? 'Выживший'),
                color: String(p.color ?? '#e8a33d'),
                state: p.state ?? null,
              });
            }
            this.edits.clear();
            for (const edit of w.edits ?? []) {
              if (!Array.isArray(edit) || edit.length !== 4) continue;
              const [x, y, z, id] = edit;
              if ([x, y, z, id].every((v) => Number.isFinite(Number(v)))) {
                this.edits.set(`${Number(x)},${Number(y)},${Number(z)}`, Number(id));
              }
            }
            this.looted = new Set((w.looted ?? []).filter((k) => typeof k === 'string'));
            this.poiKills = new Set((w.poiKills ?? []).filter((k) => typeof k === 'string'));
            this.pois.clear();
            for (const entry of w.pois ?? []) {
              if (!Array.isArray(entry) || entry.length < 2) continue;
              const [id, state] = entry;
              if (typeof id !== 'string' || !state) continue;
              this.pois.set(id, {
                remaining: Math.max(0, Number(state.remaining) || 0),
                total: Math.max(0, Number(state.total) || 0),
              });
            }
            this.day = Math.max(1, Number(w.time?.day) || 1);
            this.hour = Number(w.time?.hour) || 12;
            this.spawnAt = null;
            for (const p of this.players.values()) {
              if (p.state) {
                this.spawnAt = { x: p.state.x, y: p.state.y, z: p.state.z };
                break;
              }
            }
            this.connected = true;
            this.available = true;
            this.connecting = false;
            this.onStatus?.('online', 'Онлайн', this.players.size + 1);
            this.onWelcome?.();
            finish(true);
            break;
          }
          case 'join': {
            const raw = data.player as NetPlayer | undefined;
            if (!raw?.id) break;
            const player: NetPlayer = {
              id: String(raw.id),
              name: String(raw.name ?? 'Выживший'),
              color: String(raw.color ?? '#e8a33d'),
              state: raw.state ?? null,
            };
            this.players.set(player.id, player);
            this.onStatus?.('online', 'Онлайн', this.players.size + 1);
            this.onJoin?.(player);
            break;
          }
          case 'leave': {
            const id = String(data.id ?? '');
            const player = this.players.get(id);
            this.players.delete(id);
            this.onStatus?.('online', 'Онлайн', this.players.size + 1);
            if (player) this.onLeave?.(player);
            break;
          }
          case 'state': {
            const id = String(data.id ?? '');
            const player = this.players.get(id);
            if (!player) break;
            player.state = {
              x: Number(data.x) || 0,
              y: Number(data.y) || 0,
              z: Number(data.z) || 0,
              yaw: Number(data.yaw) || 0,
              pitch: Number(data.pitch) || 0,
              speed: Number(data.speed) || 0,
              health: Number(data.health) || 0,
              dead: !!data.dead,
            };
            this.onState?.(player);
            break;
          }
          case 'edit': {
            const x = Number(data.x);
            const y = Number(data.y);
            const z = Number(data.z);
            const id = Number(data.id);
            if (![x, y, z, id].every(Number.isFinite)) break;
            this.edits.set(`${x},${y},${z}`, id);
            this.onEdit?.(x, y, z, id);
            break;
          }
          case 'looted': {
            const key = String(data.key ?? '');
            if (!key) break;
            this.looted.add(key);
            this.onLooted?.(key);
            break;
          }
          case 'poiKill': {
            const id = String(data.id ?? '');
            const index = Number(data.index);
            if (!id || !Number.isFinite(index)) break;
            this.poiKills.add(`${id}:${index}`);
            const remaining = Math.max(0, Number(data.remaining) || 0);
            const total = Math.max(0, Number(data.total) || 0);
            this.pois.set(id, { remaining, total });
            this.onPoiKill?.(id, index, remaining, total);
            break;
          }
          case 'chat': {
            this.onChat?.({
              id: typeof data.id === 'string' ? data.id : undefined,
              name: typeof data.name === 'string' ? data.name : undefined,
              color: typeof data.color === 'string' ? data.color : undefined,
              text: String(data.text ?? ''),
              system: !!data.system,
              ts: Number(data.ts) || Date.now(),
            });
            break;
          }
          case 'time': {
            const day = Math.max(1, Number(data.day) || 1);
            const hour = Number(data.hour) || 0;
            this.day = day;
            this.hour = hour;
            this.onTime?.(day, hour);
            break;
          }
          case 'error': {
            this.lastError = String(data.text ?? 'Ошибка сервера');
            this.onChat?.({ system: true, text: this.lastError, ts: Date.now() });
            break;
          }
        }
      };

      ws.onerror = () => {
        if (gen !== this.generation) return;
        this.lastError = 'Не удалось подключиться к серверу';
        if (!this.connected) {
          this.available = false;
          this.connecting = false;
          this.onStatus?.('offline', 'Сервер недоступен — одиночная игра', 0);
          finish(false);
        }
      };

      ws.onclose = () => {
        if (gen !== this.generation) return;
        const wasConnected = this.connected;
        this.connected = false;
        this.available = false;
        this.connecting = false;
        this.ws = null;
        if (this.welcomeTimer) {
          clearTimeout(this.welcomeTimer);
          this.welcomeTimer = null;
        }
        if (!wasConnected) {
          this.onStatus?.('offline', 'Сервер недоступен — одиночная игра', 0);
          finish(false);
        } else {
          this.onStatus?.('offline', 'Соединение потеряно', this.players.size);
          this.onClose?.(this.lastError || 'Соединение с сервером потеряно');
        }
      };
    });
    this.connectPromise = promise;
    return promise;
  }

  disconnect(notify = true) {
    this.generation++;
    if (this.welcomeTimer) {
      clearTimeout(this.welcomeTimer);
      this.welcomeTimer = null;
    }
    this.connectPromise = null;
    const pending = this.pendingResolve;
    this.pendingResolve = null;
    pending?.(false);
    if (this.ws) {
      try { this.ws.close(1000, 'client leave'); } catch { /* ignore */ }
    }
    const wasConnected = this.connected;
    this.ws = null;
    this.connected = false;
    this.available = false;
    this.connecting = false;
    this.players.clear();
    if (wasConnected && notify) {
      this.onStatus?.('offline', 'Вы вышли из сети', 0);
    }
  }

  private send(data: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendState(state: RemoteState) {
    if (!this.connected) return;
    this.send({ type: 'state', ...state });
  }

  sendEdit(x: number, y: number, z: number, id: number) {
    if (!this.connected) return;
    this.send({ type: 'edit', x, y, z, id });
  }

  sendLooted(key: string) {
    if (!this.connected) return;
    this.looted.add(key);
    this.send({ type: 'looted', key });
  }

  sendPoiKill(id: string, index: number, remaining: number, total: number) {
    if (!this.connected) return;
    this.send({ type: 'poiKill', id, index, remaining, total });
  }

  sendChat(text: string) {
    if (!this.connected) return;
    const clean = text.trim().slice(0, 180);
    if (!clean) return;
    this.send({ type: 'chat', text: clean });
  }
}

export const net = new NetClient();
