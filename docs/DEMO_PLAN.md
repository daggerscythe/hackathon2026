# Slaying Goliath: State of the Game & Solo Demo Plan

*Branch `dani` · written 2026-11-18 from a full code read and a live 2-tab test on localhost.*

---

## TL;DR

- **Playable?** Yes, but only on a LAN with a Node server running and **at least 2 players** (1 villain + 1 hero). Up to 4. I started and finished a real 1v1 match in two browser tabs.
- **Bugs:** There are several game-breaking ones. The worst: when a match ends, the clients send `matchOver` back and forth forever (1,482 messages in about 3 s during the test). Also, **your own CSV character's stats are ignored on your own screen** because they're hard-coded.
- **Optimized?** No. There are about 10k console logs in the first few seconds of a match, an 8.9 MB music file, a 2 MB sword, a 1.7 MB fireball model that's never shown, and a lot of dead code.
- **Itch.io blockers:** itch only hosts static files, so there's nowhere for the Node server to run. The game uses `ws://` (itch serves pages over https). Some paths are absolute (`/UI/...`). The music and SFX are copyrighted (Dark Souls, Skyrim).
- **Plan:** Add a **Solo vs Bots** mode that runs entirely in the browser with no server. You pick a side, and AI bots built from `data.csv` fill the other 3 slots. Ship that as a static itch build. Multiplayer stays in the repo as "self-host on LAN".

---

## 1. Game script (brief)

**Title:** Slaying Goliath
**Logline:** One player is the Goliath. Three heroes, each with a random superhero pulled from a 780-row dataset, have three minutes to bring them down.
**Genre:** First-person 3v1 asymmetric arena brawler ("friendslop coopetition"), browser-based (A-Frame + cannon physics).

### Core loop
```
Menu → Mode Select → Lobby (PIN) → pick side + class → random CSV character → 3-min Battle → Game Over → Menu
```

