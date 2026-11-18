// ============================================
// ROSTER — loads data.csv and sorts every character into a class pool
// Shared by the multiplayer lobby, the solo setup screen, and bot spawning.
//
//   await Roster.load();
//   Roster.pools.Hero.Tank        → [{ name, cls, emoji, str, mag, def, spd, pow }, …]
//   Roster.random('Villain', 'Brute')
//   Roster.toGameCharacter(entry, 'Villain') → what the arena expects
// ============================================
const Roster = (() => {
  const CSV_URL = new URL('../data.csv', document.currentScript.src).href;

  const HERO_CLASSES    = ['Tank', 'DPS', 'Support', 'Mage'];
  const VILLAIN_CLASSES = ['Brute', 'Agile', 'Mage'];

  // Checked in order — the first matching rule wins. Each class is defined
  // by the stat its attacks scale with.
  const RULES = {
    Hero: [
      { cls: 'Support', test: c => c.pow >= 70 && c.str <= 40 },   // heals scale with Power
      { cls: 'Mage',    test: c => c.mag >= 75 && c.str < 60 },    // fireballs scale with Magic
      { cls: 'Tank',    test: c => c.def >= 70 },                  // soaks damage with Defense
      { cls: 'DPS',     test: c => c.str >= 70 },                  // melee scales with Strength
    ],
    Villain: [
      { cls: 'Mage',    test: c => c.mag >= 75 && c.str < 60 },
      { cls: 'Brute',   test: c => c.str >= 75 },
      { cls: 'Agile',   test: c => c.spd >= 70 && c.str >= 45 },
    ],
  };

  // display class → class id used by game.js
  const GAME_CLASS = {
    Hero:    { Tank: 'tank', DPS: 'dps', Support: 'support', Mage: 'mage' },
    Villain: { Brute: 'brute', Agile: 'agile', Mage: 'villain_mage' },
  };

  const pools = { Hero: {}, Villain: {} };
  let loading = null;

  function parseCsv(text) {
    const lines   = text.split(/\r?\n/).filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',');
      const row  = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
      return row;
    });
  }

  function classify(c, side) {
    return RULES[side].find(r => r.test(c))?.cls ?? null;
  }

  /** Fetch and classify data.csv once; later calls reuse the same promise. */
  function load() {
    if (loading) return loading;
    HERO_CLASSES.forEach(c => pools.Hero[c] = []);
    VILLAIN_CLASSES.forEach(c => pools.Villain[c] = []);

    loading = fetch(CSV_URL)
      .then(r => r.text())
      .then(text => {
        parseCsv(text).forEach(row => {
          const side = row.isVillain === 'True' ? 'Villain' : 'Hero';
          const c = {
            name: row.Name,
            str:  +row.Strength || 0,
            mag:  +row.Magic    || 0,
            def:  +row.Defense  || 0,
            spd:  +row.Speed    || 0,
            pow:  +row.Power    || 0,
          };
          const cls = classify(c, side);
          if (!cls) return;
          pools[side][cls].push({ ...c, cls, emoji: side === 'Villain' ? '💀' : '⚔️' });
        });
        return pools;
      });
    return loading;
  }

  function random(side, cls) {
    const pool = pools[side]?.[cls] || [];
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /** A pool entry → the character object the lobby / arena pass around. */
  function toGameCharacter(entry, side) {
    return {
      name:       entry.name,
      cls:        GAME_CLASS[side][entry.cls],
      clsDisplay: entry.cls,
      role:       side.toLowerCase(),
      str: entry.str, mag: entry.mag, def: entry.def, spd: entry.spd, pow: entry.pow,
    };
  }

  return { HERO_CLASSES, VILLAIN_CLASSES, pools, load, random, toGameCharacter };
})();
