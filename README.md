# Slaying Goliath
**A Hackathon Project · OleMiss CS**

A 3v1 asymmetric arena brawler built with A-Frame. Play solo against bots in the browser, or online with up to 4 friends.

---

## Win/Lose Condition
| Side | Win Condition | Lose Condition |
|------|--------------|----------------|
| **Heroes (×1–3)** | Reduce Goliath's HP to 0 | All heroes are defeated |
| **Goliath (×1)** | Defeat every hero | HP reaches 0 |

If the 3-minute round timer expires, **heroes win**: Goliath failed to eliminate them in time.

---

## Gameplay loop
```
Menu → Mode Select ─┬─ Fate of Goliath (solo) → Solo Setup ─┬→ Battle → Game Over → Menu
                    └─ Skirmish (online)      → PIN Lobby  ─┘
```
1. **Solo:** pick a side, a class, how many fighters are in the arena (2–4) and bot difficulty. Bots fill the other slots.
2. **Online:** players join a lobby with a shared PIN. One picks Goliath, the rest pick heroes; the host starts.
3. **Character:** you pick a class and get a character from `data.csv` in that class. Its stats drive everything.
4. **Battle:** a 3-minute round in the arena.

---

## Classes

### Hero Classes
| Class | Attack | Role |
|-------|--------|------|
| Tank | Melee (sword) | High-defense frontliner |
| DPS | Melee (sword) | High-strength damage dealer |
| Support | Heals | LMB heals the nearest ally, RMB heals yourself |
| Mage | Fireball | Ranged spell caster |

### Goliath (Villain) Classes
| Class | Attack | Role |
|-------|--------|------|
| Brute | Melee (sword) | Heavy hitter |
| Agile | Melee (sword) | Fast hunter |
| Mage | Fireball | Ranged spell caster |

---

## Combat System

### Base Stats
- Heroes start with **100 HP**
- Goliath starts with **150 + 80 per hero** (230 HP vs 1 hero, 390 HP vs 3)

### Stat Formulas (CSV values are 0–100)
| Stat | Effect |
|------|--------|
| **Strength** | Melee damage: `10 × Strength/100` |
| **Magic** | Fireball damage: `15 × Magic/100` |
| **Defense** | Damage taken: `× (1 − 0.6 × Defense/100)`, so even 100 Defense only blocks 60% |
| **Speed** | Movement: `5 × (0.6 + 0.8 × Speed/100)` units/sec |
| **Power** | Heal amount: `20 × Power/100` HP |

### Goliath rules
- Goliath's hits deal **×1.3** damage and cleave up to **2 heroes** in front of it, but it swings slower.
- Goliath regains **15% of max HP** for every hero it defeats.

### Melee
Melee hits enemies within 4 units and inside a 120° arc in front of you.

### Cooldowns
| Ability | Cooldown |
|---------|----------|
| Hero melee | 0.5 s |
| Goliath melee | 0.8 s |
| Fireball | 1.5 s |
| Heal | 5 s |

---

## Controls
| Action | Key |
|--------|-----|
| Move | WASD |
| Jump | Space |
| Look | Mouse (click the arena to lock the cursor; Esc releases it) |
| Attack / Heal ally | LMB |
| Heal self (Support only) | RMB |

---

## CSV integration
Characters are loaded from `data.csv` (~780 rows) by `game/roster.js`. Each row is a playable character.

### Parsed Fields
| Field | Type | Usage |
|-------|------|-------|
| `Name` | string | Display name |
| `Strength` | 0–100 | Melee damage |
| `Magic` | 0–100 | Fireball damage |
| `Defense` | 0–100 | Damage reduction |
| `Speed` | 0–100 | Movement speed |
| `Power` | 0–100 | Healing amount |
| `isVillain` | bool | Hero or Goliath pool |

### Class Assignment
Each character is put in the first class whose rule it matches. Each class is defined by the stat its abilities use.

| Side | Class | Rule | Pool |
|------|-------|------|------|
| Hero | Support | Power ≥ 70, Strength ≤ 40 | 51 |
| Hero | Mage | Magic ≥ 75, Strength < 60 | 42 |
| Hero | Tank | Defense ≥ 70 | 89 |
| Hero | DPS | Strength ≥ 70 | 77 |
| Goliath | Mage | Magic ≥ 75, Strength < 60 | 51 |
| Goliath | Brute | Strength ≥ 75 | 102 |
| Goliath | Agile | Speed ≥ 70, Strength ≥ 45 | 36 |

---

## Bots (solo mode)
`game/bot-ai.js` drives bots with the same combat functions as players, so stats and cooldowns apply to them unchanged.
- **Melee bots** chase their target and circle it once in reach.
- **Casters** keep 7–12 units away, back off from whoever is closest, and lead their shots.
- **Supports** follow the most injured ally and heal.
- **Goliath bots** hunt the weakest nearby hero.

Difficulty sets how often bots re-plan, how accurately they aim, how quickly they swing, and how much they dodge.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| 3D Engine | A-Frame 1.5.0 |
| Physics | aframe-physics-system (c-frame fork) |
| Multiplayer | WebSockets |
| Data | CSV (custom parser in `game/roster.js`) |
| Models | Custom low-poly GLB (Three.js) |
 
---

## Team
| Name | Role |
|------|------|
| Earnest | UI & Multiplayer (WebSockets) |
| Bisesh | 3D Models & Sound Design |
| Dani | Game Logic & Scripting |
| Ember | CSV Integration & Multiplayer (WebSockets) |
 
---

## Running locally
```
cd backend
npm install
node index.js        # serves the game + lobby on http://localhost:9091 (PORT env to change)
```
Open `http://localhost:9091`. Friends on the same network join with the LAN address the server prints.

## Project Structure
```
/game          → Core game logic (game.js, physics.js, network.js, match-setup.js, ui.js, audio.js)
/UI            → Menu, mode select, and lobby / character select screens
/assets        → 3D models, textures, audio
/backend       → HTTP + WebSocket server (index.js)
/tools         → Procedural low-poly model + arena generators used to make the GLBs
/docs          → Design notes
data.csv       → Character database (~780 characters)
index.html     → Entry point (opens the menu)
arena.html     → Battle scene (A-Frame)
```

## MVP+++:
    - implement character customization in ready up menu
    - add dead ragdolls on the ground
    - change between sky and night
    - different arenas
    - implement power ups
    - implement shields and special abilities
    - implement leveling up, ranks, and a leaderboard