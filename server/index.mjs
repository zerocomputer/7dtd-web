import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.WS_PORT || process.env.PORT || 5190);
const DATA_FILE = process.env.ROOMS_FILE || fileURLToPath(new URL('./rooms.json', import.meta.url));
const STATIC_ROOT = fileURLToPath(new URL('../dist', import.meta.url));
const MAX_PLAYERS = 16;
const DAY_LENGTH = 720;
const COLORS = ['#e8a33d', '#7fb3ff', '#8bd17c', '#e07a9a', '#c9a0ff', '#ffd166', '#6ed6c9', '#ff9f6e'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** @type {Map<string, Room>} */
const rooms = new Map();
let nextPlayerId = 1;
let saveTimer = null;

/*
 * Room shape:
 *  seed, players Map, edits Map, looted Set, poiKills Set, pois Map,
 *  baseDay, baseHour, epoch (null while the room is empty/frozen), createdAt
 */

function makeRoom(id, seed) {
  return {
    id,
    seed: seed >>> 0,
    players: new Map(),
    edits: new Map(),
    looted: new Set(),
    poiKills: new Set(),
    pois: new Map(),
    baseDay: 1,
    baseHour: 12,
    epoch: null,
    createdAt: Date.now(),
  };
}

function roomTime(room) {
  if (room.epoch === null) return { day: room.baseDay, hour: room.baseHour };
  const totalHours = (room.baseDay - 1) * 24 + room.baseHour + ((Date.now() - room.epoch) / 1000) * (24 / DAY_LENGTH);
  return { day: 1 + Math.floor(totalHours / 24), hour: totalHours % 24 };
}

function freezeRoomTime(room) {
  const t = roomTime(room);
  room.baseDay = t.day;
  room.baseHour = t.hour;
  room.epoch = null;
}

function startRoomTime(room) {
  if (room.epoch === null) room.epoch = Date.now();
}

function sanitizeRoom(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const clean = raw.replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  return clean || 'rotwood';
}

function sanitizeName(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const clean = raw.replace(/[<>&\u0000-\u001f]/g, '').slice(0, 16);
  return clean || 'Выживший';
}

function sanitizeChat(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>&\u0000-\u001f]/g, '').trim().slice(0, 180);
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcast(room, data, exceptId = null) {
  for (const player of room.players.values()) {
    if (exceptId && player.id === exceptId) continue;
    send(player.ws, data);
  }
}

function broadcastSystem(room, text, exceptId = null) {
  broadcast(room, { type: 'chat', system: true, text, ts: Date.now() }, exceptId);
}

function serializeRoom(room) {
  const time = roomTime(room);
  return {
    id: room.id,
    seed: room.seed,
    day: time.day,
    hour: time.hour,
    createdAt: room.createdAt,
    edits: [...room.edits.entries()].map(([key, id]) => {
      const [x, y, z] = key.split(',').map(Number);
      return [x, y, z, id];
    }),
    looted: [...room.looted],
    poiKills: [...room.poiKills],
    pois: [...room.pois.entries()],
  };
}

function saveRooms() {
  const payload = {
    version: 1,
    savedAt: Date.now(),
    rooms: [...rooms.values()].map((room) => {
      const data = serializeRoom(room);
      if (room.players.size === 0) freezeRoomTime(room);
      return data;
    }),
  };
  try {
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload));
    renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('[server] failed to save rooms', err);
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveRooms();
  }, 1500);
}