### Win conditions
| Side | Wins when | Note |
|---|---|---|
| Heroes | Villain HP hits 0, **or the 3:00 timer runs out** | Stalling favors the heroes |
| Villain | Every hero is dead | Heals +30 HP per kill (can't go over 100 max) |

### Classes (as the code actually classifies `data.csv`)
| Side | Class | Rule in `pinCode.html` | Pool size | Attack |
|---|---|---|---|---|
| Hero | Tank | Def ≥ 70, Spd ≤ 50 | 58 | Melee |
| Hero | DPS | Str ≥ 80, Def ≤ 60 | 48 | Melee |
| Hero | Support | Pow ≥ 70, Str ≤ 20, Def ≤ 20 | **4** | LMB heal ally / RMB heal self |
| Hero | Mage | Mag ≥ 80, Def ≤ 40 | 25 | Fireball |
| Villain | Brute | Def ≥ 70, Spd ≤ 50 *(README says Str ≥ 80, which is wrong)* | 57 | Melee |
| Villain | Agile | Spd ≥ 70, Def ≤ 50 | 68 | Melee |
| Villain | Mage | Mag ≥ 80, Def ≤ 40 | 28 | Fireball |

Your class is your choice. The character inside that class is a random row from the CSV, and its stats drive everything.

### Combat numbers (from `game.js`; the README values are out of date)
- HP: 100 for everyone, villain included
- Melee: `25 × Str × (1 − targetDef)`, minimum 3. It hits **every** enemy within 4 units, in any direction, with a 300 ms lockout.
- Magic: `35 × Mag × (1 − targetDef)`, minimum 3. Projectile speed 10, range 20, cooldown **1.5 s**.
- Heal: `15 × Pow` HP, cooldown 5 s (Support only)
- Speed: *meant to* scale movement, but isn't wired up (see bugs)
- Controls: WASD, Space to jump, mouse to look (pointer lock), LMB to attack, RMB for Support's self-heal

### Design pillars to keep for the showcase
1. **The dataset is the roster.** Every match gives you a different character, so the CSV is part of the gameplay rather than decoration.
2. **Asymmetry.** One big threat against a coordinated team.
3. **Short and readable.** Three-minute rounds, low-poly, runs in a browser tab.

---

## 2. Current state

### Player count (point 2 of your question)
`backend/index.js`: `MIN_START = 2`, `MAX_PLAYERS = 4`. The host must press Start, everyone must be Ready, and there must be **exactly 1 villain**. So the **minimum is 2 players (1v1)**, not 4.
Because `sessionStorage` is per tab, you *can* play both sides yourself with two tabs on one machine. Only the focused tab gets input, though, so the other player just stands still. That works for a debug session but not for a demo.

### Bugs: confirmed in the live test ✅ or found in the code 🔍

**Critical**
1. ✅ **`matchOver` broadcast storm.** `network.js` sends `matchOver` on every `game:matchOver` event. Receivers that are already in GAME_OVER re-emit the event, which sends it again, and this never stops. In the test that was 1,482 messages in about 3 s, and it floods the server for as long as the tabs stay open.
2. ✅ **Local stats are hard-coded.** `index.html` registers *you* with `str 80 / mag 75 / def 60 / spd 50 / pow 20` no matter which character you drew. Other clients see your real CSV stats, so every screen computes damage differently. In the test, the villain had 60% defense on their own screen and 93% on the hero's.
3. 🔍 **The speed stat does nothing.** `player-physics` uses a constant `speed = 5`.
4. 🔍 **Match-start race.** If the villain's remote entity hasn't spawned when a hero's scene finishes loading, `initMatch` is skipped. That client then gets no timer, no HUD rows, no cooldown slots, no music, and `matchState` stays null, so it can never detect a win on its own.
5. 🔍 **Heals aren't networked.** Only the healer's screen shows the HP going up.
6. 🔍 **`playerDied` uses the wrong ID format.** It sends a raw `clientId` or `'villain'`, but remote characters are keyed `remote-<id>`, so receivers ignore it. The sender's own client handles it twice, because `handleDeath` doesn't check `isAlive`. The result is a double kill-feed entry and a double villain heal.

**Major**
7. 🔍 **Melee is silent.** The melee path calls `applyHit` directly and never emits `MELEE_FIRED`, so there's no sword sound, no combat-log line and no hit flash. The flash also targets an entity with no mesh, so it would fail anyway.
8. ✅/🔍 `game/audio.js` ends with a stray `vict` (ReferenceError). Victory sounds were never wired up.
9. ✅ The hero who died was not put into spectate mode in the test (`isSpectating` stayed false).
10. 🔍 Every client runs its own round timer and calls `endMatch` independently, which also feeds bug #1.
11. 🔍 Balance: the villain has 100 HP against three heroes, and the +30 per-kill heal does nothing at full HP. "Brute" is classified by defense, so you can draw a 23-strength Brute that deals about 6 damage per hit. Support has only 4 characters.
12. 🔍 Mode Select shows 3 modes, but all of them go to the same lobby. "Hone Your Skills" does nothing yet, which makes it the obvious place for Solo mode.

### Performance & size
| Issue | Impact |
|---|---|
| About 9.7k console messages in the first seconds (`loadSound`, `getLocalCharacterId`, `[WIN CHECK]`, per-attack logs) | Real frame-time cost with DevTools open; also noisy |
| `Dark Souls - CC.mp3` is 8.9 MB | Half the download, **and copyrighted** |
| `sword.glb` is 2.0 MB and `fireball.glb` is 1.7 MB (the fireball is preloaded but the projectile is drawn as an `a-sphere`) | About 3.7 MB of waste. A gltf-transform/meshopt pass should get these under 100 KB |
| `new THREE.Quaternion/Euler` allocated every frame in physics and the 20 Hz send loop; `querySelector` every frame per remote player | Minor GC churn. Easy fix |
| A-Frame and physics load from CDNs | Fine, but vendor them locally for a self-contained itch zip |

### Dead code to delete
`backend/ArenaRoom.js` and its `colyseus`, `@colyseus/*` and `networked-aframe` dependencies (never loaded). The `player-controller` and `camera-follow` components in `game.js`. Also `debug-overlay.js`, `model_generator.html`, `pvp-world-generator.html`, `config/`, and the empty `UI/menu.js` and `UI/characterSelection.js`.

### Release blockers for itch.io
- itch is static-only, so the Node and WebSocket server can't run there.
- `ws://host:9090` is blocked from an https page (mixed content).
- Absolute paths like `/UI/menu.html` break inside itch's iframe subpath.
- **Copyrighted audio:** the Dark Souls track, the Skyrim heal sound, and possibly the victory stings. Replace everything with CC0 audio (Kenney, freesound CC0, OpenGameArt).
- Credit the 3 teammates on the itch page. The README already has a team table you can reuse.

---

## 3. Plan: a showcase build you can play alone

### Approach: Solo vs Bots, client-only
The game logic is already **client-authoritative**: each browser applies its own hits through `applyHit`, `performMagic` and `performHeal` in `game.js`. That makes bots cheap to add. A bot is just another entry in the `characters` map, with an A-Frame entity driven by an AI component instead of a WebSocket. Solo mode turns the network layer into a no-op, and the whole game ships as static files.

**Alternatives I considered and rejected:** Hosting the Node server (on Render or Fly) and adding matchmaking doesn't help, because a demo with no other players online is still empty. Keeping two tabs or hotseat play isn't a real game.

### Phase 0: Fix the foundation (about half a day)
- Fix bugs 1–6. Tag `matchOver` so it's relayed once and never re-sent. Use real CSV stats for the local player. Apply the speed stat. Make match init deterministic from `lobbyPlayers` rather than waiting for network spawns. Network heals. Normalize character IDs.
- Emit `MELEE_FIRED` from the hitbox path. Fix `audio.js`. Strip the hot-path logs behind a `DEBUG` flag.
- Switch to relative paths everywhere.

### Phase 1: Solo mode (the core of this work)
| New or changed | What it does |
|---|---|
| `game/roster.js` (new) | Moves CSV fetch + classification out of `pinCode.html` so the lobby and solo mode share it. Fixes the Brute rule. |
| `game/transport.js` (new) | `Net.send()` wraps the WebSocket. In solo mode it does nothing, and `network.js` only connects in multiplayer mode. |
| `UI/solo-setup.html` (new, or replace "Hone Your Skills") | Choose Hero or Villain and a class, reveal the random CSV character card, and pick a difficulty. Writes the same `sessionStorage` keys the lobby writes. |
| `game/bot-ai.js` (new) | A `bot-brain` component with a small state machine per class. **Melee:** chase the nearest enemy and swing in range. **Mage:** keep 8–12 units away, strafe, and fire fireballs with some aim error. **Support:** follow the lowest-HP ally and heal. **Villain bot:** go after the weakest or closest hero and retreat when low. A difficulty setting controls reaction delay, aim error and aggression. |
| `index.html` / match init | In solo mode, spawn 3 bots from random CSV rows for the other side and any open team slots, then call `initMatch` immediately. |
| Balance pass | Villain HP scaled for 3v1 (start at about 250–300), raise the max HP cap on kill heals, and give melee a real cooldown plus a forward cone check. |

### Phase 2: Showcase polish
- A how-to-play card and a character reveal at match start. Hit feedback (mesh flash, small knockback, the existing damage numbers). A death animation or ragdoll, which is already on your MVP+ list.
- CC0 audio, compressed GLBs, and a pause menu with mouse-sensitivity and volume settings.
- An **attract/demo mode**: bots against bots with a slow orbit camera. This is free once bots exist, and it's how you record a trailer and gifs without anyone else.

### Phase 3: Release
- A `dist/` folder with the static build and vendored libraries, zipped for itch with "This file will be played in the browser" checked. Test inside the itch iframe, including pointer lock and fullscreen.
- itch page: gifs from attract mode, controls, the dataset hook, and team credits. A portfolio write-up of what you built during the jam and what you rebuilt afterwards.
- **Optional, later:** host the multiplayer server with `wss://` so the itch build can also offer "Play with friends".

### Decisions for you before we start
1. **Which side can solo players choose?** I recommend both. "Be the Goliath" and "Slay the Goliath" are both strong hooks, and the bots need all class behaviors anyway.
2. **Multiplayer in the itch build?** I recommend solo only for v1, with multiplayer documented as "run the server locally".
3. **Delete the dead code** (Colyseus and friends)? I recommend yes. It makes the repo much clearer for portfolio readers.
