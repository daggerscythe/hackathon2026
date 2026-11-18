// ============================================
// ARENA — layout of the coliseum's solid objects
// Depends on game.js (ARENA_FLOOR_Y).
//
// Mirrors assets/models/arena.glb (made by tools/pvp-world-generator.html,
// placed at y = -0.25 so its sand floor sits at y = 0). Used for:
//   - invisible physics colliders (arena-colliders component)
//   - bot steering (ArenaLayout.resolve / pathClear)
//   - fireballs stopping on cover (ArenaLayout.blocksPoint / losClear)
// ============================================
const ArenaLayout = (() => {
  const WALL_RADIUS = 14.3;   // inner face of the coliseum wall

  // broken stone pillars (round), tops measured from the model
  const PILLARS = [
    [5, 3, 1.67], [-5, 3, 1.43], [4, -5, 1.39], [-4, -5, 1.50],
    [0, 7, 1.73], [0, -7, 1.64], [7, 0, 2.15], [-7, 0, 1.56],
  ].map(([x, z, top]) => ({ x, z, r: 0.5, top }));

  // low stone walls, 3.2 long × 0.55 thick, 0.75 tall
  const BARRIERS = [
    [3, 0, 0], [-3, 0, 0], [0, 3, 90], [0, -3, 90],
    [5.5, 5.5, 45], [-5.5, 5.5, 45], [5.5, -5.5, -45], [-5.5, -5.5, -45],
  ].map(([x, z, deg]) => ({ x, z, ry: THREE.MathUtils.degToRad(deg), halfLen: 1.6, halfThick: 0.275, top: 0.75 }));

  // raised octagonal spawn platforms (red = Goliath, blue = heroes)
  const PLATFORMS = [
    { x: 0, z: -11, r: 2.1, top: 0.35 },
    { x: 0, z: 11,  r: 2.1, top: 0.35 },
  ];

  /** point (x,z) in a barrier's local frame */
  function toLocal(b, x, z) {
    const dx = x - b.x, dz = z - b.z, c = Math.cos(b.ry), s = Math.sin(b.ry);
    return { lx: c * dx - s * dz, lz: s * dx + c * dz };
  }
  function toWorld(b, lx, lz) {
    const c = Math.cos(b.ry), s = Math.sin(b.ry);
    return { x: b.x + c * lx + s * lz, z: b.z - s * lx + c * lz };
  }

  /** Height of the walkable surface at (x, z). */
  function groundHeightAt(x, z) {
    for (const p of PLATFORMS) {
      if (Math.hypot(x - p.x, z - p.z) < p.r) return p.top;
    }
    return ARENA_FLOOR_Y;
  }

  /**
   * Push a circle of `radius` at `pos` (x/z mutated) out of every obstacle and
   * back inside the wall. Returns true if anything pushed it.
   */
  function resolve(pos, radius) {
    let hit = false;
    for (const p of PILLARS) {
      const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), min = p.r + radius;
      if (d < min && d > 1e-4) { pos.x = p.x + (dx / d) * min; pos.z = p.z + (dz / d) * min; hit = true; }
    }
    for (const b of BARRIERS) {
      const { lx, lz } = toLocal(b, pos.x, pos.z);
      const cx = THREE.MathUtils.clamp(lx, -b.halfLen, b.halfLen);
      const cz = THREE.MathUtils.clamp(lz, -b.halfThick, b.halfThick);
      const ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
      if (d >= radius) continue;
      let nx, nz;
      if (d > 1e-4) { nx = cx + (ex / d) * radius; nz = cz + (ez / d) * radius; }
      else          { nx = lx; nz = (lz >= 0 ? b.halfThick : -b.halfThick) + Math.sign(lz || 1) * radius; } // inside: push out the thin side
      const w = toWorld(b, nx, nz);
      pos.x = w.x; pos.z = w.z; hit = true;
    }
    const r = Math.hypot(pos.x, pos.z), max = WALL_RADIUS - radius;
    if (r > max) { pos.x *= max / r; pos.z *= max / r; hit = true; }
    return hit;
  }

  /** Is the point inside a solid obstacle (or outside the arena)? */
  function blocksPoint(x, y, z) {
    if (y < ARENA_FLOOR_Y || Math.hypot(x, z) > WALL_RADIUS) return true;
    for (const p of PILLARS) if (y < p.top && Math.hypot(x - p.x, z - p.z) < p.r) return true;
    for (const b of BARRIERS) {
      if (y >= b.top) continue;
      const { lx, lz } = toLocal(b, x, z);
      if (Math.abs(lx) < b.halfLen && Math.abs(lz) < b.halfThick) return true;
    }
    return false;
  }

  /** Is the straight line between two points at height y free of cover? */
  function losClear(ax, az, bx, bz, y) {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / 0.25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (blocksPoint(ax + (bx - ax) * t, y, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** Can a body of `radius` walk straight from a to b? */
  function pathClear(ax, az, bx, bz, radius) {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / 0.3);
    const probe = { x: 0, z: 0 };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      probe.x = ax + (bx - ax) * t; probe.z = az + (bz - az) * t;
      if (resolve(probe, radius)) return false;
    }
    return true;
  }

  return { WALL_RADIUS, PILLARS, BARRIERS, PLATFORMS, groundHeightAt, resolve, blocksPoint, losClear, pathClear };
})();

// ============================================
// Invisible physics colliders for the local (physics-driven) player.
// Attach to the a-scene: <a-scene arena-colliders>
// ============================================
AFRAME.registerComponent('arena-colliders', {
  init() {
    const add = (attrs) => {
      const box = document.createElement('a-box');
      Object.entries({ visible: 'false', 'static-body': 'shape: box', ...attrs })
        .forEach(([k, v]) => box.setAttribute(k, v));
      this.el.appendChild(box);
    };

    // floor
    add({ position: `0 ${ARENA_FLOOR_Y - 0.1} 0`, width: 32, height: 0.2, depth: 32 });

    // cover
    ArenaLayout.PILLARS.forEach(p => add({
      position: `${p.x} ${p.top / 2} ${p.z}`, width: p.r * 1.6, height: p.top, depth: p.r * 1.6,
    }));
    ArenaLayout.BARRIERS.forEach(b => add({
      position: `${b.x} ${b.top / 2} ${b.z}`, rotation: `0 ${THREE.MathUtils.radToDeg(b.ry)} 0`,
      width: b.halfLen * 2, height: b.top, depth: b.halfThick * 2,
    }));
    ArenaLayout.PLATFORMS.forEach(p => add({
      position: `${p.x} ${p.top / 2} ${p.z}`, width: p.r * 1.7, height: p.top, depth: p.r * 1.7,
    }));

    // ring wall: 24 tall slabs just inside the coliseum wall
    const SEGMENTS = 24, r = ArenaLayout.WALL_RADIUS + 0.25;
    const side = 2 * r * Math.tan(Math.PI / SEGMENTS) + 0.2;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      add({
        position: `${Math.sin(a) * r} 3 ${Math.cos(a) * r}`,
        rotation: `0 ${THREE.MathUtils.radToDeg(a)} 0`,
        width: side, height: 6, depth: 0.5,
      });
    }
  },
});
