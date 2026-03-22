// ============================================================
// backend/ArenaRoom.js
//
// Colyseus Room — authoritative game server.
// All game state lives here. Clients send inputs,
// server mutates state, Colyseus patches all clients.
//
// Install: npm install colyseus @colyseus/schema
// ============================================================

const { Room }               = require('colyseus');
const { Schema, MapSchema }  = require('@colyseus/schema');
const schema                 = require('@colyseus/schema');

// ── Schema definitions (plain JS, no TypeScript decorators) ──────────────

class PlayerState extends Schema {}
schema.defineTypes(PlayerState, {
  // identity
  sessionId:   'string',
  clientId:    'string',
  username:    'string',
  role:        'string',   // 'hero' | 'villain'
  cls:         'string',   // 'tank' | 'dps' | 'support' | 'mage' | 'brute' | 'agile' | 'villain_mage'
  charName:    'string',

  // position — synced at Colyseus tick rate
  x:           'float32',
  y:           'float32',
  z:           'float32',
  rotY:        'float32',

  // combat stats (set on join, immutable after)
  maxHealth:   'number',
  strength:    'float32',
  magic:       'float32',
  defense:     'float32',
  speed:       'float32',
  power:       'float32',

  // runtime
  health:      'number',
  isAlive:     'boolean',
});

class ArenaState extends Schema {}
schema.defineTypes(ArenaState, {
  players:     { map: PlayerState },
  phase:       'string',   // 'waiting' | 'battle' | 'gameover'
  winner:      'string',   // '' | 'hero' | 'villain'
});

// ── Constants (mirror game.js) ────────────────────────────────────────────
const BASE_DAMAGE          = 10;
const BASE_HEAL_RATE       = 5;
const VILLAIN_HP_PER_KILL  = 50;
const MAGIC_COOLDOWN_MS    = 3000;
const HEAL_COOLDOWN_MS     = 5000;
const MELEE_RANGE          = 4;

// ── ArenaRoom ─────────────────────────────────────────────────────────────
class ArenaRoom extends Room {

  onCreate(options) {
    const state = new ArenaState();
    state.players = new MapSchema();
    state.phase   = 'waiting';
    state.winner  = '';
    this.setState(state);

    // Per-session cooldown tracking (not in schema — server-only)
    this._cooldowns = {};  // sessionId → { magic: ts, heal: ts }

    // ── Client messages ────────────────────────────────────────────────
    // Position update — client sends their world position every frame
    this.onMessage('move', (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.isAlive) return;
      p.x    = data.x    ?? p.x;
      p.y    = data.y    ?? p.y;
      p.z    = data.z    ?? p.z;
      p.rotY = data.rotY ?? p.rotY;
    });

    // Melee attack — server validates range and applies damage authoritatively
    this.onMessage('melee', (client, data) => {
      if (this.state.phase !== 'battle') return;
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.isAlive) return;

      const target = this.state.players.get(data.targetSessionId);
      if (!target || !target.isAlive) return;
      if (target.role === attacker.role) return; // no friendly fire

      // Server-side range check using synced positions
      const dx   = attacker.x - target.x;
      const dz   = attacker.z - target.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > MELEE_RANGE) return;

      const damage = this._calcDamage(attacker, target, 'strength');
      this._applyDamage(target, damage);