function loadRooms() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    for (const raw of data.rooms ?? []) {
      if (!raw || !raw.id) continue;
      const room = makeRoom(sanitizeRoom(raw.id), Number(raw.seed) || 1);
      room.baseDay = Math.max(1, Number(raw.day) || 1);
      room.baseHour = Math.max(0, Math.min(23.99, Number(raw.hour) || 0));
      room.createdAt = Number(raw.createdAt) || Date.now();
      for (const entry of raw.edits ?? []) {
        if (!Array.isArray(entry) || entry.length !== 4) continue;
        const [x, y, z, id] = entry.map(Number);
        if (![x, y, z, id].every(Number.isFinite)) continue;
        room.edits.set(`${x},${y},${z}`, id);
      }
      for (const key of raw.looted ?? []) if (typeof key === 'string') room.looted.add(key);
      for (const key of raw.poiKills ?? []) if (typeof key === 'string') room.poiKills.add(key);
      for (const entry of raw.pois ?? []) {
        if (!Array.isArray(entry) || entry.length < 3) continue;
        room.pois.set(String(entry[0]), {
          remaining: Math.max(0, Number(entry[1]) || 0),
          total: Math.max(0, Number(entry[2]) || 0),
        });
      }
      rooms.set(room.id, room);
    }
    console.log(`[server] loaded ${rooms.size} room(s)`);
  } catch (err) {
    console.error('[server] failed to load rooms', err);
  }
}

function playerPublic(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    state: player.state,
  };
}

function welcome(room, player) {
  const time = roomTime(room);
  return {
    type: 'welcome',
    self: { id: player.id, name: player.name, color: player.color },
    room: { id: room.id, seed: room.seed },
    players: [...room.players.values()]
      .filter((p) => p.id !== player.id)
      .map(playerPublic),
    edits: [...room.edits.entries()].map(([key, id]) => {
      const [x, y, z] = key.split(',').map(Number);
      return [x, y, z, id];
    }),
    looted: [...room.looted],
    poiKills: [...room.poiKills],
    pois: [...room.pois.entries()],
    time,
  };
}

/** @typedef {ReturnType<typeof makeRoom>} Room */

async function serveHttp(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({
      ok: true,
      rooms: [...rooms.values()].map((room) => ({
        id: room.id,
        seed: room.seed,
        players: room.players.size,
        ...roomTime(room),
      })),
    }));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';

  let file = resolve(STATIC_ROOT, `.${pathname}`);
  const rel = relative(STATIC_ROOT, file);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
  } catch {
    if (extname(pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    file = join(STATIC_ROOT, 'index.html');
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const ext = extname(file).toLowerCase();
    const cache = ext === '.html'
      ? 'no-cache'
      : pathname.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': cache,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found. Run `npm run build` to create dist/ before starting the production server.');
  }
}

