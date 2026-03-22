import { WebSocketServer } from 'ws';
import os from 'node:os';
import { decode, encode, MsgType, Role } from '@hack/shared';

/**
 * @typedef {{ id:string, name:string, role:string, classId: string|null, confirmed: boolean, ready:boolean, ws: import('ws').WebSocket }} Player
 */

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `p_${Math.random().toString(16).slice(2)}`;
}

const HERO_CLASSES = /** @type {const} */ (['hero:tank', 'hero:dps', 'hero:support', 'hero:mage']);
const VILLAIN_CLASSES = /** @type {const} */ (['villain:mage', 'villain:brute', 'villain:agile']);

function isAllowedClassId(classId) {
  return HERO_CLASSES.includes(classId) || VILLAIN_CLASSES.includes(classId);
}

function classToRole(classId) {
  return HERO_CLASSES.includes(classId) ? Role.HERO : Role.VILLAIN;
}

function getHostUrls(port) {
  /** @type {string[]} */
  const ips = [];
  const nets = os.networkInterfaces();

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (!e) continue;
      if (e.family !== 'IPv4') continue;
      if (e.internal) continue;
      if (typeof e.address !== 'string' || e.address.length === 0) continue;
      ips.push(e.address);
    }
  }

  const uniqueIps = Array.from(new Set(ips)).sort();
  const urls = uniqueIps.map((ip) => `ws://${ip}:${port}`);
  urls.unshift(`ws://localhost:${port}`);
  return urls;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} seed
 * @param {number} count
 */
function makeSpawnPoints(seed, count) {
  const rand = mulberry32(seed);
  const base = rand() * Math.PI * 2;

  /** @type {Array<{x:number, z:number}>} */
  const points = [];
  for (let i = 0; i < count; i++) {
    const angleJitter = (rand() - 0.5) * (Math.PI / 9);
    const radius = 3.0 + rand() * 1.25;
    const angle = base + i * ((Math.PI * 2) / count) + angleJitter;
    points.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    });
  }

  // Shuffle so spawn ordering isn't always the same for early-joining players.
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = points[i];
    points[i] = points[j];
    points[j] = tmp;
  }

  return points;
}

