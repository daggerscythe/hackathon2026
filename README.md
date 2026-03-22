
# Hackathon 2026 — 4‑Player LAN Fighting Game (Scaffold)

Goal: a lightweight fighting game playable on the same network (LAN/Wi‑Fi) with 4 players total: **3 heroes vs 1 villain**, all in a shared arena. Gameplay specifics can evolve later; this doc scaffolds the project architecture so we can iterate safely.

## Tech

- Three.js (rendering)
- Tailwind (UI)
- WebSockets (real‑time networking)
- Node.js server (authoritative simulation)

## High-level architecture

**Server-authoritative model** (recommended for fighting games):

- Clients send **inputs** (move/jump/attack) to the server.
- Server runs the **truth simulation** (positions, velocities, collisions, damage, cooldowns).
- Server broadcasts **world snapshots** to all clients at a fixed tick.
- Clients **interpolate** snapshots for smooth rendering.

This prevents cheating, reduces desync, and makes hit detection consistent.

### Responsibilities

**Client (browser)**
- Render arena + characters
- Capture local input + send it to server
- Maintain a local predicted/visual representation
- Smooth movement by interpolation and simple prediction
- UI (lobby, join code/IP, role display, health bars)

**Server (Node)**
- Track connected players and assign hero/villain roles
- Run fixed-step simulation loop (tick)
- Validate input and apply to each player
- Resolve collisions / arena boundaries
- Publish snapshots (state of all players)

## Proposed repo layout

Ignore `ThreeJS/` (legacy/old). Use a dedicated game client + server.

```
hackathon2026/
	game-client/             # new web client (Three.js + Tailwind)
	game-server/             # new Node server (WebSockets)
	shared/                  # message types + constants shared by client/server
```

Notes:
- `shared/` can be plain JS initially; TypeScript later if desired.
- If you prefer fewer folders, client+server can live together, but separation reduces confusion.

## Game flow (MVP)

### 1) Host + Join

- One player runs the server on LAN.
- Clients connect to `ws://<host-ip>:<port>`.
- Server assigns **slots** (first 4 are active, extra are spectators).
- **Hero/Villain is NOT assigned at join** — it is confirmed during Character Select.

### 2) Character Select (first-come-first-serve)

- After the host starts the match, everyone enters Character Select.
- Players confirm a class; the server locks it first-come-first-serve.
- Constraints:
	- exactly 1 villain total
	- up to 3 heroes total
	- hero subclasses are unique (no duplicates)

After the last active player confirms their class, the server starts a **10 second countdown**, then the game officially begins.

### 3) Ready state

- Server waits until 4 players are connected (or a Start button).
- Server sends `match_start` with initial spawn positions.

### 4) Match loop (basic)

- Each tick:
	- apply inputs -> velocity
	- apply gravity
	- resolve ground contact
	- clamp to arena bounds
	- broadcast snapshot

No attacks/hitboxes required for MVP; we can add them once movement feels good.

## Controls (MVP)

You mentioned “each character movement controlled by WASD”. Since only one keyboard exists per device, the most common pattern for LAN play is:

- Each player controls their own character from their own device using WASD.

Suggested mapping:
- `W` = jump (or `Space`), `A/D` = left/right strafe, `S` = (optional) crouch/fast-fall

If you truly want WASD on the same keyboard for 4 players, that’s “same device” multiplayer and needs distinct key sets (WASD, arrows, IJKL, numpad, etc.).

## Networking details (practical)

### Tick rates

- Server simulation tick: **60 Hz** (feels responsive for a fighter)
- Snapshot broadcast: **20–30 Hz** (bandwidth friendly)
- Client render: browser `requestAnimationFrame` (typically 60+)

### Messages (minimal protocol)

Put these in `shared/messages.js` so both sides agree.

- `join`: `{ name }`
- `welcome`: `{ playerId, role, tickRate, arena }`
- `input`: `{ seq, buttons, axis }`
	- `buttons`: `{ jump: boolean }` (expand later)
	- `axis`: `{ x: -1|0|1, z: -1|0|1 }`
- `snapshot`: `{ serverTime, players: { [id]: { p, v, r, grounded, hp, role } } }`
- `match_start`: `{ seed, spawns }`
- `match_end`: `{ winner }`

### Client smoothing

- Maintain a small buffer of snapshots (e.g. 100–150ms).
- Render at `now - bufferDelay` by interpolating between two snapshots.
- For local player, optionally do light prediction and then correct.

## Scene + physics (MVP)

Start simple and deterministic:

- Arena is a flat plane + a few simple colliders (boxes).
- Character is represented by:
	- a visible GLB model
	- a simple capsule/cylinder collider used by the server
- Server uses basic kinematics:
	- acceleration from input
	- gravity constant
	- max speed
	- jump impulse

Later we can add:
- hitboxes/hurtboxes
- knockback
- i-frames
- particles

## State structure note (ECS vs simple objects)

For the MVP, a simple server-side `players` map + a fixed tick loop is usually faster to iterate than a full ECS.

If the project grows (dozens of systems/components, many entity types), an ECS can help keep logic modular — but we can defer that until movement/combat is stable.

## Assets + animation

- Export characters as `.glb` with animations.
- Keep clip names stable (e.g. `Idle`, `Run`, `Jump`, `Land`, `Attack1`).
- Client plays animations based on state received in snapshots.