const httpServer = createServer((req, res) => {
  void serveHttp(req, res).catch((err) => {
    console.error('[server] http error', err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal server error');
  });
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const roomId = sanitizeRoom(url.searchParams.get('room'));
  const name = sanitizeName(url.searchParams.get('name'));
  const requestedSeed = Number(url.searchParams.get('seed'));
  let room = rooms.get(roomId);
  if (!room) {
    const seed = Number.isFinite(requestedSeed) && requestedSeed > 0
      ? requestedSeed >>> 0
      : (Math.random() * 0xffffffff) >>> 0;
    room = makeRoom(roomId, seed);
    rooms.set(roomId, room);
    console.log(`[server] created room ${roomId} seed ${room.seed}`);
    scheduleSave();
  }
  if (room.players.size >= MAX_PLAYERS) {
    send(ws, { type: 'error', text: 'Комната заполнена (максимум 16 игроков).' });
    ws.close(4001, 'room full');
    return;
  }

  startRoomTime(room);
  const id = `p${nextPlayerId++}`;
  const player = {
    id,
    name,
    color: COLORS[(nextPlayerId + room.players.size) % COLORS.length],
    ws,
    state: null,
    lastStateAt: 0,
    lastChatAt: 0,
    isAlive: true,
  };

  room.players.set(id, player);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  send(ws, welcome(room, player));
  broadcast(room, {
    type: 'join',
    player: { id, name, color: player.color },
  }, id);
  broadcastSystem(room, `${name} подключился`, id);
  console.log(`[server] ${name} (${id}) joined ${roomId}; ${room.players.size} online`);
  scheduleSave();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'state') {
      const now = Date.now();
      if (now - player.lastStateAt < 32) return;
      player.lastStateAt = now;
      const x = Number(msg.x);
      const y = Number(msg.y);
      const z = Number(msg.z);
      if (![x, y, z].every(Number.isFinite)) return;
      player.state = {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        z: Math.round(z * 100) / 100,
        yaw: Number.isFinite(Number(msg.yaw)) ? Number(msg.yaw) : 0,
        pitch: Number.isFinite(Number(msg.pitch)) ? Number(msg.pitch) : 0,
        speed: Math.max(0, Math.min(20, Number(msg.speed) || 0)),
        health: Math.max(0, Math.min(100, Number(msg.health) || 0)),
        dead: !!msg.dead,
      };
      broadcast(room, {
        type: 'state',
        id,
        ...player.state,
      }, id);
      return;
    }

    if (msg.type === 'edit') {
      const x = Number(msg.x);
      const y = Number(msg.y);
      const z = Number(msg.z);
      const block = Number(msg.id);
      if (![x, y, z, block].every(Number.isFinite)) return;
      if (y < 0 || y > 255 || block < 0 || block > 255) return;
      room.edits.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, Math.floor(block));
      broadcast(room, {
        type: 'edit',
        x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), id: Math.floor(block),
      }, id);
      scheduleSave();
      return;
    }

    if (msg.type === 'looted') {
      const key = typeof msg.key === 'string' ? msg.key.slice(0, 40) : '';
      if (!key) return;
      room.looted.add(key);
      broadcast(room, { type: 'looted', key }, id);
      scheduleSave();
      return;
    }

    if (msg.type === 'poiKill') {
      const poiId = typeof msg.id === 'string' ? msg.id.slice(0, 120) : '';
      const index = Number(msg.index);
      const remaining = Number(msg.remaining);
      const total = Number(msg.total);
      if (!poiId || !Number.isFinite(index) || !Number.isFinite(remaining) || !Number.isFinite(total)) return;
      room.poiKills.add(`${poiId}:${Math.floor(index)}`);
      const current = room.pois.get(poiId);
      const next = {
        remaining: Math.max(0, Math.min(current?.remaining ?? remaining, Math.floor(remaining))),
        total: Math.max(current?.total ?? total, Math.floor(total)),
      };
      room.pois.set(poiId, next);
      broadcast(room, {
        type: 'poiKill',
        id: poiId,
        index: Math.floor(index),
        remaining: next.remaining,
        total: next.total,
      }, id);
      scheduleSave();
      return;
    }

    if (msg.type === 'chat') {
      const text = sanitizeChat(msg.text);
      const now = Date.now();
      if (!text || now - player.lastChatAt < 550) return;
      player.lastChatAt = now;
      broadcast(room, {
        type: 'chat',
        id,
        name: player.name,
        color: player.color,
        text,
        ts: now,
      });
    }
  });

  ws.on('close', () => {
    room.players.delete(id);
    broadcast(room, { type: 'leave', id });
    broadcastSystem(room, `${name} вышел`);
    if (room.players.size === 0) freezeRoomTime(room);
    scheduleSave();
    console.log(`[server] ${name} (${id}) left ${roomId}; ${room.players.size} online`);
  });

  ws.on('error', (err) => {
    console.error('[server] socket error', err.message);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;
    const time = roomTime(room);
    broadcast(room, { type: 'time', day: time.day, hour: time.hour });
  }
}, 10000);

loadRooms();
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] ROTWOOD multiplayer listening on 0.0.0.0:${PORT}`);
  console.log(`[server] static root: ${STATIC_ROOT}`);
});

function shutdown() {
  console.log('[server] shutting down…');
  for (const room of rooms.values()) {
    if (room.players.size === 0) freezeRoomTime(room);
  }
  saveRooms();
  for (const ws of wss.clients) ws.close(1001, 'server shutdown');
  wss.close(() => {
    httpServer.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
