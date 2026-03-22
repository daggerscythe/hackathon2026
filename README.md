# Slaying Goliath
**A Hackathon Project · OleMiss CS**

A 3v1 asymmetric multiplayer hero fighter built with A-Frame and WebSockets.

---

## Win/Lose Condition
| Side | Win Condition | Lose Condition |
|------|--------------|----------------|
| **Heroes (×3)** | Reduce the villain's HP to 0 | All 3 heroes are defeated |
| **Villain (×1)** | Defeat all 3 heroes | HP reaches 0 |

If the 3-minute round timer expires, **heroes win** — the villain failed to eliminate them in time.

---

## Gameplay loop
```
Menu → Mode Select → PIN Lobby → Character Select → Battle → Game Over

↓

Return to Character Select
```
1. **Lobby** — players join via a shared PIN code. One player selects villain, up to three select heroes.
2. **Character Select** — each player chooses a class. A character is randomly assigned from the CSV pool matching that class.
3. **Battle** — 3-minute round. Heroes cooperate to defeat the villain. Villain must eliminate all heroes before time runs out.
4. **Game Over** — winning side is declared, EXP is awarded, players return to character select.

---

## Classes

### Hero Classes
| Class | Primary Attack | Role |
|-------|---------------|------|
| Tank | Melee (sword) | High defense frontliner |
| DPS | Melee (sword) | High strength damage dealer |
| Support | Melee (sword) | Healer — can heal self or allies |
| Mage | Magic (fireball) | Ranged spell caster |

### Villain Classes
| Class | Primary Attack | Role |
|-------|---------------|------|
| Brute | Melee (sword) | High strength brawler |
| Agile | Melee (sword) | Fast, light hitter |
| Mage | Magic (fireball) | Ranged spell caster |

---

## Combat System

### Base Stats
- All players start with **100 HP**
- Base damage is **10** per hit

### Stat Formulas (CSV values are percentages, 0-100)
| Stat | Formula | Example |
|------|---------|---------|
| **Strength** (melee damage) | `BASE_DAMAGE × (strength / 100)` | strength 70 → deals 7 raw damage |
| **Magic** (ranged damage) | `BASE_DAMAGE × (magic / 100)` | magic 80 → deals 8 raw damage |
| **Defense** (damage reduction) | `raw_damage × (1 - defense / 100)` | defense 70 → takes 30% of incoming damage |
| **Speed** (movement) | `BASE_SPEED × (speed / 100)` | speed 50 → moves at half speed |
| **Power** (healing) | `5 × (power / 100)` HP per second | power 70 → heals 3.5 HP/sec |

### Final Damage Formula
```
raw_damage   = BASE_DAMAGE × attacker_stat / 100
damage_taken = raw_damage  × (1 - defender_defense / 100)
```

### Villain Scaling
The villain gains **+50 HP** each time a hero is defeated, rewarding aggressive play.
 
### Cooldowns
| Ability | Cooldown |
|---------|----------|
| Magic attack | 3 seconds |
| Heal | 5 seconds |
| Melee attack | None |
 
---

## Controls
| Action | Key |
|--------|-----|
| Move | WASD |
| Jump | Space |
| Attack / Heal Ally | LMB |
| Heal Self (Support only) | RMB |
| Look | Mouse |

## CSV integration:
Characters are loaded from `data.csv`. Each row represents a playable character.
 
### Parsed Fields
| Field | Type | Usage |
|-------|------|-------|
| `Name` | string | Display name |
| `Strength` | 0–100 | Melee damage multiplier |
| `Magic` | 0–100 | Ranged damage multiplier |
| `Defense` | 0–100 | Damage reduction multiplier |
| `Speed` | 0–100 | Movement speed multiplier |
| `Power` | 0–100 | Healing rate multiplier |

### Class Assignment
Characters are classified at load time by their stats. A player picks a class during character select, then receives a **randomly assigned character** from that class pool.
 
| Class | Classification Rules |
|-------|---------------------|
| Tank | Defense ≥ 70, Speed ≤ 50 |
| DPS | Strength ≥ 80, Defense ≤ 60 |
| Support | Power ≥ 70, Strength ≤ 20, Defense ≤ 20 |
| Hero Mage | Magic ≥ 80, Defense ≤ 40 |
| Brute | isVillain, Strength ≥ 80 |
| Agile | isVillain, Speed ≥ 80 |
| Villain Mage | isVillain, Magic ≥ 80 |
 
---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| 3D Engine | A-Frame 1.5.0 |
| Physics | aframe-physics-system (c-frame fork) |
| Multiplayer | WebSockets |
| Data | CSV (Papa Parse) |
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

## Project Structure
```
/game          → Core game logic (game.js, physics.js, network.js, ui.js)
/UI            → Menu, lobby, and character select screens
/assets        → 3D models, textures, audio
/server        → WebSocket + HTTP server (index.js)
data.csv       → Character database (~780 characters)
index.html     → Main game scene (A-Frame)
```