export function createGameServer({ port = 8080, countdownSeconds = 10 } = {}) {
  const wss = new WebSocketServer({ port });
  /** @type {Map<string, Player>} */
  const players = new Map();

  /** @type {Promise<any> | null} */
  let rapierReady = null;
  async function getRapier() {
    if (!rapierReady) {
      rapierReady = import('@dimforge/rapier3d-compat').then(async (m) => {
        const RAPIER = m.default ?? m;
        if (typeof RAPIER.init === 'function') {
          const origWarn = console.warn;
          console.warn = (...args) => {
            const msg = String(args?.[0] ?? '');
            if (msg.includes('deprecated parameters for the initialization function')) return;
            origWarn(...args);
          };
          try {
            await RAPIER.init({});
          } finally {
            console.warn = origWarn;
          }
        }
        return RAPIER;
      });
    }
    return rapierReady;
  }

  // Warm up Rapier/WASM so game_begin-to-first-snapshot latency is small.
  // If it fails, we’ll fall back to "no physics" (client will still render static scene).
  getRapier().catch(() => {
    // ignore
  });

  const hostUrls = getHostUrls(port);

  /** @type {string | null} */
  let hostId = null;
  let matchStarted = false;
  let gameStarted = false;
  /** @type {number | null} */
  let countdownEndsAt = null;
  /** @type {NodeJS.Timeout | null} */
  let countdownTimer = null;

  /** @type {Array<{id:string, x:number, z:number}> | null} */
  let matchSpawns = null;

  /** @type {null | { RAPIER:any, world:any, bodies: Map<string, any>, input: Map<string, {x:number, z:number}>, tickTimer: NodeJS.Timeout, snapshotTimer: NodeJS.Timeout }} */
  let sim = null;

  const SIM_HZ = 60;
  const SNAPSHOT_HZ = 20;
  const PLAYER_SPEED = 4.2;
  // With a capsule collider, the body origin should sit above the ground by (radius + halfHeight).
  // If we lock Y translation and spawn intersecting the ground, Rapier can't resolve the contact and movement appears stuck.
  const PLAYER_Y = 0.62;
  const ARENA_HALF = 6.0;
  const WALL_THICKNESS = 0.25;
  const WALL_HEIGHT = 2.5;

  function stopSimulation() {
    if (!sim) return;
    clearInterval(sim.tickTimer);
    clearInterval(sim.snapshotTimer);
    sim = null;
  }

  /** @param {Array<{id:string,x:number,z:number}>} spawns */
  async function startSimulation(spawns) {
    stopSimulation();

    const RAPIER = await getRapier();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    world.timestep = 1 / SIM_HZ;

    // Ground: thin fixed box centered at y=0.
    {
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
      const col = RAPIER.ColliderDesc.cuboid(40, 0.05, 40).setFriction(1.0);
      world.createCollider(col, rb);
    }

    // Walls: four fixed boxes. (Equivalent to an XY-plane wall at +/-Z, and YZ-plane walls at +/-X.)
    {
      const t = WALL_THICKNESS;
      const h = WALL_HEIGHT;
      const a = ARENA_HALF;

      const wallDefs = [
        // +Z / -Z walls (XY planes at z=±a)
        { x: 0, y: h / 2, z: a + t, hx: a + t, hy: h / 2, hz: t },
        { x: 0, y: h / 2, z: -a - t, hx: a + t, hy: h / 2, hz: t },
        // +X / -X walls (YZ planes at x=±a)
        { x: a + t, y: h / 2, z: 0, hx: t, hy: h / 2, hz: a + t },
        { x: -a - t, y: h / 2, z: 0, hx: t, hy: h / 2, hz: a + t },
      ];

      for (const w of wallDefs) {
        const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w.x, w.y, w.z));
        const col = RAPIER.ColliderDesc.cuboid(w.hx, w.hy, w.hz).setFriction(1.0);
        world.createCollider(col, rb);
      }
    }

    /** @type {Map<string, any>} */
    const bodies = new Map();
    /** @type {Map<string, {x:number, z:number}>} */
    const input = new Map();

    for (const s of spawns) {
      const x = Number.isFinite(s.x) ? s.x : 0;
      const z = Number.isFinite(s.z) ? s.z : 0;

      const rbDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, PLAYER_Y, z)
        .setLinearDamping(6.0)
        .setAngularDamping(10.0);
      const rb = world.createRigidBody(rbDesc);

      // Keep movement on XZ plane.
      if (typeof rb.setEnabledRotations === 'function') {
        rb.setEnabledRotations(false, false, false, true);
      }
      if (typeof rb.setEnabledTranslations === 'function') {
        rb.setEnabledTranslations(true, false, true, true);
      }

      // Capsule collider for "egg" placeholder (could be sphere if preferred).
      const radius = 0.35;
      const halfHeight = 0.25;
      const colDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
        .setFriction(1.0)
        .setRestitution(0.0);
      world.createCollider(colDesc, rb);

      bodies.set(s.id, rb);
      input.set(s.id, { x: 0, z: 0 });
    }

    const tickTimer = setInterval(() => {
      // Apply inputs as target velocities.
      for (const [id, rb] of bodies.entries()) {
        const i = input.get(id) ?? { x: 0, z: 0 };
        let ax = Number.isFinite(i.x) ? i.x : 0;
        let az = Number.isFinite(i.z) ? i.z : 0;
        const mag = Math.hypot(ax, az);
        if (mag > 1e-6 && mag > 1) {
          ax /= mag;
          az /= mag;
        }

        rb.setLinvel({ x: ax * PLAYER_SPEED, y: 0, z: az * PLAYER_SPEED }, true);
      }

      world.step();
    }, Math.floor(1000 / SIM_HZ));

    const snapshotTimer = setInterval(() => {
      /** @type {Array<{id:string,x:number,y:number,z:number}>} */
      const list = [];
      for (const [id, rb] of bodies.entries()) {
        const t = rb.translation();
        list.push({ id, x: t.x, y: t.y, z: t.z });
      }
      broadcast(MsgType.SNAPSHOT, { t: Date.now(), players: list });
    }, Math.floor(1000 / SNAPSHOT_HZ));

    sim = { RAPIER, world, bodies, input, tickTimer, snapshotTimer };
  }

  function ensureHost() {
    if (hostId && players.has(hostId)) return;
    const first = players.values().next();
    hostId = first.done ? null : first.value.id;
  }

  function activePlayers() {
    return Array.from(players.values()).filter((p) => p.role !== Role.SPECTATOR);
  }

  function confirmedActivePlayers() {
    return activePlayers().filter((p) => p.confirmed);
  }

  function confirmedVillainExists() {
    return Array.from(players.values()).some((p) => p.confirmed && p.role === Role.VILLAIN);
  }

  function confirmedHeroesCount() {
    return Array.from(players.values()).filter((p) => p.confirmed && p.role === Role.HERO).length;
  }

  function classTaken(classId) {
    return Array.from(players.values()).some((p) => p.confirmed && p.classId === classId);
  }

  function lobbyState() {
    ensureHost();
    return {
      maxPlayers: 4,
      hostId,
      matchStarted,
      countdownEndsAt: countdownEndsAt ?? undefined,
      gameStarted,
      players: Array.from(players.values()).map(lobbyPlayerState),
    };
  }

  function broadcast(type, payload) {
    const msg = encode({ type, ...payload });
    for (const p of players.values()) {
      p.ws.send(msg);
    }
  }

  function maybeStartCountdown() {
    if (!matchStarted) return;
    if (gameStarted) return;
    if (countdownEndsAt) return;

    const confirmed = confirmedActivePlayers();
    if (confirmed.length !== 4) return;

    const ms = Math.max(0, Math.floor(countdownSeconds * 1000));
    countdownEndsAt = Date.now() + ms;
    broadcast(MsgType.COUNTDOWN, { endsAt: countdownEndsAt });
    broadcastLobby();

    countdownTimer = setTimeout(() => {
      const spawns = Array.isArray(matchSpawns)
        ? matchSpawns
        : confirmedActivePlayers().map((p) => ({ id: p.id, x: 0, z: 0 }));

      startSimulation(spawns)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('failed to start simulation', err);
          broadcast(MsgType.ERROR, { message: 'physics init failed (continuing without collisions)' });
        })
        .finally(() => {
          gameStarted = true;
          broadcast(MsgType.GAME_BEGIN, {});
          broadcastLobby();
        });
    }, ms);
  }

  function lobbyPlayerState(p) {
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      ready: p.ready,
      classId: p.classId ?? undefined,
      confirmed: p.confirmed ? true : undefined,
    };
  }

  function broadcastLobby() {
    const msg = encode({ type: MsgType.LOBBY, lobby: lobbyState() });
    for (const p of players.values()) {
      p.ws.send(msg);
    }
  }

  wss.on('connection', (ws) => {
    const playerId = makeId();

    /** @type {Player} */
    const player = {
      id: playerId,
      name: 'Anonymous',
      role: Role.SPECTATOR,
      classId: null,
      confirmed: false,
      ready: false,
      ws,
    };
    players.set(playerId, player);
    ensureHost();

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      const res = decode(raw);
      if (!res.ok) {
        ws.send(encode({ type: MsgType.ERROR, message: res.error }));
        return;
      }

      const msg = res.data;
      if (msg.type === MsgType.JOIN) {
        player.name = msg.name.slice(0, 24);
        const activeCount = activePlayers().filter((p) => p.id !== player.id).length;
        player.role = activeCount < 4 ? Role.UNASSIGNED : Role.SPECTATOR;
        player.ready = false;
        player.classId = null;
        player.confirmed = false;

        if (!hostId) hostId = player.id;
        ensureHost();

        ws.send(
          encode({
            type: MsgType.WELCOME,
            playerId: player.id,
            role: player.role,
            lobby: lobbyState(),
            hostUrls,
          })
        );

        broadcastLobby();
      }

      if (msg.type === MsgType.READY) {
        if (matchStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'match already started' }));
          return;
        }

        player.ready = msg.ready;
        broadcastLobby();
      }

      if (msg.type === MsgType.PICK) {
        if (!matchStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'match not started' }));
          return;
        }
        if (gameStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'game already started' }));
          return;
        }
        if (player.role === Role.SPECTATOR) {
          ws.send(encode({ type: MsgType.ERROR, message: 'spectator cannot pick' }));
          return;
        }
        if (player.confirmed) {
          ws.send(encode({ type: MsgType.ERROR, message: 'already confirmed' }));
          return;
        }
        const classId = msg.classId.trim();
        if (!isAllowedClassId(classId)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'invalid class' }));
          return;
        }

        const desiredRole = classToRole(classId);
        const heroesConfirmed = confirmedHeroesCount();
        const villainConfirmed = confirmedVillainExists();

        if (desiredRole === Role.HERO && heroesConfirmed >= 3) {
          ws.send(encode({ type: MsgType.ERROR, message: 'heroes already full' }));
          return;
        }
        if (desiredRole === Role.VILLAIN && villainConfirmed) {
          ws.send(encode({ type: MsgType.ERROR, message: 'villain already taken' }));
          return;
        }
        if (desiredRole === Role.HERO && classTaken(classId)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'class already taken' }));
          return;
        }
        if (desiredRole === Role.VILLAIN && classTaken(classId)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'class already taken' }));
          return;
        }

        player.role = desiredRole;
        player.classId = classId;
        player.confirmed = true;

        broadcastLobby();
        maybeStartCountdown();
      }

      if (msg.type === MsgType.INPUT) {
        if (!gameStarted || !sim) return;
        if (player.role === Role.SPECTATOR) return;
        const x = msg.axis?.x;
        const z = msg.axis?.z;
        if (typeof x !== 'number' || typeof z !== 'number') return;
        if (sim.input.has(player.id)) {
          sim.input.set(player.id, { x, z });
        }
      }

      if (msg.type === MsgType.START) {
        ensureHost();
        if (!hostId || player.id !== hostId) {
          ws.send(encode({ type: MsgType.ERROR, message: 'only host can start' }));
          return;
        }
        if (matchStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'match already started' }));
          return;
        }
        if (gameStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'game already started' }));
          return;
        }

        const active = activePlayers();
        if (active.length !== 4) {
          ws.send(encode({ type: MsgType.ERROR, message: 'need 4 active players to start' }));
          return;
        }
        if (!active.every((p) => p.ready)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'all players must be ready' }));
          return;
        }

        matchStarted = true;
        gameStarted = false;
        countdownEndsAt = null;
        matchSpawns = null;
        if (countdownTimer) {
          clearTimeout(countdownTimer);
          countdownTimer = null;
        }

        const seed = Math.floor(Math.random() * 1_000_000_000);
        const spawnPoints = makeSpawnPoints(seed, active.length);
        const spawns = active.map((p, i) => ({
          id: p.id,
          x: spawnPoints[i]?.x ?? 0,
          z: spawnPoints[i]?.z ?? 0,
        }));

        matchSpawns = spawns;

        const startMsg = encode({ type: MsgType.MATCH_START, seed, spawns });
        for (const p of players.values()) {
          p.ws.send(startMsg);
        }
        broadcastLobby();
      }

      // Input handling + simulation loop will be added later.
    });

    ws.on('close', () => {
      players.delete(playerId);
      ensureHost();

      if (sim?.bodies?.has(playerId)) {
        const rb = sim.bodies.get(playerId);
        if (rb && typeof sim.world?.removeRigidBody === 'function') {
          try {
            sim.world.removeRigidBody(rb);
          } catch {
            // ignore
          }
        }
        sim.bodies.delete(playerId);
        sim.input.delete(playerId);
      }

      // If someone leaves before the game begins, reset countdown.
      // (Simple behavior: require 4 confirmed again.)
      if (!gameStarted && countdownEndsAt) {
        countdownEndsAt = null;
        if (countdownTimer) {
          clearTimeout(countdownTimer);
          countdownTimer = null;
        }
      }

      // If everyone leaves, reset the match so new joins start fresh.
      if (players.size === 0) {
        hostId = null;
        matchStarted = false;
        gameStarted = false;
        countdownEndsAt = null;
        matchSpawns = null;
        if (countdownTimer) {
          clearTimeout(countdownTimer);
          countdownTimer = null;
        }

        stopSimulation();
      }

      broadcastLobby();
    });

    ws.on('error', () => {
      // ignore; close will handle cleanup
    });
  });

  return {
    port,
    wss,
    close: () =>
      new Promise((resolve) => {
        if (countdownTimer) {
          clearTimeout(countdownTimer);
          countdownTimer = null;
        }

        stopSimulation();

        for (const client of wss.clients) {
          try {
            client.terminate();
          } catch {
            // ignore
          }
        }
        wss.close(() => resolve());
      }),
  };
}