## Tailwind UI (MVP)

Minimal screens:

- Join screen: input for host IP/port + player name
- HUD: role (Hero/Villain), health bar, connection/ping indicator

## Implementation plan (incremental)

1. **Server skeleton**: WebSocket accept connections, assign IDs/roles
2. **Client skeleton**: connect + join, render arena + placeholder capsules
3. **Input pipeline**: capture keyboard -> send `input` messages
4. **Authoritative movement**: server sim tick updates positions -> `snapshot`
5. **Client interpolation**: smooth remote movement, basic local prediction
6. **Swap placeholders for GLBs**: load character models and attach to player entities
7. **Animation mapping**: play Idle/Run/Jump based on state

## Order of operations (what to build first)

Treat these as milestones you can demo at each step.

1. **Project scaffold**
	- Create `game-client/`, `game-server/`, `shared/`
	- Decide dev ports and scripts (client dev server + server runner)

2. **Page 1: Player selection UI (first deliverable)**
	- Tailwind page that lets a user pick:
	  - name
	  - team/role preference (Hero/Villain or “Any”)
	  - character/skin (optional now)
	  - host IP/port to connect
	- No 3D needed yet; focus on clean UX and state management.

3. **Networking handshake (minimum viable LAN join)**
	- Server accepts socket, assigns `playerId` and a role
	- Client connects and transitions UI states: `connecting -> lobby -> in_match`

4. **Lobby state**
	- Show connected players, roles, and “Ready”
	- Host can start match (or auto-start when 4 present)

5. **3D arena skeleton**
	- Client renders a ground plane + placeholders for players
	- Server sends snapshots; client shows all 4 players in the same arena

6. **Movement MVP**
	- Client captures keyboard input and sends to server
	- Server simulates: walk + jump + gravity + ground collision
	- Client interpolates snapshots (smooth remote movement)

7. **Replace placeholders with character assets**
	- Load the chosen `.glb` per player
	- Drive animations based on server state

8. **Fighting loop (later)**
	- Add attacks/hitboxes, damage, knockback, rounds

## Independent sections (parallelizable work)

These are mostly separable so teammates can work in parallel.

1. **UI/UX (Tailwind)**
	- Player selection page
	- Lobby UI (connected players, ready, start)
	- In-game HUD (hp, role, ping)

2. **Shared protocol (`shared/`)**
	- Message shapes + constants (tick rate, gravity, arena bounds)
	- Versioning (so client/server mismatches are obvious)

3. **Server simulation (`game-server/`)**
	- Player join/leave and role assignment
	- Fixed-step tick loop + authoritative movement
	- Snapshot broadcast + basic validation

4. **Client render + entity system (`game-client/`)**
	- Three.js scene setup
	- Player entities (spawn/update/remove)
	- Snapshot interpolation

5. **Input system**
	- Keyboard mapping -> input state -> network messages
	- (Later) gamepad support

6. **Assets + animation pipeline**
	- Blender export conventions (clip naming, scale, axis)
	- GLB loading + animation state machine

7. **VFX (later)**
	- Particles, hit sparks, trails (client-only visuals driven by server events)

## Dev notes (LAN)

- Run server on one machine, get its LAN IP (e.g. `192.168.x.x`).
- Allow inbound firewall rule for the server port.
- Keep payloads small; avoid sending matrices, send positions/rotations as numbers.

## Repo scaffold (now implemented)

This repo is structured as a pnpm workspace:

- `game-server/` — WebSocket server (authoritative lobby/sim)
- `game-client/` — Tailwind UI + client networking
- `shared/` — message protocol + constants

## Run (dev)

From the repo root:

- Install all workspace deps: `pnpm install`
- Start server + client together: `pnpm dev`

Or run individually:

- Server: `pnpm dev:server` (defaults to `ws://localhost:8080`)
- Client: `pnpm dev:client`

## Testing approach

### 1) Unit tests (fast, deterministic)

Run:

- `pnpm test`

Currently included:

- `shared/` tests validate message decoding/encoding.

What to add next:

- Pure functions in `shared/` (math helpers, protocol upgrades)
- Server simulation step functions (movement/physics) in isolation

### 2) Integration tests (server + real WebSocket clients)

Run:

- `pnpm -C game-server test`

These tests spin up the server on a port, connect via `ws`, send `join`, and assert `welcome`.

What to add next:

- Role assignment (3 heroes + 1 villain) across 4 clients
- Disconnect/reconnect behavior
- Snapshot frequency and payload shape

### 3) Manual LAN tests (most important early)

Checklist:

1. Run server on host machine: `pnpm dev:server`
2. Find host LAN IP (e.g. `192.168.1.50`)
3. On a second device on the same Wi‑Fi, open `http://<host-ip>:5173` in a browser
4. In Player Select, set Server URL to `ws://<host-ip>:8080` and connect
5. Verify lobby list updates on both devices

Common issues:

- Windows Firewall blocking inbound port 8080 (allow Node)
- Using `localhost` on a phone (must use the host’s LAN IP)

### 4) Client e2e/UI tests (later)

Once the UI stabilizes, add Playwright to `game-client/` to automate:

- player selection form -> connect -> lobby renders
- reconnect/disconnect UX

