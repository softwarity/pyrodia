# PYRODIA — The Fire Must Survive

*A Pyro's Journey.* Think fast. Feed the fire. Don't get wet.

PYRODIA is a real-time sliding pipe puzzle, in the spirit of the PC Engine classic
*Blodia / Timeball*, reimagined around a living flame. The flame moves on its own through a
network of pipes. The board is a sliding puzzle with one hole: you slide pipe tiles into the
hole **while the flame is moving** to keep it inside the network, feed it fuel, and bring it
home to the hearth before it falls into the water, runs out of fuel, or runs out of time.

This repository is a fully playable HTML5 / TypeScript prototype: 100 levels, lives, score,
fuel, Embers, objectives, level select, persistence, procedural generator, validator and debug
tools. It is architected so the gameplay core can later be wrapped for iOS and Android.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173  (debug panel enabled in dev)
npm run build        # production build in dist/
npm run preview      # serve the production build locally
npm test             # unit tests (puzzle rules, simulation, scoring, all 100 levels valid)
npm run levels:validate   # validate every level and print path/clicks/reaction stats
npm run levels:generate   # regenerate levels 13-100 (deterministic seeds) into src/level/data/generated.ts
```

Debug mode is on in `npm run dev`. In a production build it stays hidden unless you open the
game with `?debug=1`.

### Deploying to GitHub Pages

`.github/workflows/deploy-pages.yml` builds the game and deploys `dist/` to GitHub Pages
automatically on every push to `main`. It can also be run manually from the Actions tab
(*Deploy to GitHub Pages → Run workflow*) on **any branch or tag**. One-time setup in the
repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**, and to allow
manual deploys from other refs, **Settings → Environments → github-pages → Deployment
branches and tags → No restriction** (or add a pattern such as `claude/*` and `v*`). The Vite `base` is
relative (`./`) so the build works from any sub-path such as `https://<user>.github.io/pyrodia/`.

---

## How to play

| Action | Desktop | Touch |
| --- | --- | --- |
| Slide a tile into the hole | click a tile next to the hole | tap it, or swipe it towards the hole |
| Speed the flame up (×3) | hold `Space` / `Shift`, or the ⏩ button | hold the ⏩ button |
| Lock the speed-up on/off | click the hearth | tap the hearth |
| Pause | ❚❚ button, `P` or `Esc` | ❚❚ button |
| Restart level | pause menu or `R` | pause menu |

Rules in one breath: keep the fire in the pipes, feed it, get it to the hearth.

* **The flame never waits.** It moves at the level's speed from the moment the short READY
  phase ends. You can already slide tiles during READY.
* **Fast-forward.** Like Blodia's speed button: when the route is ready, hold ⏩ (or tap the
  hearth to lock it) and the flame travels three times faster. Fuel is burnt per tile, so
  speed is free; it only saves time, which means a bigger time bonus.
* **Only tiles next to the hole can move** (they have a faint glowing rim). Sliding a tile
  moves the hole to where the tile was, like a 15-puzzle. The source and the hearth are fixed,
  and so are tiles marked with a padlock.
* **Movement rule at a junction**: straight ahead if possible, otherwise turn right, otherwise
  turn left. A **dead end** bounces the flame back (useful to buy time or grab fuel).
* **You cannot slide the tile the flame is currently in** (it shakes and refuses).
* **Water** is under everything. A pipe opening that leads nowhere, including into the hole,
  drops the flame into the water: SPLASH, one life lost, level restarts.
* **Numbered warps.** A pipe ending in a numbered ring is linked to the other ring with the
  same number: the flame enters one and comes out of its twin. Warps slide like any other
  tile, so a pair can be rearranged to open new routes.
* **The board wraps around.** A pipe that opens onto an edge continues from the opposite edge
  (small chevrons mark those openings), so routes can loop across the board. A level can turn
  this off with `wrap: false`.
* **You do not have to visit every pipe.** Reaching the hearth is enough. Many levels offer a
  short route and a longer detour (a T-junction into a dead-end branch) that holds extra fuel
  and rare embers: the short way is safe, the detour pays.
* **Fuel** burns with every tile travelled. Wood (+10), oil (+30), brazier (full refill) and
  rare embers (+20 fuel, +3 Embers) are picked up by passing through their tile centre. Empty
  tank = the flame burns out.
* **Time** limit per level; running out burns the flame out.
* A dotted **lookahead** shows where the flame goes next with the current configuration and
  marks the first break with a red ✕. Later levels preview fewer tiles.
* **Embers** (✦) are a persistent currency earned by finishing levels. During play you can
  spend them on *Emergency Fuel* (+30 fuel) or *Emergency Time* (+5 s). Using a boost forfeits
  the PERFECT rating for that attempt.
* **Rewards are not cumulative across replays.** A pickup always refuels the flame, but its
  score bonus and its Embers are granted only the first time it is collected on that level.
  Pickups you already collected on an earlier attempt are drawn greyed out; collecting one you
  missed before still counts in full.

Level results: 🔥🔥🔥 PERFECT (every objective met, no boost) · 🔥🔥 EXCELLENT · 🔥 COMPLETED.
Default objectives are *no death*, *collect all fuel* (when the level has pickups) and *finish
under a target time*. They are shown on the level-complete screen so you always know what
you could do better.

---

## Architecture

Everything under `src/` is plain TypeScript. Gameplay never touches the DOM; the DOM and the
canvas are consumers of game events.

```
src/
├── core/          EventEmitter, seeded Rng                       (engine utilities)
├── puzzle/        Direction, Tile, Grid, PathSim, TileGeometry,  (puzzle engine)
│                  Solver, Validator, Generator
├── entities/      Entity base, Flame, Pickup                     (entity system)
├── level/         LevelDef (data format), LevelParser, levels,   (level system)
│                  difficulty curve, Objectives, data/handmade.ts,
│                  data/generated.ts
├── player/        Lives, Fuel, Embers, Scoring, Progress         (player system)
├── game/          Config, GameStates, LevelSession, Game         (game loop / state machine)
├── render/        CanvasRenderer, Layout, Particles, Theme       (rendering)
├── audio/         AudioManager (+ WebAudio placeholder backend)  (audio)
├── persistence/   KeyValueStorage interface + localStorage       (persistence)
├── input/         PointerInput (mouse + touch unified)           (input)
├── ui/            UI (DOM screens/overlays), DebugPanel          (menus)
└── main.ts        wiring: loop, events -> audio/effects, input
scripts/           generate-levels.ts, validate-levels.ts, smoke.mjs
tests/             vitest suite
```

Key objects:

* **`Game`** – top-level state machine (`TITLE → LEVEL_SELECT → PLAYING → LEVEL_COMPLETE → …`,
  `PLAYING → DEATH → RESTART | GAME_OVER`, plus `PAUSED`, `OPTIONS`). Owns the run (lives,
  score, level index) and the current `LevelSession`. Emits typed events; it has no DOM access.
* **`LevelSession`** – one attempt at one level: grid, entities (flames), timer, fixed
  timestep simulation (120 Hz) for deterministic movement, slides, pickups (which travel with
  their tile), lookahead prediction, boosts, and the per-attempt stats that feed
  scoring/objectives.
* **`CanvasRenderer`** – draws board, water, pipes, pickups, flame, particles and the HUD from
  game state. It reads, never mutates. Replaceable by another backend.
* **`UI`** – DOM screens (title, level select, options, pause, level complete, game over,
  in-game chrome). Subscribes to `Game` events.
* **`AudioManager`** – named gameplay events (`rotateTile`, `flameDanger`, `fuelCollected`,
  `waterSplash`, `perfectLevel`, …). The default backend synthesises placeholder sounds with
  WebAudio; swap the backend to use real samples or a native bridge.
* **`Progress`** – the player profile (level results, high score, Embers, current level,
  settings) persisted through the `KeyValueStorage` interface (localStorage adapter today).

## Level data

Levels are pure data (`LevelDef`). Hand-made levels live in `src/level/data/handmade.ts`:
a tutorial set (1–8) and a "classic" set (9–12) whose layouts echo the first Blodia boards;
levels 13–100 are generated deterministically and **baked** into `src/level/data/generated.ts`
so the shipped game uses static data.

`rows` describe the **solved** board (a complete route from the source to the hearth) and
`scramble` is the list of hole moves applied to it to produce the board the player starts from.
The intended solution is simply the reverse sequence, so every level is solvable by
construction, and the validator double-checks it.

```ts
{
  id: 2,
  name: 'Around the Bend',
  width: 5, height: 4,
  flameSpeed: 0.65,      // tiles per second
  timeLimit: 30,         // seconds
  lookahead: 3,          // tiles previewed ahead of the flame (0 = none)
  baseScore: 550,
  initialFuel: 100, maxFuel: 100, fuelPerTile: 2,   // optional, defaults in player/Fuel.ts
  pickups: [{ x: 2, y: 2, kind: 'wood' }],          // on the SOLVED board; they travel with the tile
  objectives: [...],     // optional, defaults derived in level/Objectives.ts
  hint: 'Only tiles next to the hole can move...',
  rows: [
    'S2 C1 I1 D3 C2',
    'I0 X0 D2 I0 I1',
    'C0 I1 I1 I1 G3',
    'I1 .. C3 D1 D0',
  ],
  scramble: 'UL',        // hole moves up, then left
}
```

Token = `<Kind><Rotation>[*]`:

| Kind | Meaning | Rotations |
| --- | --- | --- |
| `..` | the hole (void): water underneath | – |
| `--` | blank: a solid tile without pipe, slides like any other (`--*` fixed) | – |
| `I` | straight | `I0` vertical, `I1` horizontal |
| `C` | corner | `C0` └ (N+E), `C1` ┌ (E+S), `C2` ┐ (S+W), `C3` ┘ (W+N) |
| `T` | T-junction | `T0` ├ (N+E+S), `T1` ┬, `T2` ┤, `T3` ┴ |
| `X` | cross | `X0` |
| `D` | dead end (bounces) | opening `D0` N, `D1` E, `D2` S, `D3` W |
| `W<rot><n>` | numbered warp (pairs) | `W31` opens West, number 1; `W12` opens East, number 2 |
| `S` | source (flame start, fixed) | opening direction as above |
| `G` | goal / hearth (fixed) | opening direction as above |
| `*` | suffix: fixed tile (cannot slide) | e.g. `C1*` |

Scramble letters are hole moves: `U` the hole moves up (the tile above slides down), `D`, `L`,
`R` likewise. Start and goal positions are derived from the `S`/`G` tiles.

## Pipe connectivity

Directions are bits: `N=1, E=2, S=4, W=8`. A tile is a kind + rotation; its connections are a
4-bit mask obtained by rotating the kind's base mask (`puzzle/Tile.ts`). Rotating clockwise is
`((m << 1) | (m >> 3)) & 0xF`, so └ → ┌ → ┐ → ┘ is literally a bit rotation. Two neighbours are
connected when each has the bit facing the other (`Grid.isConnected`).

`puzzle/PathSim.ts` holds the single movement rule (`chooseExit`: straight › right › left ›
bounce) and `predictPath`, used by the live flame, the lookahead preview, the validator and the
solver so they can never disagree. Sliding is `Grid.slide(x, y)`: the tile swaps places with
the adjacent hole; `Grid.legalMoves()` lists what can move.

## Flame movement

`entities/Flame.ts`. The flame lives in a tile with an `entry` side, an `exit` side and a
`progress` from 0 (entering) to 1 (leaving). `LevelSession` advances it in fixed 1/120 s steps,
so movement is deterministic regardless of frame rate. When `progress` reaches 1 the flame
checks the neighbour through `exit`: if the neighbour has a matching opening it enters it and
its new exit is decided immediately with the movement rule (the occupied tile is locked against
rotation, so deciding on entry is equivalent to deciding at the centre); otherwise it starts
falling (small arc, then splash). The hole counts as "nothing there". Rendering converts
(`entry`, `exit`, `progress`) into a position inside the tile with `puzzle/TileGeometry.ts`
(quarter arcs for corners, straight segments through the centre otherwise).

## Fuel

`player/Fuel.ts`. Each flame owns a `FuelTank`. Fuel burns per tile travelled
(`fuelPerTile`), so faster levels do not burn more per tile, only per second. Pickups sit *in*
a tile and slide with it; crossing the tile centre collects it (`wood`, `oil`, `brazier`,
`ember`). Fuel is always granted; score and Embers only the first time that pickup is
collected on that level (`Progress` remembers the collected pickup ids per level). Fuel ratio drives the
flame's size and flicker (`Flame.intensity`) and is exposed so later mechanics can read it
(small flame can't burn wood, big flame melts ice...). An empty tank triggers an extinguish
animation and a `fuel` death. The validator simulates fuel along the solution path so a level
can never be impossible because of fuel.

## Lives

`player/Lives.ts` is a small resource class (`startingLives` in `game/Config.ts`). Deaths
(`water`, `fuel`, `timeout`) cost one life and restart the level with the same run score; zero
lives → GAME OVER with *Continue* (same level, fresh lives, score reset), *New game* and
*Levels*. The class is deliberately abstract so hearts/energy/revives can replace it.

## Score

`player/Scoring.ts`, one function and one config object:

```
score = base + timeBonus + fuelBonus + lifeBonus + pickupBonus + perfectBonus
```

* `timeBonus` = 1500 × remaining time ratio, `fuelBonus` = 800 × remaining fuel ratio
* `lifeBonus` = 250 per remaining life, `pickupBonus` = 150 per pickup collected for the first
  time on this level
* `perfectBonus` = 750 when the level is rated 3 flames

Run score, high score (persisted), per-level best score and total best are tracked.

## Embers

`player/Embers.ts` + `Progress`. Earned on completion (1 + 1 per flame + 3 for a perfect, plus
rare ember pickups). Uses are data (`EMBER_USES`): *Emergency Fuel* (3 ✦ → +30 fuel) and
*Emergency Time* (3 ✦ → +5 s), both available from the in-game buttons. Add a new use by adding
an entry and handling its effect in `LevelSession.applyBoost`.

## Level progression

Level *n+1* unlocks when level *n* is completed. The title's PLAY button continues at the
furthest unlocked level. The difficulty curve for generated levels is one function
(`level/difficulty.ts`): board size 5×4 → 9×7, flame speed 0.7 → 1.6 tiles/s, lookahead 3 → 1,
fuel burn 2 → 5 per tile, scramble length 1 → 9 slides, more junction decoys, fixed tiles and
bonus detours as the number grows.

## Adding a level

1. Add a `LevelDef` to `src/level/data/handmade.ts` (or edit a generated one) with a unique
   `id`. Write the **solved** board in `rows` (exactly one `S`, at least one `G`, at least one
   `..` hole) and a `scramble` of hole moves.
2. Run `npm run levels:validate`. The validator checks: the scramble is legal, the start board
   does not already win and does not kill the flame on the first tile, the reverse scramble
   really leads to the hearth, a breadth-first solver finds the shortest solution (reported as
   `slides`), pickups sit on pipe tiles, fuel suffices along the route, and it warns about
   tight timing.
3. `npm test` runs the same validation for all levels.

The debug panel's *regenerate* button previews a fresh procedural level with the current
level's size, and *dump level* prints its JSON so it can be pasted into the data file.

## Adding a special mechanic

* **New pipe behaviour / tile** (ice block, wood that burns away): add a `TileKind` in
  `puzzle/Tile.ts` with its base mask and rotation count, a token letter in `KIND_CODES`, a
  drawing case in `CanvasRenderer.drawTile`, and if it alters routing, a branch in
  `chooseExit`/`Flame.advance` (e.g. refuse entry while frozen). If it must not slide, mark it
  locked in `makeTile`.
* **New entity** (wind, oil slick, extinguisher, a second flame): extend `entities/Entity`,
  push it into `LevelSession.entities`, update it in `LevelSession.update`, and render it from
  the entity list. The session already holds `flames: Flame[]`; multi-flame levels only need a
  spawn loop and a "all flames arrived" win condition.
* **New pickup**: add the kind to `PickupKind`, its values in `FUEL_CONFIG`, an icon in
  `drawPickupIcon`.
* **New objective**: add an `ObjectiveKind` and its evaluation in `level/Objectives.ts`.
* **New Ember use**: add it to `EMBER_USES` and apply it in `LevelSession.applyBoost`.

Audio and effects hook on session events (`main.ts`), so new mechanics only emit events.

## Migrating to iOS and Android

The prototype was built with that port in mind:

* **Capacitor wrapper (fastest path).** The game is a static bundle (`dist/`) with no backend.
  `npx cap add ios android` + copying `dist/` gives native apps with the same code. Touch input,
  safe-area insets, portrait and landscape are already handled. Replace `LocalStorageAdapter`
  with a Capacitor Preferences adapter behind the same `KeyValueStorage` interface, and the
  WebAudio backend with a native/Howler backend behind `AudioBackend`.
* **Native game framework later.** The simulation (`puzzle/`, `entities/`, `game/`,
  `player/`, `level/`) has no DOM or canvas dependency and is covered by tests; it can be
  bundled as a library and driven by any renderer. The `CanvasRenderer` is the only file that
  knows how things look; the `UI` class is the only file that knows about HTML. Level data is
  JSON-serialisable and the player profile is a plain object (`Progress.profile()`).
* **Assets.** All current art and sounds are procedural placeholders, so swapping them for
  sprite sheets and sample packs touches only `render/` and `audio/`.

## Design notes vs. Blodia / Timeball

The original is a sliding-tile pipe puzzle with a ball that must not leave the pipes. PYRODIA
keeps that mechanical DNA (a 15-puzzle board of pipes, one hole, a continuously moving object
that falls if the pipe is open, lives, score, escalating speed) and adds a living flame with
fuel and pickups, optional bonus detours instead of the original "roll over every tile" goal,
a lookahead to make deaths understandable, objectives and Embers for replay value, and
completely original visuals, sounds and level data. Nothing from the original ROM, graphics,
music or text is used.

## License

Prototype code © the PYRODIA authors. All assets are original placeholders.