      // Broadcast hit effect to all clients (visual feedback)
      this.broadcast('hitEffect', {
        attackerSessionId: client.sessionId,
        targetSessionId:   data.targetSessionId,
        damage,
        type:              'melee',
      });
    });

    // Magic — server validates cooldown, broadcasts projectile spawn to all
    this.onMessage('magic', (client, data) => {
      if (this.state.phase !== 'battle') return;
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.isAlive) return;
      if (this._onCooldown(client.sessionId, 'magic')) return;

      this._setCooldown(client.sessionId, 'magic');

      // Broadcast to ALL clients — each client runs the projectile locally
      // and sends 'magicHit' back when it connects
      this.broadcast('spawnProjectile', {
        ownerSessionId: client.sessionId,
        x:   data.x,
        y:   data.y,
        z:   data.z,
        dirX: data.dirX,
        dirY: data.dirY,
        dirZ: data.dirZ,
      });
    });

    // Magic hit — client reports a projectile hit, server validates and applies
    this.onMessage('magicHit', (client, data) => {
      if (this.state.phase !== 'battle') return;
      const attacker = this.state.players.get(data.ownerSessionId);
      const target   = this.state.players.get(data.targetSessionId);
      if (!attacker || !target || !target.isAlive) return;
      if (target.role === attacker.role) return;

      const damage = this._calcDamage(attacker, target, 'magic');
      this._applyDamage(target, damage);

      this.broadcast('hitEffect', {
        attackerSessionId: data.ownerSessionId,
        targetSessionId:   data.targetSessionId,
        damage,
        type:              'magic',
      });
    });

    // Heal — server validates cooldown and applies
    this.onMessage('heal', (client, data) => {
      if (this.state.phase !== 'battle') return;
      const healer = this.state.players.get(client.sessionId);
      if (!healer || !healer.isAlive || healer.role !== 'hero') return;
      if (this._onCooldown(client.sessionId, 'heal')) return;

      const healee = this.state.players.get(data.targetSessionId || client.sessionId);
      if (!healee || !healee.isAlive) return;

      this._setCooldown(client.sessionId, 'heal');

      const amount = BASE_HEAL_RATE * healer.power;
      healee.health = Math.min(healee.maxHealth, healee.health + amount);

      this.broadcast('healEffect', {
        healerSessionId: client.sessionId,
        healeeSessionId: data.targetSessionId || client.sessionId,
        amount,
      });
    });

    console.log(`[ArenaRoom] Room created: ${this.roomId}`);
  }

  onJoin(client, options) {
    console.log(`[ArenaRoom] ${client.sessionId} joining (${options.role}/${options.cls})`);

    const p          = new PlayerState();
    p.sessionId      = client.sessionId;
    p.clientId       = options.clientId   || client.sessionId;
    p.username       = options.username   || 'Player';
    p.role           = options.role       || 'hero';
    p.cls            = options.cls        || 'tank';
    p.charName       = options.charName   || options.name || 'Unknown';

    // Spawn position — spread players around the arena
    const angle      = Math.random() * Math.PI * 2;
    p.x              = Math.cos(angle) * 8;
    p.y              = 2;
    p.z              = Math.sin(angle) * 8;
    p.rotY           = 0;

    p.maxHealth      = 100;
    p.health         = 100;
    p.isAlive        = true;

    // Stats from CSV selection (sent as options from client)
    p.strength       = (options.str  || 70) / 100;
    p.magic          = (options.mag  || 60) / 100;
    p.defense        = (options.def  || 30) / 100;
    p.speed          = (options.spd  || 50) / 100;
    p.power          = (options.pow  || 40) / 100;

    this.state.players.set(client.sessionId, p);
    this._cooldowns[client.sessionId] = { magic: 0, heal: 0 };

    // Start battle once we have at least 2 players and exactly 1 villain
    this._tryStartBattle();
  }

  onLeave(client, consented) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      // Treat as death so the match can resolve
      if (p.isAlive) this._handleDeath(client.sessionId);
      this.state.players.delete(client.sessionId);
    }
    delete this._cooldowns[client.sessionId];
    console.log(`[ArenaRoom] ${client.sessionId} left`);
  }

  onDispose() {
    console.log(`[ArenaRoom] Room disposed: ${this.roomId}`);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  _tryStartBattle() {
    if (this.state.phase !== 'waiting') return;
    const players   = [...this.state.players.values()];
    const villains  = players.filter(p => p.role === 'villain');
    const heroes    = players.filter(p => p.role === 'hero');
    if (villains.length !== 1 || heroes.length < 1) return;

    this.state.phase = 'battle';
    console.log(`[ArenaRoom] Battle started! Villain: ${villains[0].charName}`);
    this.broadcast('matchStarted', {
      villainSessionId: villains[0].sessionId,
      heroSessionIds:   heroes.map(h => h.sessionId),
    });
  }

  _calcDamage(attacker, target, type) {
    const statMult  = type === 'magic' ? attacker.magic : attacker.strength;
    const raw       = BASE_DAMAGE * statMult;
    const taken     = raw * (1 - target.defense);
    return Math.max(0.1, taken);
  }

  _applyDamage(target, damage) {
    target.health = Math.max(0, target.health - damage);
    if (target.health <= 0) this._handleDeath(target.sessionId);
  }

  _handleDeath(sessionId) {
    const dead = this.state.players.get(sessionId);
    if (!dead || !dead.isAlive) return;

    dead.isAlive = false;
    this.broadcast('playerDied', { sessionId, role: dead.role });

    // Villain gains health for each hero killed
    if (dead.role === 'hero') {
      this.state.players.forEach(p => {
        if (p.role === 'villain' && p.isAlive) {
          p.health = Math.min(p.maxHealth, p.health + VILLAIN_HP_PER_KILL);
        }
      });
    }

    this._checkWin();
  }

  _checkWin() {
    if (this.state.phase !== 'battle') return;

    const players  = [...this.state.players.values()];
    const villain  = players.find(p => p.role === 'villain');
    const heroes   = players.filter(p => p.role === 'hero');

    const villainDead = villain && !villain.isAlive;
    const heroesDead  = heroes.length > 0 && heroes.every(p => !p.isAlive);

    if (villainDead || heroesDead) {
      this.state.phase  = 'gameover';
      this.state.winner = villainDead ? 'hero' : 'villain';
      this.broadcast('matchOver', { winner: this.state.winner });
      console.log(`[ArenaRoom] Match over — ${this.state.winner} wins`);
    }
  }

  _onCooldown(sessionId, ability) {
    const cd      = this._cooldowns[sessionId];
    if (!cd) return false;
    const limit   = ability === 'magic' ? MAGIC_COOLDOWN_MS : HEAL_COOLDOWN_MS;
    return (Date.now() - cd[ability]) < limit;
  }

  _setCooldown(sessionId, ability) {
    if (this._cooldowns[sessionId]) this._cooldowns[sessionId][ability] = Date.now();
  }
}

module.exports = { ArenaRoom };
